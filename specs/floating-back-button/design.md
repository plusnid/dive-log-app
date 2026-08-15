# 設計: フローティング戻るボタン

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [UI仕上げ レベル3設計](../ui-polish-level3/design.md) / [観察した生物の記録・検索設計](../marine-life-observation/design.md) / [写真の拡大表示設計](../photo-lightbox/design.md) / [サイン入力の全画面化設計](../signature-fullscreen/design.md) / [モバイル対応設計](../mobile-compatibility/design.md) / [ダイビングログCRUD設計](../dive-log-crud/design.md)

## 設計方針

- 対象は**詳細画面・設定画面・生物検索画面の3画面**。入力フォーム画面（`DiveLogFormView`）は対象外で、現行のインラインの「← キャンセル」を据え置く（2026-08-15 確定。[要件の確定事項 3](./requirements.md#確定事項ユーザー確認済み)、REQ-3.4）。
- **表示層だけの変更**。`src/types` / `src/db` / `src/sync` / `src/platform` / `src/hooks` は一切変更しない（REQ-6.2, REQ-6.6）。
- 戻る動作は `src/App.tsx` の既存の `back()` をそのまま使う。各Viewの props（`onBack` / `onCancel`）のシグネチャも変更しない（REQ-2.1, REQ-6.3）。
- 部品はFABと同じ粒度で切り出す（`src/components/FloatingBackButton.tsx` + `.css`）。固定配置・セーフエリア対応・コンテンツ列への追従・`aria-label` という [Fab](../ui-polish-level3/design.md#1-4-css) の慣習をそのまま踏襲する（REQ-1.5, REQ-1.6）。
- **戻るボタンの描画は `src/App.tsx` に集約する**（→ [5](#5-描画場所)）。戻り先を知っているのは `App.tsx` だけであり、読み込み中・記録なしの分岐（REQ-3.5）を各Viewの全returnに書き足す必要がなくなる。
- 依存パッケージは追加しない。アイコンは既存の `ChevronLeftIcon`（`src/components/icons.tsx`）を再利用する（REQ-5.5, REQ-6.1）。

## 変更対象ファイル

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/components/FloatingBackButton.tsx` / `.css` | 新規 | 固定表示の戻るボタン | REQ-1.1〜REQ-1.12, REQ-5.1〜REQ-5.7 |
| `src/App.tsx` | 変更 | 一覧以外のルートで `FloatingBackButton` を描画 | REQ-1.10, REQ-3.5, REQ-5.3 |
| `src/views/DiveLogDetailView.tsx` | 変更 | 先頭のインライン「← 戻る」を削除 | REQ-3.1 |
| `src/views/SyncSettingsView.tsx` | 変更 | インライン「← 戻る」を削除、`.view__header` を `h1` 単独へ | REQ-3.2, REQ-4.3 |
| `src/views/CreatureSearchView.tsx` | 変更 | インライン「← 戻る」3箇所を削除、`.view__header` を整理 | REQ-3.3, REQ-4.3 |
| `src/App.css` | 変更 | 固定ボタンと本文が重ならないための上部余白 | REQ-4.1, REQ-4.2 |

**無変更**: `src/views/DiveLogFormView.tsx`（対象外。インラインの「← キャンセル」を据え置く。REQ-3.4）、`src/views/DiveLogListView.tsx`（一覧には戻るボタンを出さない。REQ-1.10）、`src/components/icons.tsx`（`ChevronLeftIcon` は [photo-lightbox](../photo-lightbox/design.md) で追加済み。REQ-5.5）。

---

## 1. 現状（調査結果）

インラインの「← 戻る」は次の5箇所（＋フォームの「← キャンセル」1箇所）にあり、いずれも `.view` の通常フロー内にあるためスクロールで画面外へ流れる。

| 画面 | 位置 | 現在のマークアップ |
| --- | --- | --- |
| `DiveLogDetailView` | `.view` の先頭 | `<button type="button" onClick={onBack}>← 戻る</button>` の直後に `h1` |
| `SyncSettingsView` | `.view__header` 内の左 | `.view__header` = `[← 戻る][h1 設定]` |
| `CreatureSearchView`（読み込み中） | `.view` の先頭 | ボタン＋`<p>読み込み中...</p>` |
| `CreatureSearchView`（該当ログ一覧） | `.view__header` 内の左 | `.view__header` = `[← 戻る][生物一覧]`、その下に `h1` |
| `CreatureSearchView`（生物一覧） | `.view` の先頭 | ボタン＋`h1 生物から探す` |
| `DiveLogFormView`（**対象外**） | `<form class="view dive-log-form">` の先頭 | `<button type="button" onClick={onCancel}>← キャンセル</button>`（据え置き。REQ-3.4） |

`App.tsx` 側では `back()` が `SyncSettingsView.onBack` / `DiveLogDetailView.onBack` / `CreatureSearchView.onBack` / `DiveLogFormView.onCancel` の**4箇所すべてに同じ関数として**渡っている。つまり6箇所の見た目の違いはあっても、動作はすべて同一である（REQ-2.1, REQ-2.5）。本仕様で置き換えるのはこのうち上位3画面の5箇所で、`DiveLogFormView` の1箇所は現状のまま残す（REQ-3.4）。

**行き止まりの発見（REQ-3.5）**: 次の3状態には戻るボタンが存在しない。

| 状態 | 該当コード | 本仕様での扱い |
| --- | --- | --- |
| 詳細画面の読み込み中 | `if (detail === undefined) return <p>読み込み中...</p>` | **解消する**（対象画面） |
| 詳細画面の記録なし | `if (detail === null) return <p>記録が見つかりませんでした。</p>` | **解消する**（対象画面） |
| 入力フォーム画面の読み込み中 | `if (loading) return <p>読み込み中...</p>` | **スコープ外**（画面ごと対象外。REQ-3.4） |

いずれも `.view` ですらない裸の `<p>` を返しており、ユーザーは再読み込み以外で画面を離れられない。特に「記録が見つかりませんでした。」は同期経由でログが消えた場合等に到達しうる恒久的な行き止まりである。本仕様の描画方式（`App.tsx` に集約）なら対象画面の分は自動的に解消される。入力フォーム画面の読み込み中は既存ログの取得中に一瞬表示されるだけであり、行き止まりとしての実害が小さいことから、画面ごと対象外とする決定（[要件の確定事項 3](./requirements.md#確定事項ユーザー確認済み)）に従ってそのまま残す。解消したくなった場合は別途ユーザー確認のうえ改訂する。

**関連する既存の固定・重なり要素**:

| 要素 | 位置 | `z-index` |
| --- | --- | --- |
| `.past-value-picker__panel`（入力フォーム画面） | 絶対配置（トリガ直下） | 10 |
| `.fab`（一覧画面のみ） | `position: fixed` 右下 | 20 |
| `.app-menu__panel`（一覧画面のみ） | 絶対配置（ヘッダー直下） | 30 |
| `ImageLightbox` / `SignatureDialog` | `<dialog>` + `showModal()` | トップレイヤー（`z-index` の影響を受けない） |

FABとメニューは一覧画面専用、過去値ピッカーは入力フォーム画面（対象外）専用、戻るボタンは対象3画面専用なので、**これらが同一画面に共存することは構造的にない**（REQ-1.4 / REQ-4.4 は将来の変更に対する保険として残す）。モーダルはトップレイヤーに描かれ、かつ `showModal()` により背面全体が不活性化されるため、固定配置の戻るボタンがモーダルの前面に出たり操作されたりすることはない（REQ-4.6）。

## 2. 配置方式

### 2-1. 固定配置（`position: fixed`）を採る

`position: fixed` の単体ボタンとする（REQ-1.2）。`position: sticky` で `.view` の先頭に置く案は、`.view` が flex カラムであるため機能はするが、(a) 本文の折り返し幅を実質的に削る、(b) 貼り付いた後に本文がボタンの下を通過するため結局不透明な背景が要る、(c) 各Viewの先頭に置く必要があり読み込み中の分岐（REQ-3.5）を救えない、という理由で不採用。

### 2-2. 表示位置（確定: コンテンツ列の左上）

**案A: コンテンツ列の左上**に確定（2026-08-15、[要件の確定事項 1](./requirements.md#確定事項ユーザー確認済み)）。比較は以下のとおり。

| 案 | 利点 | 欠点 |
| --- | --- | --- |
| **A: 左上（確定）** | ネイティブの戻る位置と一致し発見しやすい。現行のインライン位置（画面先頭）と同じ場所なので移行の違和感が小さい。画面下部の既存の操作行（「編集」「削除」）・iOS Safariの下部ツールバーと競合しない | 片手・親指では届きにくい。スクロール中は本文左上を覆う |
| B: 左下（不採用） | 片手操作で最も押しやすい。FAB（右下）と左右対称 | 最下部までスクロールしたとき「編集」「削除」（左寄せの `.view__actions`）と重なる。iOS Safari下部ツールバーと近接 |
| C: 上部固定のヘッダーバー（不採用） | 見た目が最もアプリらしい。生物検索の「生物一覧」ボタンの置き場も自然に決まる | 全画面の `h1` / `.view__header` の構造変更を伴い、変更量が大きい。共通ヘッダー部品の新設は本仕様の対象外 |

### 2-3. 重なり順

`z-index: 20`（FABと同値）とする。一覧画面のメニューパネル（30）・入力フォーム画面の過去値ピッカー（10）はいずれも戻るボタンを表示しない画面の要素であり、同一画面で重なることはない（REQ-4.4）。モーダルはトップレイヤーのため常に前面（REQ-4.6）。

### 2-4. 検討したが採らなかった方式

- **共通ヘッダー部品（AppBar）の新設**: 画面名・右側の付随ボタン（生物検索の「生物一覧」）まで面倒を見る部品にすると、全Viewの見出し構造を書き換えることになる。今回の要望は「戻るボタンがスクロールで消える」ことの解消であり、範囲を戻るボタン1つに絞る。将来ヘッダーを共通化する場合の受け皿としては、本部品をそのバー内へ移設すればよい。
- **各Viewが `FloatingBackButton` を描く**（Fabと同じ流儀）: 素直だが、`CreatureSearchView` は3つのreturn、`DiveLogDetailView` は3つのreturnがあり、合計6箇所に同じ要素を書くことになる。書き漏らしが REQ-1.3 / REQ-3.5 の違反に直結するため不採用（→ [5](#5-描画場所)）。

## 3. 見た目（確定: アイコンのみの円形ボタン）

**案ア（アイコンのみの円形ボタン）**に確定（2026-08-15、[要件の確定事項 2](./requirements.md#確定事項ユーザー確認済み)）。

- 直径44px（REQ-1.7 の下限ちょうど。FABの56pxより一段小さくすることで「主要操作＝FAB／副次操作＝戻る」の強弱を保つ。REQ-1.14）。
- 中身は `ChevronLeftIcon` のみ、`aria-label="戻る"`（REQ-1.13, REQ-5.1, REQ-5.4）。`title` は付けない（[ui-polish-level1](../ui-polish-level1/design.md) の方針）。
- 背景は `var(--surface)`、文字色は `var(--text)`、境界は `1px solid var(--border)`（＝共通の `button` スタイルと同じトークン）。本文の上に浮くため不透明にし（REQ-1.8）、`box-shadow` で浮きを示す。FABのようなアクセント色にはしない（主要操作はあくまでFABと各画面の保存/編集）。
- 不採用: アイコン＋「戻る」文字を持つ角丸ボタン（横幅が広く、本文を覆う面積が増えるため）。

## 4. コンポーネント

```tsx
// src/components/FloatingBackButton.tsx
interface FloatingBackButtonProps {
  onClick: () => void
}
```

```tsx
export function FloatingBackButton({ onClick }: FloatingBackButtonProps) {
  return (
    <button type="button" className="floating-back" aria-label="戻る" onClick={onClick}>
      <ChevronLeftIcon />
    </button>
  )
}
```

- 対象3画面ですべて名前が「戻る」に統一されたため（REQ-5.1）、ラベルはコンポーネント内に固定する。入力フォーム画面（名前が「キャンセル」）が対象外になったことで、`label` prop は不要になった。将来ほかの名前が必要になった時点で任意propを足せばよい（現時点では入れない）。
- `type="button"` を明示する（現状は `<form>` の外に置くため送信の懸念はないが、既存の各ボタンと同じ書き方に揃える）。
- 表示テキストを持たないため `aria-label` が唯一の名前になる（アイコンは `aria-hidden`。REQ-5.4）。

## 5. 描画場所

`src/App.tsx` の**対象3ルート**（`settings` / `detail` / `creatures`）で、Viewと**兄弟として**戻るボタンを描く。フラグメントの先頭に置くことでDOM順＝Tab順が現行（`.view` 先頭のインラインボタン）と一致する（REQ-5.3）。

```tsx
if (route.view === 'settings') {
  return (
    <>
      <FloatingBackButton onClick={back} />
      <SyncSettingsView onBack={back} />
    </>
  )
}
```

- **`form` ルートは無変更**（`<DiveLogFormView … onCancel={back} />` をそのまま返す）。入力フォーム画面は対象外であり、フローティング戻るボタンを描かない（REQ-3.4）。
- 一覧ルート（`route.view === 'list'`）でも描かない（REQ-1.10）。
- 各Viewの props（`onBack` / `onCancel`）は**残したまま**にする。`App.tsx` からの受け渡しを消さないことで、Viewが自前で戻る導線を持ちたくなった場合の余地を残し、差分も最小になる。ただし本仕様適用後、`SyncSettingsView` / `DiveLogDetailView` / `CreatureSearchView` は `onBack` を使わなくなるため、**未使用propsとしてoxlintの警告が出る場合は props ごと削除してよい**（その場合 `App.tsx` の呼び出し側も合わせる）。`DiveLogFormView` の `onCancel` は引き続き使用されるため必ず残す。実装時に lint 結果で判断すること。
- 読み込み中・記録なしの分岐はViewの内側にあるが、ボタンはViewの外側にあるため常に表示される（REQ-3.5）。これが本方式を選ぶ最大の理由。
- 同時に描かれるのは1つだけであることが `App.tsx` の early return 構造から自明（REQ-1.3）。

## 6. CSS

`src/components/FloatingBackButton.css`（案A・案ア前提）:

```css
.floating-back {
  position: fixed;
  z-index: 20;
  top: calc(0.5rem + env(safe-area-inset-top));
  left: max(1rem + env(safe-area-inset-left), calc(50% - 320px + 1rem));
  width: 44px;
  height: 44px;
  min-width: 0;   /* 共通 button の min-width/min-height: 44px と同値だが明示 */
  min-height: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text);
  font-size: 1.25rem;   /* アイコンの width/height: 1em に効く */
  display: grid;
  place-items: center;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
}
```

| 指定 | 意図 / 関連要件 |
| --- | --- |
| `position: fixed` + `z-index: 20` | スクロール追従なし（REQ-1.2）、本文より前面（REQ-1.9） |
| `left: max(1rem + env(safe-area-inset-left), calc(50% - 320px + 1rem))` | 幅640px以下ではビューポート左端から1rem、それより広い画面ではコンテンツ列の左端に揃う（REQ-1.6）。`.fab` の `right` の左右反転（[ui-polish-level3](../ui-polish-level3/design.md#1-4-css)） |
| `top: calc(0.5rem + env(safe-area-inset-top))` | ノッチとの重なり回避（REQ-1.5）。**`#root` の `padding` は上端にセーフエリアを加算していない**（`src/index.css` は右・下・左のみ）ため、固定要素側で自前に加算する必要がある |
| `width/height: 44px` | タップ領域（REQ-1.7）。FAB（56px）より小さくして主従を付ける |
| `background: var(--surface)` / `border` / `box-shadow` | 不透明な背景（REQ-1.8）と浮きの表現。ライト/ダーク両対応のトークン（REQ-5.7） |
| `color: var(--text)` | `--surface` に対するコントラストは既存の本文と同等（ライト/ダークとも4.5:1以上。[ui-polish-level2](../ui-polish-level2/design.md)）。アイコンは非テキスト要素として3:1以上（REQ-5.6） |

フォーカスリングは共通のブラウザ既定（`:focus-visible`）に任せる。`outline` を消さないこと（REQ-5.2）。

本文との重なり回避（REQ-4.1）— `src/App.css`:

```css
/* 対象3画面には固定の戻るボタンが乗るため、その分だけ上を空ける（REQ-4.1）。
   一覧（.view--list）と入力フォーム（.dive-log-form）は戻るボタンを出さないため除外する
   （REQ-1.10, REQ-3.4。余白だけが増えると不要な空白になるため）。 */
.view:not(.view--list):not(.dive-log-form) {
  padding-top: calc(3rem + env(safe-area-inset-top));
}
```

- 計算: ボタン上端 `0.5rem` ＋ 高さ `44px`（≒2.75rem）＋ 余白 ≒ `3.75rem`。`#root` が既に `padding-top: 1rem` を持つので、`.view` 側は約 `2.75rem` あれば足りる。切り上げて `3rem` とし、セーフエリア分を加算する。
- セレクタで賄えるのは、対象3画面がいずれも最上位要素に `view` クラスを持ち、除外対象の2画面がそれぞれ `view--list` / `dive-log-form` という判別可能なクラスを併せ持つため（入力フォームは `class="view dive-log-form"`）。**除外を1つでも書き漏らすと、戻るボタンのない画面の先頭に不要な空白が出る**ので注意（REQ-6.5: 一覧・入力フォームの見た目を変えない）。
  - 代替案として、対象3画面のルート要素に `view--with-back` 修飾クラスを付ける方法もあるが、`DiveLogDetailView` と `CreatureSearchView` はreturnが3つずつあり付け忘れの余地が増えるため、CSS側の除外を採る。
- **詳細画面の読み込み中・記録なしの状態は `.view` を持たない裸の `<p>`** のため、この余白が効かずボタンとテキストが重なる。実装時に `DiveLogDetailView` のこれら2つのreturnを `<div className="view"><p>…</p></div>` で包むこと（表示文言は変更しない。REQ-3.8）。`DiveLogFormView` の「読み込み中...」は**対象外なので包まない**（現状のまま。[1](#1-現状調査結果)）。

## 7. 各画面の差分

### 7-1. 詳細画面（`DiveLogDetailView`）

- 先頭の `<button …>← 戻る</button>` を削除。`h1`（サイト名）が `.view` の先頭要素になる。
- 「読み込み中...」「記録が見つかりませんでした。」を `.view` で包む（[6](#6-css) の余白のため）。これにより行き止まりが解消される（REQ-3.5）。
- 下部の `.view__actions`（編集・削除）は変更しない（REQ-3.7）。左上配置（確定）ではこの行と重ならないため、`padding-bottom` の追加は不要（REQ-4.2 は左上配置により自動的に満たされる）。

### 7-2. 設定画面（`SyncSettingsView`）

- `.view__header` から戻るボタンを削除。残るのは `h1 設定` だけになるため、**`.view__header` の `div` ごと外して `<h1>設定</h1>` を直接置く**（`justify-content: space-between` の効かない1要素のヘッダーを残さない。REQ-4.3、[要件の確定事項 5](./requirements.md#確定事項ユーザー確認済み)）。
- 「データ管理」以下のセクション構成は変更しない（[ui-polish-level3 REQ-2.11](../ui-polish-level3/requirements.md)）。

### 7-3. 生物検索画面（`CreatureSearchView`）

- 3箇所の戻るボタンを削除（REQ-3.3）。
- 該当ログ一覧の `.view__header` は「生物一覧」ボタンだけが残る。`space-between` で左端に寄ってしまうため、`justify-content: flex-end` 相当（クラス追加、または当該ボタンに `margin-left: auto`）で**右寄せを維持する**（REQ-4.3）。「生物一覧」導線自体は変更しない（REQ-2.6）。
- 読み込み中の状態（`<div className="view">` にボタンと `<p>` があった箇所）は `<p>読み込み中...</p>` のみになる。`.view` は維持する。

### 7-4. 入力フォーム画面（`DiveLogFormView`）— 対象外

**本画面は無変更**（2026-08-15 ユーザー確定。[要件の確定事項 3](./requirements.md#確定事項ユーザー確認済み)、REQ-3.4）。

- 先頭のインラインの `<button type="button" onClick={onCancel}>← キャンセル</button>` はそのまま残す。テキスト付きで、スクロールすると画面外へ流れる現行の挙動も維持する。
- `App.tsx` の `form` ルートでもフローティング戻るボタンを描かない。`onCancel` prop も現行どおり使用され続ける。
- 「読み込み中...」の裸の `<p>`（戻る手段なし）も現状維持（スコープ外）。
- **不採用にした案（含める・名前は「キャンセル」）の理由**: 縦に長いフォームの上に常時「キャンセル」が浮くと、スクロール中の誤タップで未保存の入力を失うリスクが高まる。現状、未保存の入力に対する確認ダイアログは存在せず（REQ-2.4）、本仕様でも新設しないため、フローティング化は「取り返しのつかない操作を最も押しやすい場所に常時置く」ことになる。
- **結果として生じる不統一**: 対象3画面はアイコンのみの円形ボタン（左上固定）、入力フォーム画面だけがテキスト付きのインラインボタン、という2種類の戻る導線が併存する。これは REQ-3.6 の意図した例外であり、実装時に「揃っていない＝バグ」と判断して勝手に統一しないこと。将来、未保存変更の確認ダイアログを導入する場合は、本画面のフローティング化を改めて検討できる。

## 8. 影響しない箇所

- `src/types` / `src/db` / `src/sync` / `src/platform` / `src/hooks`: 変更なし（REQ-6.2）。同期の `schemaVersion` も据え置き。
- `src/App.tsx` の `Route` 定義・`push` / `replace` / `back` / `dropLog`・履歴スタックの挙動: 変更なし（REQ-2.2, REQ-6.3）。追加するのは対象3ルートの early return での要素の並置のみ（`list` / `form` ルートは無変更）。
- `DiveLogFormView`（インラインの「← キャンセル」、保存処理、`PastValuePicker`、天候セグメント等）: 変更なし（REQ-3.4）。
- `DiveLogListView` / `Fab` / `AppMenu` / `InstallGuide`: 変更なし（REQ-1.10, REQ-6.5）。
- `ImageLightbox` / `SignatureDialog`: 変更なし。`showModal()` によるトップレイヤー表示と背面の不活性化により、戻るボタンは自動的に前面から外れ操作不能になる（REQ-4.6）。
- 各画面の見出し・本文・入力項目・保存されるデータ: 変更なし（REQ-3.7, REQ-3.8）。

## 9. 既知のトレードオフ・リスク

- **戻る導線が2種類併存する**（対象3画面はフローティングの円形アイコン、入力フォーム画面はインラインのテキストボタン）。[要件の確定事項 3](./requirements.md#確定事項ユーザー確認済み) に基づく意図した例外（REQ-3.6）。入力フォーム画面での誤タップによる入力喪失を避けることを、見た目の統一より優先した判断。将来、未保存変更の確認ダイアログを導入した時点で再検討できる。
- **入力フォーム画面の行き止まりが残る**: 既存ログ編集時の「読み込み中...」には戻る手段がないままとなる（表示は一瞬であり実害は小さいという判断。解消するには別途ユーザー確認が必要）。
- **常に本文の一部（左上）を覆う**。固定配置である以上避けられない。44pxの円に留めることで影響を最小化する。長文が入りうるのは詳細画面の「写真・メモ」や生物検索の一覧だが、いずれも先頭行の左端が一時的に隠れる程度で、スクロールすれば読める。
- **iOS Safari のソフトウェアキーボード表示中の `position: fixed`**（REQ-4.7）: iOSではキーボード表示時にビジュアルビューポートが縮み、`fixed` 要素の位置がずれる（浮き上がる／スクロールに追従して見える）ことがある。対象3画面のうち文字入力があるのは**生物検索画面の検索欄のみ**で、入力欄は画面上部の見出し直下にあるため、左上の戻るボタンと近接する。実機確認が必要（手動確認観点13）。上部配置は「キーボードが下から出る」ぶん下部配置より影響が小さい。入力フォーム画面が対象外になったことで、このリスクの影響範囲はさらに小さくなった。
- **文字だけを頼りにするユーザーの発見性**: 対象3画面では「← 戻る」の文字が消え、シェブロンのみになる。支援技術には `aria-label` で伝わる（REQ-5.1）が、視覚的にはアイコンの意味を推測させることになる。これはFAB（＋のみ）で既に採った判断と同じ水準。
- **ブラウザ/OSの戻る操作とは引き続き連動しない**（[marine-life-observation REQ-11.19](../marine-life-observation/requirements.md)）。本仕様は画面内の導線を改善するだけで、Androidの戻るジェスチャはアプリ／タブを離れる挙動のまま。
- **Tab順**: 戻るボタンがDOM先頭に来るため、各画面で最初のTab停止位置になる（現行のインラインボタンと同じ）。ただし固定配置のため、視覚順（左上）と一致しない画面はない。

## 手動確認観点

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。

1. 詳細画面・設定画面・生物検索画面（生物一覧／該当ログ一覧）のそれぞれで、下までスクロールしても戻るボタンが同じ位置に見え、押すと1つ前の画面へ戻ること（REQ-1.2, REQ-2.1）。
2. 対象3画面で戻るボタンが1つだけ表示され、旧インラインの「← 戻る」が残っていないこと（REQ-1.3, REQ-3.1〜REQ-3.3）。
3. 一覧画面に戻るボタンが表示されないこと。FABの位置・見た目が従来どおりであること（REQ-1.10, REQ-6.5）。
3-2. **入力フォーム画面（新規作成・編集の両方）にフローティング戻るボタンが表示されず、現行のインラインの「← キャンセル」がそのまま残っていること。画面先頭に不要な空白が増えていないこと**（REQ-3.4、[6](#6-css) のCSS除外）。押すと従来どおり前の画面へ戻ること。
4. 詳細画面を開いた直後の「読み込み中...」、および存在しないログを指す状態の「記録が見つかりませんでした。」で戻るボタンが押せること（REQ-3.5）。テキストとボタンが重なっていないこと。
5. 各画面を最上部まで表示した状態で、`h1` と本文がボタンに覆われていないこと（REQ-4.1）。
6. 生物検索（該当ログ一覧）で「生物一覧」ボタンが右寄せのまま残っていること（REQ-4.3, REQ-2.6）。設定画面の見出し「設定」の位置が破綻していないこと。
7. iOS のホーム画面起動（スタンドアロン）で、ボタンがノッチ・ステータスバーと重ならないこと（REQ-1.5）。ブラウザタブ起動でも上部のアドレスバーと干渉しないこと。
8. デスクトップの広い画面（幅1280px想定）で、ボタンがコンテンツ列の左上付近に表示され、画面の端に取り残されないこと（REQ-1.6）。
9. 画面幅320px / 375px / 640px で横スクロールが発生しないこと（REQ-4.5）。
10. Tabキーで各画面の最初のフォーカスが戻るボタンに当たり、フォーカスリングが見えること。Enter / Space で戻れること（REQ-5.2, REQ-5.3）。
11. スクリーンリーダー（iOS VoiceOver / Android TalkBack）で「戻る」と読まれること（REQ-5.1）。
12. 詳細画面で写真の拡大表示を開いている間、戻るボタンがライトボックスの前面に出ず、Tabでも到達できないこと（REQ-4.6）。
13. 生物検索画面の検索欄に文字入力中（ソフトウェアキーボード表示中）に、ボタンが検索欄・絞り込みを覆っていないこと。iOS実機で位置がずれないこと（REQ-4.7、[9](#9-既知のトレードオフリスク)）。
14. ライト／ダークの両方で、ボタンの背景・境界・アイコンが本文の上で判別できること（REQ-5.6, REQ-5.7）。
15. 機内モードでリロードしても、すべての画面で戻るボタンが表示されること（REQ-6.4）。
