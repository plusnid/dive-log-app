# 設計: UI仕上げ レベル2（テーマカラー・フォント・カードの写真プレビュー）

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [UI仕上げ レベル1設計](../ui-polish-level1/design.md) / [写真の添付設計](../photo-attachment/design.md) / [モバイル対応設計](../mobile-compatibility/design.md) / [オフライン・PWA設計](../offline-pwa/design.md) / [Google Drive同期設計](../google-drive-sync/design.md)

## 設計方針

- **原則として表示層のみの変更**。`src/types` / `src/db/db.ts`（Dexieスキーマ）/ `src/sync` / `src/platform` は変更しない（REQ-4.1, REQ-4.2）。例外はサムネイル取得のためにリポジトリへ**読み取り専用の関数を1本追加**する点のみ（REQ-3.13）。
- 配色・書体は [ui-polish-level1](../ui-polish-level1/design.md) が作った土台どおり **`src/index.css` のトークンに集中**させる。既存トークン名は変えず、値の変更＋必要最小限の追加で対応する（REQ-1.2）。
- 依存パッケージは追加しない（REQ-2.11, REQ-4.7）。画像縮小が必要になった場合も Canvas API で足りる。
- 一覧は現状 `useDiveLogs()`（`useLiveQuery` で全件取得）で、仮想スクロールは導入していない。**この構造は変えず**、写真の読み込みだけをカード単位で遅延させる。

## 変更対象ファイル

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/index.css` | 変更 | 配色トークンの値変更、`--on-accent` / `--danger` / フォントトークンの追加、`button[type='submit']` の `#fff` 解消 | REQ-1.x, REQ-2.2 |
| `src/App.css` | 変更 | `.form-error` のトークン化、見出しへの `--font-display` 適用 | REQ-1.9, REQ-2.1 |
| `src/components/PhotoPicker.css` | 変更 | `#ccc` / `#f0f0f0` / `#666` のトークン化 | REQ-1.13 |
| `src/components/SignaturePad.css` | 変更 | 枠線 `#ccc` のトークン化（**背景 `#fff` は維持**） | REQ-1.11, REQ-1.13 |
| `index.html` | 変更 | `theme-color` の値更新（ライト/ダーク併記） | REQ-1.12 |
| `vite.config.ts` | 変更 | `manifest.theme_color` / `background_color`、（自己ホストフォント採用時のみ）`workbox.globPatterns` に `woff2` 追加 | REQ-1.12, REQ-2.5 |
| `src/components/DiveLogListItem.tsx` / `.css` | 変更 | サムネイル領域の追加（テキスト列＋サムネイルの横並び） | REQ-3.1〜REQ-3.7 |
| `src/components/CardThumbnail.tsx` / `.css` | 新規 | 遅延読み込み付きサムネイル部品 | REQ-3.8〜REQ-3.10 |
| `src/db/diveLogRepository.ts` | 変更 | `getAttachmentBlob(id)` を追加（読み取りのみ） | REQ-3.13 |

`src/views/*` は変更不要の想定。

---

## 1. 配色（テーマカラー）

### 現行の配色トークン

`src/index.css`（[ui-polish-level1](../ui-polish-level1/design.md) 実装後の状態）:

| トークン | ライト | ダーク | 主な用途 |
| --- | --- | --- | --- |
| `--text` | `#1a1a1a` | `#e8e8e8` | 本文・データ本体 |
| `--text-muted` | `#6b6b6b` | `#9ba1a8` | ラベル・エリア名・サブタイトル |
| `--bg` | `#f7f7f5` | `#14161a` | ページ背景（`body`） |
| `--surface` | `#ffffff` | `#1f2228` | カード・入力欄・ボタンの面 |
| `--border` | `#dcdcdc` | `#34383f` | 枠線 |
| `--accent` | `#0b5b7a` | `#5fb4d8` | 送信ボタン背景／強調文字 |

ユーザーが「ダークグレー（#1F1F1F周辺）」と指摘したのは **ダークモードの `--surface: #1f2228` / `--bg: #14161a`**。したがって「深いネイビー化」の主対象はダークモードであり、ライトモードは REQ-1.5 のとおり**明るいまま青みを与える**方向で扱う。

### アクセントカラーの現在の適用箇所

コードベース全体を検索した結果、`--accent` の適用箇所は**2箇所だけ**である。

| 箇所 | 使い方 | 備考 |
| --- | --- | --- |
| `src/index.css` `button[type='submit']` | `background: var(--accent)` / `border-color: var(--accent)` / `color: #fff` | フォームの「保存」ボタン。文字色が `#fff` ハードコード（→ REQ-1.7 で `--on-accent` 化） |
| `src/App.css` `.dive-log-form__carry-over-notice` | `color: var(--accent)`（`--bg` の上の文字） | 同日引き継ぎ通知（[dive-log-crud REQ-7](../dive-log-crud/requirements.md)） |

加えて、アクセント色と同じ値がアプリ外に2箇所ある:

| 箇所 | 現行値 | 影響 |
| --- | --- | --- |
| `index.html` の `<meta name="theme-color">` | `#0b5b7a` | ブラウザのアドレスバー／Androidのステータスバー色 |
| `vite.config.ts` の `manifest.theme_color`（`background_color: '#ffffff'`） | `#0b5b7a` | スタンドアロン起動時のUI色・スプラッシュ背景（[offline-pwa/design.md](../offline-pwa/design.md) に記載あり。実装時に同ファイルの記述も更新すること） |

**存在しない適用先**（ユーザー提示の原文にある「選択中State」「フォーカスリング」）:

- 選択中Stateを持つUI（タブ・セグメントコントロール・選択中のリスト行）は現状のアプリに存在しない。ナビゲーション再構成とセグメントコントロール化は**レベル3**の範囲であり、そこでアクセントの適用先が増える。
- フォーカスリングは現在CSSで一切指定しておらず、ブラウザ既定の表示に委ねている（[ui-polish-level1 REQ-5.5](../ui-polish-level1/requirements.md) が「フォーカス表示を変更しない」としたため）。アクセント色でカスタムのフォーカスリングを描くことは可能だが、**濃紺背景で既定リングが見えにくくなる場合の対処**として必要になったときに検討する（[未確定事項](./requirements.md#未確定事項確認したい点)の対象外だが、実装時に実機確認する。→ [手動確認観点](#手動確認観点) 8）。

### 配色候補（3案）

コントラスト比はWCAG 2.1の相対輝度式で算出した実測値（本文テキストは4.5:1以上が要求、枠線などの非テキストは参考値）。

#### 案A（推奨）: ダークは深海ネイビー／ライトは白基調＋青み

| トークン | ライト | ダーク |
| --- | --- | --- |
| `--text` | `#12212F` | `#E8EEF5` |
| `--text-muted` | `#5A6B7C` | `#9FB0C4` |
| `--bg` | `#F2F6FA` | `#0A1A2F` |
| `--surface` | `#FFFFFF` | `#12263F` |
| `--border` | `#D3DEE8` | `#2C4A6B` |
| `--accent` | `#0B6E77`（ターコイズ暗） | `#4FD1C5`（ターコイズ明） |
| `--on-accent`（新規） | `#FFFFFF` | `#08243A` |
| `--danger`（新規） | `#B3261E` | `#FF9B93` |

コントラスト実測:

| 組み合わせ | ライト | ダーク | 判定 |
| --- | --- | --- | --- |
| `--text` / `--surface` | 15.06（対 `--bg`） | 13.08 | ✅ |
| `--text-muted` / `--surface` | 5.48 | 6.90 | ✅ 4.5以上 |
| `--text-muted` / `--bg` | 5.05 | 7.89 | ✅ |
| `--accent`（文字）/ `--bg` | 5.51 | 9.37 | ✅（引き継ぎ通知） |
| `--on-accent` / `--accent`（ボタン） | 5.98 | 8.51 | ✅ |
| `--danger` / `--bg` | 6.54 | 8.62 | ✅ |
| `--border` / `--surface`（参考） | 1.37 | 1.67 | 現行（1.37 / 1.35）と同等以上 |

- ダークの `--bg #0A1A2F` はユーザー提示の例示値そのもの。`--surface` はそれより一段明るいネイビー（`#12263F`）にして、カードが背景から浮くようにする（現行のダークも `--bg` < `--surface` の関係）。
- ライトは面を白のまま維持し、`--bg` をごく淡い青（`#F2F6FA`）にすることで「白すぎない」印象を作る。屋外・直射日光下での視認性（[mobile-compatibility](../mobile-compatibility/requirements.md) の利用シーン）を落とさない。

#### 案B: 両モードとも青を強めに

案Aから、ライトのみ `--bg: #E8EFF6` / `--surface: #FBFDFF` / `--text: #10202E` / `--text-muted: #55677A` に置き換える案（muted 5.71、text 14.28 でいずれも基準を満たす）。昼間も海の色を感じるが、写真サムネイルを載せたときに背景の青と写真の色が干渉しやすい。

#### 案C: 深海テーマに固定（常時ダーク）

`prefers-color-scheme` の分岐をやめ、ネイビー1本にする案。世界観は最も強いが [mobile-compatibility REQ-6.5](../mobile-compatibility/requirements.md)（OSのダークモード追従）と矛盾し、同要件の改訂が必要になるため**非推奨**。

### アクセントの系統（サンゴ / ターコイズ）

| 案 | ライト | ダーク | 評価 |
| --- | --- | --- | --- |
| **案ア（推奨）ターコイズ1色** | `#0B6E77` | `#4FD1C5` | 基調のネイビーと同系で落ち着く。明暗どちらでも4.5:1を満たす値が取りやすい |
| 案イ サンゴ1色 | `#C0442E` | `#FF8A75` | 白文字との比 5.11（ライト）、文字としての比 4.71（ライト）と**基準ぎりぎり**。ライトでは暗く濁った赤になり「サンゴ」の印象が薄れる |
| 案ウ ターコイズ＋サンゴ | `--accent #0B6E77` ＋ `--accent-warm #C0442E` | `--accent #4FD1C5` ＋ `--accent-warm #FF8A75` | 主要操作＝ターコイズ、強調（同日引き継ぎ通知など）＝サンゴ。トークンが1つ増え、使い分けルールが必要 |

いずれの案でも、**明るいアクセントに白文字は不可**（例: `#4FD1C5` に白は1.87）。そのため `--on-accent` を導入し、ライト＝白／ダーク＝濃紺とする（REQ-1.7）。

### 新規トークンと index.css の変更イメージ

```css
:root {
  --text: …;
  --text-muted: …;
  --bg: …;
  --surface: …;
  --border: …;
  --accent: …;
  --on-accent: #ffffff;   /* 新規: アクセント面上の文字色 */
  --danger: #b3261e;      /* 新規: エラーメッセージ */
  --font-body: …;         /* 新規: 本文用（後述） */
  --font-display: …;      /* 新規: 見出し用（後述） */
  color-scheme: light dark;
  font: 16px/1.5 var(--font-body);
}

@media (prefers-color-scheme: dark) { :root { /* 上記のダーク値 */ } }

button[type='submit'] {
  background: var(--accent);
  color: var(--on-accent);   /* #fff のハードコードを解消（REQ-1.7） */
  border-color: var(--accent);
}
```

### ハードコード色の掃除（REQ-1.13）

濃紺化すると、現在ライト前提でハードコードされている淡いグレーがダークモードで浮く・沈む。

| ファイル | 現行 | 変更後 | 理由 |
| --- | --- | --- | --- |
| `App.css` `.form-error` | `color: #b3261e` | `var(--danger)` | 濃紺 `#0A1A2F` 上で 2.67 と大幅に基準未達（REQ-1.9） |
| `PhotoPicker.css` `.photo-picker__thumb img` | `border: 1px solid #ccc` | `var(--border)` | ダークで浮く |
| `PhotoPicker.css` `.photo-picker__placeholder` | `border: 1px dashed #ccc` / `background: #f0f0f0` / `color: #666` | `var(--border)` / `var(--surface)` または `var(--bg)` / `var(--text-muted)` | ダークで白い箱＋淡色文字になり判読不能 |
| `SignaturePad.css` `.signature-pad__canvas` / `__preview` | `border: 1px solid #ccc` / `background: #fff` | 枠線のみ `var(--border)`。**背景 `#fff` は維持** | サイン描画は白背景前提（REQ-1.11、[mobile-compatibility REQ-6.5](../mobile-compatibility/requirements.md) の除外） |
| `App.css` `.detail-signature` | `background: #fff` | 変更しない | 同上 |
| `PastValuePicker.css` `box-shadow: 0 4px 12px rgb(0 0 0 / 0.15)` | そのまま | 変更しない（ダークでは影がほぼ見えないが、枠線で判別可能） | 影響小 |

### ブラウザUI・PWAテーマ色（REQ-1.12）

```html
<!-- index.html -->
<meta name="theme-color" media="(prefers-color-scheme: light)" content="<ライトの基調色>" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0A1A2F" />
```

- `media` 付き `theme-color` は iOS Safari 15+ / Chrome 93+ で対応。非対応環境では最初の1つが使われるため、**フォールバックとして `media` なしの1行を先に置く**。
- `vite.config.ts` の `manifest.theme_color` は単一値しか持てないため、基調色（濃紺 `#0A1A2F` またはアクセント）のどちらにするかは[未確定事項 6](./requirements.md#未確定事項確認したい点)。`background_color`（スプラッシュ）を白のままにするか濃紺にするかも同様。
- 変更後は [offline-pwa/design.md](../offline-pwa/design.md) の「Service Worker / Manifest」節に書かれた `theme_color: '#0b5b7a'` / `background_color: '#ffffff'` の記述も更新する。

---

## 2. タイポグラフィ（フォント）

### 現行

`src/index.css` の `:root` に `font: 16px/1.5 system-ui, 'Segoe UI', Roboto, sans-serif;` のみ。見出し（`.view h1`）はサイズと太さだけで差をつけている（[ui-polish-level1](../ui-polish-level1/design.md)）。日本語グリフは `system-ui` のフォールバック任せ（iOS: ヒラギノ角ゴ、Android: Noto Sans CJK、Windows: Yu Gothic UI）。

### フォント方式の比較

| 方式 | 追加DL量 | 印象の変化 | 判定 |
| --- | --- | --- | --- |
| **システムフォントスタックの明示＋見出し書式の調整**（採用） | 0 バイト | 中（太さ・字間・数字書式で差をつける） | **採用**。オフライン要件（REQ-2.3, REQ-2.4）に無条件で適合し、依存もビルド変更も不要 |
| 欧文のみ自己ホスト（Archivo / Oswald 等） | 20〜60KB | 小 | 不採用。タイトル「ダイビングログ」もポイント名も日本語であり、欧文書体は日付・数値にしか効かない（費用対効果が低い） |
| 日本語フォントを丸ごと自己ホスト（Zen Maru Gothic 等） | Regular+Bold で **2〜5MB** | 大 | 条件付き。初回DLとService Workerのプリキャッシュが数MB増える。[未確定事項 3](./requirements.md#未確定事項確認したい点) でユーザー判断 |
| 日本語フォントをサブセット化して自己ホスト | 200KB〜1MB | 大 | 条件付き。サブセット生成ツール（`subset-font` / fonttools 等）のビルド時依存が必要で REQ-2.11 に抵触。動的な文字（ポイント名・メモ）に未収録文字が出るとフォールバックが混ざる |
| Google Fonts 等のCDN読み込み | - | - | **不可**。[概要 NFR-1-b](../00-overview.md)（同期無効時は外部リクエストを一切発生させない）とオフライン要件に反する |

### 採用案（システムスタック＋書式調整）

```css
:root {
  --font-body: system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Noto Sans JP',
    'Yu Gothic UI', Meiryo, sans-serif;
  --font-display: var(--font-body);
  font: 16px/1.5 var(--font-body);
}
```

見出し・数値に与える差:

| 対象 | 指定 | 意図 |
| --- | --- | --- |
| `.view h1`（アプリタイトル・詳細のポイント名） | `font-family: var(--font-display)` / `font-weight: 700` / `letter-spacing: 0.04em` | 字間を広げると日本語見出しは「静かで海っぽい」印象になる（REQ-2.1） |
| `.dive-log-list-item__site` | `font-family: var(--font-display)` / `letter-spacing: 0.02em` | 一覧と詳細の見出しを揃える（[ui-polish-level1 REQ-4.1](../ui-polish-level1/requirements.md)） |
| `.dive-log-list-item__date` / `__meta-value` / 詳細の `dd` | `font-variant-numeric: tabular-nums` | 数字の幅が揃い、縦に並ぶ日付・水深が読みやすくなる |

- `--font-display` を**別トークンにしておく**ことで、後から自己ホスト書体を採用する場合の変更点が `@font-face` 1つとこのトークンだけになる。
- 字間を広げるのは**見出しのみ**。本文・入力欄には適用しない（REQ-2.10、iOS自動ズーム課題に触れない）。

### 自己ホストを選ぶ場合の手順（実装時の参考。本specでは実施しない）

1. SIL OFLのフォント（**Zen Maru Gothic** / **M PLUS Rounded 1c** / **Kiwi Maru** / **M PLUS 2** など）を入手し、`woff2` を `src/assets/fonts/` に配置する。ライセンス条文（`OFL.txt`）を同ディレクトリに含める（REQ-2.6）。
2. `src/index.css` に `@font-face { font-family: 'Zen Maru Gothic'; src: url(./assets/fonts/xxx.woff2) format('woff2'); font-weight: 700; font-display: swap; }` を追加し、`--font-display` の先頭に指定する。
3. `vite.config.ts` の `workbox.globPatterns` を `['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}']` に変更する（**現行はフォント拡張子を含まないため、オフライン初回表示でフォントが取得できない**）（REQ-2.5）。
4. ウェイトは**見出しに使う1ウェイトのみ**に絞る（Regular と Bold の両方を積まない）。

---

## 3. 一覧カードの写真サムネイル

### 現状の写真の持ち方（調査結果）

- 写真は `attachments` テーブル（`++id, type, &uuid`）に `Attachment { blob: Blob, mimeType, type: 'photo' | 'signature' }` として保存され、`DiveLog.photoIds: number[]` が参照する（[photo-attachment/design.md](../photo-attachment/design.md)）。
- **保存時の圧縮・リサイズは行っていない**（選択したファイルをそのまま `Blob` 保存）。スマートフォンのカメラロール由来なら1枚 2〜8MB・4000px級が普通。枚数上限もない。
- 一覧は `useDiveLogs()` → `db.diveLogs.orderBy('date').reverse().toArray()`。**添付は取得していない**（`DiveLog` に blob は含まれない）ので、現状の一覧は件数が増えても軽い。
- 詳細画面だけが `getDiveLogDetail` で `attachments.bulkGet(photoIds)` し、`URL.createObjectURL` → アンマウントで `revokeObjectURL` している。
- 一覧に仮想スクロールは無い（`<ul>` に全件 `map`）。**全カードが常にマウントされている**点が、サムネイル設計上の最大の制約。

### サムネイル方式の比較

| 方式 | 実装 | メモリ/CPU | スキーマ・同期への影響 | 判定 |
| --- | --- | --- | --- | --- |
| 一覧のクエリで写真も一緒に取る（`useLiveQuery` で join） | 最小 | **不可**。全ログ分の原本Blobが常時メモリに載る（100件×3MB＝300MB級） | なし | **不採用** |
| **方式1: 原本Blobをカード単位で遅延読み込みして `<img>` に表示** | 小 | 表示に近づいたカードのみ blob 保持。デコードは原本解像度で行われるため端末依存 | なし | **採用（第一段階）** |
| 方式2: 読み込み時にCanvasで縮小し、小さいBlobだけをメモリキャッシュ（原本は即解放） | 中 | 定常メモリは小（64px相当）。初回のみデコード＋描画コスト | なし | 方式1で問題が出た場合に移行 |
| 方式3: 保存時にサムネイルを生成してIndexedDBへ永続化 | 大 | 最良 | Dexie **version 3** の追加、既存写真のバックフィル、[同期](../google-drive-sync/design.md)の対象・`schemaVersion` の見直し（REQ-4.2の改訂） | 今回は不採用（[未確定事項 4](./requirements.md#未確定事項確認したい点)） |

**方式1→方式2への移行判断基準**（実機確認で1つでも該当したら方式2へ）:

- 一覧を高速スクロールしたときにフレーム落ち・白抜けが目に見える。
- iOS Safari（スタンドアロン起動含む）で写真付きログ50件以上の一覧を往復スクロールしてタブが再読込・強制終了する。
- Chrome DevTools の Memory で、一覧表示中のJSヒープ＋Blob保持量が数百MB規模になる。

### 方式1の実装スケッチ

#### リポジトリ（`src/db/diveLogRepository.ts`）

```ts
/** 一覧カードのサムネイル表示用に、添付1件のBlobだけを取得する（REQ-3.13）。 */
export async function getAttachmentBlob(id: number): Promise<Blob | undefined> {
  return (await db.attachments.get(id))?.blob
}
```

- 既存関数（`getDiveLogDetail` 等）は変更しない。書き込み系にも触れないため `notifyLocalChange()` とは無関係。

#### コンポーネント（`src/components/CardThumbnail.tsx`、新規）

```tsx
interface CardThumbnailProps {
  photoId: number
}
```

責務:

1. ルート要素を `IntersectionObserver`（`rootMargin: '200px'`）で監視し、**ビューポートに近づいたら**初めて `getAttachmentBlob` を呼ぶ（REQ-3.8, REQ-3.9）。読み込み開始後は `disconnect()` する。
2. 取得した Blob を `URL.createObjectURL` し、`useEffect` のクリーンアップで必ず `URL.revokeObjectURL`（REQ-3.10）。取得中にアンマウント／`photoId` が変わった場合は結果を破棄する（`cancelled` フラグ）。
3. `<img alt="" decoding="async" />` で描画。`alt=""` によりカードボタンのアクセシブル名を変えない（REQ-3.6）。
4. 読み込み前・取得失敗・`onError`（HEIC等の非対応形式、[mobile-compatibility REQ-4.5](../mobile-compatibility/requirements.md)）のときは、**同じ寸法のプレースホルダー**（`--bg` の面に `icons.tsx` の `PhotoIcon` を `--text-muted` で表示）を出す。領域の大きさが変わらないためレイアウトが崩れない（REQ-3.5）。
5. `IntersectionObserver` が使えない環境（機能検出、[mobile-compatibility REQ-1.3](../mobile-compatibility/requirements.md)）では、監視をせず即座に読み込む。

保持ポリシー: いったん読み込んだサムネイルは、カードがアンマウントされるまで保持する（画面外に出るたびに解放・再取得すると往復スクロールでちらつくため）。長大なリストで問題が出た場合の対策は方式2への移行、または解放ポリシーの追加（LRU）とする。

#### 一覧カード（`src/components/DiveLogListItem.tsx`）

[ui-polish-level1](../ui-polish-level1/design.md) の縦3段構成を**テキスト列としてまとめ**、その右にサムネイルを置く。

```
┌──────────────────────────────────┐
│ 2026-08-09                 ┌──────┐│
│ 城ヶ島・岩骨                │ 写真 ││ ← 64×64（角丸・cover）
│ 〰 最大水深 20m ◷ 45分 📷 3枚 └──────┘│
└──────────────────────────────────┘
```

```tsx
<button type="button" className="dive-log-list-item__button" onClick={…}>
  <div className="dive-log-list-item__body">
    {/* 既存の日付・サイト名・メタ行をそのまま移動 */}
  </div>
  {diveLog.photoIds.length > 0 && <CardThumbnail photoId={diveLog.photoIds[0]} />}
</button>
```

- 追加するのは `__body` ラッパーとサムネイルのみ。**表示する情報の種類・順序・条件は変えない**（[ui-polish-level1 REQ-1.7](../ui-polish-level1/requirements.md)、REQ-4.3）。
- サムネイルはDOM上テキストの**後ろ**に置き、`alt=""` とするため読み上げ順に影響しない（REQ-3.6）。
- サムネイルは `<button>` の内側にあるため、タップすれば従来どおり詳細へ遷移する。入れ子のボタン・リンクは作らない（REQ-3.7）。
- `photoIds[0]` は挿入順（[photo-attachment/design.md](../photo-attachment/design.md) の `concat` 順）で決まる。代表写真の選択機能は作らない（REQ-3.2）。
- 写真が0枚のログではサムネイル要素自体を出さず、テキスト列が全幅に広がる（REQ-3.4）。

#### CSS（`DiveLogListItem.css` / `CardThumbnail.css`）

| セレクタ | 指定 | 意図 |
| --- | --- | --- |
| `.dive-log-list-item__button` | `flex-direction: row` / `align-items: flex-start` / `gap: 0.75rem`（`padding: 1rem` は維持） | テキスト列とサムネイルの横並び |
| `.dive-log-list-item__body` | `flex: 1` / `min-width: 0` / `display: flex` / `flex-direction: column` / `gap: 0.5rem` | 従来の縦3段。`min-width: 0` が無いと長いポイント名でサムネイルが押し出される（REQ-4.4） |
| `.card-thumbnail` | `flex: 0 0 auto` / `width: 64px` / `height: 64px` / `border-radius: 8px` / `overflow: hidden` / `background: var(--bg)` / `border: 1px solid var(--border)` / `display: grid` / `place-items: center` | 固定寸法でレイアウトを安定させる（REQ-3.3） |
| `.card-thumbnail img` | `width: 100%` / `height: 100%` / `object-fit: cover` / `display: block` | 縦横比に依存せず正方形にトリミング（REQ-3.3） |
| `.card-thumbnail__placeholder` | `color: var(--text-muted)` / `font-size: 1.5rem` | 未読込・失敗時のアイコン表示（REQ-3.5） |

- 幅320pxの端末でも、テキスト列は `padding 1rem×2 + 64px + gap 0.75rem` を差し引いた約210pxを確保できる（REQ-4.4）。メタ行は既存どおり折り返す。
- カード高は「テキスト3段（約96px）」が支配的で、64pxのサムネイルはそれを超えない。タップ領域は44px以上を維持（REQ-4.5）。

### リアルタイム反映（REQ-3.14）

`useDiveLogs()` の `useLiveQuery` は `diveLogs` テーブルの変更を購読している。写真の追加・削除は必ず `photoIds` の更新を伴う（[photo-attachment/design.md](../photo-attachment/design.md) の更新フロー）ため、`photoIds[0]` が変われば `CardThumbnail` の `photoId` prop が変わり、`useEffect` が再実行されてサムネイルが差し替わる。`attachments` テーブル単体の購読は不要。

---

## 影響しない箇所

- データモデル（`src/types/diveLog.ts`）、Dexieスキーマ（`src/db/db.ts`）、書き込み系リポジトリ関数、`src/sync/`、`src/platform/`: 変更なし（REQ-4.1, REQ-4.2）。同期の `schemaVersion` も据え置き。
- 画面遷移（`src/App.tsx`）、`useDiveLogs` のクエリ、空状態メッセージ、フォームの入力項目: 変更なし。
- 詳細画面の写真表示（`.detail-photos`）: レイアウト・読み込み方法とも変更なし（枠線色がトークン経由で変わるのみ）。
- ただし配色トークンとフォントトークンは全画面に効くため、フォーム画面・同期設定画面・インストール案内の見た目も連動して変わる（意図した効果）。

## 手動確認観点

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。

1. ライト／ダークをOS設定で切り替え、一覧・詳細・フォーム・同期設定・インストール案内のすべてで文字が読めること（REQ-1.3, REQ-1.8）。
2. 送信ボタン（保存）・同日引き継ぎ通知・エラーメッセージが、両モードで判読できること（REQ-1.7, REQ-1.9）。
3. サイン描画キャンバスとサイン画像が白背景のままで、描いた線が見えること（REQ-1.11）。
4. 写真ピッカーのサムネイル枠・「プレビューできない画像」プレースホルダーがダークモードで浮かないこと（REQ-1.13）。
5. ホーム画面から起動したときのステータスバー色・スプラッシュが不自然でないこと（REQ-1.12、iOS/Android両方）。
6. 機内モードでリロードしても、書体・配色・サムネイルが同一に表示されること（REQ-2.4, REQ-3.12）。
7. 見出しの字間調整後、日本語＋英数字混在（長いポイント名、`2026-08-09`、`20m`）で文字欠け・重なりがないこと（REQ-2.9）。
8. キーボードのTab移動で、濃紺背景でもフォーカス位置が判別できること（REQ-4.6）。判別しにくい場合はアクセント色のフォーカスリング追加を検討する。
9. 写真0枚／1枚／10枚のログ、HEIC等の表示できない画像を含むログが混在した一覧で、カードの高さと配置が崩れないこと（REQ-3.4, REQ-3.5）。
10. 写真付きログ50件以上の一覧を上下に往復スクロールし、引っかかり・タブの強制終了が起きないこと（REQ-3.11、iOS Safari／Android Chrome の実機）。
11. 一覧が表示された直後、写真の読み込み完了前でも日付・ポイント名・メタ行が読めること（REQ-3.8）。
12. 編集画面で写真を追加・削除して保存したあと、一覧に戻らずともサムネイルが更新されること（REQ-3.14）。
13. 画面幅320px／375px／640pxで横スクロールが出ないこと（REQ-4.4）。

## 既知のトレードオフ・将来への布石

- 原本Blobをそのまま表示する方式1は、**端末のメモリ・デコード性能に依存する**。写真の保存時リサイズ（[未確定事項 7](./requirements.md#未確定事項確認したい点)）または方式3のサムネイル永続化を将来入れれば、この不確実性は根本的に解消する。
- `--on-accent` / `--danger` / `--font-display` の追加は、レベル3（FAB・ナビゲーション・セグメントコントロール）でアクセントの適用先が増えたときにそのまま使える。レベル3ではフォーカスリングと選択中Stateの配色を、本仕様のアクセントトークンの上に定義する。
- 配色を変えるとスクリーンショットを含むドキュメント（`docs/` 等）との齟齬が生じうるが、現状スクリーンショットは同梱していないため影響しない。
- 案C（常時ダーク固定）を後から選ぶ場合、本仕様のトークン構成のままメディアクエリを削除するだけで移行できる（ただし [mobile-compatibility REQ-6.5](../mobile-compatibility/requirements.md) の改訂が必要）。
