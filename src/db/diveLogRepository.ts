import { db } from './db'
import { newUuid } from './uuid'
import { notifyLocalChange } from './changeNotifier'
import type { Attachment, DiveLog, DiveLogDraft } from '../types/diveLog'
import type { Tombstone } from '../types/sync'

async function addAttachment(type: Attachment['type'], blob: Blob): Promise<number> {
  return db.attachments.add({
    uuid: newUuid(),
    type,
    blob,
    mimeType: blob.type || 'image/png',
    createdAt: new Date().toISOString(),
  })
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
): Promise<number> {
  const id = await db.transaction('rw', db.diveLogs, db.attachments, async () => {
    const photoIds = await Promise.all(photoFiles.map((file) => addAttachment('photo', file)))
    const signatureId = signatureBlob ? await addAttachment('signature', signatureBlob) : undefined

    const now = new Date().toISOString()
    const diveLog: DiveLog = {
      ...draft,
      uuid: newUuid(),
      photoIds,
      signatureId,
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
}

export async function updateDiveLog(
  id: number,
  draft: DiveLogDraft,
  { newPhotoFiles, removedPhotoIds, newSignatureBlob }: UpdateDiveLogOptions,
): Promise<void> {
  await db.transaction('rw', db.diveLogs, db.attachments, db.tombstones, async () => {
    const existing = await db.diveLogs.get(id)
    if (!existing) throw new Error(`DiveLog ${id} not found`)

    if (removedPhotoIds.length > 0) {
      const removedPhotos = await db.attachments.bulkGet(removedPhotoIds)
      await db.attachments.bulkDelete(removedPhotoIds)
      await recordTombstonesForAttachments(removedPhotos)
    }
    const addedPhotoIds = await Promise.all(newPhotoFiles.map((file) => addAttachment('photo', file)))
    const photoIds = existing.photoIds.filter((pid) => !removedPhotoIds.includes(pid)).concat(addedPhotoIds)

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
      signatureId = await addAttachment('signature', newSignatureBlob)
    }

    await db.diveLogs.update(id, {
      ...draft,
      photoIds,
      signatureId,
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

export interface DiveLogDetail {
  diveLog: DiveLog
  photos: Attachment[]
  signature: Attachment | null
}

export async function getDiveLogDetail(id: number): Promise<DiveLogDetail | undefined> {
  const diveLog = await db.diveLogs.get(id)
  if (!diveLog) return undefined

  const photos = (await db.attachments.bulkGet(diveLog.photoIds)).filter((a): a is Attachment => a != null)
  const signature = diveLog.signatureId != null ? ((await db.attachments.get(diveLog.signatureId)) ?? null) : null

  return { diveLog, photos, signature }
}
