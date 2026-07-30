# 設計: ダイビングログの記録・閲覧・編集・削除

関連: [要件](./requirements.md)

## データモデル

`src/types/diveLog.ts`

```ts
type Weather = 'sunny' | 'cloudy' | 'rainy' | 'other'
type Current = 'none' | 'weak' | 'moderate' | 'strong'

interface DiveLog {
  id?: number
  date: string
  startTime?: string
  siteName: string
  maxDepth?: number
  duration?: number
  waterTemp?: number
  visibility?: number
  weather?: Weather
  current?: Current
  tankStartPressure?: number
  tankEndPressure?: number
  weight?: number
  gear?: string
  buddyName?: string
  notes?: string
  photoIds: number[]
  signatureId?: number
  guideName?: string
  createdAt: string   // ISO日時
  updatedAt: string   // ISO日時
}

type DiveLogDraft = Omit<DiveLog, 'id' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt'>
```

`DiveLogDraft` はフォームが扱う「保存前の入力値」。写真・サインID・メタデータはリポジトリ層が計算して付与する。

## 永続化（Dexie）

`src/db/db.ts`

```ts
class DiveLogDatabase extends Dexie {
  diveLogs: Table<DiveLog, number>
  attachments: Table<Attachment, number>
  // version(1).stores({ diveLogs: '++id, date, siteName, createdAt', attachments: '++id, type' })
}
```

- `diveLogs` テーブルは `date` / `siteName` / `createdAt` にインデックスを持つ（`++id` は自動採番主キー）。
- 添付（写真・サイン）は別テーブル `attachments` に保存し、`DiveLog.photoIds` / `signatureId` で参照する（詳細は [photo-attachment](../photo-attachment/design.md), [guide-signature](../guide-signature/design.md)）。

## リポジトリ層 (`src/db/diveLogRepository.ts`)

UIコンポーネントは Dexie を直接呼ばず、以下の関数のみを使う。

- `createDiveLog(draft, photoFiles, signatureBlob)`: `db.transaction('rw', diveLogs, attachments)` 内で添付を先に保存してIDを確定させ、`DiveLog` を1件 `add`。
- `updateDiveLog(id, draft, { newPhotoFiles, removedPhotoIds, newSignatureBlob })`: 既存レコードを取得し、削除対象添付の `bulkDelete`、新規写真の追加、`photoIds` の再計算、サインの差し替えロジック（[guide-signature/design.md](../guide-signature/design.md) 参照）を行った上で `update`。
- `deleteDiveLog(id)`: ログに紐づく `photoIds` + `signatureId` をまとめて `bulkDelete` してからログ本体を `delete`（カスケード削除）。
- `getDiveLogDetail(id)`: ログ本体と、紐づく写真配列・サイン（あれば）をまとめて返す `DiveLogDetail` を組み立てる（`attachments.bulkGet` / `attachments.get`）。

すべての複合操作は `db.transaction('rw', ...)` でラップし、添付とログ本体の整合性を保証する。

## UI構成

- `App.tsx`: `Route = { view: 'list' } | { view: 'form', id? } | { view: 'detail', id }` を `useState` で保持し、3画面を出し分ける自前ルーター。React Router 等のライブラリは使わない。
- `views/DiveLogListView.tsx`: `hooks/useDiveLogs.ts`（`dexie-react-hooks` の `useLiveQuery` で `diveLogs.orderBy('date').reverse()` を購読）を使い、一覧を表示。DBの変更はリアルタイムに反映される。
- `components/DiveLogListItem.tsx`: 1行分の表示（日付・サイト名・任意メタ情報）。
- `views/DiveLogFormView.tsx`: 新規作成／編集を1コンポーネントで共用（`id` の有無で `isEditing` を切替）。編集時は `getDiveLogDetail` で初期値をロードしてフォーム状態に展開。送信時に `createDiveLog` / `updateDiveLog` を呼び分ける。
- `views/DiveLogDetailView.tsx`: `getDiveLogDetail` で取得した内容を分類ごとの `<section>` に表示。削除は `window.confirm` 確認後に `deleteDiveLog` を呼び、一覧へ戻る。

## 既知の設計上のトレードオフ

- `useState` ベースの独自ルーティングのため、ブラウザの戻る/進むボタンやURL共有には対応していない。
- フォームのバリデーションはHTML標準の `required` のみで、業務ルール（例: 終了圧力 < 開始圧力など）のチェックはない。
