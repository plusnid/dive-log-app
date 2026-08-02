/**
 * Google Drive REST v3 の薄いラッパー。
 * すべて `fetch` + `Authorization: Bearer <token>` で呼ぶ。React にも Dexie にも依存しない。
 */

const API_BASE = 'https://www.googleapis.com/drive/v3'
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'
const ROOT_FOLDER_NAME = 'ダイビングログ'
const LOGS_FOLDER_NAME = 'logs'
const ATTACHMENTS_FOLDER_NAME = 'attachments'
const RESUMABLE_THRESHOLD_BYTES = 5 * 1024 * 1024
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]

export interface DriveFileMeta {
  id: string
  name: string
  appProperties?: Record<string, string>
  modifiedTime?: string
  size?: string
}

export interface AppFolders {
  rootFolderId: string
  logsFolderId: string
  attachmentsFolderId: string
}

/** Drive API 呼び出しの失敗（容量不足・レート制限・認証切れ等を判別するための情報を保持する）。 */
export class DriveApiError extends Error {
  readonly status: number
  readonly reason?: string

  constructor(message: string, status: number, reason?: string) {
    super(message)
    this.name = 'DriveApiError'
    this.status = status
    this.reason = reason
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 401（アクセストークン失効）を受け取った際に、無操作での再取得を試みる関数。 */
export type TokenRefresher = () => Promise<string | null>

let tokenRefresher: TokenRefresher | null = null

/**
 * 401 を受け取った際の再認証処理を登録する。`sync/syncEngine.ts` が
 * `googleAuth.refreshAccessTokenAfterUnauthorized` を渡して結びつける（REQ-1.7）。
 * driveClient 自体は googleAuth に依存しない（design.md のモジュール依存関係を維持するため）。
 */
export function setTokenRefresher(refresher: TokenRefresher | null): void {
  tokenRefresher = refresher
}

function isRetryableStatus(status: number, reason?: string): boolean {
  if (status === 429 || status >= 500) return true
  if (status === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')) return true
  return false
}

async function readErrorReason(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { errors?: { reason?: string }[]; status?: string } }
    return body.error?.errors?.[0]?.reason ?? body.error?.status
  } catch {
    return undefined
  }
}

/**
 * リトライ（指数バックオフ + ジッター、最大5回）と、エラーの意味づけを共通化する（REQ-7.4 / 7.5）。
 * `token` を渡した場合、401 を受け取った際に `tokenRefresher`（登録されていれば）で無操作の
 * 再取得を1回だけ試み、成功すれば新しいトークンで同じリクエストを再試行する（REQ-1.7）。
 */
async function requestWithRetry(input: string, init: RequestInit, token?: string, retriedAuth = false): Promise<Response> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(input, init)
    if (res.ok) return res

    const reason = await readErrorReason(res.clone())

    if (res.status === 403 && reason === 'storageQuotaExceeded') {
      throw new DriveApiError('Google Drive の空き容量が不足しています。', res.status, reason)
    }
    if (res.status === 401) {
      if (!retriedAuth && token && tokenRefresher) {
        const newToken = await tokenRefresher()
        if (newToken) {
          const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${newToken}` }
          return requestWithRetry(input, { ...init, headers }, newToken, true)
        }
      }
      throw new DriveApiError('アクセストークンが無効です。', res.status, reason)
    }
    if (attempt < RETRY_DELAYS_MS.length && isRetryableStatus(res.status, reason)) {
      const jitter = Math.random() * 300
      await sleep(RETRY_DELAYS_MS[attempt] + jitter)
      continue
    }
    throw new DriveApiError(`Google Drive API がエラーを返しました (status=${res.status})`, res.status, reason)
  }
  throw new DriveApiError('Google Drive へのリクエストに失敗しました', 0)
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

async function findFolder(token: string, query: string): Promise<DriveFileMeta | null> {
  const params = new URLSearchParams({ q: query, fields: 'files(id,name,appProperties)' })
  const res = await requestWithRetry(`${API_BASE}/files?${params.toString()}`, { headers: authHeaders(token) }, token)
  const data = (await res.json()) as { files?: DriveFileMeta[] }
  return data.files?.[0] ?? null
}

async function createFolder(
  token: string,
  name: string,
  parents: string[],
  appProperties?: Record<string, string>,
): Promise<DriveFileMeta> {
  const res = await requestWithRetry(
    `${API_BASE}/files?fields=id,name,appProperties`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents, appProperties }),
    },
    token,
  )
  return (await res.json()) as DriveFileMeta
}

/** 本アプリ専用のフォルダを解決する（既にあれば再利用、無ければ作成）。REQ-1.4。 */
export async function ensureAppFolders(token: string): Promise<AppFolders> {
  let root = await findFolder(
    token,
    "mimeType='application/vnd.google-apps.folder' and appProperties has { key='diveLogAppRoot' and value='true' } and trashed=false",
  )
  if (!root) {
    root = await createFolder(token, ROOT_FOLDER_NAME, [], { diveLogAppRoot: 'true' })
  }

  let logs = await findFolder(
    token,
    `'${root.id}' in parents and name='${LOGS_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  if (!logs) logs = await createFolder(token, LOGS_FOLDER_NAME, [root.id])

  let attachments = await findFolder(
    token,
    `'${root.id}' in parents and name='${ATTACHMENTS_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  if (!attachments) attachments = await createFolder(token, ATTACHMENTS_FOLDER_NAME, [root.id])

  return { rootFolderId: root.id, logsFolderId: logs.id, attachmentsFolderId: attachments.id }
}

/** 指定フォルダ直下のファイル一覧を、ページングを辿ってすべて取得する。 */
export async function listFiles(token: string, folderId: string): Promise<DriveFileMeta[]> {
  const files: DriveFileMeta[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,appProperties,modifiedTime,size)',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await requestWithRetry(`${API_BASE}/files?${params.toString()}`, { headers: authHeaders(token) }, token)
    const data = (await res.json()) as { files?: DriveFileMeta[]; nextPageToken?: string }
    files.push(...(data.files ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return files
}

export async function downloadFileText(token: string, fileId: string): Promise<string> {
  const res = await requestWithRetry(`${API_BASE}/files/${fileId}?alt=media`, { headers: authHeaders(token) }, token)
  return res.text()
}

export async function downloadFileBlob(token: string, fileId: string): Promise<Blob> {
  const res = await requestWithRetry(`${API_BASE}/files/${fileId}?alt=media`, { headers: authHeaders(token) }, token)
  return res.blob()
}

interface UploadMetadata {
  name?: string
  parents?: string[]
  appProperties?: Record<string, string>
}

async function multipartUpload(
  token: string,
  method: 'POST' | 'PATCH',
  url: string,
  metadata: UploadMetadata,
  content: Blob,
  mimeType: string,
): Promise<DriveFileMeta> {
  const boundary = `dive-log-sync-${Math.random().toString(36).slice(2)}`
  const encoder = new TextEncoder()
  const body = new Blob([
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    content,
    encoder.encode(`\r\n--${boundary}--`),
  ])
  const res = await requestWithRetry(
    url,
    {
      method,
      headers: { ...authHeaders(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    token,
  )
  return (await res.json()) as DriveFileMeta
}

async function resumableUpload(
  token: string,
  method: 'POST' | 'PATCH',
  url: string,
  metadata: UploadMetadata,
  content: Blob,
  mimeType: string,
): Promise<DriveFileMeta> {
  const initRes = await requestWithRetry(
    url,
    {
      method,
      headers: { ...authHeaders(token), 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(metadata),
    },
    token,
  )
  const sessionUrl = initRes.headers.get('Location')
  if (!sessionUrl) throw new DriveApiError('resumable upload session を開始できませんでした', 0)

  const uploadRes = await requestWithRetry(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: content,
  })
  return (await uploadRes.json()) as DriveFileMeta
}

export interface CreateFileParams {
  name: string
  parents: string[]
  mimeType: string
  appProperties?: Record<string, string>
  content: Blob | string
}

export async function createFile(token: string, params: CreateFileParams): Promise<DriveFileMeta> {
  const content = typeof params.content === 'string' ? new Blob([params.content], { type: params.mimeType }) : params.content
  const metadata: UploadMetadata = { name: params.name, parents: params.parents, appProperties: params.appProperties }
  if (content.size > RESUMABLE_THRESHOLD_BYTES) {
    return resumableUpload(token, 'POST', `${UPLOAD_BASE}/files?uploadType=resumable`, metadata, content, params.mimeType)
  }
  return multipartUpload(token, 'POST', `${UPLOAD_BASE}/files?uploadType=multipart`, metadata, content, params.mimeType)
}

export interface UpdateFileParams {
  name?: string
  mimeType: string
  appProperties?: Record<string, string>
  content: Blob | string
}

export async function updateFile(token: string, fileId: string, params: UpdateFileParams): Promise<DriveFileMeta> {
  const content = typeof params.content === 'string' ? new Blob([params.content], { type: params.mimeType }) : params.content
  const metadata: UploadMetadata = { name: params.name, appProperties: params.appProperties }
  if (content.size > RESUMABLE_THRESHOLD_BYTES) {
    return resumableUpload(token, 'PATCH', `${UPLOAD_BASE}/files/${fileId}?uploadType=resumable`, metadata, content, params.mimeType)
  }
  return multipartUpload(token, 'PATCH', `${UPLOAD_BASE}/files/${fileId}?uploadType=multipart`, metadata, content, params.mimeType)
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await requestWithRetry(`${API_BASE}/files/${fileId}`, { method: 'DELETE', headers: authHeaders(token) }, token)
}

export async function getAccountEmail(token: string): Promise<string | undefined> {
  const res = await requestWithRetry(`${API_BASE}/about?fields=user(emailAddress)`, { headers: authHeaders(token) }, token)
  const data = (await res.json()) as { user?: { emailAddress?: string } }
  return data.user?.emailAddress
}
