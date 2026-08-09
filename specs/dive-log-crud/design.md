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
  area?: string       // エリア名（例: 石垣島）。任意・自由記述で siteName とは独立
  siteName: string
  maxDepth?: number
  duration?: number
  waterTemp?: number
  visibility?: number
  weather?: Weather
  current?: Current
  // 器材・エア管理
  drySuit?: DrySuit          // 選択リスト。undefined = 選択なし
  wetSuit?: WetSuit          // 選択リスト。undefined = 選択なし
  hood?: boolean             // フード着用有無。undefined / false = 着用なし
  hoodVest?: boolean         // フードベスト着用有無
  aluminumTank?: AluminumTank
  steelTank?: SteelTank
  tankStartPressure?: number
  tankEndPressure?: number
  weight?: number
  /** @deprecated 旧「使用器材」自由記述。新規入力はせず、既存データの保持と詳細画面での参照のみ（REQ-6.9, REQ-6.10） */
  gear?: string
  buddyName?: string
  notes?: string
  photoIds: number[]
  signatureId?: number
  guideName?: string
  /**
   * ダイビングプラン画像。値は `Attachment.uuid` の配列（[dive-plan-image](../dive-plan-image/design.md)）。
   * 実体は写真と同じ `attachments` に `type: 'photo'` として保存され、`photoIds` にも含まれる。
   * 未設定（undefined）と空配列はいずれも「プラン画像なし」。
   */
  planImageUuids?: string[]
  createdAt: string   // ISO日時
  updatedAt: string   // ISO日時
}

type DiveLogDraft = Omit<
  DiveLog,
  'id' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt' | 'gear' | 'observations' | 'planImageUuids'
>
```

`DiveLogDraft` はフォームが扱う「保存前の入力値」。写真・サインID・メタデータはリポジトリ層が計算して付与する。`gear` を `Omit` に加えることで、フォームからは旧項目を書き込めなくする（実装上の `uuid` も現状どおり `Omit` 対象）。`observations`（[marine-life-observation](../marine-life-observation/requirements.md)）も同じ理由で `Omit` に含まれる: 写真参照の解決（`Attachment.uuid` の確定）がリポジトリ層でのみ可能なため、フォームは `ObservationDraft[]` を独立した引数として渡す。`planImageUuids`（[dive-plan-image](../dive-plan-image/requirements.md)）も同じ理由で `Omit` に含まれる: フォームは未保存のプラン画像（`File`）と保存済みの添付ID（`number`）しか持てず、`Attachment.uuid` へ解決できるのはリポジトリ層だけであるため、フォームは `newPlanImageFiles: File[]` / `removedPlanImageIds: number[]` を独立した引数として渡す。

`area` は `siteName` と同じ基本情報カテゴリに属する独立した任意項目（REQ-2.6）。エリアを表す別テーブルや参照ID（外部キー）は作らず、ログ1件ごとの文字列として持つ。フォーム上は他の任意テキスト項目（`buddyName` / `guideName`）と同様に空文字 `''` を初期値とし、リポジトリ層に渡る値も含めて空文字は「未入力」として扱う（表示側は `diveLog.area || '-'` のように falsy 判定する）。過去ログからの参照入力（REQ-8）も最終的にこの文字列へ値を書き込むだけで、参照元ログのIDは保持しない（REQ-8.11）。

### 器材の選択肢（`src/types/gearOptions.ts`）

`Weather` / `Current` と同じ「コード値の直和型 + 日本語ラベル」方式に揃える。ただしフォーム（`<option>`）と詳細画面（ラベル表示）の双方が同じ4項目のラベルを必要とするため、`weatherLabel` のようにビュー内で個別定義するのはやめ、型とラベルを1モジュールに集約する。

```ts
export type DrySuit = 'inner_light' | 'inner_medium' | 'inner_heavy'
export type WetSuit = 'wet_3mm' | 'wet_5mm' | 'wet_5mm_tapper' | 'semidry'
export type AluminumTank = 'al_10l' | 'al_11l' | 'al_12l'
export type SteelTank = 'steel_10l' | 'steel_12l' | 'steel_14l'

export interface GearOption<T extends string> {
  value: T
  label: string
}

export const drySuitOptions: GearOption<DrySuit>[] = [
  { value: 'inner_light', label: 'インナー薄手' },
  { value: 'inner_medium', label: 'インナー中厚' },
  { value: 'inner_heavy', label: 'インナー厚手' },
]
export const wetSuitOptions: GearOption<WetSuit>[] = [
  { value: 'wet_3mm', label: '3mm' },
  { value: 'wet_5mm', label: '5mm' },
  { value: 'wet_5mm_tapper', label: '5mm + タッパー' },
  { value: 'semidry', label: 'セミドライ' },
]
export const aluminumTankOptions: GearOption<AluminumTank>[] = [
  { value: 'al_10l', label: '10L' },
  { value: 'al_11l', label: '11L' },
  { value: 'al_12l', label: '12L' },
]
export const steelTankOptions: GearOption<SteelTank>[] = [
  { value: 'steel_10l', label: '10L' },
  { value: 'steel_12l', label: '12L' },
  { value: 'steel_14l', label: '14L' },
]

/** 未選択（undefined）や未知のコード値は '-' を返す。 */
export function gearLabel<T extends string>(options: GearOption<T>[], value: T | undefined): string
```

- 「選択なし」は選択肢の配列に含めず、`<option value="">選択なし</option>` を各 `<select>` の先頭に静的に置く（`weather` / `current` と同じ書き方）。空文字選択時は `undefined` に変換して保存する（REQ-6.4）。
- 選択肢の集合はコード上の定数のみで管理し、DBテーブルや設定画面は作らない（REQ-6.3）。選択肢を増減するときは、既存レコードが保持する旧コード値が「未知の値」になり得るため、`gearLabel()` は未知の値を `-`（もしくはコード値そのまま）にフォールバックさせ、例外を投げない設計とする。
- ドライスーツ／ウェットスーツ、アルミタンク／スチールタンクの排他制御は行わない（REQ-6.6, REQ-6.7）。既存のバリデーション方針（HTML標準の `required` のみ）を維持し、組み合わせの妥当性チェックは実装しない。
- `hood` / `hoodVest` はチェックボックスで、未チェック時は `false` を保存する（`undefined` と `false` はどちらも「着用なし」として表示側で同値に扱う。旧レコードは `undefined`）。

### 旧 `gear`（使用器材）の扱い

- **データ変換は行わない**。既存レコードの `gear` 文字列はそのまま IndexedDB に残す（`upgrade()` によるパース・自動マッピングはしない。自由記述から選択肢への機械的変換は誤変換のリスクが高い）。
- 型定義からは削除せず `@deprecated` として残し、`DiveLogDraft` からのみ除外する。これにより:
  - フォームには入力欄が出ない（REQ-6.9）。
  - `updateDiveLog()` の `db.diveLogs.update(id, { ...draft, ... })` は `gear` キーを含まないため、既存値は上書きされずに保持される（REQ-4.6）。Dexie の `update` は渡されたキーのみを変更する。
  - 新規作成 (`createDiveLog`) では `gear` が付与されない。
- 詳細画面は `diveLog.gear` に値があるときのみ「使用器材（旧項目）」行を出す（REQ-6.10）。値がなければ `<dt>` / `<dd>` 自体を出力しない（`area` の一覧表示と同じ「値がないなら要素を出さない」方針）。

## 永続化（Dexie）

`src/db/db.ts`

```ts
class DiveLogDatabase extends Dexie {
  diveLogs: Table<DiveLog, number>
  attachments: Table<Attachment, number>
  // version(1).stores({ diveLogs: '++id, date, siteName, createdAt', attachments: '++id, type' })
}
```

- `diveLogs` テーブルは `date` / `siteName` / `createdAt` にインデックスを持つ（`++id` は自動採番主キー）。google-drive-sync 導入時に version 2 で `&uuid` / `updatedAt` インデックスと同期用テーブルが追加されている（[google-drive-sync/design.md](../google-drive-sync/design.md) 参照）。
- `area` はインデックスを張らない非キー項目のため、Dexie の `stores()` 定義変更もバージョン上げも不要（IndexedDB はオブジェクト全体を保存するため、`stores()` に現れない属性は追加できる）。既存レコードは `area` が `undefined` のまま残り、`upgrade()` によるバックフィルは行わない（REQ-4.4）。エリア名での検索・絞り込みを将来行う場合に初めて version を上げてインデックスを追加する。
- 器材の構造化項目（`drySuit` / `wetSuit` / `hood` / `hoodVest` / `aluminumTank` / `steelTank`）も同様に非キー項目のため、**Dexie のバージョン上げは不要**。既存レコードでは `undefined` のまま（REQ-4.5）。器材での検索・集計を将来行う場合に初めてインデックス追加を検討する。
- 同日ログの引き継ぎ（REQ-7）は既存の `date` インデックスをそのまま使う（`where('date').equals(...)`）。参照入力（REQ-8）の候補抽出は全件走査になるが、個人のログ件数（数百〜数千件想定）ではインデックス追加の必要はない。
- 添付（写真・サイン）は別テーブル `attachments` に保存し、`DiveLog.photoIds` / `signatureId` で参照する（詳細は [photo-attachment](../photo-attachment/design.md), [guide-signature](../guide-signature/design.md)）。

## リポジトリ層 (`src/db/diveLogRepository.ts`)

UIコンポーネントは Dexie を直接呼ばず、以下の関数のみを使う。

- `createDiveLog(draft, photoFiles, signatureBlob, observations, planImageFiles)`: `db.transaction('rw', diveLogs, attachments)` 内で添付を先に保存してIDを確定させ、`DiveLog` を1件 `add`。`observations`（[marine-life-observation](../marine-life-observation/design.md)、既定値 `[]`）は保存した写真の `Attachment.uuid` へ解決したうえで書き込む。`planImageFiles`（[dive-plan-image](../dive-plan-image/design.md)、既定値 `[]`）も同じトランザクションで `type: 'photo'` として保存し、その添付IDを `photoIds` の末尾に、`uuid` を `planImageUuids` に書き込む。
- `updateDiveLog(id, draft, { newPhotoFiles, removedPhotoIds, newSignatureBlob, observations, newPlanImageFiles, removedPlanImageIds })`: 既存レコードを取得し、削除対象添付（写真・プラン画像を合わせた集合）の `bulkDelete`、新規写真・新規プラン画像の追加、`photoIds` / `planImageUuids` の再計算（プラン画像の添付IDは常に `photoIds` の末尾に置く規約を維持する）、サインの差し替えロジック（[guide-signature/design.md](../guide-signature/design.md) 参照）を行った上で `update`。`observations` が `undefined` のときは既存の観察記録を変更しない（[marine-life-observation](../marine-life-observation/design.md) の「リポジトリ層」参照）。観察記録の写真候補（`allowedUuids`）からはプラン画像の `uuid` を除外する。
- `deleteDiveLog(id)`: ログに紐づく `photoIds`（プラン画像の添付を含む）+ `signatureId` をまとめて `bulkDelete` してからログ本体を `delete`（カスケード削除）。
- `getDiveLogDetail(id)`: ログ本体と、紐づく写真配列（プラン画像を除く）・プラン画像配列・サイン（あれば）をまとめて返す `DiveLogDetail`（`{ diveLog, photos, planImages, signature }`）を組み立てる（`attachments.bulkGet` / `attachments.get`）。`planImageUuids` の順序で解決し、解決できない参照は落とす（[dive-plan-image/design.md](../dive-plan-image/design.md) 6-3節）。

本機能追加で以下の2つの読み取り関数を追加する（いずれも書き込みを伴わないため `transaction` は不要）。

```ts
/** 指定日付のログのうち、引き継ぎ元となる1件を返す（REQ-7.2, REQ-7.3）。 */
export async function findCarryOverSource(date: string): Promise<DiveLog | undefined>

/** 参照入力の元データ（エリア名・ダイビングポイント名の組）を「最近使った順」で返す（REQ-8.3〜REQ-8.5, REQ-8.10, REQ-8.12）。 */
export async function listPastPlaceValues(): Promise<{ area: string; siteName: string }[]>
```

- `findCarryOverSource(date)`: `db.diveLogs.where('date').equals(date).toArray()` で候補を取り、`updatedAt` の降順 → `id` の降順で並べた先頭を返す（`updatedAt` は ISO 8601 固定長のため文字列比較で時系列順になる）。0件なら `undefined`。
- `listPastPlaceValues()`: `db.diveLogs.toArray()` を1回だけ実行し、`date` 降順 → `updatedAt` 降順にソートして `{ area: diveLog.area ?? '', siteName: diveLog.siteName }` の配列（1ログ1件、`trim()` はしない生の値）をそのまま返す。大文字小文字・全角半角の正規化はしない（REQ-8.4）。エリア名・ダイビングポイント名それぞれの「候補一覧」への変換（重複排除・絞り込み）はUI側（下記 `derivePlaceCandidates`）が担当する。ソート済みの生レコードをUI側に渡すのは、ダイビングポイント名側がエリア名の現在値で動的に絞り込まれる（REQ-8.10）ため、絞り込み条件が変わるたびにDBへ再クエリせず、フォーム表示中に保持した1つの配列から都度フィルタするほうが単純なため。
- 引き継ぎ対象項目の抽出（`DiveLog` → 引き継ぎ用の部分ドラフト）はUI側の関心事とみなし、フォーム側に置く（下記 `pickCarryOverFields`）。リポジトリは「どのログを引き継ぎ元にするか」だけを担当する。

## フック層

- `hooks/useDiveLogs.ts`: 既存。一覧の購読（`useLiveQuery`）。
- 参照入力の候補・引き継ぎ元の取得には `useLiveQuery` を使わず、フォーム内の `useEffect` + `useState` で必要なタイミングに1回だけ取得する。理由は、フォーム表示中に他画面の操作でログ件数が変わることが（自前ルーターの単一画面構成では）なく、リアルタイム購読の利点がないため。Google Drive 同期による背後での取り込みで候補が増えるケースは、フォームを開き直したときに反映されれば十分とする。

## UI構成

- `App.tsx`: `Route = { view: 'list' } | { view: 'form', id? } | { view: 'detail', id }` を `useState` で保持し、3画面を出し分ける自前ルーター。React Router 等のライブラリは使わない。
- `views/DiveLogListView.tsx`: `hooks/useDiveLogs.ts`（`dexie-react-hooks` の `useLiveQuery` で `diveLogs.orderBy('date').reverse()` を購読）を使い、一覧を表示。DBの変更はリアルタイムに反映される。
- `components/DiveLogListItem.tsx`: 1行分の表示（日付・エリア名・サイト名・任意メタ情報）。日付・エリア名+サイト名・メタ行を縦3段（すべて左揃え）で表示する（[ui-polish-level1](../ui-polish-level1/design.md) によりレイアウトを変更、`dive-log-list-item__main` 行は廃止）。エリア名は `dive-log-list-item__site-group` 内でサイト名の直前に補助的な文字列として出す。`area` が空のときは要素自体をレンダリングしない（REQ-1.5）ため、区切り文字や余白はエリア名側の要素に持たせ、サイト名の表示は従来どおりとする。器材項目は一覧に出さない（REQ-1.6）ため変更なし。
- `components/PastValuePicker.tsx`（新規）: 「参照」ボタンと候補一覧パネルをセットにした再利用部品。
  ```tsx
  interface PastValuePickerProps {
    /** パネル見出し（例: 「過去のエリア」） */
    title: string
    values: string[]
    onSelect: (value: string) => void
  }
  ```
  - `values.length === 0` のときは参照ボタンを `disabled` にする（REQ-8.7）。
  - パネルは `useState` の開閉フラグによる条件付きレンダリングで、入力欄の直下にインライン展開する。既存アプリにモーダル基盤がないため `<dialog>` は導入しない。候補が多い場合は `max-height` + スクロールで扱い、絞り込み検索は提供しない。
  - フォーム (`<form>`) の内側に置くため、参照ボタン・候補ボタン・閉じるボタンはすべて `type="button"` とし、Enter/クリックでフォームが送信されないようにする（既存のキャンセルボタンと同じ扱い）。
  - 候補選択時は `onSelect(value)` を呼んでパネルを閉じる（REQ-8.6）。閉じる操作では `onSelect` を呼ばない（REQ-8.8）。
  - `values` はコンポーネント自身では計算せず、呼び出し側（`DiveLogFormView`）が都度渡す `props` である。ダイビングポイント名用の `PastValuePicker` は `draft.area` が変わるたびに親が再計算した `values` を渡すため、パネルを開いたままエリア名入力欄を編集すると `values` の再レンダリングでそのまま候補一覧が更新される（REQ-8.13。パネル側に特別な再取得ロジックは不要）。
  - モジュールスコープの純関数として `derivePlaceCandidates` を用意し、`listPastPlaceValues()` の生レコードから候補配列を導く。
    ```ts
    /** area が空文字なら絞り込まず、非空なら trim 一致するレコードのみ対象にする（REQ-8.4, REQ-8.10, REQ-8.12）。 */
    function derivePlaceCandidates(
      records: { area: string; siteName: string }[],
      areaFilter: string,
    ): { areas: string[]; siteNames: string[] }
    ```
    `areas` は常に全レコードの `area`（空文字除外・trim完全一致で重複排除）。`siteNames` は `areaFilter.trim()` が空文字なら全レコード、非空なら `record.area.trim() === areaFilter.trim()` のレコードのみを対象に、同じ方式で重複排除する。レコードは既に「最近使った順」で渡されるため、先頭から走査して重複排除するだけで順序が保たれる。
- `views/DiveLogFormView.tsx`: 新規作成／編集を1コンポーネントで共用（`id` の有無で `isEditing` を切替）。編集時は `getDiveLogDetail` で初期値をロードしてフォーム状態に展開。送信時に `createDiveLog` / `updateDiveLog` を呼び分ける。
  - 基本情報の `<fieldset>` 内に「エリア」テキスト入力を開始時刻とダイビングポイントの間に置き（広い地域 → 具体的なポイントの順）、`required` は付けない。`emptyDraft` と編集時の初期化の双方に `area: ''`（編集時は `diveLog.area ?? ''`）を持つ。
  - エリアとダイビングポイントの各 `<label>` 内に `PastValuePicker` を入力欄の隣（同一行）に配置し、`onSelect` で `updateField('area' | 'siteName', value)` を呼ぶ。初期ロードで取得した生レコード（`placeRecords: { area: string; siteName: string }[]`）から `derivePlaceCandidates(placeRecords, draft.area)` を毎レンダリングで呼び、`{ areas, siteNames }` を得る（配列は小さく計算も軽いため `useMemo` は必須ではないが、依存値 `[placeRecords, draft.area]` で `useMemo` してよい）。エリア用ピッカーには `areas` を、ダイビングポイント用ピッカーには `siteNames`（エリア名入力欄の現在値で絞り込み済み、REQ-8.10）を渡す。
  - 器材・エア管理の `<fieldset>` は、`gear` のテキスト入力を削除し、REQ-6.1 の順（ドライスーツ → ウェットスーツ → フード → フードベスト → アルミタンク → スチールタンク → タンク開始圧力 → タンク終了圧力 → ウェイト）で並べる。4つの `<select>` は `weather` / `current` と同じ書き方（`value={draft.drySuit ?? ''}`、`onChange` で `e.target.value || undefined` にキャスト）とし、選択肢は `src/types/gearOptions.ts` の配列を `map` して生成する。フード類は `<input type="checkbox" checked={draft.hood ?? false} onChange={(e) => updateField('hood', e.target.checked)} />`。
  - `emptyDraft` は `gear: ''` を削除し、`drySuit: undefined` / `wetSuit: undefined` / `hood: false` / `hoodVest: false` / `aluminumTank: undefined` / `steelTank: undefined` を持つ。編集時の初期化も同じキーを `diveLog` から写す（`hood: diveLog.hood ?? false`）。
  - **同日ログの引き継ぎ（REQ-7）**:
    - 引き継ぎ対象項目の抽出はモジュールスコープの純関数に切り出す。
      ```ts
      const carryOverKeys = [
        'area', 'drySuit', 'wetSuit', 'hood', 'hoodVest',
        'aluminumTank', 'steelTank', 'weight', 'guideName', 'buddyName',
      ] as const
      function pickCarryOverFields(source: DiveLog): Partial<DiveLogDraft>
      ```
      文字列項目は `?? ''`、真偽値は `?? false`、数値・選択リストはそのまま（`undefined` 可）に正規化して返す（REQ-7.6）。
    - 新規作成時のマウント時に `findCarryOverSource(emptyDraft.date)` を1回実行し、見つかれば `setDraft((prev) => ({ ...prev, ...pickCarryOverFields(source) }))` する。`loading` は編集時のみ `true` だったが、**新規作成時もこの初回クエリの完了までは `true`** とし、ユーザーの入力途中に非同期でフォーム値が差し替わることを防ぐ（`loading` の初期値を `true` に統一する）。参照入力の候補（`listPastPlaceValues()`）も同じ初期ロードで一緒に取得する。
    - 引き継ぎが発生したかどうかは `carriedOverFrom: string | null`（引き継ぎ元の日付）で保持し、値があるときはフォーム冒頭に案内メッセージを表示する（REQ-7.7）。例: 「同じ日付（2026-08-05）の直前の記録から、エリア・器材・ガイド名などを引き継ぎました。」
    - `draft.date` が変化したときは、引き継ぎ元の**有無だけ**を再取得して `carryOverSource` state を更新し、自動コピーは行わない（REQ-7.10）。器材・エア管理セクションに置く「同じ日付の直前のログから引き継ぐ」ボタンは `carryOverSource == null` のとき `disabled`（REQ-7.12）、押されたときのみ `pickCarryOverFields` の結果で上書きする（REQ-7.11）。
    - `isEditing` のときは初回コピー・引き継ぎボタンのいずれも行わない／表示しない（REQ-7.13）。
- `views/DiveLogDetailView.tsx`: `getDiveLogDetail` で取得した内容を分類ごとの `<section>` に表示。削除は `window.confirm` 確認後に `deleteDiveLog` を呼び、一覧へ戻る。
  - 基本情報セクションの `<dl>` 先頭に `エリア` の `<dt>` / `<dd>` を追加し、未入力時は `-` を表示する（REQ-3.4）。見出し `<h1>` はダイビングポイント名のままとし、エリア名で置き換えたり結合したりはしない。
  - 器材・エア管理セクションの `<dl>` を `ドライスーツ` / `ウェットスーツ` / `フード` / `フードベスト` / `アルミタンク` / `スチールタンク` / `タンク圧力（開始/終了）` / `ウェイト` に変更する（REQ-6.11）。選択リストは `gearLabel(...)` で日本語化し、未選択は `-`。フード類は `diveLog.hood ? '着用' : '-'`。
  - 旧 `gear` は `{diveLog.gear && (<><dt>使用器材（旧項目）</dt><dd>{diveLog.gear}</dd></>)}` のように値があるときだけ出す（REQ-6.10）。天候のラベルは [ui-polish-level3](../ui-polish-level3/design.md) により `src/types/weatherOptions.ts` の `weatherLabel()` に集約され、ローカル定義は廃止された（器材のラベルと同じ「型＋ラベル配列＋関数」の形に揃った）。ローカルの `currentLabel`（流れ）は今回のスコープ外のためそのまま残る。

## Google Drive 同期への影響

`src/sync/syncEngine.ts` の `toRemoteLogBody()` は `id` / `uuid` / `photoIds` / `signatureId` / `createdAt` / `updatedAt` を除いた残余（rest スプレッド）をそのまま `logs/<uuid>.json` の `log` に書き出すため、`area` および器材の新項目（`drySuit` / `wetSuit` / `hood` / `hoodVest` / `aluminumTank` / `steelTank`）は個別の対応なしに同期対象に含まれる。競合解決も従来どおりレコード単位（`updatedAt` 比較）で行い、項目単位のマージはしないため `schemaVersion` の変更は不要（[google-drive-sync/design.md](../google-drive-sync/design.md) 参照）。新項目を持たない旧バージョンの端末が書き出したログを取り込んだ場合、各項目は `undefined` のままとなる。

旧 `gear` については次の点に注意する。

- `RemoteLogBody` は `Omit<DiveLog, 'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt'>`（[marine-life-observation/design.md](../marine-life-observation/design.md) で `DiveLogDraft` のエイリアスから変更済み。フォームが直接編集しない `observations` も型に含めるため）。`gear` は既存の型定義上すでに含まれず、`toRemoteLogBody()` の rest スプレッドは実行時には `gear` を含み、`syncRepository.applyRemoteLog()` の `{ ...remoteLog }` も受け取った値をそのまま書き戻すため、旧項目の値は端末間で保持される。この「型には出ないが実行時には運ばれる」構造は意図的なものであり、rest スプレッドを明示的なフィールド列挙に置き換えると旧データが同期で失われるので変更しない。
- `logs/<uuid>.json` のサンプルに含まれる `gear` は旧項目として扱う（[google-drive-sync/design.md](../google-drive-sync/design.md) のサンプルを新項目に合わせて更新済み）。

同期そのものの有効・無効に関わらず、引き継ぎ（REQ-7）と参照入力（REQ-8）はローカルの `diveLogs` テーブルのみを参照する。オフラインでも動作し、外部通信は発生しない（[概要](../00-overview.md) NFR-1, NFR-2）。

## 既知の設計上のトレードオフ

- 独自ルーティング（`src/App.tsx` の履歴スタック）はアプリ内部の遷移履歴を持つが（[marine-life-observation/design.md](../marine-life-observation/design.md) 10節）、ブラウザの履歴API（`history.pushState` / `popstate`）とは連動しない。ブラウザの戻る/進むボタン・URL共有・ディープリンクには対応していない。
- フォームのバリデーションはHTML標準の `required` のみで、業務ルール（例: 終了圧力 < 開始圧力、ドライとウェットの同時選択など）のチェックはない。
- エリア名・ダイビングポイント名はマスタ管理せず自由記述のため、同じ場所でも表記ゆれ（「石垣島」/「石垣」）が生じうる。参照入力（REQ-8）は「過去に自分が入力した文字列をそのまま再利用する」ことで表記ゆれの発生を減らすだけの仕組みであり、既に存在する表記ゆれの名寄せ・正規化・統合リネームは行わない。エリア／ポイントでの絞り込み検索も引き続き未実装（一覧の検索・フィルタ自体が未実装、[概要](../00-overview.md) の既知の制約を参照）。
- 参照候補は毎回 `diveLogs` の全件走査から導出するため、ログ件数が非常に多くなるとフォームの初期表示が遅くなる可能性がある（現実的な件数では問題にならない想定。必要になった時点でキャッシュやインデックスを検討する）。
- 器材の選択肢を後から変更・削除した場合、旧コード値を持つ既存レコードは選択肢に存在しない値を保持し続ける（`gearLabel()` のフォールバック表示になり、編集フォームでは「選択なし」相当に見える）。選択肢の削除は慎重に行う。
- 旧 `gear` の値は構造化項目へ自動変換されないため、過去ログの器材情報を新項目で検索・集計したい場合はユーザーが手作業で入力し直す必要がある。
- 同日ログの引き継ぎは「フォームを開いた瞬間の1回」に限定されるため、日付を変更したユーザーは明示的な引き継ぎボタンを押す必要がある（自動再実行しないのは入力済みの値を保護するため）。
