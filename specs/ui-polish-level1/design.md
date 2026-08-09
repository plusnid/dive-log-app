# 設計: UI仕上げ レベル1（情報の強弱・余白・アイコン）

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [ダイビングログCRUD設計](../dive-log-crud/design.md) / [モバイル対応設計](../mobile-compatibility/design.md)

## 設計方針

- **表示層のみの変更**（REQ-5.1）。`src/types` / `src/db` / `src/hooks` / `src/sync` / `src/platform` は一切変更しない。`DiveLogListItem` の props（`diveLog` / `onSelect`）も変更しない。
- 色・文字サイズの値は、**CSS変数（`src/index.css` の `:root`）とコンポーネントCSSに閉じる**。tsx 側にはインラインスタイルを書かない。将来レベル2でテーマカラーやフォントを変えるときに、変更点が `index.css` に集中する状態を作っておく。
- 依存パッケージは追加しない（`package.json` は変更しない）。アイコンはインラインSVGを自前で持つ。

## 変更対象ファイル

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/components/icons.tsx` | 新規 | メタ行用のインラインSVGアイコン4種 | REQ-3.1〜REQ-3.6 |
| `src/components/DiveLogListItem.tsx` | 変更 | カードの行構成とメタ行のマークアップ（ラベル/データの分離、アイコン挿入） | REQ-1.1〜REQ-1.8, REQ-3.1 |
| `src/components/DiveLogListItem.css` | 変更 | 文字サイズ・太さ・色・パディング・間隔、ハードコード色のトークン化 | REQ-1.x, REQ-2.x, REQ-5.2, REQ-5.4 |
| `src/index.css` | 変更 | `--text-muted` トークンの追加（ライト/ダーク） | REQ-1.4, REQ-5.2, REQ-5.4 |
| `src/App.css` | 変更 | `.view h1` / `.detail-subtitle` / `dt` の書式・色トークン化、`.dive-log-list` の間隔 | REQ-2.2, REQ-4.1, REQ-4.2 |

`src/views/DiveLogListView.tsx` と `src/views/DiveLogDetailView.tsx` は**変更不要**の想定（詳細画面の見出しは既存の `<h1>` と `.detail-subtitle` に対するCSSだけで REQ-4.1 を満たせる）。

## 色トークン（`src/index.css`）

既存の `--text` / `--bg` / `--surface` / `--border` / `--accent` に、ラベル用の淡色を1つだけ追加する。**アクセントカラーやテーマの変更は行わない**（レベル2の範囲）。

```css
:root {
  /* 既存の変数はそのまま */
  --text-muted: #6b6b6b;
}

@media (prefers-color-scheme: dark) {
  :root {
    --text-muted: #9ba1a8;
  }
}
```

- 値の根拠（REQ-5.4）: 現行の `#777` はライトモードの白背景に対してコントラスト比 約4.47:1 でWCAG AA（4.5:1）をわずかに下回る。`#6b6b6b` で 約5.3:1 になる。ダークモードの `#9ba1a8` は `--surface: #1f2228` に対して 約6.1:1。
- 適用先: 一覧カードのエリア名・メタ行ラベル、詳細画面の `dt`、`.detail-subtitle`。既存の `#777` / `#555` のハードコードはこのトークンに置き換える。

## 一覧カードのマークアップ（`DiveLogListItem.tsx`）

### 行構成

現行は「日付（左） ／ エリア名+ポイント名（右）」を `justify-content: space-between` で1行に置いている。ポイント名を大きくすると右端に大きな文字が来て視線の起点が定まらず、長いポイント名の折り返しも不安定になるため、**縦3段・すべて左揃え**に変更する（要件の [未確定事項 1](./requirements.md#未確定事項確認したい点)）。

```
┌─────────────────────────────┐
│ 2026-08-09                  │  ← 日付（0.95rem / 600 / --text）
│ 城ヶ島・岩骨                 │  ← エリア名（淡色・小）＋ ポイント名（1.15rem / 700）
│ 〰 最大水深 20m  ◷ 潜水時間 45分 │  ← メタ行（ラベル淡色小 / データ本体は --text）
└─────────────────────────────┘
```

```tsx
<li className="dive-log-list-item">
  <button type="button" className="dive-log-list-item__button" onClick={...}>
    <span className="dive-log-list-item__date">{diveLog.date}</span>
    <span className="dive-log-list-item__site-group">
      {diveLog.area && <span className="dive-log-list-item__area">{diveLog.area}</span>}
      <span className="dive-log-list-item__site">{diveLog.siteName}</span>
    </span>
    <div className="dive-log-list-item__meta">
      {/* 各項目は下表のとおり */}
    </div>
  </button>
</li>
```

- `dive-log-list-item__main` は不要になるため削除する（日付とサイト名グループが直接 `__button` の子になる）。[dive-log-crud/design.md](../dive-log-crud/design.md) の「UI構成」に `dive-log-list-item__main` 行への言及があるため、実装時に同ファイルの記述も本仕様に合わせて更新する（エリア名がポイント名の直前に付くという要件自体は不変）。
- `area` が空のときに要素自体を出さない現行の方針（[dive-log-crud REQ-1.5](../dive-log-crud/requirements.md)）と、`__area::after { content: '・' }` による区切りはそのまま維持する（REQ-1.8）。
- `diveLog.id == null` の早期 return、`onSelect(diveLog.id!)` の呼び出しは現行のまま。

### メタ行の各項目

```tsx
<span className="dive-log-list-item__meta-item">
  <DepthIcon className="dive-log-list-item__icon" />
  <span className="dive-log-list-item__meta-label">最大水深</span>
  <span className="dive-log-list-item__meta-value">{diveLog.maxDepth}m</span>
</span>
```

| 項目 | アイコン | ラベル | データ本体 | 表示条件（現行どおり） |
| --- | --- | --- | --- | --- |
| 最大水深 | 波 `DepthIcon` | 最大水深 | `{maxDepth}m` | `maxDepth != null` |
| 潜水時間 | 時計 `DurationIcon` | 潜水時間 | `{duration}分` | `duration != null` |
| 写真 | カメラ `PhotoIcon` | 写真 | `{photoIds.length}枚` | `photoIds.length > 0` |
| サイン | チェック `SignedIcon` | （なし） | サイン済 | `signatureId != null` |

- サインは数値データを持たないため、ラベルを置かずデータ本体だけを持つ例外とする（「サイン」＋「済」に分けるより自然な日本語のため）。書式はデータ本体と同じ。
- 現行の `title="写真あり"` / `title="サイン済み"` は削除する。テキストラベルが常に見えており（REQ-3.6）、`title` はタッチ環境で表示されないため。
- 文言は「📷 3」→「写真 3枚」、「✔ サイン済」→「サイン済」に変わる。項目の種類・順序・表示条件は変えないため REQ-1.7 の範囲内の書式変更として扱う。

## アイコンの実装方式

**インラインSVGを自前で持つ**（`src/components/icons.tsx` を新規追加）。

### 方式の比較と選定理由

| 方式 | 判定 | 理由 |
| --- | --- | --- |
| 絵文字（🌊 ⏱ 📷 ✔） | 不採用 | OS・フォントごとに絵柄と色が大きく異なり、線の太さ・サイズ・色をCSSで制御できない。REQ-3.3（単色・文字色追従）とREQ-3.4（統一）を満たせない。カラー絵文字はダークモードで浮きやすい |
| アイコンライブラリ（lucide-react 等） | 不採用 | 依存追加を避ける方針（REQ-3.5）。4個のアイコンのためにパッケージを増やす費用対効果が低い |
| SVGスプライト / 画像ファイル | 不採用 | 追加のネットワーク取得が発生し、Service Worker のプリキャッシュ対象管理も増える（[offline-pwa](../offline-pwa/design.md)） |
| **インラインSVGコンポーネント** | **採用** | 依存ゼロ、`currentColor` で文字色・ダークモードに自動追従、`1em` 指定で文字サイズに追従、バンドル増は4個で1KB未満 |

### `src/components/icons.tsx`

```tsx
interface IconProps {
  className?: string
}

export function DepthIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* パス */}
    </svg>
  )
}
```

- 4種すべて同じ属性セット（`viewBox="0 0 24 24"` / `stroke="currentColor"` / `strokeWidth="2"` / 線端は丸）で作り、REQ-3.4の統一を担保する。塗り（`fill`）は使わず線画で統一する。
- `aria-hidden="true"` と `focusable="false"` により支援技術から除外する（REQ-3.2）。SVGに `<title>` は付けない。
- 形状の目安（最終的な `d` は実装者が調整してよい。上記の共通属性と「線画・24グリッド」を守ることが条件）:
  - `DepthIcon`（波）: 横断する波線を2本（例: `M3 9c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 3-2` を y 方向にずらして2本）
  - `DurationIcon`（時計）: `<circle cx="12" cy="12" r="9" />` + 針 `M12 7v5l3.5 2`
  - `PhotoIcon`（カメラ）: 本体の角丸矩形 + レンズ `<circle cx="12" cy="13" r="3.5" />`
  - `SignedIcon`（チェック）: `M4 13l5 5L20 6`
- 配置は `src/components/icons.tsx` の単一ファイルとする（現状 `components/` はフラット構成のため、`icons/` ディレクトリは作らない）。将来アイコンが増えたらディレクトリ化を検討する。

## CSS（文字サイズ・余白）

### `src/components/DiveLogListItem.css`

| セレクタ | 指定 | 意図 / 関連要件 |
| --- | --- | --- |
| `.dive-log-list-item__button` | `padding: 1rem` / `gap: 0.5rem` / `background: var(--surface)` / `border-color: var(--border)` | 上下左右均等の広めパディング（REQ-2.1）、行間（REQ-2.2）、ダークモード追従（REQ-5.2） |
| `.dive-log-list-item__date` | `font-size: 0.95rem` / `font-weight: 600` / `color: var(--text)` | 日付を淡色にしない（REQ-1.2） |
| `.dive-log-list-item__site-group` | `line-height: 1.35` / `overflow-wrap: anywhere` | 長いポイント名の折り返し（REQ-1.9） |
| `.dive-log-list-item__site` | `font-size: 1.15rem` / `font-weight: 700` | カード内で最大・最太（REQ-1.1, REQ-1.3） |
| `.dive-log-list-item__area` | `font-size: 0.85rem` / `font-weight: 400` / `color: var(--text-muted)` | ポイント名より弱い（REQ-1.8） |
| `.dive-log-list-item__meta` | `display: flex` / `flex-wrap: wrap` / `row-gap: 0.4rem` / `column-gap: 1rem` | 項目間の間隔と折り返し（REQ-2.3, REQ-2.5） |
| `.dive-log-list-item__meta-item` | `display: inline-flex` / `align-items: center` / `gap: 0.3rem` | アイコンとテキストの縦位置合わせ |
| `.dive-log-list-item__meta-label` | `font-size: 0.78rem` / `color: var(--text-muted)` | ラベルを小さく淡く（REQ-1.4） |
| `.dive-log-list-item__meta-value` | `font-size: 0.9rem` / `font-weight: 600` / `color: var(--text)` | データ本体を引き立てる（REQ-1.5） |
| `.dive-log-list-item__icon` | `flex: 0 0 auto` / `color: var(--text-muted)` | 文字サイズ（`1em`）・行の色に追従（REQ-3.3） |

- カード背景 `#fff` と枠線 `#ddd` のハードコードを `var(--surface)` / `var(--border)` に置き換える（要件の [未確定事項 2](./requirements.md#未確定事項確認したい点)）。これは [mobile-compatibility REQ-6.5](../mobile-compatibility/requirements.md)（OSのダークモード追従）への適合修正であり、テーマカラーそのものの変更（レベル2）ではない。
- `.dive-log-list-item__meta` の旧 `font-size: 0.85rem` / `color: #555` はラベル・データ本体の個別指定に置き換えるため削除する。
- パディングを 0.75rem/1rem → 1rem に広げるため、カード高さは3行構成と合わせて増える。タップ領域は十分44px以上を満たす（REQ-2.4）。
- アイコンのサイズは `width="1em"` によって、属する行の `font-size`（ラベル 0.78rem 相当）に追従する。アイコンを目立たせすぎないため色はラベルと同じ `--text-muted` とする。

### `src/App.css`

- `.dive-log-list { gap: 0.5rem }` → `0.6rem`（カード内パディングを広げた分、カード間も気持ち広げる。REQ-2.2）。
- `.view h1 { font-size: 1.5rem; line-height: 1.3; margin: 0 }` を追加。一覧のタイトルと詳細画面の見出し（ポイント名）に共通で効く。ブラウザ既定の `2em` + 大きな上下マージンを抑え、`.view` の `gap: 1rem` に余白管理を寄せる（REQ-4.1）。
- `.detail-subtitle { color: var(--text-muted); font-size: 0.9rem; margin: 0 }`（REQ-4.1, REQ-4.2）。
- `dt { color: var(--text-muted) }`（REQ-4.2）。`dd` は変更しない。
- 入力要素（`input` / `select` / `textarea`）と `.dive-log-form label` の `font-size: 0.9rem` は**変更しない**（REQ-5.3。ここを触るとiOS自動ズームの既知課題に影響するため、対応は [mobile-compatibility](../mobile-compatibility/design.md#既知の制約リスク) 側の判断に委ねる）。

## 影響しない箇所

- データモデル（`src/types/diveLog.ts`）、Dexieスキーマ（`src/db/db.ts`）、リポジトリ関数、同期（`src/sync/`）: 変更なし（REQ-5.1）。同期対象のデータ構造に触れないため `schemaVersion` の変更も不要。
- 画面遷移（`src/App.tsx` の自前ルーター）、`useDiveLogs` の購読、空状態メッセージ: 変更なし。
- フォーム画面・同期設定画面・インストール案内・写真ピッカー・サインパッド: 変更なし。ただし `--text-muted` の追加と `.view h1` の追加は全画面に効くため、他画面の見出しの見え方がわずかに変わる点は許容する。

## 手動確認観点

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。

1. 画面幅375px / 640pxで横スクロールが出ないこと、メタ行が折り返しても崩れないこと（REQ-2.5）。
2. OSをダークモードにしたとき、カード背景・文字・アイコンが読みやすいこと（REQ-5.2, REQ-5.4）。
3. 任意項目が未入力のログ（最大水深なし・写真0枚・サインなし・エリア名なし）でカードが崩れないこと（REQ-1.7）。
4. 長いダイビングポイント名・長いエリア名で折り返されること（REQ-1.9）。
5. カードのタップで詳細画面に遷移し、キーボードのTab移動とフォーカスリングが従来どおり効くこと（REQ-5.5）。
6. 詳細画面の見出し・サブタイトル・項目ラベルが一覧カードと同じ強弱で見えること（REQ-4.1, REQ-4.2）。

## 既知のトレードオフ・将来への布石

- 一覧カードが縦3段になるため、1画面あたりに表示できる件数は現行より減る。可読性を優先した意図的なトレードオフ。
- アイコンのSVGパスをコード内に直書きするため、デザイン変更時は `icons.tsx` の編集が必要になる（アイコン数が少ないうちは許容）。
- 本仕様で追加する `--text-muted` と `.view h1` は、レベル2（テーマカラー・フォント変更）で色とタイポグラフィを一括変更するための土台になる。レベル2・レベル3は本仕様の範囲外であり、着手時に別specとして起票する。
