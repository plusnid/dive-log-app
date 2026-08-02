/**
 * ストレージ永続化・使用量に関するユーティリティ。
 *
 * Dexie には依存しない（案内の状態は IndexedDB ではなく localStorage 等に保存する想定のため）。
 */

export type PersistStorageResult = 'persisted' | 'denied' | 'unsupported'

/**
 * ストレージ永続化（`navigator.storage.persist()`）を要求する。
 * API が存在しない環境では 'unsupported' を返し、呼び出し側はエラー扱いしない（REQ-3.3）。
 */
export async function requestPersistentStorage(): Promise<PersistStorageResult> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported'

  try {
    const persisted = await navigator.storage.persist()
    return persisted ? 'persisted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

export interface StorageEstimate {
  usage?: number
  quota?: number
}

/**
 * 推定使用量・上限を取得する。API が存在しない、または取得に失敗した場合は null を返す。
 */
export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null

  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}

/** 現在ストレージが永続化されているかどうか（案内表示用。API がなければ false）。 */
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false

  try {
    return await navigator.storage.persisted()
  } catch {
    return false
  }
}
