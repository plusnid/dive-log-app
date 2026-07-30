import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

export function useDiveLogs() {
  return useLiveQuery(() => db.diveLogs.orderBy('date').reverse().toArray(), [])
}
