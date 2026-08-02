/**
 * ログの作成・更新・削除が確定したことを、リポジトリの外側（同期エンジン等）へ
 * 通知するための軽量なイベント発行機構。
 *
 * `db/diveLogRepository.ts` が `sync/` に直接依存しないようにするための間接層。
 * 購読側（`sync/syncEngine.ts`）はここに登録し、自動同期のデバウンス実行に使う。
 */

type Listener = () => void

const listeners = new Set<Listener>()

/** ログ・添付の作成/更新/削除が確定した後に呼び出す。 */
export function notifyLocalChange(): void {
  for (const listener of listeners) listener()
}

/** 変更通知を購読する。戻り値の関数を呼ぶと購読解除する。 */
export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
