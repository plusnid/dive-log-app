import { useEffect, useState } from 'react'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { connect, disconnect, isSyncConfigured, requestSync, setAutoSync } from '../sync/syncEngine'
import { getStorageEstimate, isStoragePersisted, type StorageEstimate } from '../platform/storage'

interface SyncSettingsViewProps {
  onBack: () => void
}

function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return '不明'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ja-JP')
}

export function SyncSettingsView({ onBack }: SyncSettingsViewProps) {
  const { settings, status } = useSyncStatus()
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [syncNowError, setSyncNowError] = useState<string | null>(null)

  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)

  useEffect(() => {
    let cancelled = false
    isStoragePersisted().then((result) => {
      if (!cancelled) setPersisted(result)
    })
    getStorageEstimate().then((result) => {
      if (!cancelled) setEstimate(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleConnect() {
    setConnecting(true)
    setConnectError(null)
    const result = await connect()
    setConnecting(false)
    if (!result.ok) setConnectError(result.errorMessage)
  }

  async function handleDisconnect() {
    await disconnect()
    setShowDisconnectConfirm(false)
  }

  async function handleSyncNow() {
    setSyncNowError(null)
    const result = await requestSync()
    // オフライン等で実行されなかった場合も、その場でユーザーに分かるように表示する（REQ-7.2）。
    // 通常は subscribeStatus 経由でも同じ内容が status.lastErrorMessage に反映されるが、
    // 明示的にここでも戻り値を使うことで、ボタン操作の結果が確実に画面へ反映されるようにする。
    if (!result.ok && result.errorMessage) setSyncNowError(result.errorMessage)
  }

  const syncConfigured = isSyncConfigured()

  return (
    <div className="view">
      <div className="view__header">
        <button type="button" onClick={onBack}>
          ← 戻る
        </button>
        <h1>設定</h1>
      </div>

      <section className="data-management">
        <h2>データ管理</h2>

        {syncConfigured && (
          <div className="sync-settings">
            <h3>Google Drive 同期</h3>

            {!settings.enabled ? (
              <>
                <p>
                  同期を有効にすると、あなた自身の Google
                  アカウントに接続し、ダイビングログの記録内容・添付写真・ガイドのサイン画像を、あなたの Google
                  Drive 内に作成する専用フォルダへ保存します。他のユーザーと共有されることはありません。
                </p>
                {connectError && (
                  <p className="form-error" role="alert">
                    {connectError}
                  </p>
                )}
                <button type="button" onClick={handleConnect} disabled={connecting}>
                  {connecting ? '接続中...' : 'Google Drive に接続'}
                </button>
              </>
            ) : (
              <>
                <dl>
                  <dt>接続中のアカウント</dt>
                  <dd>{settings.accountEmail ?? '取得できませんでした'}</dd>
                  <dt>同期先フォルダ</dt>
                  <dd>ダイビングログ（マイドライブ直下）</dd>
                  <dt>同期状態</dt>
                  <dd>
                    {status.phase === 'running'
                      ? '同期中...'
                      : status.phase === 'error' || status.lastErrorMessage
                        ? 'エラー'
                        : settings.lastSyncAt
                          ? '完了'
                          : '未同期'}
                    {status.lastResult?.conflicts
                      ? `（競合 ${status.lastResult.conflicts} 件を検出し、競合コピーを作成しました）`
                      : ''}
                  </dd>
                  <dt>最終同期日時</dt>
                  <dd>{formatDateTime(settings.lastSyncAt)}</dd>
                </dl>

                {(syncNowError ?? status.lastErrorMessage) && (
                  <p className="form-error" role="alert">
                    {syncNowError ?? status.lastErrorMessage}
                  </p>
                )}

                <div className="view__actions">
                  <button type="button" onClick={handleSyncNow} disabled={status.phase === 'running'}>
                    {status.phase === 'running' ? '同期中...' : '今すぐ同期'}
                  </button>
                </div>

                <label className="sync-settings__toggle">
                  <input
                    type="checkbox"
                    checked={settings.autoSync}
                    onChange={(e) => void setAutoSync(e.target.checked)}
                  />
                  自動同期を有効にする（アプリ起動時・オンライン復帰時・記録の変更後に自動的に同期します）
                </label>

                {!showDisconnectConfirm ? (
                  <button type="button" onClick={() => setShowDisconnectConfirm(true)}>
                    接続を解除
                  </button>
                ) : (
                  <div className="sync-settings__disconnect-confirm">
                    <p>
                      接続を解除しても、Google Drive
                      上に保存済みのデータは削除されません。完全に削除したい場合は、Drive側で手動削除するか、Googleアカウントの設定画面からこのアプリのアクセス権を取り消してください。
                    </p>
                    <div className="view__actions">
                      <button type="button" onClick={handleDisconnect}>
                        解除する
                      </button>
                      <button type="button" onClick={() => setShowDisconnectConfirm(false)}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="storage-status">
          <h3>ストレージの状態</h3>
          <p>
            永続化:{' '}
            {persisted == null
              ? '確認中...'
              : persisted
                ? '有効（ブラウザによる自動削除の対象になりにくい状態です）'
                : '無効（ブラウザの判断でデータが削除される場合があります）'}
          </p>
          {estimate && (estimate.usage != null || estimate.quota != null) && (
            <p>
              使用量の目安: {formatBytes(estimate.usage)} / {formatBytes(estimate.quota)}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
