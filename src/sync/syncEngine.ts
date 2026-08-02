/**
 * 同期の差分判定・競合解決・実行制御（specs/google-drive-sync/design.md「同期アルゴリズム」参照）。
 * React にも Dexie にも依存しない。UI からは公開関数と `subscribeStatus` の購読だけを使う。
 */
import * as googleAuth from './googleAuth'
import * as driveClient from './driveClient'
import { mapWithConcurrency } from './concurrency'
import * as syncRepository from '../db/syncRepository'
import { onLocalChange } from '../db/changeNotifier'
import type { DiveLog } from '../types/diveLog'
import type { SyncRecord } from '../types/sync'
import {
  UnsupportedSchemaError,
  type AttachmentContent,
  type DiveLogSnapshot,
  type RemoteLogBody,
  type RemoteLogFile,
  type RemoteManifest,
  type SyncResult,
  type SyncStatusSnapshot,
} from './syncTypes'

export { isSyncConfigured } from './googleAuth'

// driveClient は googleAuth に依存しない（design.md のモジュール依存関係を維持するため）。
// 401 を受け取った際の無操作再取得（REQ-1.7）は、両者を知っている syncEngine が結びつける。
driveClient.setTokenRefresher(googleAuth.refreshAccessTokenAfterUnauthorized)

const SCHEMA_VERSION = 1
const APP_VERSION = '1.0.0'
const CONCURRENCY = 3
const AUTO_SYNC_DEBOUNCE_MS = 5000

// ---------------------------------------------------------------------------
// 状態の購読（実行中フラグ・直近の結果）
// ---------------------------------------------------------------------------

type StatusListener = (status: SyncStatusSnapshot) => void

let status: SyncStatusSnapshot = { phase: 'idle' }
const statusListeners = new Set<StatusListener>()

function setStatus(next: SyncStatusSnapshot): void {
  status = next
  for (const listener of statusListeners) listener(status)
}

export function getStatus(): SyncStatusSnapshot {
  return status
}

export function subscribeStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)
  listener(status)
  return () => statusListeners.delete(listener)
}

// ---------------------------------------------------------------------------
// 実行制御（多重実行の抑止。REQ-3.4）
// ---------------------------------------------------------------------------

let current: Promise<SyncResult> | null = null
let pending: { promise: Promise<SyncResult>; resolve: (r: SyncResult) => void; reject: (e: unknown) => void } | null = null

function runNextIfPending(): void {
  current = null
  if (!pending) return
  const { resolve, reject } = pending
  pending = null
  const next = runSyncOnce()
  current = next.finally(runNextIfPending)
  next.then(resolve, reject)
}

/** 同期を要求する。実行中なら多重実行せず、完了後に1回だけ再実行する（REQ-3.4）。 */
export function requestSync(): Promise<SyncResult> {
  if (!current) {
    current = runSyncOnce().finally(runNextIfPending)
    return current
  }
  if (!pending) {
    let resolve!: (r: SyncResult) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<SyncResult>((res, rej) => {
      resolve = res
      reject = rej
    })
    pending = { promise, resolve, reject }
  }
  return pending.promise
}

// ---------------------------------------------------------------------------
// 接続・切断・自動同期の設定
// ---------------------------------------------------------------------------

export type ConnectResult = { ok: true } | { ok: false; errorMessage: string }

/** Google Drive への接続（REQ-1.2 / 1.4 / 1.5）。 */
export async function connect(): Promise<ConnectResult> {
  try {
    const token = await googleAuth.connect()
    const folders = await driveClient.ensureAppFolders(token)
    const accountEmail = await driveClient.getAccountEmail(token).catch(() => undefined)
    await syncRepository.updateSyncSettings({
      enabled: true,
      accountEmail,
      rootFolderId: folders.rootFolderId,
      logsFolderId: folders.logsFolderId,
      attachmentsFolderId: folders.attachmentsFolderId,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, errorMessage: toUserMessage(error) }
  }
}

/** 接続を解除する（REQ-8.1）。ローカルのログ・Drive上のデータは削除しない（REQ-8.2 / 8.3）。 */
export async function disconnect(): Promise<void> {
  googleAuth.disconnect()
  await syncRepository.updateSyncSettings({
    enabled: false,
    autoSync: false,
    accountEmail: undefined,
    rootFolderId: undefined,
    logsFolderId: undefined,
    attachmentsFolderId: undefined,
    lastSyncAt: undefined,
  })
}

/** 自動同期の有効/無効を切り替える（REQ-3.3）。 */
export async function setAutoSync(enabled: boolean): Promise<void> {
  await syncRepository.updateSyncSettings({ autoSync: enabled })
}

/**
 * オフラインのため実行できなかった同期要求があるかどうか。
 * オンライン復帰時にこれが立っていれば、自動同期の設定に関わらず同期を再試行する（REQ-7.2）。
 */
let offlineSyncPending = false

let autoSyncTeardown: (() => void) | null = null

/**
 * 自動同期のトリガを登録する（REQ-3.2）。App のマウント時に一度だけ呼ぶ。
 * 実際に同期を走らせるかどうかは、その都度 `enabled && autoSync && online` を確認してから決める。
 */
export function initAutoSync(): () => void {
  if (autoSyncTeardown) return autoSyncTeardown

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function maybeSync(): Promise<void> {
    const settings = await syncRepository.getSyncSettingsRaw()
    if (!settings?.enabled || !settings.autoSync) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    void requestSync()
  }

  void maybeSync() // アプリの起動時（オンラインの場合）

  const onlineHandler = () => {
    // オフライン中に「今すぐ同期」等で保留された同期要求があれば、自動同期の設定に関わらず再試行する（REQ-7.2）。
    if (offlineSyncPending) {
      offlineSyncPending = false
      void requestSync()
      return
    }
    void maybeSync() // オフラインからオンラインに復帰したとき（自動同期が有効な場合）
  }
  if (typeof window !== 'undefined') window.addEventListener('online', onlineHandler)

  const unsubscribeChange = onLocalChange(() => {
    // ログの作成・更新・削除が確定した後、一定時間の待ち合わせを行う
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void maybeSync(), AUTO_SYNC_DEBOUNCE_MS)
  })

  autoSyncTeardown = () => {
    if (typeof window !== 'undefined') window.removeEventListener('online', onlineHandler)
    unsubscribeChange()
    if (debounceTimer) clearTimeout(debounceTimer)
    autoSyncTeardown = null
  }
  return autoSyncTeardown
}

// ---------------------------------------------------------------------------
// エラーメッセージ（REQ-7.4 / 7.6）
// ---------------------------------------------------------------------------

function toUserMessage(error: unknown): string {
  if (error instanceof driveClient.DriveApiError) {
    if (error.reason === 'storageQuotaExceeded') {
      return 'Google Drive の空き容量が不足しているため同期できませんでした。Drive の空き容量を確保してから再度お試しください。'
    }
    if (error.status === 401) {
      return 'Google アカウントの認証が切れました。設定画面から再接続してください。'
    }
    if (error.status === 429 || (error.status === 403 && error.reason != null)) {
      return 'Google Drive の利用制限に達しました。しばらく待ってから再度お試しください。'
    }
    return `Google Drive との通信でエラーが発生しました（status=${error.status}）。`
  }
  if (error instanceof UnsupportedSchemaError) {
    return 'Drive上のデータがこのアプリの対応バージョンと異なります。アプリを更新してください。'
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'オフラインのため同期できません。オンライン復帰後にもう一度お試しください。'
  }
  return '同期中にエラーが発生しました。もう一度お試しください。'
}

// ---------------------------------------------------------------------------
// 同期本体
// ---------------------------------------------------------------------------

interface RemoteLogEntry {
  fileId: string
  updatedAt: string
  deleted: boolean
  deletedAt: string
}

interface RemoteAttachmentEntry {
  fileId: string
  kind: 'photo' | 'signature'
}

function toRemoteLogMap(files: driveClient.DriveFileMeta[]): Map<string, RemoteLogEntry> {
  const map = new Map<string, RemoteLogEntry>()
  for (const f of files) {
    const uuid = f.appProperties?.uuid
    if (!uuid) continue
    map.set(uuid, {
      fileId: f.id,
      updatedAt: f.appProperties?.updatedAt ?? '',
      deleted: f.appProperties?.deleted === 'true',
      deletedAt: f.appProperties?.deletedAt ?? '',
    })
  }
  return map
}

function toRemoteAttachmentMap(files: driveClient.DriveFileMeta[]): Map<string, RemoteAttachmentEntry> {
  const map = new Map<string, RemoteAttachmentEntry>()
  for (const f of files) {
    const uuid = f.appProperties?.uuid
    if (!uuid) continue
    const kind = f.appProperties?.kind === 'signature' ? 'signature' : 'photo'
    map.set(uuid, { fileId: f.id, kind })
  }
  return map
}

function toRemoteLogBody(local: DiveLog): RemoteLogBody {
  const { id: _id, uuid: _uuid, photoIds: _photoIds, signatureId: _signatureId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = local
  return rest
}

interface EngineContext {
  token: string
  deviceId: string
  logsFolderId: string
  attachmentsFolderId: string
  remoteAttachmentMap: Map<string, RemoteAttachmentEntry>
  attachmentSyncRecordMap: Map<string, SyncRecord>
}

/**
 * 添付が Drive 上に実在することを保証する。ローカルの syncRecord の有無だけでなく、
 * リモートの添付一覧（`ctx.remoteAttachmentMap`）に実際にそのuuidが存在するかも確認し、
 * 存在しなければ syncRecord があっても再アップロードする。
 * ログ本体側と同様に REQ-4.7（Drive側で手動削除・不具合#1の巻き添え削除等への耐性）を添付にも適用する。
 */
async function ensureAttachmentsUploaded(
  ctx: EngineContext,
  attachments: { uuid: string; type: 'photo' | 'signature'; blob: Blob; mimeType: string; createdAt: string }[],
): Promise<SyncRecord[]> {
  const newRecords: SyncRecord[] = []
  await mapWithConcurrency(attachments, CONCURRENCY, async (att) => {
    const remoteEntry = ctx.remoteAttachmentMap.get(att.uuid)
    if (remoteEntry) {
      // Drive上に既に実在する。syncRecordが無ければ（記録漏れ等）ここで補うだけで、再アップロードはしない。
      if (!ctx.attachmentSyncRecordMap.has(att.uuid)) {
        const record: SyncRecord = {
          uuid: att.uuid,
          kind: 'attachment',
          remoteFileId: remoteEntry.fileId,
          syncedUpdatedAt: att.createdAt,
        }
        ctx.attachmentSyncRecordMap.set(att.uuid, record)
        newRecords.push(record)
      }
      return
    }

    // Drive側に実体が無い（未アップロード、手動削除、または不具合#1のような巻き添え削除）→ (再)アップロードする。
    const ext = att.mimeType.includes('png') ? 'png' : att.mimeType.includes('webp') ? 'webp' : 'jpg'
    const meta = await driveClient.createFile(ctx.token, {
      name: `${att.uuid}.${ext}`,
      parents: [ctx.attachmentsFolderId],
      mimeType: att.mimeType,
      appProperties: { uuid: att.uuid, kind: att.type },
      content: att.blob,
    })
    const record: SyncRecord = { uuid: att.uuid, kind: 'attachment', remoteFileId: meta.id, syncedUpdatedAt: att.createdAt }
    ctx.attachmentSyncRecordMap.set(att.uuid, record)
    ctx.remoteAttachmentMap.set(att.uuid, { fileId: meta.id, kind: att.type })
    newRecords.push(record)
  })
  return newRecords
}

async function buildPushPayload(local: DiveLog) {
  const ids = [...local.photoIds]
  if (local.signatureId != null) ids.push(local.signatureId)
  const attachments = await syncRepository.getAttachmentsByLocalIds(ids)
  const byId = new Map(attachments.map((a) => [a.id, a]))
  const photos = local.photoIds.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => a != null)
  const signature = local.signatureId != null ? (byId.get(local.signatureId) ?? null) : null
  return { photos, signature }
}

/** ログをDriveへ push する（新規作成 or 既存ファイルの更新）。 */
async function pushLog(ctx: EngineContext, local: DiveLog, existingFileId: string | undefined): Promise<SyncRecord[]> {
  const { photos, signature } = await buildPushPayload(local)
  const attachmentRecords = await ensureAttachmentsUploaded(ctx, [...photos, ...(signature ? [signature] : [])])

  const body: RemoteLogFile = {
    schemaVersion: SCHEMA_VERSION,
    uuid: local.uuid,
    createdAt: local.createdAt,
    updatedAt: local.updatedAt,
    deleted: false,
    deletedAt: null,
    deviceId: ctx.deviceId,
    log: toRemoteLogBody(local),
    photoUuids: photos.map((p) => p.uuid),
    signatureUuid: signature ? signature.uuid : null,
  }
  const appProperties = { uuid: local.uuid, updatedAt: local.updatedAt, deleted: 'false', deletedAt: '' }
  const content = JSON.stringify(body)

  const meta = existingFileId
    ? await driveClient.updateFile(ctx.token, existingFileId, { mimeType: 'application/json', appProperties, content })
    : await driveClient.createFile(ctx.token, {
        name: `${local.uuid}.json`,
        parents: [ctx.logsFolderId],
        mimeType: 'application/json',
        appProperties,
        content,
      })

  const logRecord: SyncRecord = { uuid: local.uuid, kind: 'diveLog', remoteFileId: meta.id, syncedUpdatedAt: local.updatedAt }
  return [logRecord, ...attachmentRecords]
}

/** ログの削除を Drive 側へ反映する（実ファイルは消さず、墓標のメタデータへ置き換える。REQ-5.2）。 */
async function pushDeleteMarker(ctx: EngineContext, uuid: string, remoteFileId: string, deletedAt: string): Promise<SyncRecord> {
  const body: RemoteLogFile = {
    schemaVersion: SCHEMA_VERSION,
    uuid,
    createdAt: deletedAt,
    updatedAt: deletedAt,
    deleted: true,
    deletedAt,
    deviceId: ctx.deviceId,
    log: null,
    photoUuids: [],
    signatureUuid: null,
  }
  const appProperties = { uuid, updatedAt: deletedAt, deleted: 'true', deletedAt }
  const meta = await driveClient.updateFile(ctx.token, remoteFileId, {
    mimeType: 'application/json',
    appProperties,
    content: JSON.stringify(body),
  })
  return { uuid, kind: 'diveLog', remoteFileId: meta.id, syncedUpdatedAt: deletedAt }
}

/** リモートのログ本文と、参照する未取得の添付をダウンロードして解析する。 */
async function fetchRemoteLogFile(ctx: EngineContext, fileId: string): Promise<RemoteLogFile> {
  const text = await driveClient.downloadFileText(ctx.token, fileId)
  const parsed = JSON.parse(text) as RemoteLogFile
  if (parsed.schemaVersion > SCHEMA_VERSION) throw new UnsupportedSchemaError()
  return parsed
}

async function downloadMissingAttachments(ctx: EngineContext, neededUuids: string[]): Promise<Map<string, Blob>> {
  if (neededUuids.length === 0) return new Map()
  const alreadyLocal = new Set((await syncRepository.getAttachmentsByUuids(neededUuids)).map((a) => a.uuid))
  const toDownload = neededUuids.filter((u) => !alreadyLocal.has(u))
  const blobs = new Map<string, Blob>()
  await mapWithConcurrency(toDownload, CONCURRENCY, async (uuid) => {
    const remoteAtt = ctx.remoteAttachmentMap.get(uuid)
    if (!remoteAtt) throw new Error(`Drive上に添付ファイルが見つかりません: ${uuid}`)
    blobs.set(uuid, await driveClient.downloadFileBlob(ctx.token, remoteAtt.fileId))
  })
  return blobs
}

/**
 * リモートのログを1件ローカルへ pull する（作成・更新の両方）。
 * `tombstoneUuidsToClear` を渡した場合（#6の削除復元など）、その墓標の消化も
 * 添付・ログ本体の書き込みと同一の Dexie トランザクションで確定させる（design.md「トランザクション境界」）。
 * 別トランザクションに分けると、途中で中断した際に L・R とも存在するが syncRecord が無い状態が生じ、
 * 次回同期で内容が同一でも競合と誤判定されてしまう（不具合#6）。
 */
async function pullLog(ctx: EngineContext, remoteFileId: string, tombstoneUuidsToClear: string[] = []): Promise<SyncRecord[]> {
  const remoteFile = await fetchRemoteLogFile(ctx, remoteFileId)
  const neededUuids = [...remoteFile.photoUuids, ...(remoteFile.signatureUuid ? [remoteFile.signatureUuid] : [])]
  const blobs = await downloadMissingAttachments(ctx, neededUuids)

  // 添付は、今回ダウンロードした分だけでなく、既にローカルに存在していた（が未だ
  // syncRecord を持たない）ものについても記録する。前回同期が途中で中断され、
  // ローカルの添付だけ作成済みだった場合などに、次回以降の重複アップロードを防ぐため。
  const now = new Date().toISOString()
  const attachmentRecords: SyncRecord[] = []
  for (const uuid of neededUuids) {
    if (ctx.attachmentSyncRecordMap.has(uuid)) continue
    const remoteAtt = ctx.remoteAttachmentMap.get(uuid)
    if (!remoteAtt) continue
    const record: SyncRecord = { uuid, kind: 'attachment', remoteFileId: remoteAtt.fileId, syncedUpdatedAt: now }
    ctx.attachmentSyncRecordMap.set(uuid, record)
    attachmentRecords.push(record)
  }

  const logRecord: SyncRecord = { uuid: remoteFile.uuid, kind: 'diveLog', remoteFileId, syncedUpdatedAt: remoteFile.updatedAt }
  const newSyncRecords = [logRecord, ...attachmentRecords]

  await syncRepository.applyRemoteLog(remoteFile, blobs, newSyncRecords, tombstoneUuidsToClear)

  return newSyncRecords
}

async function buildLocalSnapshot(local: DiveLog): Promise<DiveLogSnapshot> {
  const { photos, signature } = await buildPushPayload(local)
  const toContent = (a: { uuid: string; type: 'photo' | 'signature'; blob: Blob }): AttachmentContent => ({
    uuid: a.uuid,
    kind: a.type,
    blob: a.blob,
  })
  return {
    log: toRemoteLogBody(local),
    createdAt: local.createdAt,
    updatedAt: local.updatedAt,
    photos: photos.map(toContent),
    signature: signature ? toContent(signature) : null,
  }
}

async function downloadRemoteSnapshot(ctx: EngineContext, remoteFileId: string): Promise<DiveLogSnapshot> {
  const remoteFile = await fetchRemoteLogFile(ctx, remoteFileId)
  if (!remoteFile.log) throw new Error('downloadRemoteSnapshot: 削除済みのログは競合コピーの対象になりません')
  const neededUuids = [...remoteFile.photoUuids, ...(remoteFile.signatureUuid ? [remoteFile.signatureUuid] : [])]

  const localAttachments = await syncRepository.getAttachmentsByUuids(neededUuids)
  const localByUuid = new Map(localAttachments.map((a) => [a.uuid, a]))
  const missing = neededUuids.filter((u) => !localByUuid.has(u))
  const downloaded = await downloadMissingAttachments(ctx, missing)

  function resolveBlob(uuid: string): Blob {
    const local = localByUuid.get(uuid)
    if (local) return local.blob
    const blob = downloaded.get(uuid)
    if (!blob) throw new Error(`競合コピー用の添付が取得できません: ${uuid}`)
    return blob
  }

  return {
    log: remoteFile.log,
    createdAt: remoteFile.createdAt,
    updatedAt: remoteFile.updatedAt,
    photos: remoteFile.photoUuids.map((uuid) => ({ uuid, kind: 'photo' as const, blob: resolveBlob(uuid) })),
    signature: remoteFile.signatureUuid
      ? { uuid: remoteFile.signatureUuid, kind: 'signature' as const, blob: resolveBlob(remoteFile.signatureUuid) }
      : null,
  }
}

interface ResolveOutcome {
  pushed: boolean
  pulled: boolean
  deletedLocally: boolean
  conflict: boolean
  newSyncRecords: SyncRecord[]
  consumedTombstoneUuids: string[]
}

const EMPTY_OUTCOME: ResolveOutcome = {
  pushed: false,
  pulled: false,
  deletedLocally: false,
  conflict: false,
  newSyncRecords: [],
  consumedTombstoneUuids: [],
}

interface ResolveInput {
  uuid: string
  local: DiveLog | undefined
  remote: RemoteLogEntry | undefined
  syncRecord: SyncRecord | undefined
  tombstoneDeletedAt: string | undefined
}

/** 決定表（specs/google-drive-sync/design.md「差分判定と競合解決の決定表」）に基づき、ログ1件分の同期を実行する。 */
async function resolveLog(ctx: EngineContext, input: ResolveInput): Promise<ResolveOutcome> {
  const { uuid, local, remote, syncRecord, tombstoneDeletedAt } = input

  // #6 / #7: ローカルに削除の墓標がある
  if (tombstoneDeletedAt !== undefined) {
    if (remote && !remote.deleted) {
      // #6: 削除 vs 更新
      if (remote.updatedAt > tombstoneDeletedAt) {
        // 復元（REQ-5.4）。syncRecords の確定・墓標の消化を pullLog 内の同一トランザクションで行う（不具合#6）。
        const newSyncRecords = await pullLog(ctx, remote.fileId, [uuid])
        return { ...EMPTY_OUTCOME, pulled: true, newSyncRecords, consumedTombstoneUuids: [uuid] }
      }
      const record = await pushDeleteMarker(ctx, uuid, remote.fileId, tombstoneDeletedAt)
      return { ...EMPTY_OUTCOME, pushed: true, newSyncRecords: [record], consumedTombstoneUuids: [uuid] }
    }
    // #7: 削除の伝播完了（リモートは存在しないか、既に墓標）
    return { ...EMPTY_OUTCOME, consumedTombstoneUuids: [uuid] }
  }

  // #1 / #2: ローカルのみに存在
  if (local && !remote) {
    const newSyncRecords = await pushLog(ctx, local, undefined) // 新規、または REQ-4.7（Drive側の手動削除への対応）
    return { ...EMPTY_OUTCOME, pushed: true, newSyncRecords }
  }

  // #3 / #4: リモートのみに存在（生存）
  if (!local && remote && !remote.deleted) {
    const newSyncRecords = await pullLog(ctx, remote.fileId)
    return { ...EMPTY_OUTCOME, pulled: true, newSyncRecords }
  }

  // #9: どちらにも実体がない（リモートが墓標のみ、ローカルにも墓標なし）
  if (!local && (!remote || remote.deleted)) {
    return EMPTY_OUTCOME
  }

  if (local && remote) {
    if (remote.deleted) {
      // #8: リモートで削除済み
      if (local.updatedAt > remote.deletedAt) {
        const newSyncRecords = await pushLog(ctx, local, remote.fileId) // ローカルの更新で復活
        return { ...EMPTY_OUTCOME, pushed: true, newSyncRecords }
      }
      await syncRepository.deleteLogByUuid(uuid) // ローカル削除（墓標は作らない。REQ-5.3）
      return { ...EMPTY_OUTCOME, deletedLocally: true }
    }

    // #5: 双方に存在（生存） → 副表
    const localChanged = !syncRecord || local.updatedAt !== syncRecord.syncedUpdatedAt
    const remoteChanged = !syncRecord || remote.updatedAt !== syncRecord.syncedUpdatedAt

    if (!localChanged && !remoteChanged) return EMPTY_OUTCOME
    if (localChanged && !remoteChanged) {
      const newSyncRecords = await pushLog(ctx, local, remote.fileId)
      return { ...EMPTY_OUTCOME, pushed: true, newSyncRecords }
    }
    if (!localChanged && remoteChanged) {
      const newSyncRecords = await pullLog(ctx, remote.fileId)
      return { ...EMPTY_OUTCOME, pulled: true, newSyncRecords }
    }

    // 競合（REQ-6.1〜6.6）: 更新日時の新しい方を勝者とする。同値ならリモートを勝者とする。
    // 競合コピー（敗者側の退避）は、勝者データの適用（pull/push）より先に行う。
    // 先に勝者を適用してから競合コピーを作る順序だと、その間に処理が中断した場合、
    // 敗者の内容はどこにも残らず復元不能になる（不具合#8）。
    // 競合コピーの作成に失敗した場合はここで例外が伝播し、勝者側の適用は行わない。
    const remoteWins = remote.updatedAt >= local.updatedAt
    if (remoteWins) {
      const loserSnapshot = await buildLocalSnapshot(local)
      await syncRepository.createConflictCopy(loserSnapshot)
      const newSyncRecords = await pullLog(ctx, remote.fileId)
      return { ...EMPTY_OUTCOME, pulled: true, conflict: true, newSyncRecords }
    }
    const loserSnapshot = await downloadRemoteSnapshot(ctx, remote.fileId)
    await syncRepository.createConflictCopy(loserSnapshot)
    const newSyncRecords = await pushLog(ctx, local, remote.fileId)
    return { ...EMPTY_OUTCOME, pushed: true, conflict: true, newSyncRecords }
  }

  return EMPTY_OUTCOME
}

async function checkManifestCompatible(ctx: EngineContext, rootFolderId: string): Promise<boolean> {
  const files = await driveClient.listFiles(ctx.token, rootFolderId)
  const manifestFile = files.find((f) => f.name === 'manifest.json')
  if (!manifestFile) return true // 初回同期、manifest未作成
  try {
    const text = await driveClient.downloadFileText(ctx.token, manifestFile.id)
    const manifest = JSON.parse(text) as RemoteManifest
    return manifest.schemaVersion <= SCHEMA_VERSION
  } catch {
    return true // 読めない場合は同期をブロックしない（ベストエフォート）
  }
}

async function updateManifest(ctx: EngineContext, rootFolderId: string): Promise<void> {
  const files = await driveClient.listFiles(ctx.token, rootFolderId)
  const manifestFile = files.find((f) => f.name === 'manifest.json')
  const now = new Date().toISOString()

  let devices: { deviceId: string; lastSyncAt: string }[] = []
  if (manifestFile) {
    try {
      const text = await driveClient.downloadFileText(ctx.token, manifestFile.id)
      devices = (JSON.parse(text) as RemoteManifest).devices ?? []
    } catch {
      devices = []
    }
  }
  devices = devices.filter((d) => d.deviceId !== ctx.deviceId)
  devices.push({ deviceId: ctx.deviceId, lastSyncAt: now })

  const manifest: RemoteManifest = { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, updatedAt: now, devices }
  const content = JSON.stringify(manifest)
  if (manifestFile) {
    await driveClient.updateFile(ctx.token, manifestFile.id, { mimeType: 'application/json', content })
  } else {
    await driveClient.createFile(ctx.token, { name: 'manifest.json', parents: [rootFolderId], mimeType: 'application/json', content })
  }
}

function failResult(errorMessage: string): SyncResult {
  return { ok: false, pushed: 0, pulled: 0, deletedLocally: 0, conflicts: 0, errorMessage }
}

async function runSyncOnce(): Promise<SyncResult> {
  setStatus({ phase: 'running' })
  // このタイミングでは「保留中のオフライン同期要求」はまだ解決されていない可能性があるため、
  // 一旦クリアしておき、実際にオフラインで再度ブロックされた場合にのみ改めて立てる。
  // こうしないと、過去のオフライン試行時に立てたフラグが、無関係な将来の online イベントで
  // 意図しない自動同期を引き起こしてしまう。
  offlineSyncPending = false
  try {
    const settings = await syncRepository.getSyncSettings()
    if (!settings.enabled) {
      const result = failResult('同期は無効になっています。')
      setStatus({ phase: 'idle', lastResult: result })
      return result
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // オンライン復帰時に自動的に再試行できるよう、保留フラグを立てておく（REQ-7.2）。
      offlineSyncPending = true
      const result = failResult('オフラインのため同期できません。オンライン復帰後にもう一度お試しください。')
      setStatus({ phase: 'idle', lastResult: result, lastErrorMessage: result.errorMessage })
      return result
    }

    const token = await googleAuth.ensureAccessToken()
    if (!token) {
      const result = failResult('Google アカウントへの再接続が必要です。設定画面から再接続してください。')
      setStatus({ phase: 'error', lastResult: result, lastErrorMessage: result.errorMessage })
      return result
    }

    let rootFolderId = settings.rootFolderId
    let logsFolderId = settings.logsFolderId
    let attachmentsFolderId = settings.attachmentsFolderId
    if (!rootFolderId || !logsFolderId || !attachmentsFolderId) {
      const resolved = await driveClient.ensureAppFolders(token)
      rootFolderId = resolved.rootFolderId
      logsFolderId = resolved.logsFolderId
      attachmentsFolderId = resolved.attachmentsFolderId
      await syncRepository.updateSyncSettings(resolved)
    }

    const { logs, syncRecords, tombstones } = await syncRepository.listAllForSync()
    const attachmentSyncRecordMap = new Map(syncRecords.filter((r) => r.kind === 'attachment').map((r) => [r.uuid, r]))

    const ctx: EngineContext = {
      token,
      deviceId: settings.deviceId,
      logsFolderId,
      attachmentsFolderId,
      remoteAttachmentMap: toRemoteAttachmentMap(await driveClient.listFiles(token, attachmentsFolderId)),
      attachmentSyncRecordMap,
    }

    if (!(await checkManifestCompatible(ctx, rootFolderId))) {
      const result = failResult('Drive上のデータの形式がこのアプリのバージョンに対応していません。アプリを更新してください。')
      setStatus({ phase: 'error', lastResult: result, lastErrorMessage: result.errorMessage })
      return result
    }

    const remoteLogFiles = await driveClient.listFiles(token, logsFolderId)
    const remoteMap = toRemoteLogMap(remoteLogFiles)

    const logSyncRecordMap = new Map(syncRecords.filter((r) => r.kind === 'diveLog').map((r) => [r.uuid, r]))
    const logTombstoneMap = new Map(tombstones.filter((t) => t.kind === 'diveLog').map((t) => [t.uuid, t.deletedAt]))
    const attachmentTombstoneMap = new Map(tombstones.filter((t) => t.kind === 'attachment').map((t) => [t.uuid, t.deletedAt]))
    const localByUuid = new Map(logs.map((l) => [l.uuid, l]))

    const allUuids = new Set<string>([...localByUuid.keys(), ...remoteMap.keys(), ...logTombstoneMap.keys()])

    let pushed = 0
    let pulled = 0
    let deletedLocally = 0
    let conflicts = 0

    // ログ1件ごとに処理を完結させ、都度 syncRecords / tombstones を確定させる。
    // こうすることで、途中でエラーが起きても既に成功した分の進捗が失われず、
    // 次回の同期はやり直しにならずに続きから再開できる（REQ-4.6 / 7.3）。
    for (const uuid of allUuids) {
      const outcome = await resolveLog(ctx, {
        uuid,
        local: localByUuid.get(uuid),
        remote: remoteMap.get(uuid),
        syncRecord: logSyncRecordMap.get(uuid),
        tombstoneDeletedAt: logTombstoneMap.get(uuid),
      })
      if (outcome.pushed) pushed++
      if (outcome.pulled) pulled++
      if (outcome.deletedLocally) deletedLocally++
      if (outcome.conflict) conflicts++
      if (outcome.newSyncRecords.length > 0) await syncRepository.markSynced(outcome.newSyncRecords)
      if (outcome.consumedTombstoneUuids.length > 0) await syncRepository.clearTombstones(outcome.consumedTombstoneUuids)
    }

    // 添付単体の墓標（写真だけ削除して更新した場合など）を処理する。
    // ログ側のJSON更新が先に完了している前提のため、必ずログの処理より後に行う。
    //
    // ただし、直前のログ処理（#6の削除復元や、#5の競合でリモート勝ちになった場合など）によって、
    // この添付が「現在の（適用後の）ログ」から再び参照されるようになっていることがある。
    // その状態のままDriveから削除すると、ログJSONが存在しない添付を参照する状態になり、
    // 他端末のpullがエラーで壊れる（不具合#1）。削除前に、現在ローカルのログが参照している
    // 添付の集合を確認し、参照されていれば削除をスキップして墓標だけ消化する。
    const stillReferencedUuids = await syncRepository.getReferencedAttachmentUuids()
    for (const [attUuid] of attachmentTombstoneMap) {
      if (stillReferencedUuids.has(attUuid)) {
        await syncRepository.clearTombstones([attUuid])
        continue
      }
      const record = ctx.attachmentSyncRecordMap.get(attUuid)
      if (record) {
        try {
          await driveClient.deleteFile(token, record.remoteFileId)
        } catch {
          continue // 削除に失敗した場合は墓標を残し、次回の同期で再試行する
        }
      }
      await syncRepository.clearTombstones([attUuid])
    }

    await updateManifest(ctx, rootFolderId)
    await syncRepository.updateSyncSettings({ lastSyncAt: new Date().toISOString() })

    const result: SyncResult = { ok: true, pushed, pulled, deletedLocally, conflicts }
    setStatus({ phase: 'idle', lastResult: result })
    return result
  } catch (error) {
    const message = toUserMessage(error)
    const result = failResult(message)
    setStatus({ phase: 'error', lastResult: result, lastErrorMessage: message })
    return result
  }
}
