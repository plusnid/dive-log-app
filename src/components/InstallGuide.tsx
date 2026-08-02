import { useState } from 'react'
import { getPlatform, isStandalone } from '../platform/environment'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import './InstallGuide.css'

const DISMISSED_KEY = 'dive-log-app:install-guide-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * ブラウザタブ起動時に、プラットフォームに応じたホーム画面追加の案内を表示する（REQ-2.2〜2.4）。
 * 一覧画面の先頭に配置する想定。
 */
export function InstallGuide() {
  const [dismissed, setDismissed] = useState(readDismissed)
  const { canInstall, promptInstall } = useInstallPrompt()

  if (isStandalone() || dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // localStorageが使えない環境では記憶できないが、案内自体は問題なく表示できるため無視する
    }
    setDismissed(true)
  }

  async function handleInstallClick() {
    await promptInstall()
    dismiss()
  }

  const platform = getPlatform()

  return (
    <div className="install-guide" role="note">
      <div className="install-guide__header">
        <p className="install-guide__title">ホーム画面に追加すると便利です</p>
        <button type="button" className="install-guide__close" onClick={dismiss} aria-label="この案内を閉じる">
          ×
        </button>
      </div>

      {platform === 'ios' && (
        <p>
          共有ボタンから「ホーム画面に追加」を選択してください。ブラウザ表示中に入力した記録は、追加後のホーム画面アプリに引き継がれない場合があります。
        </p>
      )}
      {platform === 'android' && (
        <p>
          ブラウザのメニューから「アプリをインストール」を選択するか、下のボタンからインストールできます。
        </p>
      )}
      {platform === 'other' && <p>ブラウザのメニューからホーム画面に追加できます。</p>}

      {canInstall && (
        <button type="button" onClick={handleInstallClick}>
          インストール
        </button>
      )}
    </div>
  )
}
