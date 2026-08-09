# 設計: ダイビングプラン画像の添付

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [ダイビングログCRUD設計](../dive-log-crud/design.md) / [写真の添付設計](../photo-attachment/design.md) / [写真の拡大表示設計](../photo-lightbox/design.md) / [観察した生物の設計](../marine-life-observation/design.md) / [ガイドサイン設計](../guide-signature/design.md) / [Google Drive同期設計](../google-drive-sync/design.md) / [モバイル対応設計](../mobile-compatibility/design.md) / [UI仕上げ レベル1設計](../ui-polish-level1/design.md) / [UI仕上げ レベル2設計](../ui-polish-level2/design.md)

ステータス: 仕様確定・実装待ち（[要件の確定事項](./requirements.md#未確定事項確認したい点) 1〜8 はすべてユーザー確定済み、2026-08-10）。

本設計は、次の確定内容に基づく。

| # | 確定内容 |
| --- | --- |
| 1 | データの持ち方は案B（`Attachment.uuid` による参照）。ただし確定事項2により**参照は配列**（`DiveLog.planImageUuids?: string[]`） |
| 2 | **複数枚を許容し、上限を設けない**。並びは追加順（並び替え操作なし） |
| 3 | 専用部品 `PlanImagePicker`（複数選択・個別の取り除きに対応。`PhotoPicker` は変更しない） |
| 4 | 任意項目 |
| 5 | フォーム＝基本情報 `fieldset` の末尾／詳細＝基本情報 `section` の `<dl>` の直後 |
| 6 | 1枚あたり横幅いっぱい・最大高さ240px・`contain`。**複数枚は縦積み**。ラベル「ダイビングプラン」 |
| 7 | 同期エンジン・Driveのファイル形式・`schemaVersion` は無変更。競合コピーの参照付け替えのみ |
| 8 | 一覧カードには追加しない（ただし写真枚数・サムネイルの手当ては必須） |

## 設計方針

- **添付の実体は既存の `attachments` テーブルをそのまま使う**。新しいテーブル・新しい Dexie バージョンは作らない（[dive-log-crud/design.md](../dive-log-crud/design.md) / [marine-life-observation/design.md 4](../marine-life-observation/design.md) と同じ「非キー項目の追加だけで済ませる」判断。REQ-9.3）。
- **同期エンジン（`src/sync/`）を変更しない**。[marine-life-observation](../marine-life-observation/design.md) が観察記録の持ち方を決めたときと同じ判断基準を採り、Drive上のファイル形式と `schemaVersion` を据え置く（→ [1](#1-データの持ち方), [7](#7-google-drive-同期への影響)）。
- **拡大表示は既存部品をそのまま使う**。`ImageLightbox` は集合の枚数に応じて前後ナビゲーションと位置表示を自動的に出し分ける（[photo-lightbox/design.md 2](../photo-lightbox/design.md)）ため、複数枚になっても部品側は無変更（REQ-4.8）。
- **入力部品は親が状態を持つコントロールドコンポーネント**とする（`PhotoPicker` / `SignaturePad` / `ObservationEditor` と同じ方針）。DB操作はリポジトリ層に閉じる（REQ-9.4）。
- **「写真」と「プラン画像」の区別は表示側で担保する**。データ上は同じ `attachments` に載るが、ユーザーから見て混ざらないようにする（REQ-1.5, REQ-3.6, REQ-7.3）。
- **複数枚の管理は写真（`PhotoPicker` ＋ `newPhotoFiles` / `removedPhotoIds`）と同じ形にそろえる**。プラン画像専用の三値（変更なし／取り除き／差し替え）の約束は作らない。同じ形にすることで、リポジトリ層の保存フロー・サニタイズを写真と対称に書ける。
- **依存パッケージは追加しない**（REQ-9.1）。

## 変更対象ファイル

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/types/diveLog.ts` | 変更 | `DiveLog.planImageUuids?: string[]` の追加。`DiveLogDraft` の `Omit` に `planImageUuids` を追加 | REQ-1.1, REQ-1.3, REQ-1.4 |
| `src/db/diveLogRepository.ts` | 変更 | プラン画像の追加・削除・サニタイズ、`DiveLogDetail` の分離（`photos` から除外・`planImages` の追加）、観察記録の写真候補からの除外 | REQ-2.8, REQ-6.1〜REQ-6.5, REQ-7.3 |
| `src/db/syncRepository.ts` | 変更 | 競合コピー作成時の `planImageUuids`（配列）の付け替え | REQ-8.3 |
| `src/components/PlanImagePicker.tsx` / `.css` | 新規 | プラン画像専用の複数枚ピッカー（複数選択・追加・個別の取り除き・プレビュー） | REQ-2.1〜REQ-2.9, REQ-2.14, REQ-2.15 |
| `src/views/DiveLogFormView.tsx` | 変更 | 基本情報の区画への配置、プラン画像の3状態の保持、送信時の受け渡し | REQ-2.x |
| `src/views/DiveLogDetailView.tsx` | 変更 | 基本情報セクションでの複数枚表示、拡大表示の対象に `plan` を追加 | REQ-3.x, REQ-4.x |
| `src/components/DiveLogListItem.tsx` | 変更 | 写真枚数からプラン画像の枚数を除外、サムネイルの表示条件の変更 | REQ-5.2, REQ-5.3 |
| `src/App.css` | 変更 | 詳細画面のプラン画像のスタイル | REQ-3.3, REQ-3.4, REQ-3.7 |

**変更しないファイル**: `src/db/db.ts`（Dexieスキーマ、REQ-9.3）、`src/sync/`（同期エンジン・型、REQ-8.2）、`src/components/ImageLightbox.tsx`（REQ-4.8）、`src/components/PhotoPicker.tsx`（REQ-2.12）、`src/components/ObservationEditor.tsx`（REQ-7.3 はリポジトリ層とフォーム側の写真プールで担保）、`src/components/CardThumbnail.tsx`、`src/components/icons.tsx`、`src/hooks/`、`src/platform/`、`src/App.tsx`。

---

## 0. 現状（コードで確認した事実）

本設計の判断の前提となる事実。いずれも実装コードで確認済み。

1. **添付は1テーブル・型で区別**: `attachments` は `++id, type, &uuid`（version 2）で、`Attachment.type` は `'photo' | 'signature'` の2値。`DiveLog` は `photoIds: number[]` と `signatureId?: number` で添付を参照する（`src/types/diveLog.ts`）。

2. **観察記録は `Attachment.uuid` の配列で写真を参照する**: `Observation.photoUuids: string[]`。ローカル採番の `id` は同期先で振り直されるため使えない、という理由で選ばれた方式（[marine-life-observation/design.md 2](../marine-life-observation/design.md)）。参照先の実体は `DiveLog.photoIds` にも含まれているため、同期時に必ず一緒に運ばれる。**本仕様のプラン画像はこの方式をそのまま流用する**（参照が配列である点まで同じ）。

3. **同期エンジンは添付を明示列挙している**（本仕様にとって最重要）。`src/sync/syncEngine.ts`:

   ```ts
   async function buildPushPayload(local: DiveLog) {
     const ids = [...local.photoIds]
     if (local.signatureId != null) ids.push(local.signatureId)
     ...
   }
   // pushLog: body.photoUuids = photos.map(p => p.uuid), body.signatureUuid = signature ? signature.uuid : null
   ```

   `RemoteLogFile` は `photoUuids: string[]` と `signatureUuid: string | null` という**固定のフィールド**で添付を運ぶ（`src/sync/syncTypes.ts`）。取り込み側 `syncRepository.applyRemoteLog()` もこの2フィールドだけを見て `upsertAttachmentByUuid()` を呼ぶ。
   → **`photoIds` / `signatureId` のどちらにも属さない新しい添付を作ると、その実体は Drive にアップロードもダウンロードもされない。** これが確定事項1で案Bを選んだ決め手である。

4. **ログ本体の項目は rest スプレッドで自動的に運ばれる**: `toRemoteLogBody()` は `id` / `uuid` / `photoIds` / `signatureId` / `createdAt` / `updatedAt` を除いた残余をそのまま `log` に書き出し、`applyRemoteLog()` は `{ ...remoteLog }` で書き戻す。`RemoteLogBody = Omit<DiveLog, 'id'|'uuid'|'photoIds'|'signatureId'|'createdAt'|'updatedAt'>` のため、**`DiveLog` に足した非キー項目は型の上でも実行時にも自動的に同期対象になる**（配列でも同様）。

5. **カスケード削除は `photoIds` + `signatureId`**: `deleteDiveLog()`（ユーザー操作）と `syncRepository.deleteLogByUuid()`（同期由来）のいずれもこの2つだけを消す。

6. **詳細画面はオブジェクトURLを1度だけ生成する**: `DiveLogDetailView` は `detail.photos` から `photoUrls: string[]`、`detail.signature` から `signatureUrl` を作り、`detail` の変更時に `revokeObjectURL` する（[photo-lightbox/design.md 0](../photo-lightbox/design.md)）。

7. **`ImageLightbox` は集合の枚数で挙動を出し分ける**: `images.length > 1` のときだけ前後ボタンとカウンタを描画し、`alt` も `images.length > 1` のときだけ `（n枚目 / 全N枚）` を付ける（`src/components/ImageLightbox.tsx`）。**プラン画像が1枚でも複数枚でも、集合をそのまま渡すだけでよく、部品を変更する必要はない**（REQ-4.5）。

8. **`PhotoPicker` の複数枚管理の形**（`PlanImagePicker` の下敷き）: props は `existingPhotos: {id, blob}[]` / `removedExistingIds: number[]` / `onRemoveExisting` / `newFiles: File[]` / `onNewFilesChange`。選択は `onNewFilesChange([...newFiles, ...files])` の**追加**であり、`input.value = ''` へのリセットで同じファイルの再選択を可能にしている。オブジェクトURLは既存用（`Map<number,string>`）と新規用（`string[]`）の2つの `useEffect` で生成・解放し、`brokenPreviews: Set<string>` で読み込み失敗を代替表示に切り替える。

9. **グローバル `button` に既定スタイルがある**: `src/index.css` の `button { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: .5rem .9rem; min-height: 44px; min-width: 44px }`。画像をボタンで包むときは打ち消しが必要（`.detail-photos__button` の前例あり）。

10. **詳細画面の `dl` は2列グリッド**（`grid-template-columns: auto 1fr`）。大きな画像を `<dd>` に入れると2列レイアウトの中に収まってしまうため、画像は `dl` の外に置く（→ [4](#4-配置)）。

---

## 1. データの持ち方

**確定＝案B（写真と同居し、ログ側から `Attachment.uuid` の配列で指す）。**

| 観点 | 案A: 専用の添付（`planImageIds?: number[]` ＋ `type: 'plan'`） | **案B（確定）: 写真と同居し `planImageUuids?: string[]` で指す** |
| --- | --- | --- |
| データモデルの明快さ | ◎ 「プラン画像は写真ではない」ことが型に出る | △ 実体は `photoIds` にも含まれ、`planImageUuids` が「そのうちのどれがプラン画像か」を示す間接的な構造 |
| Dexie スキーマ | 変更不要 | 変更不要（非キー項目） |
| カスケード削除（REQ-6.3） | `deleteDiveLog()` と `syncRepository.deleteLogByUuid()` の両方に追加が必要 | **無変更**（`photoIds` に含まれるため既存の削除経路で消える） |
| 同期エンジン（`src/sync/`） | **変更必須**（[0-3](#0-現状コードで確認した事実)） | **無変更**（実体は `photoUuids` で運ばれ、参照は `log` の rest スプレッドで運ばれる） |
| 旧版端末との混在（REQ-8.4） | ✗ プラン画像が静かに失われうる | ◎ 値も実体も保持される（廃止項目 `gear` と同じ仕組み） |
| 写真枚数・一覧サムネイル | ◎ 自然に区別される | △ 表示側で除外が必要（→ [8](#8-一覧カードへの表示)） |
| 観察記録の写真候補（REQ-7.3） | ◎ 自動的に候補外 | △ リポジトリ層で `allowedUuids` から除外する（→ [6](#6-リポジトリ層srcdbdivelogrepositoryts)） |

複数枚化（確定事項2）によっても、この比較の結論は変わらない。案Bで単数を配列にする追加コストは「`string` を `string[]` に読み替える」だけであり、観察記録（`photoUuids: string[]`）で実績のある形と完全に同じになる。

### データモデル

`src/types/diveLog.ts`

```ts
export interface DiveLog {
  // ...既存フィールドは変更なし
  photoIds: number[]
  /**
   * ダイビングプラン画像。値は `Attachment.uuid` の配列（端末非依存。REQ-8.1, REQ-8.4）。
   * 配列の順序が表示順（REQ-1.4）。上限なし（REQ-1.3）。
   * 実体は同じ `attachments` に `type: 'photo'` として保存され、`photoIds` にも含まれる
   * （同期エンジンが添付を `photoIds` から列挙するため。design.md 0-3）。
   * 未設定（undefined）と空配列はいずれも「プラン画像なし」（REQ-1.2, REQ-7.1）。
   */
  planImageUuids?: string[]
}

export type DiveLogDraft = Omit<
  DiveLog,
  'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt' | 'gear' | 'observations' | 'planImageUuids'
>
```

`planImageUuids` を `DiveLogDraft` から `Omit` する理由は `observations` と同じである。フォームはまだ保存されていない画像（`File`）と保存済みの添付ID（`number`）しか持てず、`Attachment.uuid` へ解決できるのは添付を保存したリポジトリ層だけであるため、**プラン画像はリポジトリ関数の独立した引数として渡す**（→ [6](#6-リポジトリ層srcdbdivelogrepositoryts)）。副次的な効果として、本機能を持たない版のアプリが `update()` するときも `planImageUuids` キーが渡らず、既存値が保持される（REQ-8.4）。

`RemoteLogBody`（`src/sync/syncTypes.ts`）は `Omit<DiveLog, 'id'|'uuid'|'photoIds'|'signatureId'|'createdAt'|'updatedAt'>` であり `planImageUuids` を含むため、**型定義の変更も不要**である。

**「未設定」と「空配列」の扱い**: 読み取り側は必ず `diveLog.planImageUuids ?? []` で正規化する。書き込み側（[6-2](#6-2-保存フロー)）は常に配列を書く（0枚のときは `[]`）。既存ログのバックフィルは行わない（REQ-7.1、[10](#10-dexie-スキーマとマイグレーション)）。

---

## 2. 枚数

**確定＝複数枚を許容し、上限を設けない（REQ-1.3）。** 理由はブリーフィング図が複数ページに分かれる場合への対応。当初の推奨案（1枚固定）は不採用。

複数枚化が本設計に与えた影響を1箇所にまとめる（各節の詳細への索引）。

| 箇所 | 1枚固定案での想定 | **複数枚（確定）での設計** | 節 |
| --- | --- | --- | --- |
| 型 | `planImageUuid?: string` | `planImageUuids?: string[]`（順序＝表示順） | [1](#1-データの持ち方) |
| 入力部品 | 「選び直す＝差し替え」の1枚UI | `PhotoPicker` と同形の複数枚UI（追加・個別の取り除き・2系統の管理） | [3](#3-入力uiplanimagepicker) |
| リポジトリの引数 | `planImage?: File \| null`（三値） | `newPlanImageFiles: File[]` ＋ `removedPlanImageIds: number[]`（写真と対称） | [6](#6-リポジトリ層srcdbdivelogrepositoryts) |
| 詳細画面 | 1枚を横幅いっぱいで表示 | 同じ見せ方を**縦積み**で枚数分（1列） | [5-1](#5-1-複数枚のレイアウト) |
| 拡大表示 | 集合1件・前後ナビなし | 集合＝全プラン画像。2枚以上なら前後ナビと位置表示が自動的に有効 | [5-3](#5-3-divelogdetailview-の変更) |
| 一覧カードの写真枚数 | `-1` するだけ | `- planImageUuids.length`（下限0でクランプ） | [8](#8-一覧カードへの表示) |
| 同期の競合コピー | uuid 1つの写像 | 配列の `flatMap` による写像（観察記録と同じ形） | [7](#7-google-drive-同期への影響) |

**並び順**（REQ-1.4）: 「保存済み（保存順）→ 当該編集で追加した分（選択順）」。並び替えUIは設けない（対象外）。ページ順を変えたい場合は、いったん取り除いてから希望の順に選び直す運用になる（→ [既知の制約](#既知の制約トレードオフ)）。

**上限を設けない**理由: 写真（[photo-attachment REQ-1](../photo-attachment/requirements.md)）と同じ扱いにそろえ、枚数制限のエラー表示・文言・検証という新しい概念を持ち込まないため。容量に関する既存の防御（保存失敗時のエラー表示、REQ-6.6）はそのまま適用される。

---

## 3. 入力UI（`PlanImagePicker`）

**確定＝プラン画像専用の新規部品を作る（`PhotoPicker` は変更しない。REQ-2.12）。**

複数枚になったことで `PhotoPicker` との機能差は小さくなったが、次の理由で専用部品を維持する。

| 観点 | **案ア: 専用部品 `PlanImagePicker`（確定）** | 案イ: `PhotoPicker` に「用途」props を足して流用 |
| --- | --- | --- |
| 既存機能への回帰リスク | なし（写真添付という中核機能に触れない） | あり（props と分岐が増える） |
| プレビューの見せ方 | 図の全体が見える `contain` の縦並びにできる | 96×96の `cover`（正方形の切り取り）で、ルート図は判別できない |
| ラベル・代替テキスト | 「ダイビングプランの画像」に固定できる | props で切り替える分岐が増える |
| 実装量 | 小（`PhotoPicker` の構造をほぼそのまま写す。約100行） | 小だが既存ファイルの改変を伴う |

### API

```tsx
interface ExistingPlanImage {
  id: number      // Attachment.id（保存済み）
  blob: Blob
}

interface PlanImagePickerProps {
  /** 保存済みのプラン画像（表示順）。編集時のみ非空 */
  existingImages: ExistingPlanImage[]
  /** 取り除きマークの付いた保存済み画像のID（REQ-2.6） */
  removedExistingIds: number[]
  /** 保存済み画像の取り除き（マークするだけ。実削除は送信時＝REQ-2.8） */
  onRemoveExisting: (id: number) => void
  /** 未保存の新規プラン画像（選択順） */
  newFiles: File[]
  /** 追加・取り除きの結果としての新しい配列（REQ-2.3, REQ-2.5） */
  onNewFilesChange: (files: File[]) => void
}
```

`PhotoPicker` と同一の形にそろえる。これにより親（`DiveLogFormView`）の状態管理も写真と同じ3つ（既存・削除マーク・新規）になり、リポジトリの引数（[6-1](#6-1-関数シグネチャ)）とも一対一で対応する。

### 挙動

- 親が状態を持つコントロールドコンポーネント。DB操作は行わない（`PhotoPicker` / `SignaturePad` / `ObservationEditor` と同じ）。
- `<input type="file" accept="image/*" multiple />`（`capture` なし。REQ-2.9, REQ-2.10）。選択時は `onNewFilesChange([...newFiles, ...files])` で**追加**し（REQ-2.3）、`input.value = ''` にリセットして同じファイルの再選択を可能にする（`PhotoPicker` と同じ）。
- 表示順は `existingImages`（`removedExistingIds` を除く）→ `newFiles` の連結（REQ-1.4）。
- オブジェクトURLは `PhotoPicker` と同じく既存用・新規用の2つの `useEffect` で生成し、クリーンアップで**全件**解放する（REQ-9.7）。
- 各項目に「取り除く」ボタンを1つ置く（`type="button"`。フォーム内のため送信を防ぐ）。既存画像は `onRemoveExisting(id)`、新規は該当インデックスを除いた配列を `onNewFilesChange` に渡す（REQ-2.5〜REQ-2.7）。
- 画像の読み込みに失敗した項目は `PhotoPicker` と同じ「プレビューできない画像」の代替表示にし、取り除きボタンは残す（REQ-2.15）。
- プラン画像が0枚のときはファイル選択欄のみを表示する（フォームでは領域を隠さない。REQ-2.1）。
- タップ領域はグローバル `button` の `min-height/min-width: 44px` により自動的に満たされる（REQ-2.14）。
- 代替テキストは「ダイビングプランの画像」。2枚以上のときは `ダイビングプランの画像${i + 1}` とし、取り除きボタンには `aria-label={`ダイビングプランの画像${i + 1}を取り除く`}` を与える（`PhotoPicker` の「削除」ボタンよりも一段丁寧にする。プラン画像は見た目が似た図が並びうるため）。

---

## 4. 配置

**確定＝案ア（基本情報の区画の末尾）。独立したセクションは設けない。**

- **フォーム**: 基本情報 `<fieldset>` の末尾（潜水時間の直後）に `<label>ダイビングプラン画像</label>` として `PlanImagePicker` を置く。`.dive-log-form fieldset` は `flex-direction: column; gap: .6rem` のため、追加のレイアウト調整は不要。
- **詳細画面**: 基本情報 `<section>` の `<dl>`（エリア・最大水深・潜水時間）の**直後**に置く。[0-10](#0-現状コードで確認した事実) のとおり `dl` は2列グリッドであり、大きな画像を `<dd>` に入れると横幅が `1fr` 側に制限されるうえ、行の高さが不揃いになる。`dl` の外に出し、小さなラベル＋画像の縦積みにする。

順序: 日付・時刻（`<h1>` と副題）→ エリア・最大水深・潜水時間 → **ダイビングプラン画像** → 環境情報。フォーム・詳細画面のどちらも「基本情報の最後」で一致させる。

複数枚になったことで詳細画面の基本情報セクションは縦に伸びるが、環境情報以降のセクションはスクロールで到達できる位置にあり、順序を変える必要はない（→ [既知の制約](#既知の制約トレードオフ)）。

---

## 5. 詳細画面での表示とライトボックス連携

### 5-1. 複数枚のレイアウト

1枚あたりの見せ方は確定済み（横幅いっぱい・最大高さ240px・`object-fit: contain`）。複数枚の並べ方を以下で比較する。

| 観点 | **案ア: 縦積み（1列）＝確定** | 案イ: 横スクロールのストリップ | 案ウ: 2列グリッド |
| --- | --- | --- | --- |
| 全枚数の存在の分かりやすさ（REQ-3.4） | ◎ すべてが同じ幅で並び、スクロールで必ず目に入る | △ 2枚目以降が画面外にあり、横スクロールできることに気づかない場合がある | ○ 並んで見える |
| 図の可読性 | ◎ 1枚あたりの幅が最大 | ○ 幅を狭める必要がある（1枚あたり80%幅など） | △ 幅が半分になり、細い文字は判別しにくい |
| 横スクロール（REQ-3.7） | ◎ 発生しない | △ 内部スクロールコンテナを作るため、ページ横スクロールとの区別・慣性の扱いに注意が要る | ◎ 発生しない |
| 実装量 | 最小（`flex-direction: column` と `gap` のみ） | 中（スクロールスナップ・端の見切れ表現） | 小 |
| 縦の長さ | 枚数×最大240px（＋余白）と最も長い | 240px固定 | 枚数の半分×240px |
| 既存パターンとの整合 | 新規（ただし `.detail-photos` の折り返しと矛盾しない） | アプリ内に横スクロール領域の前例がない | `.detail-photos` に近い |

**案アを確定とする。** プラン図は「全体を読む」ための画像であり、幅を犠牲にする案ウ・存在が隠れる案イはいずれも本機能の目的に反する。プラン画像は通常1〜3枚程度と想定され、縦の長さの増加は許容範囲である。実運用で枚数が多くなり縦に長すぎると感じた場合は、2枚目以降の最大高さを下げる／折りたたむ、といった調整を別途検討する（→ [既知の制約](#既知の制約トレードオフ)）。

### 5-2. ラベルと代替テキスト

ラベル（REQ-3.5）: **「ダイビングプラン」**（枚数の併記は行わない。枚数は並んだ画像そのものと、拡大表示の位置表示から分かる）。

| 要素 | 1枚のとき | 2枚以上のとき |
| --- | --- | --- |
| 開く操作要素（ボタン） | `aria-label="ダイビングプランの画像を拡大表示"` | `aria-label={`ダイビングプランの画像${i + 1}を拡大表示`}`（[photo-lightbox](../photo-lightbox/design.md) の「写真1を拡大表示」と同じ位置ベースの命名） |
| ボタン内の `<img>` | `alt=""`（装飾扱い） | 同左 |
| 拡大表示中の画像 | `label: 'ダイビングプランの画像'` → `alt="ダイビングプランの画像"` | 同じ `label` を渡し、`ImageLightbox` が `alt="ダイビングプランの画像（2枚目 / 全3枚）"` を組み立てる（[0-7](#0-現状コードで確認した事実)。部品は無変更） |
| 拡大表示に対応していない環境（REQ-4.9） | `<img alt="ダイビングプランの画像">` | `<img alt={`ダイビングプランの画像${i + 1}`}>` |

### 5-3. `DiveLogDetailView` の変更

```ts
type LightboxTarget =
  | { kind: 'log'; index: number }
  | { kind: 'observation'; uuid: string; index: number }
  | { kind: 'plan'; index: number }        // 追加（REQ-4.2）

const [planImageUrls, setPlanImageUrls] = useState<string[]>([])
```

- `photoUrls` / `signatureUrl` を生成している既存の `useEffect`（依存 `[detail]`）に `detail.planImages` の分を足し、同じクリーンアップで**全URLを** `revokeObjectURL` する（REQ-4.10, REQ-9.7）。**新しい `useEffect` は増やさない**（解放漏れの経路を増やさないため）。

  ```ts
  const planUrls = detail.planImages.map((p) => URL.createObjectURL(p.blob))
  ```

- 対象の集合の導出に分岐を追加する:

  ```ts
  function lightboxImages(target: LightboxTarget): LightboxImage[] {
    if (target.kind === 'plan') {
      return planImageUrls.map((url) => ({ url, label: 'ダイビングプランの画像' }))  // REQ-4.2, REQ-4.3
    }
    // ...既存の 'log' / 'observation' の分岐は変更しない（REQ-7.2）
  }
  ```

  解決できない参照はリポジトリ層で既に除かれている（[6-3](#6-3-getdivelogdetail)）ため、`planImageUrls` は常に表示可能な画像だけを含む（REQ-3.8, REQ-4.4）。既存の描画側は `activeLightboxImages.length > 0` のときだけ `ImageLightbox` を描く防御をそのまま使う。

- マークアップ（基本情報セクションの `<dl>` の直後）:

  ```tsx
  {planImageUrls.length > 0 && (
    <div className="detail-plan-images">
      <p className="detail-plan-images__label">ダイビングプラン</p>
      <div className="detail-plan-images__list">
        {planImageUrls.map((url, i) => {
          const name = planImageUrls.length > 1 ? `ダイビングプランの画像${i + 1}` : 'ダイビングプランの画像'
          return canShowLightbox ? (
            <button
              key={url}
              type="button"
              className="detail-plan-images__button"
              aria-label={`${name}を拡大表示`}
              onClick={() => setLightbox({ kind: 'plan', index: i })}
            >
              <img src={url} alt="" />
            </button>
          ) : (
            <img key={url} src={url} alt={name} />   {/* REQ-4.9 */}
          )
        })}
      </div>
    </div>
  )}
  ```

  プラン画像が0枚のときはこのブロック自体を出力しない（REQ-3.2）。ラベルは `<p>` とし、見出しの階層（`<h1>` → `<h2>`）を増やさない。

- 拡大表示の前後移動は既存の `onIndexChange`（`setLightbox((prev) => ({ ...prev, index: next }))`）がそのまま機能する。`kind: 'plan'` でも `index` フィールドを持つため、既存の書き方を変えない。

---

## 6. リポジトリ層（`src/db/diveLogRepository.ts`）

### 6-1. 関数シグネチャ

```ts
export async function createDiveLog(
  draft: DiveLogDraft,
  photoFiles: File[],
  signatureBlob: Blob | null,
  observations: ObservationDraft[] = [],
  planImageFiles: File[] = [],                 // 追加（既定値により既存の呼び出しは無変更でも動く）
): Promise<number>

export interface UpdateDiveLogOptions {
  newPhotoFiles: File[]
  removedPhotoIds: number[]
  /** undefined = no change, null = remove signature, Blob = replace signature */
  newSignatureBlob?: Blob | null
  /** undefined = 既存の観察記録を変更しない */
  observations?: ObservationDraft[]
  /** 追加するプラン画像（未保存の File。選択順）。省略時は追加なし（REQ-2.3） */
  newPlanImageFiles?: File[]
  /** 取り除く保存済みプラン画像の Attachment.id。省略時は削除なし（REQ-2.6） */
  removedPlanImageIds?: number[]
}

export interface DiveLogDetail {
  diveLog: DiveLog
  /** 写真。**プラン画像は含まない**（REQ-3.6, REQ-7.3。除外はここ1箇所で行う） */
  photos: Attachment[]
  /** ダイビングプラン画像（`planImageUuids` の順序。解決できない参照は除外済み。0件なら空配列） */
  planImages: Attachment[]
  signature: Attachment | null
}
```

**三値（`undefined` / `null` / 値）の約束を採らない理由**: 複数枚になったことで、プラン画像の変更は「差し替え」ではなく写真と同じ「追加・削除の集合管理」になった。写真の `newPhotoFiles` / `removedPhotoIds` と同形にすることで、フォーム側の状態・保存フロー・サニタイズをすべて写真と対称に書ける。両方が省略（または空配列）のとき、結果として `planImageUuids` は既存値の正規化（実体のない参照の除去）のみが行われる（REQ-6.5）。

### 6-2. 保存フロー

**`createDiveLog`**

```ts
const addedPhotos = await Promise.all(photoFiles.map((f) => addAttachment('photo', f)))
const addedPlans = await Promise.all(planImageFiles.map((f) => addAttachment('photo', f)))
// プラン画像の添付IDは常に photoIds の末尾に置く（一覧カードのサムネイル選択のため。8節）
const photoIds = [...addedPhotos.map((p) => p.id), ...addedPlans.map((p) => p.id)]
const planImageUuids = addedPlans.map((p) => p.uuid)          // 順序＝選択順（REQ-1.4）
// 観察記録が紐づけられるのは写真のみ。プラン画像の uuid は allowedUuids に入れない（REQ-7.3）
const allowedUuids = new Set(addedPhotos.map((p) => p.uuid))
// diveLog に planImageUuids（0枚なら []）を含めて add
```

**`updateDiveLog`**

1. `existing.photoIds` に対して1回だけ `bulkGet` し、`id → uuid` / `uuid → id` の対応表を作る。
2. 既存プラン画像のIDを順序どおりに解決する:

   ```ts
   const oldPlanIds = (existing.planImageUuids ?? []).flatMap((u) => {
     const pid = idByUuid.get(u)
     return pid != null ? [pid] : []          // 解決できない参照はここで落ちる（REQ-6.5）
   })
   ```

3. 削除: `removedPhotoIds` と `removedPlanImageIds` を連結して重複を除いた集合に対し、既存どおり `bulkGet` → `bulkDelete` → `recordTombstonesForAttachments()` を行う（REQ-6.2, REQ-6.4）。写真とプラン画像で削除処理を分ける必要はない（どちらも `type: 'photo'` の添付であり、墓標の記録方法も同じ）。
4. 追加: `newPhotoFiles` と `newPlanImageFiles` をそれぞれ `addAttachment('photo', file)` で保存する。
5. 参照の再計算（プラン画像は常に `photoIds` の末尾）:

   ```ts
   const keptPlanIds = oldPlanIds.filter((pid) => !removedIds.includes(pid))
   const planIds = [...keptPlanIds, ...addedPlans.map((p) => p.id)]
   const planIdSet = new Set(planIds)
   const keptPhotoIds = existing.photoIds.filter((pid) => !removedIds.includes(pid) && !planIdSet.has(pid))
   const photoIds = [...keptPhotoIds, ...addedPhotoIds, ...planIds]
   const planImageUuids = [
     ...keptPlanIds.map((pid) => uuidById.get(pid)!),
     ...addedPlans.map((p) => p.uuid),
   ]
   ```

   重複した参照はここで自然に排除される（`planIds` は既存の解決済みIDと新規IDの連結であり、同一IDが2度現れない）。念のため実装では `Set` による重複除去を1行入れてよい（REQ-6.5）。
6. 観察記録の解決（`resolveObservations`）に渡す `allowedUuids` から、プラン画像の uuid を除外する（REQ-7.3）。既存の実装は最終 `photoIds` の `bulkGet` から `allowedUuids` を作っているため、そこに `!planUuidSet.has(attachment.uuid)` の条件を1つ足す。
7. 書き込み:

   ```ts
   await db.diveLogs.update(id, {
     ...draft,
     photoIds,
     signatureId,
     ...(resolvedObservations !== undefined ? { observations: resolvedObservations } : {}),
     planImageUuids,                          // 常に配列を書く（0枚なら []）
     updatedAt: new Date().toISOString(),
   })
   ```

   配列を常に書くため、1枚固定案で懸念していた「`undefined` を渡したときの Dexie のプロパティ削除の挙動」に依存しない。

**`deleteDiveLog`**: **変更不要**。プラン画像の添付IDは `photoIds` に含まれるため、既存のカスケード削除と墓標記録でそのまま処理される（REQ-6.3, REQ-6.4）。

### 6-3. `getDiveLogDetail`

```ts
const all = (await db.attachments.bulkGet(diveLog.photoIds)).filter((a): a is Attachment => a != null)
const byUuid = new Map(all.map((a) => [a.uuid, a]))
const planUuids = diveLog.planImageUuids ?? []
// 参照の順序で解決する（photoIds の順序ではない）。解決できない参照は落とす（REQ-3.8）
const planImages = planUuids.flatMap((u) => {
  const a = byUuid.get(u)
  return a ? [a] : []
})
const planUuidSet = new Set(planImages.map((a) => a.uuid))
const photos = all.filter((a) => !planUuidSet.has(a.uuid))
return { diveLog, photos, planImages, signature }
```

この1箇所で分離することにより、`photos` を使う既存の呼び出し側は**すべて自動的にプラン画像を除外した状態になる**:

| 呼び出し側 | 効果 |
| --- | --- |
| `DiveLogDetailView` の「写真・メモ」 | プラン画像が写真一覧に出ない（REQ-3.6） |
| `DiveLogDetailView` の `photoUrlByUuid`（観察記録のサムネイル） | 観察記録がプラン画像を指すことはないため影響なし |
| `DiveLogFormView` の `existingPhotos` → `PhotoPicker` | プラン画像が写真として表示・削除されない（REQ-2.12） |
| `DiveLogFormView` の `availablePhotos` → `ObservationEditor` | 観察記録の写真候補に出ない（REQ-7.3） |
| `DiveLogFormView` の観察記録復元用 `byUuid` | プラン画像を指す参照は落ちる（`observations` 側にそもそも作られない） |

### 6-4. `DiveLogFormView` 側の状態

写真と同じ3つの状態を持つ（[3](#3-入力uiplanimagepicker) の props と一対一）。

```ts
const [existingPlanImages, setExistingPlanImages] = useState<Attachment[]>([])   // 編集時のみ
const [removedPlanImageIds, setRemovedPlanImageIds] = useState<number[]>([])
const [newPlanImageFiles, setNewPlanImageFiles] = useState<File[]>([])
```

- 編集時の初期ロード（`getDiveLogDetail`）で `setExistingPlanImages(detail.planImages)`（REQ-2.4）。
- `PlanImagePicker` へは `existingImages={existingPlanImages.map((p) => ({ id: p.id as number, blob: p.blob }))}` / `removedExistingIds={removedPlanImageIds}` / `onRemoveExisting` / `newFiles={newPlanImageFiles}` / `onNewFilesChange={setNewPlanImageFiles}` を渡す。
- 送信: 新規作成は `createDiveLog(draft, newFiles, signatureBlob ?? null, observations, newPlanImageFiles)`、編集は `updateDiveLog(id, draft, { ..., newPlanImageFiles, removedPlanImageIds })`。
- 観察記録との連動は不要。プラン画像は観察記録の写真候補（`availablePhotos`）に入らないため、`handleRemoveExistingPhoto` のような参照の整理（REQ-3.6 相当の処理）は要らない。
- 引き継ぎ（REQ-2.11）: `pickCarryOverFields()` / `carryOverKeys` は**変更しない**。プラン画像は `DiveLogDraft` に含まれないため、そもそも引き継ぎの対象になりえない。
- キャンセル（REQ-2.13）: フォームの state を破棄するだけで既存の挙動どおり（DBへは何も書いていない）。
- 保存失敗時（REQ-6.6）: 既存の `handleSubmit` の `catch` をそのまま使う。プラン画像の枚数が多い分だけ `QuotaExceededError` の可能性は上がるが、文言・挙動は変更しない。

---

## 7. Google Drive 同期への影響

**同期エンジン（`src/sync/`）とDrive上のファイル形式は無変更である（確定事項 7）。** 参照が配列になっても、この結論は変わらない。

### 変更が不要な理由

| 項目 | 理由 |
| --- | --- |
| 画像の実体のアップロード／ダウンロード | プラン画像の添付IDは `DiveLog.photoIds` に含まれるため、`buildPushPayload()` が拾い、`photoUuids` に載って運ばれる。pull 側も `remote.photoUuids` をダウンロードして `upsertAttachmentByUuid()` する（[0-3](#0-現状コードで確認した事実)） |
| 参照（`planImageUuids`）の転送 | `toRemoteLogBody()` の rest スプレッドにより `log` に含まれる。配列も JSON でそのまま運ばれる（`observations` の前例と同じ）。`RemoteLogBody` の型にも自動的に含まれるため型定義の変更も不要（[0-4](#0-現状コードで確認した事実)） |
| 取り込み | `applyRemoteLog()` の `{ ...remoteLog }` でそのまま書き戻される。`planImageUuids` の各要素は必ず `photoUuids` に含まれるため、参照先が欠けることはない（[google-drive-sync/design.md](../google-drive-sync/design.md) の「トランザクション境界」により添付→ログの順で適用される） |
| 並び順（REQ-8.1） | `planImageUuids` の順序が JSON の配列としてそのまま保たれる。`photoIds` の順序に依存しない（[6-3](#6-3-getdivelogdetail) は uuid 配列の順で解決する） |
| 削除の伝播 | プラン画像は `photoIds` の一員として `deleteDiveLog()` / `deleteLogByUuid()` で消え、墓標も既存経路で記録される |
| 競合解決の粒度 | ログ単位のまま（REQ-8.5）。プラン画像だけが競合することはない |
| `schemaVersion` | **1のまま**（REQ-8.2）。`log` の中身は項目集合が自由であるという既存設計に従う |

`logs/<uuid>.json` は次のようになる（追加部分のみ抜粋）。**トップレベルの構造は変わらない**。

```jsonc
{
  "schemaVersion": 1,
  "log": {
    "date": "2026-08-09", "siteName": "…",
    "planImageUuids": ["3c9f…", "b21e…"]      // ← 追加（各要素は photoUuids に含まれる）
  },
  "photoUuids": ["7f3a…", "3c9f…", "b21e…"],  // ← プラン画像の実体も含まれる（末尾）
  "signatureUuid": "…"
}
```

### 変更が必要な唯一の箇所

**競合コピーでの参照の付け替え（REQ-8.3）** — `src/db/syncRepository.ts` の `createConflictCopy()`。

現状は敗者側の写真 Blob を新しい uuid の添付として複製し、`observations[].photoUuids` を `photoUuidMap`（旧uuid → 新uuid）で写像している。**同じ `photoUuidMap` を使い、観察記録とまったく同じ `flatMap` の形で `planImageUuids` も写像する**。

```ts
// 観察記録の付け替えの直後に置く
const planImageUuids = source.log.planImageUuids?.flatMap((uuid) => {
  const mapped = photoUuidMap.get(uuid)
  return mapped ? [mapped] : []      // 複製できなかった参照は落とす（順序は保つ）
})

await db.diveLogs.add({
  ...source.log,
  observations,
  planImageUuids,        // 複製後の添付を指す（undefined のときはそのまま undefined＝プラン画像なし）
  siteName: `${source.log.siteName}（競合コピー …）`,
  // ...
})
```

数行の追加で済み、`sync/`（React にも Dexie にも依存しないレイヤー）には手を入れない。

### バージョン混在時の挙動

| 状況 | 挙動 | 根拠 |
| --- | --- | --- |
| 本機能なしの端末が書いたログを、本機能ありの端末が取り込む | `planImageUuids` が無い → プラン画像0枚として扱う | REQ-7.1 |
| 本機能ありの端末が書いたログを、本機能なしの端末が取り込む | `planImageUuids` は `{ ...remoteLog }` で保存され、画像の実体も `photoUuids` 経由で保存される。ただし**その端末ではプラン画像が「写真」として（枚数分）一覧・詳細に表示される** | 既存実装。既知の制約 |
| 上記の端末がそのログを編集・保存する | `update()` は渡されたキーのみ変更し、その版の `DiveLogDraft` に `planImageUuids` は含まれないため値は保持される | REQ-8.4、[dive-log-crud REQ-4.6](../dive-log-crud/requirements.md) と同じ仕組み |
| 上記の端末がプラン画像の一部を「写真」として削除して保存する | 実体が消え、その uuid は解決できない参照として残る → 新しい端末では**残りのプラン画像だけ**が表示され、次回保存時に参照配列から除去される（エラーにはならない） | [6-3](#6-3-getdivelogdetail) の `flatMap`、[6-2](#6-2-保存フロー) のサニタイズ。REQ-3.8, REQ-6.5 |

---

## 8. 一覧カードへの表示

**確定＝一覧カードに新しい表示は追加しない（REQ-5.1）。** [ui-polish-level1](../ui-polish-level1/design.md) の「情報の強弱を付ける」方針からも、一覧に出す価値の低い情報は増やさない。アイコン（`PlanIcon`）の追加も不要。

**ただし、案B（`photoIds` 同居）の帰結として、次の2点の手当ては必須である。**

1. **写真枚数（REQ-5.2）**: `DiveLogListItem` は `diveLog.photoIds.length` をそのまま「写真 n枚」として出しているため、プラン画像の枚数分だけ多くなる。`DiveLog` だけで判定できる派生値に置き換える。

   ```tsx
   const planCount = diveLog.planImageUuids?.length ?? 0
   // 解決できない参照が残っている場合に負にならないようクランプする（7節のバージョン混在時）
   const photoCount = Math.max(0, diveLog.photoIds.length - planCount)
   // 表示条件も photoCount > 0 に変える（プラン画像のみのログでは「写真」を出さない）
   ```

2. **カードのサムネイル（REQ-5.3）**: `CardThumbnail` には `diveLog.photoIds[0]` が渡される。`DiveLogListItem` は uuid → ローカルID の対応を知らないため、「どのIDがプラン画像か」を判定できない。そこで次の2つを併用する。

   - **リポジトリ層でプラン画像の添付IDを常に `photoIds` の末尾に置く規約**（[6-2](#6-2-保存フロー)）。これにより、写真が1枚以上あるとき `photoIds[0]` は必ず写真になる。同期の pull では `remote.photoUuids` の順序がそのまま `photoIds` になり、push 側が末尾規約で書いているため順序は保たれる。
   - **サムネイルの表示条件を `photoCount > 0` にする**。プラン画像しか持たないログではサムネイル自体を出さない。こうすれば、末尾規約が破れている（旧版端末が書いた順序など）場合でもプラン図がサムネイルに選ばれる確率を下げられ、少なくとも「写真0枚なのにプラン図が出る」ことはなくなる。

   > 残る隙間: 写真とプラン画像の両方があり、かつ末尾規約が破れているログでは `photoIds[0]` がプラン画像になりうる（旧版端末を経由した場合のみ）。この場合も表示が壊れることはなく、その端末で次に保存すれば規約どおりに正規化される。

---

## 9. スタイル（`src/App.css` / `PlanImagePicker.css`）

配色は既存トークン（`--surface` / `--border` / `--text-muted` / `--accent`）のみを使う（REQ-9.5）。[photo-lightbox](../photo-lightbox/design.md) のようなテーマ非依存の例外は設けない。

| クラス | 主な指定 | 根拠 |
| --- | --- | --- |
| `.detail-plan-images` | `margin-top: .5rem; display: flex; flex-direction: column; gap: .25rem` | 基本情報の `dl` の直後に置く（ラベルと一覧の縦積み） |
| `.detail-plan-images__label` | `margin: 0; color: var(--text-muted); font-size: .9rem` | `dt` と同じ弱い書式でラベルであることを示す（REQ-3.5） |
| `.detail-plan-images__list` | `display: flex; flex-direction: column; gap: .5rem` | **複数枚の縦積み**（[5-1](#5-1-複数枚のレイアウト)）。`.detail-photos` の `flex-wrap: wrap` とは別物であることを明示する |
| `.detail-plan-images img` | `width: 100%; max-height: 240px; object-fit: contain; border: 1px solid var(--border); border-radius: 8px; background: var(--surface)` | REQ-3.3（全体表示・切り取らない）、REQ-3.7（横スクロールを出さない）。余白部分が「画像の外」であることを背景色で示す |
| `.detail-plan-images__button` | `padding: 0; border: 0; background: none; min-height: 0; min-width: 0; width: 100%; display: block; line-height: 0; border-radius: 8px; cursor: zoom-in` | グローバル `button` 既定の打ち消し（[0-9](#0-現状コードで確認した事実)）。`.detail-photos__button` と同じ書き方 |
| `.plan-image-picker` | `display: flex; flex-direction: column; gap: .5rem; align-items: stretch` | `PhotoPicker.css` と同じ構成（並びだけ縦にする） |
| `.plan-image-picker__list` | `display: flex; flex-direction: column; gap: .5rem` | 入力時も詳細画面と同じ縦積みにし、保存後の見え方と一致させる |
| `.plan-image-picker__item` | `display: flex; flex-direction: column; gap: .25rem; align-items: flex-start` | プレビューと「取り除く」ボタンの組。ボタンは画像に重ねず下に置く（`PhotoPicker` は96pxの正方形に重ねているが、プラン図では図の一部を隠すため） |
| `.plan-image-picker__item img` | `width: 100%; max-height: 200px; object-fit: contain; border: 1px solid var(--border); border-radius: 8px; background: var(--surface)` | 入力時も図の全体が見えるようにする |
| `.plan-image-picker__placeholder` | `PhotoPicker.css` の `.photo-picker__placeholder` と同じ書式（幅は `100%`、高さは `120px` 程度） | 読み込み失敗時の表示を既存とそろえる（REQ-2.15） |

アイコンの追加は不要（`src/components/icons.tsx` は変更しない）。

---

## 10. Dexie スキーマとマイグレーション

**`src/db/db.ts` は変更しない**（REQ-9.3）。

- `planImageUuids` は `stores()` に現れない非キー項目であり、IndexedDB はオブジェクト全体を保存するため、スキーマ定義の変更もバージョン上げも不要（[dive-log-crud/design.md](../dive-log-crud/design.md) が `area` / 器材項目で、[marine-life-observation/design.md 4](../marine-life-observation/design.md) が `observations`（同じく配列）で採ったのと同じ判断）。
- 既存レコードは `planImageUuids` が `undefined` のまま残る。`upgrade()` によるバックフィルは行わない（REQ-7.1）。読み取り側は `?? []` で「未設定＝0枚」として扱う。
- プラン画像の有無・枚数で検索・絞り込みを行いたくなった場合に初めて version を上げてインデックス追加を検討する（現時点では一覧の検索・フィルタ自体が未実装）。

---

## 11. 手動確認観点

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。Tier 1 実機（iOS Safari / Android Chrome）とデスクトップで行う。

1. 新規作成でプラン画像を1枚選び、保存 → 詳細画面の基本情報の下に全体が表示されること（REQ-2.1, REQ-3.1, REQ-3.3）。
2. 新規作成で**1回の選択操作で2枚以上**を選べ、保存後に詳細画面へ選択順で縦に並ぶこと（REQ-2.2, REQ-1.4, REQ-3.4）。
3. 2回に分けて選んだとき、後から選んだ画像が**追加**され、先に選んだものが消えないこと（REQ-2.3）。
4. プラン画像を添付せずに保存できること（REQ-1.2）、詳細画面にプラン画像の領域が出ないこと（REQ-3.2）。
5. フォームで未保存のプラン画像1枚だけを取り除け、他の未保存・保存済みの画像に影響しないこと（REQ-2.5, REQ-2.7）。
6. 編集画面で保存済みのプラン画像がすべてプレビュー表示され、そのうち1枚だけを取り除いて保存 → 詳細画面に残りが正しい順序で表示されること（REQ-2.4, REQ-2.6, REQ-6.1）。再編集しても取り除いた画像が復活しないこと（REQ-6.2）。
7. 保存済みプラン画像をすべて取り除いて保存 → 詳細画面にプラン画像の領域が出ないこと（REQ-3.2, REQ-6.1）。
8. **プラン画像が「写真・メモ」の写真一覧・`PhotoPicker`・観察記録の写真候補のいずれにも出ないこと**（REQ-3.6, REQ-2.12, REQ-7.3）。
9. 写真3枚＋プラン画像2枚のログで、一覧カードの表示が「写真 3枚」であること、カードのサムネイルが写真（プラン図でない）であること（REQ-5.2, REQ-5.3）。
10. プラン画像のみを添付したログで、一覧カードに「写真」の項目とサムネイルが出ないこと（[8](#8-一覧カードへの表示)）。
11. プラン画像が1枚のとき、詳細画面でタップすると拡大表示が開き、**前後ボタンと位置表示が出ないこと**（REQ-4.5）。
12. プラン画像が3枚のとき、2枚目をタップすると拡大表示が2枚目から開き、位置表示が「2 / 3」であること。前後ボタン・左右矢印キーで1枚目・3枚目へ移動でき、写真や観察記録の写真が混ざらないこと（REQ-4.2, REQ-4.3, REQ-4.5）。
13. 拡大表示から ×・背景タップ・Escape で閉じられ、フォーカスが元のプラン画像のボタンに戻ること（[photo-lightbox REQ-5.x](../photo-lightbox/requirements.md) の挙動が変わっていないこと。REQ-4.8）。
14. 写真の拡大表示・観察記録の写真の拡大表示が従来どおり動作すること（REQ-7.2）。
15. 縦長・横長・極端に細長い図のそれぞれで、画像が切り取られず、幅320pxでも横スクロールが出ないこと（REQ-3.3, REQ-3.7）。
16. 同じ日付のログから新規作成したとき、プラン画像が引き継がれないこと（REQ-2.11）。
17. ログを削除したあと、プラン画像の添付がすべて残っていないこと（開発者ツールで `attachments` を確認。REQ-6.3）。
18. 機内モードで、プラン画像の添付・表示・拡大表示がすべて動作すること（REQ-9.2）。
19. OSをダーク／ライトに切り替えて、ラベルと画像の枠が読めること（REQ-9.5）。
20. スクリーンリーダー（VoiceOver / TalkBack）で、開く操作要素が「ダイビングプランの画像2を拡大表示」（1枚のときは「ダイビングプランの画像を拡大表示」）、拡大表示中の画像が「ダイビングプランの画像（2枚目 / 全3枚）」と読み上げられること（REQ-4.7）。
21. キーボードの Tab で各プラン画像のボタンに順に到達でき、Enter / Space で拡大表示が開くこと。フォーカスリングが見えること。
22. プラン画像の添付・取り除き・拡大表示を10回以上繰り返しても、表示が崩れずメモリ上のオブジェクトURLが残らないこと（REQ-9.7）。
23. （同期を有効にしている場合）プラン画像を複数枚持つログを別端末へ同期し、同じ枚数・同じ順序で「プラン画像として」表示されること（写真として表示されないこと。REQ-8.1）。
24. （同期を有効にしている場合）意図的に競合を起こし、競合コピー側のプラン画像が複製された画像を**すべて**指していること（REQ-8.3）。
25. 本機能の追加前に作成した既存ログを開いて編集・保存しても、エラーにならずプラン画像なしのままであること（REQ-7.1）。

---

## 既知の制約・トレードオフ

- **プラン画像は写真と同じ `attachments` に同居する**（[1](#1-データの持ち方)）。「写真かプラン画像か」はログ側の `planImageUuids` でしか判別できないため、添付テーブルだけを見ても用途は分からない。表示側の除外処理（`getDiveLogDetail` の分離・一覧カードの引き算）を将来壊すと、プラン画像が写真として現れる回帰が起きうる。
- **本機能を持たない旧バージョンの端末では、プラン画像が「写真」として枚数分表示される**（[7](#7-google-drive-同期への影響)）。データは失われないが、その端末で写真として削除されると当該参照が解決できなくなる（残りのプラン画像は表示され、次回保存時に参照が整理される）。
- **プラン画像の並び替えができない**（REQ-1.4）。並びは「保存済み → 追加順」に固定であり、ページ順を入れ替えるにはいったん取り除いて選び直す必要がある。ページ番号やキャプションも保存しないため、順序が唯一の手がかりになる。
- **枚数に上限がなく、複数枚添付すると詳細画面の基本情報セクションが縦に長くなる**（1枚あたり最大240px）。プラン画像が多いログでは環境情報以降へのスクロール量が増える。実運用で問題になる場合は、2枚目以降の高さを下げる／折りたたむ等を別要望として検討する。
- **画像の圧縮・リサイズを行わない**（REQ-9.6、[photo-attachment/design.md](../photo-attachment/design.md) と同じ制約）。高解像度のプラン図を複数枚添付すると、1枚固定の場合よりも IndexedDB と Drive の容量を圧迫しやすい（保存失敗時は既存のエラー表示に従う＝REQ-6.6）。
- **PDFのプランには対応しない**。`accept="image/*"` のため、PDFで共有された場合はユーザーがスクリーンショット等で画像化する必要がある（複数ページのPDFは、ページごとに画像化して複数枚添付する運用になる）。対応するには表示側にPDFレンダリング（依存パッケージの追加）が必要になり、REQ-9.1 に反する。
- **プラン画像に説明を付けられない**。代替テキストは「ダイビングプランの画像（n枚目 / 全N枚）」で固定であり、図の内容そのものを音声のみで把握することはできない（[photo-lightbox 7](../photo-lightbox/design.md) と同じ限界）。
- **拡大表示のズーム・回転はできない**（[photo-lightbox](../photo-lightbox/design.md) の方針を維持）。細かい文字を読むにはOS/ブラウザのピンチズームに頼る。プラン図は写真より細部の可読性が要求されるため、実機確認の結果によっては [photo-lightbox 8](../photo-lightbox/design.md) の案B（実寸表示＋スクロール）を別要望として検討する余地がある。
- **一覧・検索からプラン画像に到達できない**（REQ-5.1）。プラン画像の有無・枚数で絞り込むことはできない。

## 実装後に更新が必要な既存ドキュメント

| ファイル | 更新内容 |
| --- | --- |
| [`specs/00-overview.md`](../00-overview.md) | 機能一覧に本仕様の行を追加（本仕様の策定時に実施済み）。実装後、状態を「実装済み」に更新する |
| [`specs/dive-log-crud/requirements.md`](../dive-log-crud/requirements.md) | 項目定義の表に「基本情報 / ダイビングプラン画像（複数可） / 任意 / 本仕様を参照」の行を追加する。REQ-7.5（引き継がない項目）にプラン画像を追記する |
| [`specs/dive-log-crud/design.md`](../dive-log-crud/design.md) | `DiveLog` / `DiveLogDraft` の定義と `getDiveLogDetail` / `createDiveLog` / `updateDiveLog` のシグネチャに `planImageUuids` / `newPlanImageFiles` / `removedPlanImageIds` / `planImages` を反映する |
| [`specs/photo-attachment/design.md`](../photo-attachment/design.md) | 「`attachments` テーブルは写真とサインで共有する」の記述に、プラン画像も `type: 'photo'` として同居し `DiveLog.planImageUuids` で区別される旨を追記する |
| [`specs/photo-lightbox/requirements.md`](../photo-lightbox/requirements.md) | 概要の「対象は詳細画面の次の2箇所」の表に3箇所目（プラン画像・集合は当該ログのプラン画像全体）を追加する。REQ-1.8（サイン画像は対象外）はそのまま |
| [`specs/marine-life-observation/design.md`](../marine-life-observation/design.md) | 7節（同期）の写真参照の説明に、プラン画像も同じ `Attachment.uuid` 配列の参照方式を採る旨を必要に応じて追記する（任意） |
| [`specs/google-drive-sync/design.md`](../google-drive-sync/design.md) | `logs/<uuid>.json` のサンプルに `planImageUuids` を追記する（トップレベル構造の変更はなし） |
