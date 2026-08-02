/**
 * Google Identity Services (GIS) の最小限のアンビエント型定義。
 * `https://accounts.google.com/gsi/client` を動的に読み込んだ後、
 * `window.google.accounts.oauth2` として提供される。
 */
export {}

declare global {
  interface GoogleTokenResponse {
    access_token: string
    expires_in: number
    scope: string
    token_type: string
    error?: string
    error_description?: string
  }

  /**
   * ユーザーがポップアップを閉じた場合など、`callback` が呼ばれずに終わるケースで
   * GIS が通知してくるエラー（例: `{ type: 'popup_closed' }`）。REQ-1.5。
   */
  interface GoogleTokenClientErrorResponse {
    type: string
    message?: string
  }

  interface GoogleTokenClient {
    callback: (response: GoogleTokenResponse) => void
    error_callback?: (error: GoogleTokenClientErrorResponse) => void
    requestAccessToken: (overrideConfig?: { prompt?: '' | 'consent' | 'select_account' }) => void
  }

  interface GoogleTokenClientConfig {
    client_id: string
    scope: string
    callback: (response: GoogleTokenResponse) => void
    error_callback?: (error: GoogleTokenClientErrorResponse) => void
  }

  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
          revoke: (accessToken: string, done: () => void) => void
        }
      }
    }
  }
}
