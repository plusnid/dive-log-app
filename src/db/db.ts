import Dexie, { type Table } from 'dexie'
import type { Attachment, DiveLog } from '../types/diveLog'
import type { SyncRecord, Tombstone } from '../types/sync'
import { newUuid } from './uuid'

/** `syncMeta` は `{ key, value }` 形式の単純なKVS（同期設定・状態を保持する）。 */
export interface SyncMetaRow {
  key: string
  value: unknown
}

export class DiveLogDatabase extends Dexie {
  diveLogs!: Table<DiveLog, number>
  attachments!: Table<Attachment, number>
  syncRecords!: Table<SyncRecord, string>
  tombstones!: Table<Tombstone, string>
  syncMeta!: Table<SyncMetaRow, string>

  constructor() {
    super('DiveLogDatabase')
    this.version(1).stores({
      diveLogs: '++id, date, siteName, createdAt',
      attachments: '++id, type',
    })

    // version 2: Google Drive 同期（uuid付与、墓標、同期メタ）を追加する。
    // 既存レコードには uuid が存在しないため、upgrade で backfill する（REQ-2.4）。
    this.version(2)
      .stores({
        diveLogs: '++id, date, siteName, createdAt, &uuid, updatedAt',
        attachments: '++id, type, &uuid',
        syncRecords: '&uuid, kind',
        tombstones: '&uuid, kind, deletedAt',
        syncMeta: '&key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('diveLogs')
          .toCollection()
          .modify((log: DiveLog) => {
            log.uuid = newUuid()
          })
        await tx
          .table('attachments')
          .toCollection()
          .modify((attachment: Attachment) => {
            attachment.uuid = newUuid()
          })
      })
  }
}

export const db = new DiveLogDatabase()
