/**
 * 同期エンジンで使う型定義（RemoteLogFile / SyncPlan の実行結果 / 状態など）。
 * `sync/` は React にも Dexie にも依存しない純粋な TypeScript モジュールとする。
 */
import type { DiveLog } from '../types/diveLog'

/**
 * Drive 上の `logs/<uuid>.json` の `log` フィールド（ローカル専用の id/uuid/photoIds/signatureId/createdAt/updatedAt は含まない）。
 * `DiveLogDraft` と異なり、フォームが直接編集しない項目（observations / 廃止済みの gear）も含む
 * （`toRemoteLogBody()` の rest スプレッドが実際に運ぶ内容と型を一致させるため。REQ-8.6）。
 */
export type RemoteLogBody = Omit<DiveLog, 'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt'>

/** Drive 上の `logs/<uuid>.json` ファイルの中身。 */
export interface RemoteLogFile {
  schemaVersion: number
  uuid: string
  createdAt: string
  updatedAt: string
  deleted: boolean
  deletedAt: string | null
  deviceId: string
  log: RemoteLogBody | null
  photoUuids: string[]
  signatureUuid: string | null
}

/** Drive 上の `manifest.json` の中身。 */
export interface RemoteManifest {
  schemaVersion: number
  appVersion: string
  updatedAt: string
  devices: { deviceId: string; lastSyncAt: string }[]
}

export interface AttachmentContent {
  uuid: string
  kind: 'photo' | 'signature'
  blob: Blob
}

/** 競合コピー作成のために必要な、あるログ1件分の「敗者側」の内容（blobそのものを保持する）。 */
export interface DiveLogSnapshot {
  log: RemoteLogBody
  createdAt: string
  updatedAt: string
  photos: AttachmentContent[]
  signature: AttachmentContent | null
}

export interface SyncResult {
  ok: boolean
  pushed: number
  pulled: number
  deletedLocally: number
  conflicts: number
  errorMessage?: string
}

export type SyncPhase = 'idle' | 'running' | 'error'

export interface SyncStatusSnapshot {
  phase: SyncPhase
  lastResult?: SyncResult
  lastErrorMessage?: string
}

/** Drive 上のデータが本アプリの対応スキーマバージョンの範囲外だったときのエラー（REQ-7.6）。 */
export class UnsupportedSchemaError extends Error {
  constructor(message = 'Drive上のデータのスキーマバージョンに対応していません') {
    super(message)
    this.name = 'UnsupportedSchemaError'
  }
}
