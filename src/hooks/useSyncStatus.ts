import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSyncSettingsRaw, defaultSyncSettings } from '../db/syncRepository'
import { getStatus, subscribeStatus } from '../sync/syncEngine'
import type { SyncSettings } from '../types/sync'
import type { SyncStatusSnapshot } from '../sync/syncTypes'

export interface UseSyncStatusResult {
  settings: SyncSettings
  status: SyncStatusSnapshot
}

/** 同期の設定（`syncMeta`）と実行状態を購読する。 */
export function useSyncStatus(): UseSyncStatusResult {
  const settingsRow = useLiveQuery(() => getSyncSettingsRaw(), [])
  const [status, setStatus] = useState<SyncStatusSnapshot>(() => getStatus())

  useEffect(() => subscribeStatus(setStatus), [])

  return { settings: settingsRow ?? defaultSyncSettings, status }
}
