import Dexie, { type Table } from 'dexie'
import type { Attachment, DiveLog } from '../types/diveLog'

export class DiveLogDatabase extends Dexie {
  diveLogs!: Table<DiveLog, number>
  attachments!: Table<Attachment, number>

  constructor() {
    super('DiveLogDatabase')
    this.version(1).stores({
      diveLogs: '++id, date, siteName, createdAt',
      attachments: '++id, type',
    })
  }
}

export const db = new DiveLogDatabase()
