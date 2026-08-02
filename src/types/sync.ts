/**
 * Google Drive 同期に関するドメイン型。
 * 詳細は specs/google-drive-sync/design.md を参照。
 */

export type SyncKind = 'diveLog' | 'attachment'

/** 前回同期が成功した時点の状態（差分判定の基準点）。 */
export interface SyncRecord {
  uuid: string
  kind: SyncKind
  remoteFileId: string
  /** 最後に同期が成功した時点の DiveLog.updatedAt（添付は createdAt） */
  syncedUpdatedAt: string
}

/** 削除されたレコードの識別子と削除日時（削除を他端末へ伝播させるための記録）。 */
export interface Tombstone {
  uuid: string
  kind: SyncKind
  deletedAt: string
}

/** 同期の設定・状態（アプリの設定値であり、同期対象データそのものには含めない）。 */
export interface SyncSettings {
  enabled: boolean
  autoSync: boolean
  accountEmail?: string
  rootFolderId?: string
  logsFolderId?: string
  attachmentsFolderId?: string
  lastSyncAt?: string
  deviceId: string
}
