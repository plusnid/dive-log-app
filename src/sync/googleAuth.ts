/**
 * Google Identity Services（GIS）を用いた OAuth 認証。
 *
 * - スコープは `drive.file` のみ（本アプリが作成したファイルにしかアクセスしない、REQ-1.3）。
 * - GIS のスクリプトは同期機能の画面を開いたとき/同期を実行するときにのみ動的に読み込む（REQ-9.3）。
 * - アクセストークンはメモリ上の変数にのみ保持し、永続化しない（REQ-1.6）。
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
/** トークンの有効期限ぎりぎりまで使い続けないための安全マージン。 */
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000

let accessToken: string | null = null
/** アクセストークンの失効予定時刻（epoch ms）。`GoogleTokenResponse.expires_in` から算出する（REQ-1.7）。 */
let tokenExpiresAt: number | null = null
let tokenClient: GoogleTokenClient | null = null
let scriptLoadPromise: Promise<void> | null = null

function getClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
}

/** OAuth クライアントIDがビルドに設定されているか（REQ-1.9: 未設定ならUIを表示しない）。 */
export function isSyncConfigured(): boolean {
  return Boolean(getClientId())
}

function loadGisScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise

  scriptLoadPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Google Identity Services を読み込めない実行環境です'))
      return
    }
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google Identity Services の読み込みに失敗しました'))
    document.head.appendChild(script)
  })
  return scriptLoadPromise
}

async function ensureTokenClient(): Promise<GoogleTokenClient> {
  await loadGisScript()
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services を初期化できませんでした')
  }
  if (!tokenClient) {
    const clientId = getClientId()
    if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID が設定されていません')
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: () => {
        /* requestToken() 呼び出しごとに上書きする */
      },
      error_callback: () => {
        /* requestToken() 呼び出しごとに上書きする */
      },
    })
  }
  return tokenClient
}

/** ポップアップを閉じた等の GIS エラーを、日本語のメッセージへ変換する（REQ-1.5）。 */
function describeGisError(error: GoogleTokenClientErrorResponse): string {
  if (error.type === 'popup_closed') return '認証をキャンセルしました。'
  if (error.type === 'popup_failed_to_open') {
    return 'ポップアップを開けませんでした。ブラウザのポップアップブロックの設定を確認してください。'
  }
  return 'Google の認証中にエラーが発生しました。'
}

function requestToken(prompt: '' | 'consent'): Promise<string> {
  return ensureTokenClient().then(
    (client) =>
      new Promise<string>((resolve, reject) => {
        let settled = false
        client.callback = (response) => {
          if (settled) return
          settled = true
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || 'アクセストークンの取得に失敗しました'))
            return
          }
          accessToken = response.access_token
          tokenExpiresAt = Date.now() + response.expires_in * 1000
          resolve(response.access_token)
        }
        // ユーザーがポップアップを閉じた場合など、callback が呼ばれずに終わるケースを拾う（REQ-1.5）。
        // これが無いと、Promise が永遠に解決/棄却されず「接続中...」のまま固まってしまう。
        client.error_callback = (error) => {
          if (settled) return
          settled = true
          reject(new Error(describeGisError(error)))
        }
        client.requestAccessToken({ prompt })
      }),
  )
}

/** ユーザーの同意を得て初回接続する（REQ-1.2）。同意画面を必ず表示する。 */
export async function connect(): Promise<string> {
  return requestToken('consent')
}

/**
 * 有効なアクセストークンを返す。メモリに保持していて、かつ失効していなければそれを使う。
 * 無ければ（または失効間近／失効済みなら）無操作での再取得を試みる（REQ-1.7）。
 * 無操作での再取得にも失敗した場合は null を返し、呼び出し側がユーザーへ再接続を促す。
 */
export async function ensureAccessToken(): Promise<string | null> {
  if (accessToken && tokenExpiresAt != null && Date.now() < tokenExpiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS) {
    return accessToken
  }
  try {
    return await requestToken('')
  } catch {
    accessToken = null
    tokenExpiresAt = null
    return null
  }
}

/**
 * driveClient が Drive API から 401 を受け取った際に呼び出す。
 * メモリ上の（失効した）トークンを破棄したうえで、無操作（`prompt: ''`）でのアクセストークン
 * 再取得を1回だけ試みる（REQ-1.7）。成功すれば呼び出し側（driveClient）が同じリクエストを
 * 新しいトークンで再試行し、失敗して初めてユーザーへ再接続を促す。
 */
export async function refreshAccessTokenAfterUnauthorized(): Promise<string | null> {
  accessToken = null
  tokenExpiresAt = null
  try {
    return await requestToken('')
  } catch {
    return null
  }
}

export function getAccessTokenIfPresent(): string | null {
  return accessToken
}

/** 接続を解除する（REQ-8.1）。メモリ上のトークンを破棄し、Google 側の同意も取り消す。 */
export function disconnect(): void {
  const token = accessToken
  accessToken = null
  tokenExpiresAt = null
  tokenClient = null
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {
      /* 結果に関わらずローカルの状態は既に破棄済み */
    })
  }
}
