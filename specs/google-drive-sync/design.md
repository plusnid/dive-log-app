# 設計: Google Drive 同期（個人バックアップ・複数端末同期）

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [ダイビングログCRUD設計](../dive-log-crud/design.md) / [写真添付設計](../photo-attachment/design.md) / [ガイドサイン設計](../guide-signature/design.md) / [モバイル対応設計](../mobile-compatibility/design.md)

ステータス: 実装済み

## 設計方針

- **オプトイン**: 同期レイヤーは既存の CRUD 経路に割り込まない。同期が無効なら `sync/` 配下のコードはネットワークにも Google のスクリプトにも一切触れない（REQ-1.1 / REQ-9.3）。
- **バックエンドを持たない**: 中継サーバーは作らない。ブラウザから直接 Google の OAuth と Drive REST API を呼ぶ（REQ-9.1）。
- **既存の依存ルールを維持**: Dexie に触れるのは `src/db/` 配下のみ。同期エンジンは `db/syncRepository.ts` を経由する。
- **ログ1件＝Drive上の1ファイル**: レコード単位の差分同期・競合解決を可能にするため。全件を1つの JSON にまとめる案は、1レコードの変更で全件を再アップロードする必要があり、同時編集時に全件が競合するため採らない。
- **ローカルを壊さない**: 通信は Dexie トランザクションの外で完結させ、書き込みは「必要なデータを全部メモリに用意してから1トランザクションで適用」する（REQ-4.5 / 4.6 / 7.3）。

## データモデルの変更

### 型定義（`src/types/diveLog.ts`）

```ts
export interface DiveLog {
  id?: number
  uuid: string          // 追加: 端末をまたいで一意（同期の主キー）
  // ...既存フィールドは変更なし
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id?: number
  uuid: string          // 追加
  type: 'photo' | 'signature'
  blob: Blob
  mimeType: string
  createdAt: string
}
```

- `id` / `photoIds` / `signatureId` は**端末ローカルの採番のまま**であり、Drive には送らない。リモート側の参照はすべて `uuid` で行う。
- `DiveLogDraft` の定義は `Omit<DiveLog, 'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt'>` に変更する（フォームは `uuid` を扱わない）。

### 同期用の型（`src/types/sync.ts`）

```ts
export type SyncKind = 'diveLog' | 'attachment'

export interface SyncRecord {
  uuid: string
  kind: SyncKind
  remoteFileId: string
  /** 最後に同期が成功した時点の DiveLog.updatedAt（添付は createdAt） */
  syncedUpdatedAt: string
}

export interface Tombstone {
  uuid: string
  kind: SyncKind
  deletedAt: string
}

export interface SyncSettings {
  enabled: boolean
  autoSync: boolean
  accountEmail?: string
  rootFolderId?: string
  logsFolderId?: string
  attachmentsFolderId?: string
  lastSyncAt?: string
  deviceId: string
}
```

### Dexie スキーマ（`src/db/db.ts`）— version 2

```ts
this.version(2)
  .stores({
    diveLogs: '++id, date, siteName, createdAt, &uuid, updatedAt',
    attachments: '++id, type, &uuid',
    syncRecords: '&uuid, kind',
    tombstones: '&uuid, kind, deletedAt',
    syncMeta: '&key',          // { key: string, value: unknown } 形式の単純なKVS
  })
  .upgrade(async (tx) => {
    // 既存レコードへの uuid backfill（REQ-2.4）
    await tx.table('diveLogs').toCollection().modify((log) => { log.uuid = newUuid() })
    await tx.table('attachments').toCollection().modify((a) => { a.uuid = newUuid() })
  })
```

- `version(1)` の定義は削除せず残す（Dexie の移行のため）。
- `newUuid()` は `crypto.randomUUID()`（セキュアコンテキスト必須）。利用できない環境向けに `crypto.getRandomValues` ベースのフォールバックを `src/db/uuid.ts` に置く。
- 墓標を `diveLogs.deletedAt` として持たせる案は、`useDiveLogs()` の `orderBy('date')` や `getDiveLogDetail()` など既存の全読み取り経路に除外条件を足す必要があるため採らず、**別テーブル `tombstones`** とする。これにより既存の読み取りコードは無変更で済む。

### 既存リポジトリへの変更（`src/db/diveLogRepository.ts`）

| 関数 | 変更内容 |
| --- | --- |
| `addAttachment` | `uuid: newUuid()` を付与 |
| `createDiveLog` | `DiveLog` に `uuid: newUuid()` を付与 |
| `updateDiveLog` | `uuid` は保持（`update` 対象に含めない）。削除した添付の `uuid` を `tombstones` に記録 |
| `deleteDiveLog` | 同一トランザクション内で、ログの `uuid` と削除する全添付の `uuid` を `tombstones` に追加 |

墓標は同期が無効でも常に書く（データ量が小さく、後から同期を有効化した場合に削除を正しく伝播できるため）。

## Drive 上のデータ形式

`drive.file` スコープでは、アプリが作成したファイルのみが見える。ユーザーのマイドライブ直下に可視のフォルダを作り、ユーザー自身が中身を確認・バックアップできるようにする（`appDataFolder` は不可視のため採らない）。

```
マイドライブ/
  ダイビングログ/                       ← ルートフォルダ（appProperties: diveLogAppRoot=true）
    manifest.json                       ← スキーマ情報・端末一覧
    logs/
      <log-uuid>.json                   ← ログ1件
    attachments/
      <attachment-uuid>.jpg / .png      ← 写真・サイン画像
```

### `logs/<uuid>.json`

```jsonc
{
  "schemaVersion": 1,
  "uuid": "9a1e...",
  "createdAt": "2026-07-20T02:11:00.000Z",
  "updatedAt": "2026-07-21T09:32:10.000Z",
  "deleted": false,
  "deletedAt": null,
  "deviceId": "書き込んだ端末のID",
  "log": {
    "date": "2026-07-20", "startTime": "09:30", "area": "石垣島", "siteName": "マンタスクランブル",
    "maxDepth": 18.5, "duration": 42, "waterTemp": 28, "visibility": 20,
    "weather": "sunny", "current": "moderate",
    // 未入力（undefined）の項目は JSON.stringify により省略される（例では wetSuit / steelTank が未選択）
    "drySuit": "inner_medium", "hood": true, "hoodVest": false, "aluminumTank": "al_11l",
    "tankStartPressure": 200, "tankEndPressure": 60, "weight": 4,
    "buddyName": "...", "notes": "...", "guideName": "..."
  },
  "photoUuids": ["...", "..."],
  "signatureUuid": "..." // なければ null
}
```

`log` の中身は `DiveLogDraft`（= `DiveLog` から `id` / `uuid` / 添付ID / 日時メタを除いたもの）をそのまま書き出したものなので、[dive-log-crud](../dive-log-crud/design.md) 側で項目が追加・廃止されても同期エンジンの変更は不要（`schemaVersion` も上げない）。廃止済みの旧項目 `gear` は型定義上 `DiveLogDraft` から外れているが、rest スプレッドにより実行時には引き続き読み書きされ、端末間で値が保持される（詳細は [dive-log-crud/design.md](../dive-log-crud/design.md) の「Google Drive 同期への影響」）。

削除されたログは、ファイルを消さずに**墓標ファイル**へ置き換える（REQ-5.2）。

```jsonc
{ "schemaVersion": 1, "uuid": "9a1e...", "deleted": true, "deletedAt": "2026-07-25T00:00:00.000Z", "log": null, "photoUuids": [], "signatureUuid": null }
```

ファイルを実削除しないのは、「リモートに無い＝まだアップロードされていない」と「リモートに無い＝削除された」を区別できなくなるため。

### ファイルの `appProperties`

Drive の `files.list` で**中身をダウンロードせずに**差分判定するため、各ファイルに `appProperties` を付与する。

| ファイル | appProperties |
| --- | --- |
| ログ | `{ uuid, updatedAt, deleted: 'true' \| 'false' }` |
| 添付 | `{ uuid, kind: 'photo' \| 'signature' }` |
| ルートフォルダ | `{ diveLogAppRoot: 'true' }` |

### `manifest.json`

```jsonc
{ "schemaVersion": 1, "appVersion": "0.0.0", "updatedAt": "...", "devices": [{ "deviceId": "...", "lastSyncAt": "..." }] }
```

`schemaVersion` が本アプリの対応範囲外なら同期を中止する（REQ-7.6）。

## モジュール構成

```
src/
  sync/
    googleAuth.ts      # GIS スクリプトの遅延ロード、トークン取得/更新、切断
    driveClient.ts     # Drive REST v3 の薄いラッパー（フォルダ解決、list/get/create/update/delete、アップロード）
    syncEngine.ts      # 差分判定・競合解決・実行制御（キュー、リトライ）
    syncTypes.ts       # RemoteLogFile / SyncPlan / SyncResult など
  db/
    syncRepository.ts  # 同期のための Dexie 読み書き（Dexie に触るのは db/ 配下のみ、の原則を維持）
  hooks/
    useSyncStatus.ts   # 同期状態・設定の購読（syncMeta を useLiveQuery で購読）
  views/
    SyncSettingsView.tsx
```

依存の向き:

```
views/SyncSettingsView → hooks/useSyncStatus → sync/syncEngine → sync/driveClient → (Drive REST)
                                                             → sync/googleAuth  → (Google Identity Services)
                                                             → db/syncRepository → db/db (Dexie)
```

`sync/` は React に依存しない（純粋な TypeScript モジュール）。UI は `syncEngine` の公開関数と、`syncMeta` テーブルの購読だけを使う。

### `db/syncRepository.ts` の公開関数（案）

```ts
listAllForSync(): Promise<{ logs: DiveLog[]; syncRecords: SyncRecord[]; tombstones: Tombstone[] }>
getAttachmentsByUuids(uuids: string[]): Promise<Attachment[]>
applyRemoteLog(remote: RemoteLog, blobs: Map<string, Blob>): Promise<void>  // 添付→ログの順に1トランザクションで適用
deleteLogByUuid(uuid: string): Promise<void>                                // 同期由来の削除（墓標は作らない）
createConflictCopy(source: DiveLogWithAttachments): Promise<void>
markSynced(records: SyncRecord[]): Promise<void>
clearTombstones(uuids: string[]): Promise<void>
getSyncSettings() / updateSyncSettings(patch)
```

## 認証設計（`sync/googleAuth.ts`）

- **ライブラリ**: Google Identity Services（GIS）の OAuth 2.0 トークンモデル。`https://accounts.google.com/gsi/client` を `<script>` として**動的に**挿入する（REQ-9.3）。同期設定画面を開くまで読み込まない。
- **スコープ**: `https://www.googleapis.com/auth/drive.file` のみ（REQ-1.3）。アプリが作成したファイル以外にはアクセスできない。
- **フロー**:

```ts
const client = google.accounts.oauth2.initTokenClient({
  client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  scope: 'https://www.googleapis.com/auth/drive.file',
  callback: (res) => { /* res.access_token をメモリに保持 */ },
})
client.requestAccessToken({ prompt: 'consent' })  // 初回接続時
client.requestAccessToken({ prompt: '' })         // 失効時の無操作更新（REQ-1.7）
```

- **トークン保管**: メモリ上の変数のみ。`localStorage` / IndexedDB / Cookie には保存しない（REQ-1.6）。ブラウザのリロードでトークンは失われ、次の同期時に `prompt: ''` で再取得を試みる。
- **リフレッシュトークンは扱わない**（ブラウザのみの構成では発行されない）。アクセストークンの有効期限（約1時間）を過ぎたら都度取得し直す。
- **接続解除**（REQ-8.1）: メモリ上のトークンを破棄し、`syncMeta` の `enabled` を `false`、`accountEmail` / フォルダIDをクリアする。`google.accounts.oauth2.revoke()` も呼ぶ。ローカルのログ・墓標・Drive上のデータは削除しない（REQ-8.2 / 8.3）。
- **アカウント表示**（REQ-1.8）: `GET /drive/v3/about?fields=user(displayName,emailAddress)` で取得する。`drive.file` スコープのみで取得できるかは実装時に実機検証が必要（検証項目）。取得できない場合は `openid email` スコープの追加、または表示の省略を検討する。
- **設定**: `VITE_GOOGLE_CLIENT_ID` が未設定のビルドでは同期UIを表示しない（REQ-1.9）。OAuth クライアントの「承認済みの JavaScript 生成元」には `https://plusnid.github.io` を登録する（配信先は GitHub Pages サブパスに決定済み。[mobile-compatibility/design.md「配信先の反映」](../mobile-compatibility/design.md#配信先の反映)）。生成元はオリジン単位のため、サブパス（`/dive-log-app/`）自体の登録は不要。

## Drive クライアント（`sync/driveClient.ts`）

すべて `fetch` + `Authorization: Bearer <token>` で呼ぶ。

| 操作 | エンドポイント |
| --- | --- |
| フォルダ検索 | `GET /drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and appProperties has { key='diveLogAppRoot' and value='true' } and trashed=false` |
| フォルダ作成 | `POST /drive/v3/files`（`mimeType: application/vnd.google-apps.folder`） |
| 一覧（差分判定用） | `GET /drive/v3/files?q='<logsFolderId>' in parents and trashed=false&fields=nextPageToken,files(id,name,appProperties,modifiedTime,size)&pageSize=1000` |
| 本文取得 | `GET /drive/v3/files/{id}?alt=media` |
| 作成（小） | `POST /upload/drive/v3/files?uploadType=multipart`（メタデータ＋本体） |
| 更新（小） | `PATCH /upload/drive/v3/files/{id}?uploadType=multipart` |
| 作成（大: 5MB超） | `uploadType=resumable`（セッションURLを取得して分割送信） |
| 削除 | `DELETE /drive/v3/files/{id}`（添付のみ。ログは墓標に置換） |

- **ページング**: `nextPageToken` を辿って全件取得する。ログ件数が数千件規模になっても1〜数リクエストで収まる。
- **同時実行数**: 3並列を上限とする（Drive のユーザー単位クォータ対策）。
- **リトライ**（REQ-7.5）: HTTP 403（`rateLimitExceeded` / `userRateLimitExceeded`）・429・5xx に対し、指数バックオフ（1s, 2s, 4s, 8s、最大5回）＋ジッター。401 はトークン再取得を1回だけ試みる。
- **容量不足**: 403 `storageQuotaExceeded` を専用メッセージにマッピングする（REQ-7.4）。

## 同期アルゴリズム（`sync/syncEngine.ts`）

```
sync():
  0. 前提チェック: enabled / online / スキーマバージョン / トークン
  1. フォルダ解決（syncMeta にIDがあれば再利用、無ければ検索→無ければ作成）
  2. リモート一覧取得: logs/ の files.list → Map<uuid, RemoteEntry{ fileId, updatedAt, deleted }>
  3. ローカル取得: listAllForSync() → logs / syncRecords / tombstones
  4. 突き合わせて SyncPlan（pull / push / delete / conflict のリスト）を作る
  5. プランを実行（ログ1件ずつ、pull は「添付DL → 1トランザクションで適用」の順）
  6. syncRecords を更新し、消化済み墓標を削除、lastSyncAt / manifest.json を更新
```

### 差分判定と競合解決の決定表

記号: `L`=ローカルのログ, `R`=リモートのログ, `S`=`syncRecords[uuid]`（前回同期の記録）, `T`=墓標。
「変更あり」は `updatedAt !== S.syncedUpdatedAt` で判定する（端末間の時計ずれの影響を受けないため、`lastSyncAt` との時刻比較は使わない）。

| # | L | R | S | T | 判定 | 動作 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | あり | なし | なし | - | 新規 | push（作成） |
| 2 | あり | なし | あり | - | Drive側で手動削除 | push（再作成）※REQ-4.7 |
| 3 | なし | あり(生) | なし | なし | リモート新規 | pull（作成） |
| 4 | なし | あり(生) | あり | なし | ローカルデータ消失（復元） | pull（作成） |
| 5 | あり | あり(生) | - | - | 双方に存在 | 下記の副表へ |
| 6 | - | あり(生) | - | あり | 削除 vs 更新 | `R.updatedAt > T.deletedAt` なら復元（pull・墓標破棄, REQ-5.4）／それ以外は push delete |
| 7 | - | なし or 墓標 | - | あり | 削除の伝播完了 | 墓標を削除、添付をDriveから削除 |
| 8 | あり | 墓標 | - | なし | リモートで削除 | `L.updatedAt > R.deletedAt` なら復活（push）／それ以外はローカル削除（墓標は作らない, REQ-5.3） |
| 9 | なし | 墓標 | - | なし | 何もしない | - |

副表（#5: 双方に存在）:

| ローカル変更 | リモート変更 | 動作 |
| --- | --- | --- |
| なし | なし | 何もしない |
| あり | なし | push（更新） |
| なし | あり | pull（更新） |
| あり | あり | **競合**（下記） |

### 競合の扱い（REQ-6）

1. `L.updatedAt` と `R.updatedAt` を比較し、新しい方を**勝者**とする（完全に同値なら決定性のためリモートを勝者とする）。
2. 勝者の内容を両側に反映する（勝者がリモートなら pull、ローカルなら push）。
3. 敗者の内容を**競合コピー**として新しい `uuid` のログでローカルに作成する（REQ-6.3）。
   - `siteName` の末尾に `（競合コピー <YYYY-MM-DD HH:mm>）` を付ける（REQ-6.4）。
   - 添付は blob を複製し、新しい `uuid` の `Attachment` として作る（元のログと参照を共有しない）。敗者がリモートの場合は、その添付をダウンロードしてから作る。
   - 競合コピーは次のプッシュで通常のログとして Drive にも作成される。
4. 競合件数を `SyncResult` に含め、UI で通知する（REQ-6.5）。

写真の追加・削除だけが競合した場合もログ単位で解決する（REQ-6.6）。写真をマージすると「削除したはずの写真が復活する」ため採らない。

### トランザクション境界（REQ-4.5 / 4.6 / 7.3）

Dexie のトランザクション内で非 Dexie の Promise（`fetch`）を待つとトランザクションが中断されるため、**必ずダウンロードを先に完了させてから**書き込む。

```
pullOne(remote):
  blobs = await Promise.all(未取得の添付uuid.map(downloadAttachment))   // トランザクション外
  await db.transaction('rw', diveLogs, attachments, syncRecords, tombstones, () => {
    添付を upsert（uuid で照合）→ photoIds/signatureId を解決 → ログを upsert → syncRecords を更新
  })
```

これにより、処理が途中で失敗しても「存在しない添付を参照するログ」は生まれない。プッシュ側も、添付のアップロードをすべて成功させてからログ JSON をアップロードする。

### 実行制御（REQ-3.4）

```ts
let running: Promise<SyncResult> | null = null
let queued = false
export function requestSync(): Promise<SyncResult>  // 実行中なら queued=true にして待つ（多重実行しない）
```

自動同期のトリガ（REQ-3.2）:
- 起動時: `App` のマウント時、`enabled && autoSync && navigator.onLine` なら実行。
- オンライン復帰: `window.addEventListener('online', ...)`。
- 書き込み後: `createDiveLog` / `updateDiveLog` / `deleteDiveLog` の完了後に発火するイベントを受けて、5秒のデバウンスののち実行する。リポジトリが `sync` に直接依存しないよう、`db/` 側は変更通知（軽量な EventTarget かコールバック登録）だけを提供し、購読は `sync/syncEngine` 側で行う。

## UI 構成

- `App.tsx` の `Route` に `{ view: 'settings' }` を追加する（現状は `list | form | detail` の3つ）。一覧画面のヘッダーに設定ボタンを置く。
- `views/SyncSettingsView.tsx` の表示内容:
  - 同期の有効/無効、接続中のアカウント、同期先フォルダ名（REQ-1.8）
  - 「Google Drive に接続」／「接続を解除」ボタン（解除時は REQ-8.4 の案内を表示）
  - 「今すぐ同期」ボタン（REQ-3.1）、自動同期のトグル（REQ-3.3）
  - 同期状態と最終同期日時、直近のエラー、競合件数（REQ-3.5 / 6.5）
  - 有効化前に「Drive に保存される内容」の説明（REQ-9.2）
  - [mobile-compatibility REQ-3.4](../mobile-compatibility/requirements.md) のストレージ使用量／永続化状態もこの画面に置く
- `hooks/useSyncStatus.ts`: `syncMeta` テーブルを `useLiveQuery` で購読し、実行中フラグは `syncEngine` の購読APIから受け取る。
- 一覧画面には、未同期の変更があることを示す軽量な表示（例: ヘッダーの同期アイコン）を置く。

## Service Worker との関係

- Google の各エンドポイント（`accounts.google.com` / `*.googleapis.com`）はクロスオリジンであり、`workbox.globPatterns` のプリキャッシュ対象外。Service Worker では**キャッシュせず素通し**する（同期は常に最新の応答を必要とするため）。
- `registerType: 'autoUpdate'` の挙動は変更しない。
- オフライン時は同期を実行しない（REQ-7.2）。アプリ本体のオフライン動作は従来どおり（[offline-pwa](../offline-pwa/design.md)）。

## 非機能要件への影響

| NFR | 影響 |
| --- | --- |
| NFR-1（外部送信なし） | 同期が有効な場合に限り、ユーザー自身の Google Drive へ送信する。それ以外の宛先には送信しない（REQ-9.1）。[00-overview.md](../00-overview.md) の NFR-1 を改定済み |
| NFR-2（オフライン） | 維持。同期以外の全機能はオフラインで動作する（REQ-7.1） |
| NFR-3（モバイル主体） | OAuth の同意フローがモバイル・スタンドアロン起動で成立することの検証が必要（[要件「検証タスク」](./requirements.md)） |
| NFR-4（認証なし） | 同期を有効化した場合に限り Google 認証が発生する。[00-overview.md](../00-overview.md) の NFR-4 を改定済み |

## 既知の制約・リスク

- **時計ずれ**: 競合時の勝者判定は各端末の `updatedAt`（端末時計）に依存する。端末の時計が大きくずれていると意図しない側が勝つ可能性がある。ただし敗者は競合コピーとして残るため、記録自体は失われない。
- **アクセストークンの寿命**: ブラウザのみの構成ではリフレッシュトークンを持てないため、リロードのたびに（無操作での）トークン再取得が必要になる。Google セッションが切れている場合はユーザー操作が必要（REQ-1.7）。
- **OAuth 同意画面が「テスト」モードであること**: Google の審査を受けないため、`drive.file` のような機微スコープでは同意の有効期間が短く設定される場合があり、無操作でのトークン再取得（REQ-1.7 の `prompt: ''`）が失敗し、想定より高い頻度で再同意（`prompt: 'consent'`）が必要になる可能性がある。個人利用（テストユーザーは登録済みの本人のみ）が前提のため許容する。
- **初回同期のデータ量**: 写真を含むため、既存ログが多い端末での初回同期は時間と通信量を要する。Wi-Fi 限定オプションは設けない方針で確定済み（[要件「決定事項」](./requirements.md)）。通信量の制御はユーザーが同期実行タイミングを自分で選ぶこと（自動同期を既定オフにすること）に委ねる。
- **Drive の無料枠**: 15GB を Gmail 等と共有するため、写真を大量に保存すると枯渇し得る。事前の使用量警告は設けない方針で確定済み（[要件「決定事項」](./requirements.md)）。容量不足時は REQ-7.4 のエラーメッセージで事後的に気づく。
- **Drive 上での手動操作**: ユーザーが Drive 側でファイルを消したり移動したりした場合、アプリはローカルの内容で作り直す（REQ-4.7）。Drive 側での編集は想定しない。
- **iOS のスタンドアロン起動でのポップアップ**: OAuth 同意のポップアップが正しく戻ってくるかは実機検証が必要（[要件「検証タスク」](./requirements.md)）。問題があった場合のリダイレクト方式へのフォールバックは、現時点では設計に含めない（検証後に判断）。
- **API クォータ**: 大量のログを一度に同期するとレート制限に達する可能性がある。並列数制限とバックオフで緩和するが、初回同期は時間がかかる。
- **テスト**: リポジトリに自動テスト基盤がないため、差分判定・競合解決の検証手段が手動確認しかない。決定表（上記）に対応するユニットテストの導入を、本機能の実装と合わせて検討することを推奨する。
