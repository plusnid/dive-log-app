# 設計: 観察した生物の記録・検索

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [ダイビングログCRUD設計](../dive-log-crud/design.md) / [写真の添付設計](../photo-attachment/design.md) / [Google Drive同期設計](../google-drive-sync/design.md) / [UI仕上げ レベル1設計](../ui-polish-level1/design.md) / [UI仕上げ レベル2設計](../ui-polish-level2/design.md) / [UI仕上げ レベル3設計](../ui-polish-level3/design.md)

ステータス: 初回分（[1](#1-観察記録の持ち方)〜[8](#8-手動確認観点初回実装分)）は実装済み。
**改善要望2件の設計（[9](#9-観察記録のリスト表示改善要望1) / [10](#10-画面遷移の履歴改善要望2)）は策定中で、[要件の未確定事項](./requirements.md#確定済み改善要望122026-08-09) 9〜18 のユーザー判断待ち。以下の 9・10 は推奨案に基づく設計であり、判断次第で差し替える。**

## 設計方針

- **観察記録はダイビングログに従属するデータとして、ログのレコード内に持つ**（[未確定事項 1](./requirements.md#未確定事項確認したい点) の案A）。これにより Dexie のスキーマ変更・カスケード削除の実装・同期の設計変更をいずれも回避できる（→ [1](#1-観察記録の持ち方)）。
- **写真は実体を複製せず、既存の `attachments` テーブルをそのまま再利用する**。観察記録は写真の**参照だけ**を持つ（[photo-attachment](../photo-attachment/design.md) の仕組みを変更しない）。
- **参照は添付の `uuid` で持つ**（端末ローカルの採番 `id` では同期後に壊れるため。→ [2](#2-写真参照の持ち方)）。
- **選択肢は「型＋ラベル配列＋ラベル関数」の既存パターンに揃える**（`src/types/gearOptions.ts` / `src/types/weatherOptions.ts` と同じ形）。
- **UIは既存のデザイン方針を踏襲する**。アイコンは `src/components/icons.tsx` にインラインSVGで追加（[ui-polish-level1](../ui-polish-level1/design.md)）、配色は `--accent` / `--surface` / `--border` / `--text-muted` トークン（[ui-polish-level2](../ui-polish-level2/design.md)）、検索画面の導線はメニュー（[ui-polish-level3](../ui-polish-level3/design.md) の `AppMenu`）に足す。
- **依存パッケージは追加しない**（REQ-9.1）。検索は文字列の `includes` と配列操作のみで実装する。
- **UIは Dexie を直接触らない**（REQ-9.7）。検索画面は既存の `useDiveLogs()` を購読し、集計は純関数で行う。

## 変更対象ファイル

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/types/diveLog.ts` | 変更 | `Observation` 型の追加、`DiveLog.observations`、`DiveLogDraft` の `Omit` に `observations` を追加 | REQ-1.1, REQ-1.2 |
| `src/types/marineLifeOptions.ts` | 新規 | `MarineLifeGenre` と選択肢配列・`marineLifeGenreLabel()` | REQ-2.4, REQ-4.5 |
| `src/db/diveLogRepository.ts` | 変更 | 観察記録の保存（写真参照の uuid 解決・サニタイズ）、名前候補の取得 | REQ-1.3, REQ-3.5〜REQ-3.7, REQ-2.7 |
| `src/db/syncRepository.ts` | 変更 | 競合コピー作成時の写真参照の付け替え | REQ-8.4 |
| `src/sync/syncTypes.ts` | 変更 | `RemoteLogBody` の型定義のみ変更（実行時の挙動は不変） | REQ-8.1, REQ-8.6 |
| `src/components/ObservationEditor.tsx` / `.css` | 新規 | 観察記録の入力（行の追加・削除、ジャンル・名前・写真選択） | REQ-2.1〜REQ-2.13, REQ-3.1〜REQ-3.8 |
| `src/views/DiveLogFormView.tsx` | 変更 | 観察記録の区画を追加、写真削除時の参照整理、保存時の受け渡し | REQ-2.x, REQ-3.6 |
| `src/views/DiveLogDetailView.tsx` | 変更 | 「観察した生物」セクションの追加 | REQ-4.1〜REQ-4.5 |
| `src/components/DiveLogListItem.tsx` / `.css` | 変更 | メタ行に生物の件数を追加 | REQ-5.1〜REQ-5.4 |
| `src/views/CreatureSearchView.tsx` / `.css` | 新規 | 生物一覧・検索・該当ログ一覧 | REQ-6.1〜REQ-6.13 |
| `src/components/AppMenu.tsx` | 変更 | 「生物から探す」項目の追加 | REQ-6.2 |
| `src/views/DiveLogListView.tsx` | 変更 | メニュー項目のハンドラを `App.tsx` へ中継 | REQ-6.2 |
| `src/App.tsx` | 変更 | `Route` に `{ view: 'creatures' }` を追加 | REQ-6.1, REQ-6.13 |
| `src/components/icons.tsx` | 変更 | `CreatureIcon`（生物）の追加 | REQ-5.1, REQ-9.3 |

`src/db/db.ts`（Dexieスキーマ）、`src/components/PhotoPicker.tsx`、`src/sync/syncEngine.ts`、`src/platform/` は**変更しない**（→ [4](#4-dexie-スキーマとマイグレーション), [7](#7-google-drive-同期への影響)）。

### 改善要望での追加変更（[9](#9-観察記録のリスト表示改善要望1) / [10](#10-画面遷移の履歴改善要望2)）

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/components/ObservationEditor.tsx` / `.css` | 変更 | 1件1行の一覧表示、行ごとの詳細の開閉、フォーカス管理 | REQ-10.1〜REQ-10.22 |
| `src/components/icons.tsx` | 変更 | `PencilIcon`（編集）の追加。一覧行の写真表示は既存の `availablePhotos` のサムネイル（`<img>`）を再利用し、新規アイコンは不要 | REQ-10.3, REQ-10.8 |
| `src/App.tsx` | 変更 | `Route` の単一 state を履歴スタックに置き換え、`push` / `replace` / `back` / `dropLog` を追加 | REQ-11.1〜REQ-11.14 |
| `src/views/CreatureSearchView.tsx` | 変更 | `selectedName`（および検索語・絞り込み）を controlled props へ引き上げ | REQ-11.15〜REQ-11.18 |

`src/types/`・`src/db/`・`src/sync/`・`src/hooks/` は改善要望では**変更しない**（保存されるデータ・同期の形式は一切変わらない。REQ-10.23, REQ-11.22）。
`DiveLogListView` / `DiveLogFormView` / `DiveLogDetailView` / `SyncSettingsView` の props も変更しない（REQ-11.20。文言のみ変更する可能性は [要件の未確定事項 15](./requirements.md#確定済み改善要望122026-08-09)）。

---

## 1. 観察記録の持ち方

### 方式の比較（[未確定事項 1](./requirements.md#未確定事項確認したい点)）

| 観点 | **案A: `DiveLog` 内に配列で持つ（推奨）** | 案B: `observations` テーブルを新設 |
| --- | --- | --- |
| Dexieスキーマ | 変更不要（`stores()` に現れない非キー項目。`area` や器材項目と同じ扱い） | version 3 が必要（`observations: '++id, &uuid, diveLogId, genre, name'`） |
| ログ削除時 | 自動（ログのレコードごと消える） | `deleteDiveLog` にカスケード削除の実装が必要 |
| 保存の原子性 | ログの `add` / `update` 1回で完結 | ログと観察記録の複数テーブル書き込みをトランザクションで束ねる必要がある |
| 同期（[google-drive-sync](../google-drive-sync/design.md)） | `logs/<uuid>.json` の `log` に自然に含まれる。エンジン変更・`schemaVersion` 変更なし | 新しい `SyncKind`・墓標・Drive上のファイル配置・競合解決の粒度の再設計が必要 |
| 競合解決 | ログ単位のまま（[REQ-6](../google-drive-sync/requirements.md)）。観察記録だけが競合することはない | 観察記録単位の競合が新たに発生し、ログとの整合（親が消えた子）も考慮が必要 |
| 検索（名前・ジャンル） | 全ログ走査（`db.diveLogs.toArray()` の在メモリ集計） | `where('name')` 等のインデックス検索が可能 |
| 件数が増えたとき | ログ1件のレコードが大きくなる（観察記録1件は数十バイト。1本20種でも1KB未満） | スケールする |
| 一覧購読との相性 | `useDiveLogs()` の結果に観察記録が含まれるため、追加のクエリなしで一覧カードの件数表示・検索画面の集計ができる | 一覧・検索のたびに別テーブルを結合する必要がある |

**案Aを推奨する。** 決め手は同期である。[google-drive-sync/design.md](../google-drive-sync/design.md) は「ログ1件＝Drive上の1ファイル」「競合解決はレコード（ログ）単位」を前提に設計されており、観察記録を独立したレコードにすると、同期対象の種別追加・墓標・親子整合の設計をやり直すことになる。一方、案Aなら**同期エンジンは1行も変えずに**観察記録が端末間で運ばれる（[7](#7-google-drive-同期への影響)）。

検索性能の懸念に対しては、ログ件数が個人利用の規模（数百〜数千件）であり、既存の `listPastPlaceValues()` が既に全件走査を行っている（[dive-log-crud/design.md](../dive-log-crud/design.md)）ことから、初回リリースではインデックスなしで十分と判断する。将来必要になった場合の移行パスは [4](#4-dexie-スキーマとマイグレーション) に記す。

### データモデル（`src/types/diveLog.ts`）

```ts
import type { MarineLifeGenre } from './marineLifeOptions'

/** 1本のダイビングで観察した生物1種の記録（REQ-1.2）。 */
export interface Observation {
  /**
   * 観察記録の識別子。同一ログ内での一意性のみを保証する。
   * 用途: フォームでの React の key の安定化、競合コピー時の突き合わせ、
   *       将来 observations を別テーブルへ移す場合の移行キー。
   */
  uuid: string
  /** ジャンル。undefined = 選択なし（REQ-1.4） */
  genre?: MarineLifeGenre
  /** 名前（自由記述・必須。空文字の観察記録は保存しない＝REQ-1.3） */
  name: string
  /** 紐づく写真。値は `Attachment.uuid`（端末非依存、REQ-8.2）。0件可（REQ-3.2） */
  photoUuids: string[]
}

export interface DiveLog {
  // ...既存フィールドは変更なし
  /** 観察した生物。未設定（undefined）は0件と同義（REQ-7.1） */
  observations?: Observation[]
}

export type DiveLogDraft = Omit<
  DiveLog,
  'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt' | 'gear' | 'observations'
>
```

`observations` を `DiveLogDraft` から `Omit` するのは、**写真・サインと同じ理由**である。フォームがまだ保存していない写真（`File`）を指す観察記録を作れる必要があり（REQ-3.5）、その参照を `Attachment.uuid` に解決できるのは添付を保存したリポジトリ層だけであるため。したがって観察記録は `photoFiles` / `signatureBlob` と同様に**リポジトリ関数の独立した引数**として渡す（→ [5](#5-リポジトリ層)）。

### ジャンルの選択肢（`src/types/marineLifeOptions.ts`、新規）

`gearOptions.ts` / `weatherOptions.ts` と同じ「型＋ラベル配列＋ラベル関数」の形に揃える。

```ts
export type MarineLifeGenre =
  | 'nudibranch' | 'fish' | 'crustacean' | 'cephalopod'
  | 'shellfish' | 'echinoderm' | 'cnidarian' | 'reptile_mammal' | 'other'

export interface MarineLifeGenreOption {
  value: MarineLifeGenre
  label: string
}

export const marineLifeGenreOptions: MarineLifeGenreOption[] = [
  { value: 'nudibranch', label: 'ウミウシ' },
  { value: 'fish', label: '魚類' },
  { value: 'crustacean', label: '甲殻類' },
  { value: 'cephalopod', label: '頭足類' },
  { value: 'shellfish', label: '貝類' },
  { value: 'echinoderm', label: '棘皮動物' },
  { value: 'cnidarian', label: '刺胞動物' },
  { value: 'reptile_mammal', label: '爬虫類・哺乳類' },
  { value: 'other', label: 'その他' },
]
```

ユーザー確定（2026-08-09）による調整: 「サメ・エイ」は独立ジャンルとせず`fish`（魚類）に統一（サメ・エイを記録する場合はジャンル「魚類」＋名前欄に記載する）。「サンゴ・イソギンチャク」は生物学的な分類名`cnidarian`（刺胞動物、クラゲ等も含む上位分類）に改称。表示順はウミウシを先頭に変更（残りは元の順序を維持）。9種となる。

```ts
/** 未選択（undefined）や未知のコード値は '-' を返す（REQ-4.5）。gearLabel / weatherLabel と同じ方針。 */
export function marineLifeGenreLabel(value: string | undefined): string
```

- 「選択なし」は配列に含めず、`<select>` の先頭に `<option value="">選択なし</option>` を静的に置く（器材の選択リストと同じ書き方。REQ-2.4）。
- 未知のコード値は例外にせず `-` にフォールバックする。旧バージョンや将来の選択肢変更で入ったコード値を持つレコードは、ユーザーが選び直さない限りそのまま保持される（REQ-7.3。`updateDiveLog` は `draft` の値をそのまま書くため、フォームで触らなければ変化しない）。
- 自由記述案（[未確定事項 2](./requirements.md#未確定事項確認したい点) 案イ）を採る場合は、このファイルを作らず `genre?: string` とし、名前と同じ `PastValuePicker` を併設する（変更点はフォームと検索画面の絞り込みUIのみで、データモデルの他の部分は変わらない）。

---

## 2. 写真参照の持ち方

観察記録が写真を指す方法には3案ある。

| 方式 | 同期後の有効性 | 写真削除時 | 競合コピー時 | 判定 |
| --- | --- | --- | --- | --- |
| ローカルの `Attachment.id`（`DiveLog.photoIds` と同じ数値） | **無効**。id は端末ごとの採番で、`applyRemoteLog` は取り込み先で採番し直す | 参照が残る（要掃除） | 参照が壊れる | 不採用 |
| `DiveLog.photoIds` 内の**位置（index）** | 有効（`photoUuids` の順序で復元されるため） | **全参照のずれ直しが必要** | 有効 | 不採用（削除のたびに全観察記録を書き換える必要があり壊れやすい） |
| **`Attachment.uuid`（採用）** | **有効**（`uuid` は端末間で不変。`applyRemoteLog` は uuid で突き合わせて upsert する） | 参照を落とすだけ（順序に影響しない） | 付け替えが必要（[7](#7-google-drive-同期への影響)） | **採用** |

`Attachment` は [google-drive-sync](../google-drive-sync/design.md) の version 2 で既に `uuid`（`&uuid` インデックス付き）を持っているため、追加のスキーマ変更なしにこの参照方式を採れる。

### フォーム上の一時的な参照（`PhotoRef`）

フォームは「まだ保存されていない写真（`File`）」も選択対象にする（REQ-3.5）。この段階では `Attachment.uuid` が存在しないため、フォーム内だけで通用する参照型を使う。

```ts
/** フォーム上の写真参照。保存時にリポジトリが Attachment.uuid へ解決する。 */
export type PhotoRef =
  | { kind: 'existing'; id: number }   // 保存済みの添付（Attachment.id）
  | { kind: 'new'; file: File }        // 未保存の新規写真（File オブジェクトの同一性で識別）

export interface ObservationDraft {
  uuid: string
  genre?: MarineLifeGenre
  name: string
  photos: PhotoRef[]
}
```

- `{ kind: 'new' }` を**index ではなく `File` オブジェクトそのもの**で持つのは、`PhotoPicker` が新規写真を配列から取り除いたときに index がずれるため。`File` の参照同一性で持てば、削除後の配列に含まれているかどうかを `Array.prototype.includes` で判定でき、ずれ直しが不要になる（REQ-3.6）。
- `PhotoPicker` の props（`existingPhotos` / `removedExistingIds` / `newFiles` / …）は**変更しない**。写真の追加・削除の責務は既存のまま [photo-attachment](../photo-attachment/design.md) に置く。

---

## 3. 入力UI

### 3-1. 配置

`DiveLogFormView` の `<fieldset>` として「観察した生物」を**器材・エア管理と写真・メモの間**に追加する……のではなく、**写真・メモの直後**に置く。理由は、写真の紐付け（REQ-3.1）を行うには先に写真が選ばれている必要があり、フォーム上の並びが「写真を追加 → 生物に紐づける」という操作順と一致するため。

```
[基本情報] [環境情報] [器材・エア管理] [写真・メモ] [観察した生物] [ガイドのサイン]
```

詳細画面のセクション順（[3-4](#3-4-詳細画面)）とは一致しなくなるが、詳細画面は閲覧順（生物 → 写真の順に見せたい）を優先する。順序に希望があれば [未確定事項 8](./requirements.md#未確定事項確認したい点) で確定する。

### 3-2. `ObservationEditor`（新規）

```tsx
interface ObservationEditorProps {
  observations: ObservationDraft[]
  onChange: (next: ObservationDraft[]) => void
  /** 紐付け可能な写真（保存済み＋未保存を統合したもの。順序は表示順） */
  availablePhotos: AvailablePhoto[]
}

interface AvailablePhoto {
  ref: PhotoRef
  /** プレビュー用のオブジェクトURL（親が生成・解放する） */
  url: string
  key: string   // React の key（`existing-<id>` / `new-<連番>`）
}
```

- 親（`DiveLogFormView`）が状態を持つコントロールドコンポーネント。DB操作は行わない（`PhotoPicker` / `SignaturePad` と同じ方針）。
- `availablePhotos` は、`existingPhotos`（`removedExistingIds` を除外したもの）と `newFiles` から親が組み立て、`URL.createObjectURL` の生成と `URL.revokeObjectURL` の解放を `useEffect` のクリーンアップで行う（[photo-attachment/design.md](../photo-attachment/design.md) と同じ扱い）。`PhotoPicker` が内部で作るオブジェクトURLとは別インスタンスになるが、オブジェクトURLは Blob の実体を複製しない軽量なハンドルであり、メモリ上の写真データが二重に載ることはない。
- 1行の構成:

```
┌─────────────────────────────────────────┐
│ [ジャンル ▼]                     [削除]  │
│ 名前 [__________________] [参照]          │
│ 写真 [◻][◻][◼]  ← 写真プールのサムネイルをトグル選択 │
└─────────────────────────────────────────┘
```

- ジャンルは `<select>`（先頭に「選択なし」）。名前は `<input type="text">` ＋ `PastValuePicker`（既存部品をそのまま再利用、REQ-2.6〜REQ-2.10）。
- 写真の選択は**トグルボタン**（`<button type="button" aria-pressed={selected}>` の中にサムネイル `<img alt="">`）。選択中は `--accent` の枠線＋チェックのアイコンで示し、色だけに依存しない（REQ-9.5）。`aria-label` は「写真1を選択」等の位置ベースの文言とする（写真に名前がないため）。
- `availablePhotos.length === 0` のときは、選択欄の代わりに「先に写真を追加すると、この生物に紐づけられます。」の案内を出す（REQ-3.8）。
- 行の追加は区画末尾の「生物を追加」ボタン（`type="button"`、REQ-2.2 / REQ-2.13）。行の削除は各行の「削除」ボタン。
- 観察記録が0件のときは、案内文（「観察した生物を記録できます。」）＋追加ボタンのみを表示する（REQ-2.11）。
- タップ領域は最小44×44px、サムネイルは56×56px程度（`CardThumbnail` の64pxに近い寸法感）で、`flex-wrap` により幅320pxで折り返す（REQ-9.4）。

### 3-3. `DiveLogFormView` 側の変更

- `const [observations, setObservations] = useState<ObservationDraft[]>([])` を追加。編集時は `getDiveLogDetail` の結果から復元する（REQ-2.12）:
  ```ts
  // Attachment.uuid → Attachment.id の逆引きで PhotoRef に戻す。
  // 見つからない uuid は落とす（REQ-3.7）。
  const byUuid = new Map(photos.map((p) => [p.uuid, p.id as number]))
  setObservations(
    (diveLog.observations ?? []).map((o) => ({
      uuid: o.uuid,
      genre: o.genre,
      name: o.name,
      photos: o.photoUuids.flatMap((u) => (byUuid.has(u) ? [{ kind: 'existing' as const, id: byUuid.get(u)! }] : [])),
    })),
  )
  ```
- 新規行の `uuid` は `newUuid()`（`src/db/uuid.ts`）で採番する。ビュー → `db/` の依存方向は既存の依存の向き（[概要](../00-overview.md)）に沿う。
- **写真が取り除かれたときの参照整理（REQ-3.6）**: 既存写真の削除（`onRemoveExisting`）と新規写真の削除（`onNewFilesChange`）を親のハンドラでラップし、観察記録側の `photos` から該当参照を除去する。
  ```ts
  function handleRemoveExisting(pid: number) {
    setRemovedPhotoIds((prev) => [...prev, pid])
    setObservations((prev) =>
      prev.map((o) => ({ ...o, photos: o.photos.filter((r) => !(r.kind === 'existing' && r.id === pid)) })),
    )
  }
  function handleNewFilesChange(next: File[]) {
    setNewFiles(next)
    setObservations((prev) =>
      prev.map((o) => ({ ...o, photos: o.photos.filter((r) => r.kind !== 'new' || next.includes(r.file)) })),
    )
  }
  ```
  リポジトリ側でも最終的なサニタイズを行う（[5](#5-リポジトリ層)）ため、UI側の取りこぼしがあってもデータには不整合が残らない。
- 送信時は `createDiveLog(draft, newFiles, signatureBlob, observations)` / `updateDiveLog(id, draft, { …, observations })` に渡す。
- 引き継ぎ（[dive-log-crud REQ-7](../dive-log-crud/requirements.md)）の `carryOverKeys` は変更しない（REQ-2.14）。

### 3-4. 詳細画面

`DiveLogDetailView` に「観察した生物」の `<section>` を、**器材・エア管理の後・写真・メモの前**に追加する。

```tsx
<section>
  <h2>観察した生物</h2>
  {observations.length === 0 ? (
    <p>-</p>                                   {/* REQ-4.3 */}
  ) : (
    <ul className="observation-list">
      {observations.map((o) => {
        const thumbUrl = o.photoUuids.length > 0 ? photoUrlByUuid.get(o.photoUuids[0]) : undefined   // REQ-4.4: 先頭1枚のみ
        return (
          <li key={o.uuid} className="observation-list__item">   {/* 1件1行（改善要望1のフォーム側と一貫） */}
            {onSelectCreature ? (
              <button type="button" className="observation-list__name" onClick={() => onSelectCreature(o.name)}>
                {o.name}
              </button>
            ) : (
              <span className="observation-list__name observation-list__name--static">{o.name}</span>
            )}
            <span className="observation-list__genre">{marineLifeGenreLabel(o.genre)}</span>
            {thumbUrl && <img className="observation-list__thumb" src={thumbUrl} alt="" />}
          </li>
        )
      })}
    </ul>
  )}
</section>
```

- 写真は `getDiveLogDetail` が返す `photos: Attachment[]` を `uuid` で引き当て、既に生成済みの `photoUrls` を再利用する（`URL.createObjectURL` を増やさない）。現状 `photoUrls` は配列の位置で `photos` と対応しているため、`uuid → url` の `Map`（`photoUrlByUuid`）を組み立てて使う。参照先が見つからない（`undefined`）場合はサムネイルを出さない（REQ-3.7 と同じ扱い）。
- **1行の構成は名前 → ジャンル → サムネイルの順**（`display: flex; align-items: center`）。2枚以上紐づいていても表示は先頭1枚のみで、残りの枚数は表示しない（REQ-4.4。[10. 観察記録のリスト表示](#10-観察記録のリスト表示と行の編集改善要望1)のフォーム側の一覧行と表示方針を揃えた。当初案の「名前・ジャンルの見出し行＋写真の全枚数を並べた行」の2段構成から、実装後のユーザーフィードバックにより1行構成へ改めた）。
- ジャンルは名前より弱い書式（`--text-muted`・小さめ）とし、名前を主とする（[ui-polish-level1](../ui-polish-level1/design.md) の情報の強弱の方針）。
- 名前を選択すると検索画面の該当ログ一覧へ移動する導線（[未確定事項 5](./requirements.md#未確定事項確認したい点)で確定・採用）を入れる。`DiveLogDetailView` に `onSelectCreature?: (name: string) => void` を追加し、`App.tsx` が `{ view: 'creatures', name }` へ遷移する。

### 3-5. 一覧カード

`DiveLogListItem` のメタ行の**末尾**（サイン済の後）に1項目を追加する（REQ-5.1〜REQ-5.3）。

```tsx
{(diveLog.observations?.length ?? 0) > 0 && (
  <span className="dive-log-list-item__meta-item">
    <CreatureIcon className="dive-log-list-item__icon" />
    <span className="dive-log-list-item__meta-label">生物</span>
    <span className="dive-log-list-item__meta-value">{diveLog.observations!.length}件</span>
  </span>
)}
```

- 書式・アイコンの扱いは既存のメタ行項目と完全に同じ（CSSの追加は不要）。
- `CreatureIcon` は `icons.tsx` の共通属性セット（`viewBox="0 0 24 24"` / `stroke="currentColor"` / `strokeWidth={2}` / 線端丸 / `aria-hidden`）で作る。形状の目安: 横向きの魚（胴体の閉じたパス＋三角の尾＋目の点）。例: `M4 12c3-4 8-5 12-1-4 4-9 3-12 1z` に尾 `M16 11l4-3v8l-4-3` と目 `M8.5 11.5h.01`（点は `strokeLinecap="round"` により丸点として描かれる）。

---

## 4. Dexie スキーマとマイグレーション

**`src/db/db.ts` は変更しない**（[未確定事項 6](./requirements.md#未確定事項確認したい点)）。

- `observations` は `stores()` に現れない非キー項目であり、IndexedDB はオブジェクト全体を保存するため、スキーマ定義の変更もバージョン上げも不要（[dive-log-crud/design.md](../dive-log-crud/design.md) が `area` と器材の構造化項目で採ったのと同じ判断）。
- 既存レコードは `observations` が `undefined` のまま残る。`upgrade()` によるバックフィルは行わない（REQ-7.1, REQ-7.2）。表示側は `diveLog.observations ?? []` で0件として扱う。
- 検索は `db.diveLogs.toArray()` の在メモリ集計で行う（[6](#6-検索と該当ログの一覧)）。ログ件数が増えて体感速度が問題になった場合の移行パス:
  1. `DiveLog` に検索用の派生フィールド（例: `observationNames: string[]`）を保存時に生成し、
  2. Dexie **version 3** で `diveLogs: '++id, date, siteName, createdAt, &uuid, updatedAt, *observationNames'`（multiEntry インデックス）を追加、
  3. `upgrade()` で既存レコードの派生フィールドを生成する。

  このとき派生フィールドが同期の `log` にも含まれることになるが、値は観察記録から再生成可能なため互換性の問題は生じない。**初回リリースではこれを行わない。**

---

## 5. リポジトリ層（`src/db/diveLogRepository.ts`）

### 関数シグネチャの変更

```ts
export async function createDiveLog(
  draft: DiveLogDraft,
  photoFiles: File[],
  signatureBlob: Blob | null,
  observations: ObservationDraft[] = [],   // 追加（既定値により既存の呼び出しは無変更でも動く）
): Promise<number>

export interface UpdateDiveLogOptions {
  newPhotoFiles: File[]
  removedPhotoIds: number[]
  newSignatureBlob?: Blob | null
  observations?: ObservationDraft[]        // 追加。undefined のときは既存の観察記録を変更しない
}
```

- `observations` を省略可能にすることで、既存の呼び出し箇所（およびテスト・将来の別画面からの保存）を壊さない。`updateDiveLog` で `undefined` のときは `db.diveLogs.update()` に `observations` キーを含めず、Dexie の「渡されたキーのみ変更する」性質により既存値を保持する（廃止項目 `gear` と同じ扱い、[dive-log-crud/design.md](../dive-log-crud/design.md)）。

### 写真参照の解決とサニタイズ

内部ヘルパー `addAttachment()` の戻り値を `number` から `{ id: number; uuid: string }` に変える（保存直後の uuid が必要なため。呼び出し箇所は同ファイル内に閉じている）。

```ts
/**
 * フォームの ObservationDraft を、保存用の Observation に変換する。
 * - 名前が空（trim 後）の観察記録は破棄する（REQ-1.3）
 * - 解決できない・最終的な写真集合に含まれない参照は破棄する（REQ-3.6, REQ-3.7）
 * - 同一観察記録内の重複した写真参照は1つにまとめる
 */
function resolveObservations(
  drafts: ObservationDraft[],
  uuidByExistingId: Map<number, string>,
  uuidByNewFile: Map<File, string>,
  allowedUuids: Set<string>,
): Observation[]
```

- 新規作成時: `photoFiles` を保存して得た `{ id, uuid }` の配列から `uuidByNewFile` を作る（`photoFiles[i]` と保存結果は同じ順序）。`uuidByExistingId` は空。`allowedUuids` は保存した写真の uuid 集合。
- 更新時: 最終的な `photoIds`（既存 − 削除 ＋ 新規）に対して `db.attachments.bulkGet(photoIds)` を行い、`id → uuid` と `allowedUuids` を作る。この1回の読み出しで、UI側で取りこぼした参照も含めて必ず整合が取れる。
- `uuid` が未設定のドラフト（外部から渡された場合）には `newUuid()` を採番する。
- いずれの処理も既存の `db.transaction('rw', db.diveLogs, db.attachments, …)` の中で完結する（追加のテーブルを触らないため、トランザクションの対象テーブルは変わらない）。

### 名前候補の取得（REQ-2.7, REQ-2.8）

```ts
/** 参照入力の元データ（観察記録のジャンルと名前の組）を「最近記録した順」で返す（REQ-2.7, REQ-2.8）。 */
export async function listPastObservationValues(): Promise<{ genre?: MarineLifeGenre; name: string }[]>
```

- 実装は `listPastPlaceValues()` と同じ形。`db.diveLogs.toArray()` を1回実行し、`date` 降順 → `updatedAt` 降順に並べたうえで、各ログの `observations` を順に展開して返す。重複排除・ジャンルでの絞り込みはUI側の純関数（`deriveCreatureNameCandidates`）で行う。これは `derivePlaceCandidates` と同じ役割分担であり、行ごとに選択中のジャンルが変わっても再クエリせずに候補を出し分けられる（[未確定事項 3](./requirements.md#未確定事項確認したい点) の補助案）。
- フォームでの取得タイミングは既存の初期ロード（`useEffect` で1回）に合わせる。`useLiveQuery` は使わない（[dive-log-crud/design.md](../dive-log-crud/design.md) のフック層の方針）。

---

## 6. 検索と該当ログの一覧

### 6-1. 画面構成

`App.tsx` の `Route` に `{ view: 'creatures'; name?: string }` を追加する（現状は `list | form | detail | settings` の4つ）。`name` が指定されていれば、該当ログの一覧を開いた状態で表示する（詳細画面の生物名からの遷移。[3-4](#3-4-詳細画面)）。

導線は `AppMenu` の項目「生物から探す」（[未確定事項 5](./requirements.md#未確定事項確認したい点) の案A）。`DiveLogListView` は `onOpenCreatures` を props で受け取り、`AppMenu` に渡す（`onOpenSettings` と同じ形）。メニュー項目は「生物から探す」「設定」「ホーム画面に追加の案内」の順とする。

```
生物から探す
┌──────────────────────────────┐
│ ← 一覧に戻る                    │
│ 生物から探す                     │
│ [検索語 __________]  [ジャンル ▼] │
│ ┌──────────────────────────┐ │
│ │ クマノミ            魚類  5件 │ │  ← 選択で下段へ
│ │ アオウミガメ  爬虫類・哺乳類 2件 │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
        ↓ 生物を選択
┌──────────────────────────────┐
│ ← 生物一覧に戻る                 │
│ クマノミ（5件）                  │
│ [既存のログカード × 5]            │  ← DiveLogListItem を再利用（REQ-6.9）
└──────────────────────────────┘
```

- 画面内の2段階（生物一覧 ↔ 該当ログ一覧）は `CreatureSearchView` 内の `useState` で切り替える（`Route` を分割しない。自前ルーターの構造を複雑にしないため）。
- FAB は一覧画面専用のため、この画面には表示されない（[ui-polish-level3 REQ-1.11](../ui-polish-level3/requirements.md) と整合）。

### 6-2. データ取得と集計

`CreatureSearchView` は既存の `useDiveLogs()`（`useLiveQuery`）をそのまま購読し、集計はモジュールスコープの純関数で行う。新しいリポジトリ関数もフックも追加しない（REQ-9.7、REQ-6.14）。

```ts
export interface CreatureEntry {
  /** 表示名（trim 済み。最初に出現した表記を採用する） */
  name: string
  /** この名前で記録されている全ジャンル（未選択は含めない、REQ-6.5） */
  genres: MarineLifeGenre[]
  /** 観察したログのID（日付の新しい順、REQ-6.9） */
  logIds: number[]
}

/** 保存済みログ（日付降順）から生物一覧を導く。同名は trim 完全一致で集約する（REQ-6.3〜REQ-6.5）。 */
export function deriveCreatureIndex(logs: DiveLog[]): CreatureEntry[]

/** 検索語（部分一致）とジャンルで絞り込む（REQ-6.6, REQ-6.7）。 */
export function filterCreatures(
  entries: CreatureEntry[],
  query: string,
  genre: MarineLifeGenre | undefined,
): CreatureEntry[]
```

- `useDiveLogs()` は `orderBy('date').reverse()` で既に日付降順のため、走査順のまま `logIds` に積めば REQ-6.9 の順序になる（同一日付内の順序は Dexie のインデックス順に従う。一覧画面と同じ順序になり、画面間で矛盾しない）。
- 同一ログ内に同じ名前の観察記録が複数あっても、`logIds` には1回だけ積む（件数はログ数、REQ-6.3）。
- 一覧の並び順は**最近観察した順**（先頭のログが新しい順）とする。[dive-log-crud REQ-8.5](../dive-log-crud/requirements.md) の参照候補と同じ考え方で、「最近見た生物ほど探したい」という想定に合う。件数順・五十音順にする場合はこの関数の最後に `sort` を足すだけで切り替えられる。
- 検索語は `query.trim()` が空文字なら絞り込まない（REQ-6.3）。部分一致は `name.includes(trimmed)` の単純判定とし、大文字小文字・全角半角・カタカナひらがなの正規化は行わない（[dive-log-crud REQ-8.4](../dive-log-crud/requirements.md) と同じ方針。表記ゆれの吸収は将来の課題）。
- 該当ログ一覧は `logs.filter((l) => selected.logIds.includes(l.id))` で得た `DiveLog[]` を `DiveLogListItem` に渡す（REQ-6.9, REQ-6.10）。`DiveLogListItem` の props は変更しない。
- 空状態: 観察記録が1件もない（`entries.length === 0` かつ検索語なし）ときは「まだ生物の記録がありません。」（REQ-6.12）、絞り込み結果が0件のときは「該当する生物が見つかりませんでした。」（REQ-6.11）。

### 6-3. 検索の計算量

ログ N 件・1本あたり平均 M 件の観察記録に対して O(N×M) の走査を、検索語の変更ごとに行う。集計（`deriveCreatureIndex`）は `logs` にのみ依存するため `useMemo` でキャッシュし、絞り込み（`filterCreatures`）だけを毎入力で再計算する。N=1000・M=10 でも1万件の文字列比較であり、インクリメンタル検索でも問題にならない。

---

## 7. Google Drive 同期への影響

### 変更が不要な部分

- `sync/syncEngine.ts` の `toRemoteLogBody()` は、`id` / `uuid` / `photoIds` / `signatureId` / `createdAt` / `updatedAt` を除いた残余（rest スプレッド）を `logs/<uuid>.json` の `log` にそのまま書き出す。したがって **`observations` は個別対応なしに同期対象へ含まれる**（REQ-8.1）。
- 取り込み側の `syncRepository.applyRemoteLog()` も `{ ...remoteLog, uuid, photoIds, signatureId, … }` の形でログを組み立てるため、`observations` はそのまま書き戻される。
- 観察記録の写真参照は `Attachment.uuid` であり、`applyRemoteLog` は添付を **uuid で突き合わせて upsert** するため、取り込み先の端末でも参照が有効なまま解決できる（REQ-8.2）。ログJSONの `photoUuids` に含まれる添付は必ず先にダウンロード・登録される（[google-drive-sync/design.md](../google-drive-sync/design.md) の「トランザクション境界」）ので、参照先が欠けることはない。
- 競合解決はログ単位のまま（REQ-8.3）。観察記録だけが競合することはなく、[google-drive-sync](../google-drive-sync/design.md) の決定表は無変更。
- `schemaVersion` は **1 のまま**（REQ-8.7）。`log` の中身は `DiveLogDraft` 相当の自由な項目集合であり、項目の増減で同期の互換性は変わらない（[google-drive-sync/design.md](../google-drive-sync/design.md) が明記している設計）。

`logs/<uuid>.json` の `log` は次のようになる（追加部分のみ抜粋）:

```jsonc
"log": {
  "date": "2026-07-20", "siteName": "…",
  "observations": [
    { "uuid": "b1c2…", "genre": "fish", "name": "クマノミ", "photoUuids": ["7f3a…"] },
    { "uuid": "d4e5…", "genre": "nudibranch", "name": "ウミウシ", "photoUuids": [] }
  ]
}
```

### 変更が必要な部分

1. **競合コピーでの写真参照の付け替え（REQ-8.4）** — `src/db/syncRepository.ts` の `createConflictCopy()`。
   現状は敗者側の写真 Blob を**新しい uuid の添付として複製**してから `{ ...source.log }` でログを作る。このままだと、複製されたログの `observations[].photoUuids` は**複製元**の添付 uuid を指したままとなり、参照が解決できなくなる（表示上は REQ-3.7 により写真なしとして無視されるが、写真との対応が失われる）。
   対応: 複製時に `旧uuid → 新uuid` の `Map` を作り、`observations` の `photoUuids` を写像する。あわせて観察記録の `uuid` も採番し直す（同一内容の観察記録が2つのログに同じ識別子で存在しないようにする）。10行程度の追加で済み、`sync/` 側（React にも Dexie にも依存しないレイヤー）には手を入れない。

2. **`RemoteLogBody` の型定義（REQ-8.6）** — `src/sync/syncTypes.ts`。
   現状 `export type RemoteLogBody = DiveLogDraft` であり、`DiveLogDraft` から `observations` を `Omit` する（[1](#データモデルsrctypesdivelogts)）と**型の上では `observations` が消える**。実行時には rest スプレッドで運ばれるため動作は正しいが（廃止項目 `gear` と同じ構造）、新規項目でこの「型に出ない」状態を放置すると、将来 `toRemoteLogBody()` を明示的なフィールド列挙に書き換えた際にデータが失われる。
   対応: 型定義を実態に合わせる（**型のみの変更で、実行時の挙動は一切変わらない**）。
   ```ts
   /** Drive 上の `logs/<uuid>.json` の `log` フィールド。ローカル専用の id/uuid/photoIds/signatureId/日時は含まない。
    *  DiveLogDraft と異なり、フォームが直接編集しない項目（observations / 廃止済みの gear）も含む。 */
   export type RemoteLogBody = Omit<DiveLog, 'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt'>
   ```
   `DiveLogSnapshot.log`（競合コピーの入力）も同じ型を使うため、1の付け替え実装が型安全になる。

### バージョン混在時の挙動

| 状況 | 挙動 | 根拠 |
| --- | --- | --- |
| 本機能なしの端末が書いたログを、本機能ありの端末が取り込む | `observations` が存在しない → 0件として扱う | REQ-8.5、`observations ?? []` |
| 本機能ありの端末が書いたログを、本機能なしの端末が取り込む | `applyRemoteLog` の `{ ...remoteLog }` により値は保存される（画面には出ない） | 既存実装 |
| 上記の端末がそのログを編集・保存する | `updateDiveLog` の `db.diveLogs.update()` は渡されたキーのみを変更し、その版の `DiveLogDraft` に `observations` は含まれないため、値は保持される | REQ-8.6、[dive-log-crud REQ-4.6](../dive-log-crud/requirements.md) と同じ仕組み |
| 上記の端末がその写真を削除して保存する | 写真の実体は消えるが、観察記録の写真参照は残る（解決できない参照になる） | REQ-3.7 により表示側で無視する。**既知の制約** |

---

## 8. 手動確認観点（初回実装分）

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。

1. 新規作成で観察記録を3件入力し、保存 → 詳細画面に入力順で表示されること（REQ-1.5）。
2. 名前を空のまま追加した行が、保存後には存在しないこと（REQ-1.3）。
3. ジャンル未選択の観察記録を保存し、詳細画面で「-」と表示されること（REQ-1.4, REQ-4.5）。
4. 写真を3枚添付し、1件目の生物に2枚・2件目に0枚を紐づけて保存 → 詳細画面で正しい写真が各行に出ること（REQ-3.1, REQ-3.2）。
5. 同じ写真を2件の生物に紐づけて保存できること（REQ-3.4）。
6. 未保存の新規写真を紐づけて保存 → 再編集したときに紐付けが保持されていること（REQ-3.5）。
7. 写真を紐づけた後にその写真をフォーム上で削除して保存 → 詳細画面でエラーにならず、その写真の紐付けだけが消えていること（REQ-3.6, REQ-3.7）。
8. 写真0枚のログで、観察記録の写真選択欄に案内が出て操作できないこと（REQ-3.8）。
9. 編集画面で既存の観察記録を並び替えずに1件削除・1件追加して保存 → 期待どおりに反映されること（REQ-2.12）。
10. 観察記録を持つログと持たないログが混在した一覧で、カードの高さ・メタ行が崩れないこと（REQ-5.1, REQ-5.2、幅320px / 375px / 640px）。
11. メニューから「生物から探す」を開き、生物一覧が最近観察した順に出ること（REQ-6.2, REQ-6.3）。
12. 検索語の部分一致・ジャンルの絞り込み・両者の併用が効くこと（REQ-6.6, REQ-6.7）。
13. 生物を選択して該当ログ一覧が日付降順で出ること、カードから詳細へ遷移できること（REQ-6.9, REQ-6.10）。
14. 観察記録が0件の状態での空状態表示と、絞り込み0件の表示が区別できること（REQ-6.11, REQ-6.12）。
15. 検索画面から一覧画面へ戻れること、戻った後にFABが表示されること（REQ-6.13、[ui-polish-level3 REQ-1.11](../ui-polish-level3/requirements.md)）。
16. 本機能の追加前に作成した既存ログを開いて編集・保存しても、エラーにならず観察記録0件のままであること（REQ-7.1）。
17. 機内モードで、観察記録の入力・詳細表示・検索がすべて動作すること（REQ-9.2）。
18. OSをダークモードにしたとき、観察記録の行・写真選択のトグル・検索画面の文字とコントラストが読めること（REQ-9.5）。
19. キーボードのTab移動で観察記録の各操作要素に到達でき、フォーカスが見えること。写真選択のトグルが Space / Enter で切り替わり、フォームが送信されないこと（REQ-2.13）。
20. （同期を有効にしている場合）観察記録付きのログを別端末へ同期し、写真との紐付けが保たれること（REQ-8.1, REQ-8.2）。
21. （同期を有効にしている場合）意図的に競合を起こし、競合コピー側の観察記録が複製された写真を指していること（REQ-8.4）。

---

## 9. 観察記録のリスト表示（改善要望1）

現状の `ObservationEditor` は、観察記録1件ごとに「ジャンルの `<select>` ＋削除ボタン」「名前の `<input>` ＋ `PastValuePicker`」「写真のトグル選択グリッド」を**常に展開**して縦に並べる。1行あたり3段（写真がある場合は4段以上）の高さになり、5件も登録すると区画がフォームの大半を占める。本節は表示形式だけを変更し、入力できる項目・保存される値は変えない（REQ-10.23）。

### 9-1. 展開方式の比較（改善要望1）

| 観点 | **案A: インライン展開（アコーディオン、推奨）** | 案B: 被せパネル（`PastValuePicker` 風） | 案C: モーダル／ボトムシート |
| --- | --- | --- | --- |
| 既存パターンとの整合 | `AppMenu` の disclosure（`aria-expanded` + 展開領域）と同じ考え方。新しい概念を持ち込まない | `PastValuePicker` と同じ被せ方だが、同パネルが**行の内側にも**開くため入れ子のパネルになる | このアプリにオーバーレイ部品は存在しない（削除確認も `window.confirm`） |
| 写真の選択グリッド | 画面幅をそのまま使える（56pxサムネイル×4〜5列、`flex-wrap`） | パネル幅に収まらず、パネル内スクロールが必要 | 十分な面積を取れる |
| 実装量 | 小（現行のJSXを展開領域へ移し、開閉の state を足すだけ） | 中（位置決め・はみ出し対策） | 大（フォーカストラップ・背面スクロール抑止・Escape・safe-area・スクリム） |
| アクセシビリティ | disclosure の標準的な実装で済む | 入れ子パネルのフォーカス制御が複雑 | `role="dialog"` + フォーカストラップの自前実装が必要でリスクが高い |
| 依存追加 | なし | なし | なし（ただし自前実装の量が最大） |
| スクロール位置 | 展開した行がその場で伸びるため、周辺の行との関係が保たれる | 背面の一覧が隠れる | 一覧を離れる |

**案Aを推奨する。** 決め手は写真の選択グリッドに必要な横幅と、フォーカストラップを自前実装しないで済むことである。案Cは1件の編集に集中できる利点があるが、本アプリはオーバーレイ部品を1つも持たないため、モーダルの一般的な要件（フォーカストラップ・背面の不活性化・Escape・iOSのビューポート対策）をここで初めて実装することになり、リスクとコストが要望に見合わない。

ユーザー確定（2026-08-09）: 展開方式は案A（インライン展開）を採用。あわせて、一覧の各行に表示する情報は当初の推奨案（写真枚数のみ）ではなく、**紐づく最初の1枚のサムネイル**を表示する案を選択した（[未確定事項 10](./requirements.md#確定済み改善要望1218)）。行の高さは推奨案より増えるが、どの写真が紐づいているかを一覧上で視認できる利点を優先する。以降の 9-2〜9-5 はこの選択を反映済み。

### 9-2. マークアップ（案A）

```tsx
/** observation.photos[0] を availablePhotos から引き当てる。見つからなければ undefined（REQ-3.7 と同じ扱い）。 */
function findThumbnail(photos: PhotoRef[], availablePhotos: AvailablePhoto[]): AvailablePhoto | undefined {
  if (photos.length === 0) return undefined
  return availablePhotos.find((p) => isSamePhotoRef(p.ref, photos[0]))
}

<ul className="observation-editor__list">
  {observations.map((observation, index) => {
    const editing = editingUuid === observation.uuid
    const detailId = `observation-detail-${observation.uuid}`
    const displayName = observation.name.trim()
    const thumbnail = findThumbnail(observation.photos, availablePhotos)   // REQ-10.3
    return (
      <li key={observation.uuid} className="observation-editor__item">
        <button
          type="button"                                  {/* REQ-10.17: 送信させない */}
          className="observation-editor__summary"
          ref={(el) => { el ? summaryRefs.current.set(observation.uuid, el) : summaryRefs.current.delete(observation.uuid) }}
          aria-expanded={editing}                         {/* REQ-10.18 */}
          aria-controls={detailId}
          onClick={() => (editing ? closeRow(observation.uuid) : setEditingUuid(observation.uuid))}
        >
          <span className={`observation-editor__summary-name${displayName ? '' : ' observation-editor__summary-name--empty'}`}>
            {displayName || '（名前未入力）'}            {/* REQ-10.4 */}
          </span>
          <span className="observation-editor__summary-genre">{marineLifeGenreLabel(observation.genre)}</span>
          {thumbnail && <img className="observation-editor__summary-thumb" src={thumbnail.url} alt="" />}
          <PencilIcon className="observation-editor__summary-icon" />
        </button>
        {editing && (
          <div id={detailId} className="observation-editor__detail">
            {/* 現行の JSX（ジャンルの select / 名前の input + PastValuePicker / 写真トグル）をそのまま移設（REQ-10.9） */}
            <div className="observation-editor__detail-actions">
              <button type="button" onClick={() => removeRow(index)}>削除</button>
              <button type="button" onClick={() => closeRow(observation.uuid)}>閉じる</button>
            </div>
          </div>
        )}
      </li>
    )
  })}
</ul>
{observations.some((o) => o.name.trim() === '') && (
  <p className="observation-editor__warning">名前が未入力の生物は保存されません。</p>  {/* REQ-10.5 / REQ-1.3 */}
)}
<button type="button" className="observation-editor__add" onClick={addRow}>生物を追加</button>
```

- **行全体を1つの `<button>` にする**。タップ領域が最大になり（REQ-10.21）、`aria-expanded` / `aria-controls` を1要素で完結できる。鉛筆アイコンは「押すと編集できる」ことの視覚的な手掛かりとして行内に置く（アイコン自体は `aria-hidden`。[ui-polish-level1](../ui-polish-level1/design.md) のアイコン方針）。
- **[未確定事項 11](./requirements.md#確定済み改善要望122026-08-09) で案B（一覧行にも削除を置く）を採る場合は、この構造を変更する必要がある**。`<button>` の入れ子はHTMLとして不正なため、`observation-editor__summary` を `<div>` にし、その中に「展開用ボタン（`flex: 1`）」と「削除ボタン（44×44px）」を兄弟として並べる形になる。
- `aria-controls` は折りたたみ時に存在しない要素を指すが、`AppMenu` も同じ書き方（`aria-controls="app-menu-panel"` を常時付与）であり、既存パターンに揃える。
- ジャンル・名前・写真の入力UIは**現行のコードをそのまま移す**（REQ-10.9）。`deriveObservationNameCandidates()` の呼び出しが展開中の1行だけになるため、行数に比例していた候補計算が減るという副次的な改善もある。
- 観察記録0件のときの案内文（「観察した生物を記録できます。」）と「生物を追加」ボタンは現状のまま。
- **サムネイルは既存の `availablePhotos`（写真トグルグリッド用に親が生成済みのオブジェクトURL）をそのまま再利用する**。[ui-polish-level2](../ui-polish-level2/design.md) の `CardThumbnail` のような遅延読み込み・独自のオブジェクトURL生成は不要（このフォームのオブジェクトURLは、そのログの写真プール分だけ表示時に既に生成済みのため、追加のメモリコストは無い）。
- 2枚以上紐づいている場合も表示は `observation.photos[0]`（配列の先頭＝最初に選択した写真）の1枚のみとし、残りの枚数は表示しない（REQ-10.3。[未確定事項 10](./requirements.md#確定済み改善要望1218)）。何枚紐づいているかを確認するには行を展開する。

### 9-3. 状態とフォーカス管理

```ts
const [editingUuid, setEditingUuid] = useState<string | null>(null)
const summaryRefs = useRef(new Map<string, HTMLButtonElement>())
const nameInputRef = useRef<HTMLInputElement>(null)

useEffect(() => {
  if (editingUuid) nameInputRef.current?.focus()   // 展開したら名前欄へ（REQ-10.13）
}, [editingUuid])

function closeRow(uuid: string) {                  // REQ-10.11, REQ-10.20
  setEditingUuid(null)
  summaryRefs.current.get(uuid)?.focus()
}

function addRow() {                                // REQ-10.13
  const uuid = newUuid()
  onChange([...observations, { uuid, genre: undefined, name: '', photos: [] }])
  setEditingUuid(uuid)
}

function removeRow(index: number) {                // REQ-10.16
  const removed = observations[index]
  onChange(observations.filter((_, i) => i !== index))
  if (removed.uuid === editingUuid) setEditingUuid(null)
}
```

- **展開状態は `ObservationEditor` の内部 state に閉じる**（親の `DiveLogFormView` へは持ち上げない）。保存対象でなく（REQ-10.15）、親が知る必要もないため。フォームを開き直せば全行が折りたたまれた状態になる。
- **キーは index ではなく `uuid`**。親が `observations` を差し替えても（写真削除時の一括更新など、[3-3](#3-3-divelogformview-側の変更)）展開中の行がずれない。
- 単一の `editingUuid` を持つことで REQ-10.10（同時展開は1件）が自然に満たされる。
- 展開時のフォーカス先は**名前の入力欄**とする。`AppMenu` の「開いたらパネル内の先頭の操作要素へ移す」と同じ方針だが、この区画で最初に触りたいのは名前であるため、先頭要素（ジャンルの `<select>`）ではなく名前の `<input>` を選ぶ。
- 折りたたみ時はフォーカスを行のトグルへ戻す（`AppMenu` の `close()` と同じ）。
- **Escape キーによる折りたたみは実装しない**。展開領域の内部で `PastValuePicker` のパネルが開いている場合があり、Escape の意味が二重になる（`PastValuePicker` 自体は Escape に未対応）。折りたたみは「閉じる」ボタンと、他の行を開く操作で行う。→ [既知の制約](#既知の制約トレードオフ)。
- `scrollIntoView` は呼ばない。フォーカス移動に伴うブラウザ既定のスクロールに任せ、意図しない画面の跳躍を避ける。

### 9-4. スタイル（`ObservationEditor.css`）

既存の配色トークンのみを使う（REQ-10.22。新規トークンは追加しない）。

| クラス | 主な指定 |
| --- | --- |
| `.observation-editor__list` | `list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem` |
| `.observation-editor__item` | `border: 1px solid var(--border); border-radius: 8px; background: var(--bg); overflow: hidden`（現行 `__row` の見た目を踏襲） |
| `.observation-editor__summary` | `display: flex; align-items: center; gap: 0.5rem; width: 100%; min-height: 44px; padding: 0.5rem 0.75rem; border: 0; background: transparent; text-align: left`（REQ-10.21） |
| `.observation-editor__summary-name` | `flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`（REQ-10.7） |
| `.observation-editor__summary-name--empty` | `color: var(--text-muted)` |
| `.observation-editor__summary-genre` | `flex-shrink: 0; font-size: 0.85rem; color: var(--text-muted)` |
| `.observation-editor__summary-thumb` | `flex-shrink: 0; width: 32px; height: 32px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border)`（既存の `--surface`/`--border` トークンのみ使用） |
| `.observation-editor__summary-icon` | `width: 1rem; height: 1rem`（`currentColor` 追従） |
| `.observation-editor__detail` | `display: flex; flex-direction: column; gap: 0.5rem; padding: 0 0.75rem 0.75rem; border-top: 1px solid var(--border)` |
| `.observation-editor__detail-actions` | `display: flex; gap: 0.5rem; justify-content: flex-end` |
| `.observation-editor__warning` | `font-size: 0.85rem; color: var(--text-muted); margin: 0` |

- 現行の `__row` / `__row-header` / `__name-field` 等のうち、詳細領域で引き続き使うものはクラス名を維持する（写真トグルの `__photo-toggle` などは無変更）。
- 展開中であることは**詳細領域が表示されていること自体**で分かるため、色だけに依存した状態表現にはならない（REQ-10.22）。加えて `aria-expanded` を支援技術へ渡す。
- `PencilIcon` は `icons.tsx` の共通属性（`viewBox="0 0 24 24"` / `stroke="currentColor"` / `strokeWidth={2}` / 線端丸 / `aria-hidden`）で追加する。形状の目安: `M4 20h4L18 10l-4-4L4 16v4z` ＋ `M14 6l4 4`。

### 9-5. 手動確認観点（改善要望1）

1. 観察記録を5件登録した状態で、区画が1件1行の一覧になり、縦の長さが現状より短くなること（REQ-10.1、幅320px / 375px）。
2. 行の編集操作で当該行だけが展開し、他の行を開くと前の行が折りたたまれること（REQ-10.8, REQ-10.10）。
3. 「生物を追加」で追加された行が展開し、名前欄にフォーカスが当たること（REQ-10.13）。
4. 展開中に入力した内容が、折りたたんだあとの一覧行の表示に反映され、そのまま保存されること（REQ-10.12）。
5. 写真を2枚紐づけた行の一覧表示に、先頭1枚のサムネイルだけが出ること（2枚目は表示されない）。0枚の行にはサムネイル領域自体が出ないこと（REQ-10.3）。
6. 名前を空のままにした行が「（名前未入力）」と表示され、注意文が出ること。保存すると当該行が消えること（REQ-10.4, REQ-10.5, REQ-1.3）。
7. 展開中の行を削除したとき、他の行が展開されず一覧に戻ること（REQ-10.16）。
8. 長い生物名が省略表示され、横スクロールが発生しないこと（REQ-10.7, REQ-10.21）。
9. キーボードのみで、行の展開（Space / Enter）→ 名前入力 → 写真トグル → 閉じる → 展開操作へフォーカスが戻る、が行えること。いずれの操作でもフォームが送信されないこと（REQ-10.17, REQ-10.19, REQ-10.20）。
10. ダークモードで一覧行・展開領域の境界と文字が読めること（REQ-10.22）。
11. 既存ログの編集を開いたとき、すべての行が折りたたまれた状態で表示されること（REQ-10.15）。
12. 写真をフォーム上で削除したとき、その写真を参照していた行の枚数表示が減ること（REQ-3.6 の回帰確認）。

---

## 10. 画面遷移の履歴（改善要望2）

### 10-0. 現状（コードで確認した事実）

`src/App.tsx` は `useState<Route>` の**単一の値**で現在の画面を保持し、履歴を持たない。各画面の戻り先はハードコードされている。

| 画面 | コールバック | 現在の実装 | 問題 |
| --- | --- | --- | --- |
| `DiveLogDetailView` | `onBack` | `{ view: 'list' }` | 生物検索から来ても一覧へ戻る |
| `DiveLogDetailView` | `onSelectCreature(name)` | `{ view: 'creatures', name }` | 戻り先を記憶していない |
| `CreatureSearchView` | `onBack` | `{ view: 'list' }` | **直前の詳細画面へ戻れない（要望の発端）** |
| `DiveLogFormView` | `onCancel` | `{ view: 'list' }` | 詳細から編集を開いても一覧へ戻る |
| `SyncSettingsView` | `onBack` | `{ view: 'list' }` | （実害なし。設定は一覧からのみ開く） |

さらに `CreatureSearchView` の2段階（生物一覧 ↔ 該当ログ一覧）は**コンポーネント内部の `useState<selectedName>`** だけで管理されており、`Route` には現れない（[6-1](#6-1-画面構成) の「`Route` を分割しない」方針）。そのため、該当ログ一覧 → 詳細 → 戻る のときに「生物一覧へ戻る」のか「該当ログ一覧へ戻る」のかを `App.tsx` が判別できない。

### 10-1. 方式の比較（改善要望2）

| 観点 | **案A: 汎用の履歴スタック（推奨）** | 案B: 生物名遷移だけ戻り先を記憶 | 案C: ルーティングライブラリの導入 |
| --- | --- | --- | --- |
| 変更量 | `App.tsx` に約40行、`CreatureSearchView` の props 変更 | `App.tsx` に数行（`Route` に `returnTo?: Route`） | 依存追加＋全画面の書き換え |
| REQ-11.8（生物名 → 戻る） | ○ | ○ | ○ |
| REQ-11.9（該当ログ一覧 → 詳細 → 戻る） | ○ | **×**（段階が `Route` にないため区別できず、別途 案A 相当の対応が要る） | ○ |
| 保存・削除後の戻り先（REQ-11.10〜REQ-11.13） | 一元的に規定できる | 個別対応が必要 | 個別対応が必要 |
| 他画面への波及 | 「詳細→編集→キャンセル」で詳細へ戻る等も同時に正しくなる | なし | 全画面 |
| 型の複雑さ | `Route` は現状のまま。スタックは `Route[]` | `returnTo?: Route` が再帰型になり、2段以上の入れ子で破綻する | ライブラリの規約に従う |
| 依存パッケージ | 追加なし | 追加なし | **追加あり（REQ-9.1 / REQ-11.23 に反する）** |
| ブラウザの戻る対応 | 対象外（REQ-11.19） | 対象外 | 対応可能だが、GitHub Pages のサブパス配信・Service Worker のナビゲーション制御との兼ね合いを別途検討する必要がある |

**案Aを推奨する。** 決め手は REQ-11.9 である。案Bは「詳細 → 生物名 → 該当ログ一覧 → 別のログの詳細 → 戻る」のような2段以上の遷移で戻り先を1つしか覚えられず、結局スタックが必要になる。案Cは依存追加のため不可（REQ-11.23）。

### 10-2. 履歴スタックの実装（`src/App.tsx`）

```ts
const HOME: Route = { view: 'list' }

/** 履歴上の同一性。creatures の query / genre は同一性に含めない（検索語の変更で履歴を増やさないため）。 */
function isSameRoute(a: Route, b: Route): boolean {
  if (a.view !== b.view) return false
  if (a.view === 'detail' && b.view === 'detail') return a.id === b.id
  if (a.view === 'form' && b.view === 'form') return a.id === b.id
  if (a.view === 'creatures' && b.view === 'creatures') return (a.name ?? null) === (b.name ?? null)
  return true   // list / settings
}

const [stack, setStack] = useState<Route[]>([HOME])
const route = stack[stack.length - 1]

/** 新しい画面へ進む。同じ画面なら積まずに置き換える（REQ-11.4）。 */
const push = (next: Route) =>
  setStack((prev) => (isSameRoute(prev[prev.length - 1], next) ? [...prev.slice(0, -1), next] : [...prev, next]))

/** 現在の画面を置き換える。置き換えた結果が直下と同一なら畳む（REQ-11.11）。 */
const replace = (next: Route) =>
  setStack((prev) => {
    const base = prev.slice(0, -1)
    const under = base[base.length - 1]
    return under && isSameRoute(under, next) ? base : [...base, next]
  })

/** 1つ戻る。戻り先がなければ一覧（REQ-11.2, REQ-11.3）。 */
const back = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : [HOME]))

/** 削除されたログを指すエントリを履歴から除去する（REQ-11.13）。 */
const dropLog = (id: number) =>
  setStack((prev) => {
    const kept = prev.filter((r) => !((r.view === 'detail' || r.view === 'form') && r.id === id))
    return kept.length > 0 ? kept : [HOME]
  })
```

- `route` は `stack` の末尾から導出するだけなので、既存の `if (route.view === 'settings') return ...` という**画面の出し分け部分は1行も変わらない**。
- 履歴に持つのは `Route`（画面種別＋識別子）だけで、ログの内容や入力中の値は持たない（REQ-11.5, REQ-11.24）。`App.tsx` は `view` ごとに別コンポーネントを `return` するため、戻ると対象の画面が**再マウント**され、`DiveLogDetailView` の `useEffect([id])` が `getDiveLogDetail(id)` を再実行する。したがって「古い内容の詳細画面に戻る」ことは起きない。一覧・検索は `useLiveQuery`（`useDiveLogs()`）で常に最新。
- リロードで失われる（REQ-11.6）。`sessionStorage` への永続化は行わない（復元時に対象のログが存在しない可能性の処理が増え、利点が小さい）。

### 10-3. 各遷移の対応表

| 画面 | コールバック | 現在 | 変更後 | 要件 |
| --- | --- | --- | --- | --- |
| 一覧 | `onSelectDive(id)` | `setRoute({detail,id})` | `push({ view: 'detail', id })` | - |
| 一覧 | `onNewDive` | `setRoute({form})` | `push({ view: 'form' })` | - |
| 一覧 | `onOpenSettings` / `onOpenCreatures` | `setRoute(...)` | `push(...)` | - |
| 詳細 | `onBack` | `setRoute({list})` | `back()` | REQ-11.2 |
| 詳細 | `onEdit(id)` | `setRoute({form,id})` | `push({ view: 'form', id })` | - |
| 詳細 | `onDeleted` | `setRoute({list})` | `dropLog(route.id)` | REQ-11.13 |
| 詳細 | `onSelectCreature(name)` | `setRoute({creatures,name})` | `push({ view: 'creatures', name })` | REQ-11.8 |
| フォーム | `onSaved(id)` | `setRoute({detail,id})` | `replace({ view: 'detail', id })` | REQ-11.10, REQ-11.11 |
| フォーム | `onCancel` | `setRoute({list})` | `back()` | REQ-11.12 |
| 設定 | `onBack` | `setRoute({list})` | `back()` | REQ-11.2 |
| 生物検索 | `onBack` | `setRoute({list})` | `back()` | REQ-11.16 |
| 生物検索 | `onSelectDive(id)` | `setRoute({detail,id})` | `push({ view: 'detail', id })` | - |
| 生物検索 | （新）`onSelectCreatureName(name)` | 内部 state | `push({ view: 'creatures', name, ... })` | REQ-11.15 |
| 生物検索 | （新）`onShowCreatureList` | 内部 state | `replace({ view: 'creatures', ... })` | REQ-11.17 |
| 生物検索 | （新）`onFilterChange` | 内部 state | `replace({ view: 'creatures', name, query, genre })` | REQ-11.18 |

**`onDeleted` の props を変えずに削除を扱える点が重要**である。`DiveLogDetailView` の `onDeleted: () => void` は引数を取らないが、`App.tsx` は分岐の中で `route.id` を知っているため、次のように書ける（REQ-11.20）。

```tsx
if (route.view === 'detail') {
  return (
    <DiveLogDetailView
      id={route.id}
      onBack={back}
      onEdit={(id) => push({ view: 'form', id })}
      onDeleted={() => dropLog(route.id)}          // ← props の型は変えない
      onSelectCreature={(name) => push({ view: 'creatures', name })}
    />
  )
}
```

### 10-4. 保存・削除の扱い

**保存（REQ-11.10, REQ-11.11）** — `onSaved` は `push` ではなく `replace` を使う。

- 新規作成: `[list, form]` → `replace({detail, 12})` → `[list, detail(12)]`。戻る → 一覧。**空の入力フォームには戻らない。**
- 詳細からの編集: `[list, detail(12), form(12)]` → `replace({detail, 12})` → 置き換え後の直下が `detail(12)` と同一なので畳んで `[list, detail(12)]`。戻る → 一覧（＝編集を始める前に詳細を開いた画面）。**同じ詳細が2回積まれない。**
- 生物検索経由: `[list, creatures(クマノミ), detail(34), form(34)]` → 保存 → `[list, creatures(クマノミ), detail(34)]` → 戻る → 該当ログ一覧。

**フォームが履歴の途中に残らないことの保証**: フォーム画面への入口は `push`（新規・編集）だけであり、出口は `onCancel`（`back`）か `onSaved`（`replace`）しかない。どちらもフォームのエントリを取り除くため、フォームのエントリは常にスタックの末尾にしか存在しない。よって「戻る」でフォームに戻ることはない（`dropLog` が `form` も対象にしているのは防御的措置）。

**削除（REQ-11.13, REQ-11.14）** — `dropLog(id)` は当該ログの `detail` / `form` エントリを**スタックの全位置から**取り除く。

- `[list, detail(12), creatures(クマノミ), detail(12)]` で末尾の詳細から削除 → `[list, creatures(クマノミ)]` → 該当ログ一覧を表示。削除済みのログはカード一覧から消える（`useDiveLogs()` が再計算される）。
- `[list, detail(12)]` で削除 → `[list]` → 一覧（現状と同じ挙動）。
- `creatures` / `list` のエントリは残す（REQ-11.14）。表示時に最新データから再計算されるため、存在しないログを指したままにはならない。
- なお `deleteDiveLog` 自体は変更しない（[dive-log-crud](../dive-log-crud/design.md)）。[dive-log-crud REQ-5.2](../dive-log-crud/requirements.md) の「一覧画面へ戻る」は REQ-11.13 により「削除前に見ていた画面へ戻る」に改まる（実装後に dive-log-crud 側の記述を更新する）。

### 10-5. `CreatureSearchView` の controlled 化（[未確定事項 16・17](./requirements.md#確定済み改善要望122026-08-09)）

現状の props は `{ onBack, onSelectDive, initialName? }` で、`selectedName` / `query` / `genreFilter` はすべて内部 state。段階を履歴に載せるため、`selectedName` を `App.tsx` 管理へ引き上げる（案A）。

```ts
interface CreatureSearchViewProps {
  onBack: () => void
  onSelectDive: (id: number) => void
  /** 該当ログ一覧を開いている生物名。null なら生物一覧（旧 initialName を置き換える） */
  selectedName: string | null
  /** 生物を選択した（履歴に積むのは App.tsx の責務） */
  onSelectCreatureName: (name: string) => void
  /** 生物一覧へ移動する常設導線（未確定事項 18 の案A） */
  onShowCreatureList: () => void
  /** 検索語・絞り込み（未確定事項 17 で案Aを採る場合のみ追加する） */
  query: string
  genre: MarineLifeGenre | undefined
  onFilterChange: (next: { query: string; genre: MarineLifeGenre | undefined }) => void
}
```

```tsx
if (route.view === 'creatures') {
  return (
    <CreatureSearchView
      selectedName={route.name ?? null}
      query={route.query ?? ''}
      genre={route.genre}
      onSelectCreatureName={(name) => push({ view: 'creatures', name, query: route.query, genre: route.genre })}
      onShowCreatureList={() => replace({ view: 'creatures', query: route.query, genre: route.genre })}
      onFilterChange={({ query, genre }) => replace({ view: 'creatures', name: route.name, query, genre })}
      onBack={back}
      onSelectDive={(id) => push({ view: 'detail', id })}
    />
  )
}
```

- `Route` の `creatures` に `query?: string` / `genre?: MarineLifeGenre` を足すのは [未確定事項 17](./requirements.md#確定済み改善要望122026-08-09) の案Aを採る場合のみ。案Bなら `query` / `genre` は `CreatureSearchView` の内部 state のままにする（詳細から戻ると検索語が初期化される）。
- 検索語の変更は `replace` で扱う（`isSameRoute` が `query` / `genre` を見ないため、`push` にしても積まれないが、意図を明示するために `replace` を使う）。1文字ごとに `App` が再レンダリングされるが、集計は `useMemo` 済みで（[6-3](#6-3-検索の計算量)）実害はない。
- 画面内の「← 生物一覧に戻る」ボタンは `onBack`（＝履歴の `back`）に統合する。履歴上、該当ログ一覧の直下は「生物一覧」（生物一覧から選んだ場合）または「ログの詳細」（生物名リンクから来た場合）であり、どちらもユーザーが直前に見ていた画面である。詳細から来た場合に生物一覧へ行けなくなるのを補うのが `onShowCreatureList`（REQ-11.17）。
- 文言は [未確定事項 15](./requirements.md#確定済み改善要望122026-08-09)（推奨: 全画面で「← 戻る」に統一し、生物一覧への移動は別ボタン「生物一覧」とする）。

### 10-6. 遷移トレース（設計の検証）

| # | 操作 | スタックの変化 | 期待どおりか |
| --- | --- | --- | --- |
| 1 | 一覧 → FAB → 保存 | `[list]` → `[list, form]` → `[list, detail(12)]` → 戻る → `[list]` | ○ REQ-11.10 |
| 2 | 一覧 → 詳細 → 編集 → 保存 → 戻る | `[list, detail(12)]` → `[…, form(12)]` → `[list, detail(12)]` → `[list]` | ○ REQ-11.11 |
| 3 | 一覧 → 詳細 → 編集 → キャンセル | `[list, detail(12), form(12)]` → `[list, detail(12)]` | ○ REQ-11.12（現状は一覧へ戻ってしまう） |
| 4 | **一覧 → 詳細 → 生物名 → 戻る** | `[list, detail(12)]` → `[…, creatures(クマノミ)]` → `[list, detail(12)]` | ○ **REQ-11.8（要望の主目的）** |
| 5 | メニュー → 生物一覧 → 生物選択 → ログ選択 → 戻る → 戻る | `[list, creatures()]` → `[…, creatures(クマノミ)]` → `[…, detail(34)]` → `[…, creatures(クマノミ)]` → `[list, creatures()]` | ○ REQ-11.9, REQ-11.16 |
| 6 | 詳細 → 生物名 → 別ログ詳細 → 編集 → 保存 → 戻る → 戻る | `[list, detail(12), creatures(クマノミ), detail(34), form(34)]` → 保存 → `[…, detail(34)]` → `[…, creatures(クマノミ)]` → `[list, detail(12)]` | ○ |
| 7 | 詳細 → 生物名 → 該当ログ一覧 → そのログの詳細 → 削除 | `[list, detail(12), creatures(クマノミ), detail(12)]` → `dropLog(12)` → `[list, creatures(クマノミ)]` | ○ REQ-11.13（削除済みログの詳細が履歴に残らない） |
| 8 | 詳細 → 生物名 → 「生物一覧」ボタン → 戻る | `[list, detail(12), creatures(クマノミ)]` → `[list, detail(12), creatures()]` → `[list, detail(12)]` | ○ REQ-11.17 |
| 9 | 一覧 → 設定 → 戻る | `[list, settings]` → `[list]` | ○（現状と同じ結果） |

### 10-7. 手動確認観点（改善要望2）

1. ログの詳細画面から生物名を選択 → 該当ログ一覧 → 戻る、で**元の詳細画面**に戻ること（REQ-11.8）。
2. 該当ログ一覧からログを開いて戻ったとき、同じ生物の該当ログ一覧が表示されること（生物一覧の先頭に戻らないこと。REQ-11.9）。
3. 生物一覧 → 生物選択 → 戻る、で生物一覧に戻ること（REQ-11.16）。
4. 新規作成を保存 → 詳細 → 戻る、で一覧に戻ること（フォームに戻らないこと。REQ-11.10）。
5. 詳細 → 編集 → 保存 → 戻る、で一覧に戻ること（同じ詳細を2回経由しないこと。REQ-11.11）。
6. 詳細 → 編集 → キャンセル、で詳細に戻ること（REQ-11.12）。
7. 生物検索経由で開いた詳細を削除したとき、該当ログ一覧に戻り、そのログが一覧から消えていること（REQ-11.13, REQ-11.14）。
8. 一覧から開いた詳細を削除したとき、一覧に戻ること（既存挙動の回帰確認）。
9. 戻る操作を繰り返して一覧まで戻り、さらに戻る操作を行っても画面が壊れないこと（REQ-11.3）。
10. 戻った先の詳細画面が、編集後の最新の内容を表示していること（REQ-11.5）。
11. 検索語を入力してから生物を選び、詳細へ入って戻ったときの検索語の状態が [未確定事項 17](./requirements.md#確定済み改善要望122026-08-09) の決定どおりであること。
12. Androidの戻るボタン／iOSのスワイプバックの挙動が従来と変わらないこと（アプリ内履歴を戻らないこと。REQ-11.19 の明示的な確認）。
13. リロード後に一覧画面から開始すること（REQ-11.6）。
14. 設定画面・インストール案内など、既存の画面遷移が従来どおり動作すること（REQ-11.22）。

### 10-8. 実装後に更新が必要な既存ドキュメント

改善要望2は本機能以外の記述にも影響するため、実装後に以下を更新する（本仕様の実装タスクの一部として扱う）。

| ファイル | 更新内容 |
| --- | --- |
| [`specs/00-overview.md`](../00-overview.md) | 技術スタックの「ルーティング」の記述（画面数と、履歴を持たない旨）を、履歴スタックを持つ自前ルーターの説明に改める |
| [`specs/dive-log-crud/design.md`](../dive-log-crud/design.md) | 「`useState` ベースの独自ルーティングのため、ブラウザの戻る/進むボタンやURL共有には対応していない」を、アプリ内履歴は持つがブラウザ履歴とは連動しない旨に改める |
| [`specs/dive-log-crud/requirements.md`](../dive-log-crud/requirements.md) | REQ-2.5（キャンセル時）・REQ-5.2（削除時）の戻り先を、REQ-11.12 / REQ-11.13 を参照する形に改める |
| [`specs/ui-polish-level3/design.md`](../ui-polish-level3/design.md) | 「自前ルーターは履歴を持たない」を前提にした既知のトレードオフの記述を更新する（ブラウザの戻る操作が未対応である結論は変わらない） |

## 既知の制約・トレードオフ

- **観察記録に直接インデックスを張れない**（案Aの帰結）。検索は全ログの在メモリ走査であり、ログ件数が数万件規模になると初回集計が重くなる。移行パスは [4](#4-dexie-スキーマとマイグレーション) に記載。
- **表記ゆれは吸収しない**。「クマノミ」「くまのみ」「Amphiprion」は別の生物として集計される。過去値の参照（REQ-2.6）で同じ表記を選びやすくすることで発生を減らすだけであり、既存の表記ゆれの名寄せ・一括リネームは提供しない（[dive-log-crud](../dive-log-crud/design.md) のエリア名・ポイント名と同じ割り切り）。
- **ジャンルのプリセットを後から変更・削除すると、旧コード値を持つ既存レコードが「未知の値」になる**（`marineLifeGenreLabel()` が `-` にフォールバックし、編集フォームでは「選択なし」に見える）。器材の選択リストと同じ制約であり、選択肢の削除は慎重に行う。
- **観察記録の写真参照は、ログの写真プールに閉じている**。ログをまたいで同じ写真を共有することはできない（そもそも添付がログ従属のため）。
- **旧バージョンの端末が写真を削除すると、解決できない写真参照が残る**（[7](#7-google-drive-同期への影響) の表）。表示は壊れないが、参照の残骸は次にそのログを本バージョンで編集・保存したときにサニタイズされる。
- **観察記録には日時・個体数・サイズなどを持たせない**。将来これらを足す場合、`Observation` に任意項目を追加するだけで済む（同期・スキーマへの影響は本機能と同じくゼロ）。
- **`Observation.uuid` は現時点では必須ではない**（同一ログ内の識別だけなら配列の位置で足りる）。それでも持たせるのは、フォームの React key の安定化、競合コピー時の識別子の作り直し、そして将来 `observations` テーブルへ移行する場合に既存データへ識別子を後付けせずに済むため。不要と判断する場合は削っても他の設計は変わらない。
- **一覧カードには件数しか出さない**（REQ-5.4）。「何を見たか」を一覧で知るには詳細画面か検索画面を開く必要がある。カードの情報量を増やしすぎない [ui-polish-level1](../ui-polish-level1/design.md) の方針を優先した判断。

### 改善要望1（リスト表示）の制約

- **1件の編集に2タップかかる**（開く → 入力）。常時展開に比べて、複数件を続けて入力するときのタップ数は増える。件数が少ないうちは現状のほうが速い、というトレードオフを受け入れる判断（[未確定事項 12](./requirements.md#確定済み改善要望122026-08-09) の自動展開でこれを緩和する）。
- **Escape キーで行を折りたためない**（[9-3](#9-3-状態とフォーカス管理)）。展開領域の中で `PastValuePicker` のパネルが開くことがあり、Escape の意味が二重になるため実装しない。`AppMenu` は Escape に対応しているため、アプリ内で挙動が揃わない点は既知の不整合。
- **展開状態は保存されない**（REQ-10.15）。フォームを離れて戻ると全行が折りたたまれる。
- **並び替えは提供しない**（REQ-1.5）。リスト表示になったことでドラッグ並び替えの要望が出やすくなるが、本仕様では扱わない。
- **一覧行では削除できない**（[未確定事項 11](./requirements.md#確定済み改善要望122026-08-09) の推奨案を採る場合）。誤って追加した行を消すには一度開く必要がある。
- **名前が未入力の行は保存時に黙って消える**（REQ-1.3）。注意文（REQ-10.5）で予告するのみで、保存時の確認ダイアログは出さない。

### 改善要望2（履歴）の制約

- **ブラウザ／OSの戻る操作には引き続き対応しない**（REQ-11.19）。本節が導入するのはアプリ内部の状態遷移スタックであり、`history.pushState` / `popstate` とは連動しない。Androidの戻るボタンやiOSのスワイプバックは、従来どおりアプリ／タブを離れる。履歴APIへの統合を行う場合は、URL設計・GitHub Pages のサブパス配信・Service Worker のナビゲーション制御・PWA 起動時の初期URLまで含めた別仕様が必要になる（[dive-log-crud/design.md](../dive-log-crud/design.md) / [ui-polish-level3/design.md](../ui-polish-level3/design.md) の既知のトレードオフを、本仕様の実装後もそのまま維持する）。
- **リロード・アプリ再起動で履歴は失われる**（REQ-11.6）。永続化しない。
- **スクロール位置は復元しない**。戻った画面は先頭から表示される（現状と同じ）。長い一覧から詳細へ入って戻ると、同じ位置には戻らない。
- **入力中のフォームの内容は履歴で復元されない**。フォームは履歴の末尾にしか存在せず、離れた時点で破棄される（[dive-log-crud REQ-2.5](../dive-log-crud/requirements.md)）。
- **履歴の深さに上限がない**（REQ-11.7）。詳細 ↔ 生物検索を往復し続けるとエントリが増え続けるが、1件は数十バイトのオブジェクトであり、セッション限りのため実害はない。
- **戻る導線の文言が行き先を名指ししなくなる**（[未確定事項 15](./requirements.md#確定済み改善要望122026-08-09) の推奨案を採る場合）。「← 一覧に戻る」から「← 戻る」へ変わるため、行き先の予測は文脈依存になる。
- **`CreatureSearchView` だけ props が変わる**（REQ-11.20 の例外）。他の画面コンポーネントは無変更で、履歴の管理は `App.tsx` に閉じる。
- **`Route` が検索語まで持つ場合、`App.tsx` の state が入力のたびに更新される**（[未確定事項 17](./requirements.md#確定済み改善要望122026-08-09) の案A）。再レンダリングの範囲は広がるが、集計は `useMemo` 済みで体感差はない見込み。
