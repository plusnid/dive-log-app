/**
 * プラットフォーム/実行環境の判定ユーティリティ。
 *
 * 機能の有無の分岐は原則として機能検出（feature detection）で行う（REQ-1.3）。
 * `getPlatform()` はインストール手順の案内文言の出し分けにのみ使用し、
 * 機能の有効・無効の判定には使用しないこと。
 */

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

/** スタンドアロン起動（ホーム画面に追加したアイコンからの起動）かどうかを判定する。 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  const matchesDisplayModeStandalone =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches

  // iOS Safari 独自のプロパティ（display-mode の matchMedia に対応しないバージョンがあるため）
  const isIosStandalone = (navigator as NavigatorWithStandalone).standalone === true

  return matchesDisplayModeStandalone || isIosStandalone
}

/**
 * インストール手順の案内文言を出し分けるためだけのプラットフォーム判定。
 * ユーザーエージェント文字列に依存するため、機能分岐には使用しないこと（REQ-1.3）。
 */
export function getPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent ?? ''

  // iPadOS 13+ は Mac として UA を送出するため、タッチ対応で判定する
  const isIPadOS = ua.includes('Macintosh') && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || isIPadOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}
