/**
 * Google Drive 同期のための Dexie 読み書き。
 * Dexie に触れるのは `db/` 配下のみ、という既存の原則を維持するため、
 * `sync/syncEngine.ts` はこのモジュールを経由してのみ IndexedDB を読み書きする。
 */
import { db } from './db'
import { newUuid } from './uuid'
import type { Attachment, DiveLog } from '../types/diveLog'
import type { SyncRecord, SyncSettings, Tombstone } from '../types/sync'
import type { DiveLogSnapshot, RemoteLogFile } from '../sync/syncTypes'

export interface SyncSnapshot {
  logs: DiveLog[]
  syncRecords: SyncRecord[]
  tombstones: Tombstone[]
}

/** ローカルの全ログ・同期記録・墓標を読み出す（差分判定の入力）。 */
export async function listAllForSync(): Promise<SyncSnapshot> {
  const [logs, syncRecords, tombstones] = await Promise.all([
    db.diveLogs.toArray(),
    db.syncRecords.toArray(),
    db.tombstones.toArray(),
  ])
  return { logs, syncRecords, tombstones }
}

/** uuid で添付を取得する（既にローカルに存在するものだけを返す）。 */
export async function getAttachmentsByUuids(uuids: string[]): Promise<Attachment[]> {
  if (uuids.length === 0) return []
  const all = await db.attachments.where('uuid').anyOf(uuids).toArray()
  return all
}

/** ローカルの採番id（DiveLog.photoIds / signatureId）から添付を取得する。プッシュ対象の内容を組み立てる際に使う。 */
export async function getAttachmentsByLocalIds(ids: number[]): Promise<Attachment[]> {
  if (ids.length === 0) return []
  const results = await db.attachments.bulkGet(ids)
  return results.filter((a): a is Attachment => a != null)
}

async function upsertAttachmentByUuid(
  uuid: string,
  kind: Attachment['type'],
  blobs: Map<string, Blob>,
): Promise<number> {
  const existing = await db.attachments.where('uuid').equals(uuid).first()
  if (existing?.id != null) return existing.id

  const blob = blobs.get(uuid)
  if (!blob) throw new Error(`applyRemoteLog: 添付 ${uuid} のダウンロード内容が見つかりません`)
  return db.attachments.add({
    uuid,
    type: kind,
    blob,
    mimeType: blob.type || (kind === 'photo' ? 'image/jpeg' : 'image/png'),
    createdAt: new Date().toISOString(),
  })
}

/**
 * リモートのログを1件ローカルへ適用する（作成 or 更新）。
 * 添付を先にすべて解決してから、1つの Dexie トランザクションでログ本体を書き込む（REQ-4.5 / 4.6）。
 * 呼び出し側は、ダウンロードが必要な添付の blob をあらかじめ `blobs` に用意しておくこと（トランザクション内では fetch を待たない）。
 *
 * `syncRecords` / `tombstoneUuidsToClear` を渡した場合、それらの確定・消化も同じトランザクション内で行う
 * （design.md「トランザクション境界」）。これらを別トランザクションに分けて呼び出し側で後追いすると、
 * 処理が両者の間で中断した際に「ログ・添付は適用済みだが syncRecord が無い」状態が生じ、
 * 次回同期で内容が同一でも競合と誤判定されてしまう（不具合#6）。
 */
export async function applyRemoteLog(
  remote: RemoteLogFile,
  blobs: Map<string, Blob>,
  syncRecords: SyncRecord[] = [],
  tombstoneUuidsToClear: string[] = [],
): Promise<void> {
  if (!remote.log) throw new Error('applyRemoteLog: 削除されていないログには log の内容が必要です')
  const remoteLog = remote.log

  await db.transaction('rw', db.diveLogs, db.attachments, db.syncRecords, db.tombstones, async () => {
    const photoIds: number[] = []
    for (const uuid of remote.photoUuids) {
      photoIds.push(await upsertAttachmentByUuid(uuid, 'photo', blobs))
    }
    let signatureId: number | undefined
    if (remote.signatureUuid) {
      signatureId = await upsertAttachmentByUuid(remote.signatureUuid, 'signature', blobs)
    }

    const existing = await db.diveLogs.where('uuid').equals(remote.uuid).first()
    const diveLog: DiveLog = {
      ...remoteLog,
      uuid: remote.uuid,
      photoIds,
      signatureId,
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
    }
    if (existing?.id != null) {
      await db.diveLogs.put({ ...diveLog, id: existing.id })
    } else {
      await db.diveLogs.add(diveLog)
    }

    if (syncRecords.length > 0) await db.syncRecords.bulkPut(syncRecords)
    if (tombstoneUuidsToClear.length > 0) await db.tombstones.bulkDelete(tombstoneUuidsToClear)
  })
}

/** 同期由来の削除（Drive側で削除確定済み）。ユーザー操作の削除ではないため墓標は作らない（REQ-5.3）。 */
export async function deleteLogByUuid(uuid: string): Promise<void> {
  await db.transaction('rw', db.diveLogs, db.attachments, async () => {
    const existing = await db.diveLogs.where('uuid').equals(uuid).first()
    if (!existing) return
    const idsToDelete = [...existing.photoIds]
    if (existing.signatureId != null) idsToDelete.push(existing.signatureId)
    if (idsToDelete.length > 0) await db.attachments.bulkDelete(idsToDelete)
    if (existing.id != null) await db.diveLogs.delete(existing.id)
  })
}

function formatConflictTimestamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 競合時に採用されなかった側の内容を、新しい uuid のログ・添付として保存する（REQ-6.3 / 6.4）。
 * 添付は blob を複製し、新しい uuid の Attachment として作る（元のログと参照を共有しない）。
 */
export async function createConflictCopy(source: DiveLogSnapshot): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.diveLogs, db.attachments, async () => {
    const photoUuidMap = new Map<string, string>()
    const photoIds = await Promise.all(
      source.photos.map(async (p) => {
        const newPhotoUuid = newUuid()
        photoUuidMap.set(p.uuid, newPhotoUuid)
        return db.attachments.add({
          uuid: newPhotoUuid,
          type: 'photo',
          blob: p.blob,
          mimeType: p.blob.type || 'image/jpeg',
          createdAt: now,
        })
      }),
    )
    let signatureId: number | undefined
    if (source.signature) {
      signatureId = await db.attachments.add({
        uuid: newUuid(),
        type: 'signature',
        blob: source.signature.blob,
        mimeType: source.signature.blob.type || 'image/png',
        createdAt: now,
      })
    }

    // 観察記録の写真参照を、複製後の写真の uuid へ付け替える（REQ-8.4）。
    // 複製元に存在しない・複製できなかった参照は落とす。観察記録自体の uuid も採番し直し、
    // 同一の識別子を持つ観察記録が2つのログに存在しないようにする。
    const observations = source.log.observations?.map((observation) => ({
      ...observation,
      uuid: newUuid(),
      photoUuids: observation.photoUuids.flatMap((uuid) => {
        const mapped = photoUuidMap.get(uuid)
        return mapped ? [mapped] : []
      }),
    }))

    // ダイビングプラン画像の参照も、観察記録とまったく同じ flatMap の形で複製後の添付へ写像する（REQ-8.3）。
    // 複製できなかった参照は落とし、残りの参照と順序を保つ。
    const planImageUuids = source.log.planImageUuids?.flatMap((uuid) => {
      const mapped = photoUuidMap.get(uuid)
      return mapped ? [mapped] : []
    })

    await db.diveLogs.add({
      ...source.log,
      observations,
      planImageUuids,
      siteName: `${source.log.siteName}（競合コピー ${formatConflictTimestamp(now)}）`,
      uuid: newUuid(),
      photoIds,
      signatureId,
      createdAt: now,
      updatedAt: now,
    })
  })
}

/** 同期が成功した記録を保存する（作成・更新の両方に使う。upsert）。 */
export async function markSynced(records: SyncRecord[]): Promise<void> {
  if (records.length === 0) return
  await db.syncRecords.bulkPut(records)
}

/** 消化済みの墓標を削除する。 */
export async function clearTombstones(uuids: string[]): Promise<void> {
  if (uuids.length === 0) return
  await db.tombstones.bulkDelete(uuids)
}

/**
 * 現在ローカルに存在するログが参照している添付（写真・サイン）の uuid 集合を返す。
 * 添付の墓標を Drive から削除する前に、その添付が（#6の削除復元や#5の競合解決の結果として）
 * 現在のログから再び参照されるようになっていないかを確認するために使う（不具合#1）。
 * ログ・添付テーブルを都度読み直す（呼び出し側が保持する古いスナップショットには依存しない）。
 */
export async function getReferencedAttachmentUuids(): Promise<Set<string>> {
  const logs = await db.diveLogs.toArray()
  const localIds = new Set<number>()
  for (const log of logs) {
    for (const photoId of log.photoIds) localIds.add(photoId)
    if (log.signatureId != null) localIds.add(log.signatureId)
  }
  if (localIds.size === 0) return new Set()
  const attachments = await db.attachments.bulkGet([...localIds])
  return new Set(attachments.filter((a): a is Attachment => a != null).map((a) => a.uuid))
}

const SETTINGS_KEY = 'settings'

export const defaultSyncSettings: SyncSettings = {
  enabled: false,
  autoSync: false,
  deviceId: '',
}

/** `useLiveQuery` から購読するための、副作用なしの読み出し。未初期化なら undefined を返す。 */
export async function getSyncSettingsRaw(): Promise<SyncSettings | undefined> {
  const row = await db.syncMeta.get(SETTINGS_KEY)
  return row?.value as SyncSettings | undefined
}

/** 同期設定を取得する。未初期化なら（deviceId を採番して）初期値を保存してから返す。 */
export async function getSyncSettings(): Promise<SyncSettings> {
  const existing = await getSyncSettingsRaw()
  if (existing) return existing
  const initial: SyncSettings = { ...defaultSyncSettings, deviceId: newUuid() }
  await db.syncMeta.put({ key: SETTINGS_KEY, value: initial })
  return initial
}

export async function updateSyncSettings(patch: Partial<SyncSettings>): Promise<SyncSettings> {
  const current = await getSyncSettings()
  const updated: SyncSettings = { ...current, ...patch }
  await db.syncMeta.put({ key: SETTINGS_KEY, value: updated })
  return updated
}
