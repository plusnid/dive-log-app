import { db } from './db'
import { newUuid } from './uuid'
import { notifyLocalChange } from './changeNotifier'
import type { Attachment, DiveLog, DiveLogDraft, Observation, ObservationDraft } from '../types/diveLog'
import type { MarineLifeGenre } from '../types/marineLifeOptions'
import type { Tombstone } from '../types/sync'

async function addAttachment(type: Attachment['type'], blob: Blob): Promise<{ id: number; uuid: string }> {
  const uuid = newUuid()
  const id = await db.attachments.add({
    uuid,
    type,
    blob,
    mimeType: blob.type || 'image/png',
    createdAt: new Date().toISOString(),
  })
  return { id, uuid }
}

/**
 * フォームの `ObservationDraft` を、保存用の `Observation` に変換する。
 * - 名前が空（trim 後）の観察記録は破棄する（REQ-1.3）
 * - 解決できない・最終的な写真集合に含まれない参照は破棄する（REQ-3.6, REQ-3.7）
 * - 同一観察記録内の重複した写真参照は1つにまとめる
 */
function resolveObservations(
  drafts: ObservationDraft[],
  uuidByExistingId: Map<number, string>,
  uuidByNewFile: Map<File, string>,
  allowedUuids: Set<string>,
): Observation[] {
  const result: Observation[] = []
  for (const draft of drafts) {
    const name = draft.name.trim()
    if (name === '') continue

    const seen = new Set<string>()
    const photoUuids: string[] = []
    for (const ref of draft.photos) {
      const uuid = ref.kind === 'existing' ? uuidByExistingId.get(ref.id) : uuidByNewFile.get(ref.file)
      if (!uuid || !allowedUuids.has(uuid) || seen.has(uuid)) continue
      seen.add(uuid)
      photoUuids.push(uuid)
    }

    result.push({ uuid: draft.uuid || newUuid(), genre: draft.genre, name, photoUuids })
  }
  return result
}

/** 削除された添付の墓標を記録する。同期が無効でも常に記録する（後から同期を有効化した場合に削除を伝播させるため）。 */
async function recordTombstonesForAttachments(attachments: (Attachment | undefined)[]): Promise<void> {
  const now = new Date().toISOString()
  const entries: Tombstone[] = attachments
    .filter((a): a is Attachment => a != null)
    .map((a) => ({ uuid: a.uuid, kind: 'attachment', deletedAt: now }))
  if (entries.length > 0) await db.tombstones.bulkPut(entries)
}

export async function createDiveLog(
  draft: DiveLogDraft,
  photoFiles: File[],
  signatureBlob: Blob | null,
  observations: ObservationDraft[] = [],
  planImageFiles: File[] = [],
): Promise<number> {
  const id = await db.transaction('rw', db.diveLogs, db.attachments, async () => {
    const addedPhotos = await Promise.all(photoFiles.map((file) => addAttachment('photo', file)))
    const addedPlans = await Promise.all(planImageFiles.map((file) => addAttachment('photo', file)))
    // プラン画像の添付IDは常に photoIds の末尾に置く（一覧カードのサムネイル選択のため。design.md 8節）
    const photoIds = [...addedPhotos.map((p) => p.id), ...addedPlans.map((p) => p.id)]
    const planImageUuids = addedPlans.map((p) => p.uuid) // 順序＝選択順（REQ-1.4）
    const signature = signatureBlob ? await addAttachment('signature', signatureBlob) : undefined

    const uuidByNewFile = new Map<File, string>(photoFiles.map((file, i) => [file, addedPhotos[i].uuid]))
    // 観察記録が紐づけられるのは写真のみ。プラン画像の uuid は allowedUuids に入れない（REQ-7.3）
    const allowedUuids = new Set(addedPhotos.map((p) => p.uuid))
    const resolvedObservations = resolveObservations(observations, new Map(), uuidByNewFile, allowedUuids)

    const now = new Date().toISOString()
    const diveLog: DiveLog = {
      ...draft,
      uuid: newUuid(),
      photoIds,
      signatureId: signature?.id,
      observations: resolvedObservations,
      planImageUuids,
      createdAt: now,
      updatedAt: now,
    }
    return db.diveLogs.add(diveLog)
  })
  notifyLocalChange()
  return id
}

export interface UpdateDiveLogOptions {
  newPhotoFiles: File[]
  removedPhotoIds: number[]
  /** undefined = no change, null = remove signature, Blob = replace signature */
  newSignatureBlob?: Blob | null
  /** undefined = 既存の観察記録を変更しない（REQ-1.8 と同じ「渡されたキーのみ変更する」方針） */
  observations?: ObservationDraft[]
  /** 追加するプラン画像（未保存の File。選択順）。省略時は追加なし（REQ-2.3） */
  newPlanImageFiles?: File[]
  /** 取り除く保存済みプラン画像の Attachment.id。省略時は削除なし（REQ-2.6） */
  removedPlanImageIds?: number[]
}

export async function updateDiveLog(
  id: number,
  draft: DiveLogDraft,
  {
    newPhotoFiles,
    removedPhotoIds,
    newSignatureBlob,
    observations,
    newPlanImageFiles = [],
    removedPlanImageIds = [],
  }: UpdateDiveLogOptions,
): Promise<void> {
  await db.transaction('rw', db.diveLogs, db.attachments, db.tombstones, async () => {
    const existing = await db.diveLogs.get(id)
    if (!existing) throw new Error(`DiveLog ${id} not found`)

    // 1. 既存の photoIds に対して1回だけ bulkGet し、id⇄uuid の対応表を作る。
    const existingAttachments = await db.attachments.bulkGet(existing.photoIds)
    const uuidById = new Map<number, string>()
    const idByUuid = new Map<string, number>()
    existing.photoIds.forEach((pid, idx) => {
      const attachment = existingAttachments[idx]
      if (attachment) {
        uuidById.set(pid, attachment.uuid)
        idByUuid.set(attachment.uuid, pid)
      }
    })

    // 2. 既存プラン画像のIDを、参照の順序どおりに解決する（解決できない参照はここで落ちる＝REQ-6.5）。
    const oldPlanIds = (existing.planImageUuids ?? []).flatMap((u) => {
      const pid = idByUuid.get(u)
      return pid != null ? [pid] : []
    })

    // 3. 削除（写真・プラン画像は同じ添付テーブル・同じ墓標方式のため、まとめて処理する）。
    const removedIds = [...new Set([...removedPhotoIds, ...removedPlanImageIds])]
    if (removedIds.length > 0) {
      const removedAttachments = await db.attachments.bulkGet(removedIds)
      await db.attachments.bulkDelete(removedIds)
      await recordTombstonesForAttachments(removedAttachments)
    }

    // 4. 追加。
    const addedPhotos = await Promise.all(newPhotoFiles.map((file) => addAttachment('photo', file)))
    const addedPhotoIds = addedPhotos.map((p) => p.id)
    const addedPlans = await Promise.all(newPlanImageFiles.map((file) => addAttachment('photo', file)))

    // 5. 参照の再計算（プラン画像は常に photoIds の末尾＝一覧カードのサムネイル選択のための規約。design.md 8節）。
    const keptPlanIds = oldPlanIds.filter((pid) => !removedIds.includes(pid))
    const planIds = [...new Set([...keptPlanIds, ...addedPlans.map((p) => p.id)])]
    const planIdSet = new Set(planIds)
    const keptPhotoIds = existing.photoIds.filter((pid) => !removedIds.includes(pid) && !planIdSet.has(pid))
    const photoIds = [...keptPhotoIds, ...addedPhotoIds, ...planIds]
    const planImageUuids = [
      ...keptPlanIds.map((pid) => uuidById.get(pid)!),
      ...addedPlans.map((p) => p.uuid),
    ]

    let signatureId = existing.signatureId
    if (newSignatureBlob === null) {
      if (existing.signatureId != null) {
        const removedSignature = await db.attachments.get(existing.signatureId)
        await db.attachments.delete(existing.signatureId)
        await recordTombstonesForAttachments([removedSignature])
      }
      signatureId = undefined
    } else if (newSignatureBlob) {
      if (existing.signatureId != null) {
        const removedSignature = await db.attachments.get(existing.signatureId)
        await db.attachments.delete(existing.signatureId)
        await recordTombstonesForAttachments([removedSignature])
      }
      const signature = await addAttachment('signature', newSignatureBlob)
      signatureId = signature.id
    }

    let resolvedObservations: Observation[] | undefined
    if (observations !== undefined) {
      // 最終的な photoIds（既存 − 削除 ＋ 新規、プラン画像を含む）に対して1回だけ読み出し、id→uuid と許可集合を作る。
      // これにより UI 側で取りこぼした参照（REQ-3.6）も含めて必ず整合が取れる（design.md 5節）。
      const finalAttachments = await db.attachments.bulkGet(photoIds)
      const uuidByExistingId = new Map<number, string>()
      const allowedUuids = new Set<string>()
      photoIds.forEach((pid, idx) => {
        const attachment = finalAttachments[idx]
        if (attachment) {
          uuidByExistingId.set(pid, attachment.uuid)
          allowedUuids.add(attachment.uuid)
        }
      })
      // 観察記録が紐づけられるのは写真のみ。プラン画像の uuid は候補から除外する（REQ-7.3）。
      const planUuidSet = new Set(planImageUuids)
      for (const uuid of planUuidSet) allowedUuids.delete(uuid)
      const uuidByNewFile = new Map<File, string>(newPhotoFiles.map((file, i) => [file, addedPhotos[i].uuid]))
      resolvedObservations = resolveObservations(observations, uuidByExistingId, uuidByNewFile, allowedUuids)
    }

    await db.diveLogs.update(id, {
      ...draft,
      photoIds,
      signatureId,
      ...(resolvedObservations !== undefined ? { observations: resolvedObservations } : {}),
      planImageUuids, // 常に配列を書く（0枚なら []）
      updatedAt: new Date().toISOString(),
    })
  })
  notifyLocalChange()
}

export async function deleteDiveLog(id: number): Promise<void> {
  await db.transaction('rw', db.diveLogs, db.attachments, db.tombstones, async () => {
    const existing = await db.diveLogs.get(id)
    if (!existing) return
    const idsToDelete = [...existing.photoIds]
    if (existing.signatureId != null) idsToDelete.push(existing.signatureId)
    const attachmentsToDelete = idsToDelete.length > 0 ? await db.attachments.bulkGet(idsToDelete) : []
    if (idsToDelete.length > 0) await db.attachments.bulkDelete(idsToDelete)

    const now = new Date().toISOString()
    const tombstoneEntries: Tombstone[] = [
      { uuid: existing.uuid, kind: 'diveLog', deletedAt: now },
      ...attachmentsToDelete
        .filter((a): a is Attachment => a != null)
        .map((a): Tombstone => ({ uuid: a.uuid, kind: 'attachment', deletedAt: now })),
    ]
    await db.tombstones.bulkPut(tombstoneEntries)

    await db.diveLogs.delete(id)
  })
  notifyLocalChange()
}

/** 指定日付のログのうち、引き継ぎ元となる1件を返す（REQ-7.2, REQ-7.3）。 */
export async function findCarryOverSource(date: string): Promise<DiveLog | undefined> {
  const candidates = await db.diveLogs.where('date').equals(date).toArray()
  candidates.sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1
    return (b.id ?? 0) - (a.id ?? 0)
  })
  return candidates[0]
}

/** 参照入力の元データ（エリア名・ダイビングポイント名の組）を「最近使った順」で返す（REQ-8.3〜REQ-8.5, REQ-8.10, REQ-8.12）。 */
export async function listPastPlaceValues(): Promise<{ area: string; siteName: string }[]> {
  const diveLogs = await db.diveLogs.toArray()
  diveLogs.sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1
    return a.updatedAt > b.updatedAt ? -1 : 1
  })
  return diveLogs.map((diveLog) => ({ area: diveLog.area ?? '', siteName: diveLog.siteName }))
}

/** 参照入力の元データ（観察記録のジャンルと名前の組）を「最近記録した順」で返す（REQ-2.7, REQ-2.8）。 */
export async function listPastObservationValues(): Promise<{ genre?: MarineLifeGenre; name: string }[]> {
  const diveLogs = await db.diveLogs.toArray()
  diveLogs.sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1
    return a.updatedAt > b.updatedAt ? -1 : 1
  })
  const result: { genre?: MarineLifeGenre; name: string }[] = []
  for (const diveLog of diveLogs) {
    for (const observation of diveLog.observations ?? []) {
      result.push({ genre: observation.genre, name: observation.name })
    }
  }
  return result
}

export interface DiveLogDetail {
  diveLog: DiveLog
  /** 写真。**プラン画像は含まない**（REQ-3.6, REQ-7.3。除外はここ1箇所で行う） */
  photos: Attachment[]
  /** ダイビングプラン画像（`planImageUuids` の順序。解決できない参照は除外済み。0件なら空配列） */
  planImages: Attachment[]
  signature: Attachment | null
}

/** 一覧カードのサムネイル表示用に、添付1件のBlobだけを取得する（読み取り専用、REQ-3.13）。 */
export async function getAttachmentBlob(id: number): Promise<Blob | undefined> {
  return (await db.attachments.get(id))?.blob
}

export async function getDiveLogDetail(id: number): Promise<DiveLogDetail | undefined> {
  const diveLog = await db.diveLogs.get(id)
  if (!diveLog) return undefined

  const all = (await db.attachments.bulkGet(diveLog.photoIds)).filter((a): a is Attachment => a != null)
  const byUuid = new Map(all.map((a) => [a.uuid, a]))
  const planUuids = diveLog.planImageUuids ?? []
  // 参照の順序で解決する（photoIds の順序ではない）。解決できない参照は落とす（REQ-3.8）
  const planImages = planUuids.flatMap((u) => {
    const a = byUuid.get(u)
    return a ? [a] : []
  })
  const planUuidSet = new Set(planImages.map((a) => a.uuid))
  const photos = all.filter((a) => !planUuidSet.has(a.uuid))
  const signature = diveLog.signatureId != null ? ((await db.attachments.get(diveLog.signatureId)) ?? null) : null

  return { diveLog, photos, planImages, signature }
}
