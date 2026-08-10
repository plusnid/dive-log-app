# 設計: UI仕上げ レベル3（FAB・ナビゲーション再構成・入力方法の最適化）

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [UI仕上げ レベル1設計](../ui-polish-level1/design.md) / [UI仕上げ レベル2設計](../ui-polish-level2/design.md) / [ダイビングログCRUD設計](../dive-log-crud/design.md) / [モバイル対応設計](../mobile-compatibility/design.md) / [Google Drive同期設計](../google-drive-sync/design.md)

## 設計方針

- **表示層と画面内インタラクションのみの変更**。`src/types/diveLog.ts` の `Weather` 型、`src/db`、`src/sync`、`src/platform` は変更しない（REQ-5.1）。天候の保存値は現行のまま。
- 画面遷移は `src/App.tsx` の `Route` 判別共用体 + `useState` を維持する（REQ-2.15）。FAB・メニューは**一覧画面（`DiveLogListView`）の内側**に閉じ込め、`App.tsx` は変更しない。ルーティングライブラリもUIライブラリも入れない（REQ-1.14, REQ-5.8）。
- 配色は [ui-polish-level2](../ui-polish-level2/design.md) が導入する `--accent` / `--on-accent` / `--danger` トークンをそのまま使う。**レベル3では新しい色トークンを追加しない**（必要になるのは影の濃さ程度で、これは `rgb(0 0 0 / …)` の直接指定で足りる）。
- アイコンは `src/components/icons.tsx` に追記する（[ui-polish-level1](../ui-polish-level1/design.md) の共通属性セットを流用）。
- メニューに追加する「インストール案内の再表示」（REQ-2.16〜REQ-2.24）は、既存の `InstallGuide` の**自己完結性を壊さない**範囲で行う。案内の表示条件・文言・「閉じた」記憶の保存先はそのままにし、外から「もう一度表示して」と伝える口だけを増やす（→ [2-5](#2-5-インストール案内の再表示)）。あわせて [mobile-compatibility REQ-2.3](../mobile-compatibility/requirements.md) に例外を追記済み。
- 新規のインタラクティブ要素（FAB・メニュー・セグメント）は、**可能な限りネイティブ要素の意味論に寄せる**。メニューは開閉ボタン＋パネル（disclosure）、天候は `fieldset` + `input[type=radio]`。自前のキーボード制御（ロービングtabindex等）を書かずに済み、支援技術対応の穴が生まれにくい。

## 変更対象ファイル

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/components/icons.tsx` | 変更 | `PlusIcon` / `MenuIcon` / `SunIcon` / `CloudIcon` / `RainIcon` / `WeatherOtherIcon` を追加 | REQ-4.1〜REQ-4.4 |
| `src/components/Fab.tsx` / `.css` | 新規 | 右下固定の円形ボタン | REQ-1.1〜REQ-1.14 |
| `src/components/AppMenu.tsx` / `.css` | 新規 | ヘッダーのメニューボタン＋パネル（開閉・Esc・外側タップ）、「設定」と「ホーム画面に追加の案内」の2項目 | REQ-2.1〜REQ-2.10, REQ-2.16〜REQ-2.18 |
| `src/components/WeatherSelect.tsx` / `.css` | 新規 | 天候のセグメントコントロール | REQ-3.1〜REQ-3.14 |
| `src/types/weatherOptions.ts` | 新規 | `weatherOptions` 配列と `weatherLabel()`（フォーム・詳細画面で共用） | REQ-3.2, REQ-3.9 |
| `src/components/InstallGuide.tsx` | 変更 | 任意prop `reopenSignal` を追加し、値が変化したら「閉じた」記憶を消して再表示する。表示内容・文言・自動表示条件は変更しない | REQ-2.18, REQ-2.20〜REQ-2.24, REQ-5.10 |
| `src/views/DiveLogListView.tsx` | 変更 | ヘッダーのボタン2つを `AppMenu` に置換、`Fab` を追加、空状態の文言、下部余白クラス、インストール案内の再表示シグナル（`installGuideSignal`）の保持 | REQ-1.2, REQ-1.12, REQ-2.1, REQ-2.18, REQ-2.19 |
| `src/views/DiveLogFormView.tsx` | 変更 | 天候の `<select>` を `WeatherSelect` に置換 | REQ-3.1, REQ-3.13 |
| `src/views/DiveLogDetailView.tsx` | 変更 | ローカルの `weatherLabel` マップを `types/weatherOptions.ts` の関数に置換（未知値は `-`） | REQ-3.9 |
| `src/views/SyncSettingsView.tsx` | 変更 | セクション構成の整理（→ [2-4](#2-4-設定画面の構成データ管理)） | REQ-2.11 |
| `src/App.css` | 変更 | 一覧画面の下部余白、`.view__header` の調整 | REQ-1.9 |

`src/App.tsx` は変更なしの想定。`src/db/*` / `src/sync/*` / `src/platform/*` / `src/types/diveLog.ts` も変更なし（`src/platform/environment.ts` の `isStandalone()` は `AppMenu` から**参照するだけ**で、実装は変更しない）。`src/hooks/useInstallPrompt.ts` も変更しない（→ [2-5](#2-5-インストール案内の再表示)）。

---

## 1. フローティングアクションボタン（FAB）

### 1-1. 現状（調査結果）

`src/views/DiveLogListView.tsx` のヘッダーには現在、`view__header` > `view__actions` の中に設定ボタンと「+ 新規記録」ボタンが横並びで置かれている（1-3 の新マークアップで `AppMenu` / `Fab` に置き換える）。

`App.tsx` から渡る props は `onSelectDive` / `onNewDive` / `onOpenSettings` の3つで、**本仕様では props を変更しない**（呼び出し元＝ `App.tsx` を触らずに済む）。`src/index.css` の `#root` は `max-width: 640px` の中央寄せで `padding` に `env(safe-area-inset-*)` を加算済み（[mobile-compatibility](../mobile-compatibility/design.md)、`min-height: 100svh`）。共通の `button` スタイル（`min-height`/`min-width: 44px` / `padding: 0.5rem 0.9rem` / `border-radius: 6px` / `background: var(--surface)`）はFABが上書きする。一覧画面の先頭には `InstallGuide`（未インストール時のみ）が入るが、FABは固定配置のため干渉しない。

### 1-2. 配置方式

`position: fixed` の円形ボタンを採用（REQ-1.3、既存レイアウトに手を入れずに済む）。`position: sticky` でリスト末尾に置く案は、一覧が短いときや空状態（REQ-1.12）で画面下部に来ないため不採用。ヘッダーに「+ 新規記録」を残す案は、片手・親指で届く位置に主要操作を移すというレベル3の主旨を満たさないため不採用。

### 1-3. コンポーネント

```tsx
// src/components/Fab.tsx
interface FabProps {
  label: string        // アクセシブルな名前（例: '新規記録'）
  onClick: () => void
}
```

- `<button type="button" className="fab" aria-label={label} onClick={onClick}><PlusIcon /></button>`（REQ-1.7）。
- 表示は `PlusIcon` のみ。`PlusIcon` は `aria-hidden="true"` なので、読み上げ名は `aria-label` だけになる（REQ-4.4）。
- `title` 属性は付けない（タッチ環境では表示されず、[ui-polish-level1](../ui-polish-level1/design.md) で `title` を外した方針と揃える）。
- 一覧画面でのみレンダリングするため、`route.view !== 'list'` のときは存在しない（REQ-1.11）。

`DiveLogListView` 側:

```tsx
<div className="view view--list">
  <InstallGuide reopenSignal={installGuideSignal} />   {/* → 2-5 */}
  <div className="view__header">
    <h1>ダイビングログ</h1>
    <AppMenu onOpenSettings={onOpenSettings} onShowInstallGuide={handleShowInstallGuide} />
  </div>
  … 一覧または空状態 …
  <Fab label="新規記録" onClick={onNewDive} />
</div>
```

- 空状態の文言は「まだ記録がありません。」＋新しい導線の案内に更新する（REQ-1.12）。例: **「まだ記録がありません。右下の＋ボタンから追加しましょう。」**（[dive-log-crud REQ-1.2](../dive-log-crud/requirements.md) の趣旨は維持）。
- `Fab` はDOM上の**最後**に置く。読み上げ順で一覧の後に来るのが自然で、Tab順も「メニュー → 一覧の各カード → FAB」になる。

### 1-4. CSS

```css
.fab {
  position: fixed;
  z-index: 20;
  right: max(1rem + env(safe-area-inset-right), calc(50% - 320px + 1rem));
  bottom: calc(1rem + env(safe-area-inset-bottom));
  width: 56px;
  height: 56px;
  min-width: 0;          /* 共通 button の min-width:44px を上書き */
  min-height: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 1.75rem;    /* アイコンの width/height: 1em に効く */
  display: grid;
  place-items: center;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
}
```

| 指定 | 意図 / 関連要件 |
| --- | --- |
| `position: fixed` + `z-index: 20` | スクロール追従なし（REQ-1.3）。`PastValuePicker` のパネル（`z-index: 10`、フォーム画面のみ）より前面だが、両者は別画面のため競合しない |
| `bottom: calc(1rem + env(safe-area-inset-bottom))` | ホームインジケーターとの重なり回避（REQ-1.8）。`#root` の `padding-bottom` とは別に、FABは `fixed` なので自前でセーフエリアを足す必要がある |
| `right: max(1rem + env(safe-area-inset-right), calc(50% - 320px + 1rem))` | 幅640px以下ではビューポート右端から1rem、それより広い画面ではコンテンツ列（最大640px＝半幅320px）の右端に揃う（REQ-1.13、[未確定事項 7](./requirements.md#未確定事項確認したい点)）。`max()` は iOS 16.4 / Chrome いずれも対応済み |
| `width/height: 56px` | Material のFAB標準寸法。44×44（[mobile-compatibility REQ-6.3](../mobile-compatibility/requirements.md)）を上回る（REQ-1.6） |
| `background: var(--accent)` / `color: var(--on-accent)` | [ui-polish-level2](../ui-polish-level2/design.md) のトークン。コントラストはライト5.98 / ダーク8.51で3:1以上（REQ-1.5, REQ-5.5） |
| `box-shadow` | 一覧カードの上に浮いていることを示す。ダークモードでは影が見えにくいため、`--surface` と `--accent` の明度差で判別する（アクセントは常に背景と十分な差がある） |

一覧側の下部余白（REQ-1.9）:

```css
/* App.css */
.view--list {
  padding-bottom: 5rem;   /* FAB 56px + 上下マージン分。最後のカードが隠れないようにする */
}
```

- `#root` の `padding-bottom` にはセーフエリアが加算済みのため、`.view--list` 側は固定値でよい。
- 一覧が空（0件）のときも同じ余白が付くが、視覚的な破綻はない。

### 1-5. 検討したが採らなかった点

- **FABを全画面共通にする**（`App.tsx` で描画し、`route.view === 'list'` のときだけ表示）: 表示条件の分岐が `App.tsx` に漏れるだけで利点がない。将来「詳細画面から編集をFAB化」する場合に再検討する。
- **`InstallGuide` 表示中はFABを下げる**: `InstallGuide` は画面上部の通常フローにあるため干渉しない。
- **FABにラベル文字（拡張FAB）を出す**: 幅320pxでの占有面積が増え、一覧の情報量を削るため見送る。

---

## 2. ナビゲーションの再構成

### 2-1. 現状（調査結果）

遷移先は `Route = { view: 'list' } | { view: 'form'; id? } | { view: 'detail'; id } | { view: 'settings' }` の4つ。**一覧画面から明示的に開ける画面は「設定」だけ**（フォーム・詳細はログに紐づく操作から開く）。`SyncSettingsView` の中身は次の2セクションのみ: (1) `Google Drive 同期`（`isSyncConfigured()` が `false`＝`VITE_GOOGLE_CLIENT_ID` 未設定のビルドでは**セクションごと非表示**。[google-drive-sync REQ-1.9](../google-drive-sync/requirements.md)）、(2) `ストレージの状態`（永続化の可否・使用量の目安。[mobile-compatibility REQ-3.4](../mobile-compatibility/requirements.md)）。**JSON/CSVのエクスポート・インポート機能はコードベースに存在しない**（`src/` 全体を検索して、ファイル出力・ファイル読み込みの実装は写真添付の `input[type=file]` のみ）。[概要の既知の制約](../00-overview.md)の記述と一致する。

したがって原文の「データ管理機能をまとめる」は、**現時点では「同期」と「ストレージの状態」を指す**。エクスポート／インポートの新規実装は本仕様の対象外とする（REQ-2.12、[未確定事項 2](./requirements.md#未確定事項確認したい点)）。

### 2-2. ナビゲーション方式

ヘッダー右のハンバーガーボタン＋パネル（案A）を採用。FABと干渉せず（画面上部）、項目追加も容易。次点は歯車アイコンボタンのみ（案B、原文の「メニューにまとめる」から外れる）。下部タブバー（案C）はFABをタブバーの上へ押し上げる必要があり干渉するうえ、現状2項目にはタブは過剰なため不採用。

以下は案Aを前提に設計する。案Bを採る場合は `AppMenu` を単純なアイコンボタンに縮約すればよく、`DiveLogListView` 側の構造は変わらない。

### 2-3. メニューの実装（案A）

```tsx
// src/components/AppMenu.tsx
interface AppMenuProps {
  onOpenSettings: () => void
  /** インストール案内の再表示（REQ-2.16〜REQ-2.19） */
  onShowInstallGuide: () => void
}
```

マークアップ（**disclosure パターン**。`role="menu"` は使わない）:

```tsx
<div className="app-menu" ref={containerRef}>
  <button
    type="button"
    ref={triggerRef}
    className="app-menu__trigger"
    aria-label="メニュー"
    aria-expanded={open}
    aria-controls="app-menu-panel"
    onClick={() => setOpen((prev) => !prev)}
  >
    <MenuIcon />
  </button>
  {open && (
    <div id="app-menu-panel" className="app-menu__panel">
      <button type="button" className="app-menu__item" onClick={() => { setOpen(false); onOpenSettings() }}>
        設定
      </button>
      {!isStandalone() && (
        <button
          type="button"
          className="app-menu__item"
          onClick={() => { setOpen(false); onShowInstallGuide() }}
        >
          ホーム画面に追加の案内
        </button>
      )}
    </div>
  )}
</div>
```

- **`role="menu"` / `role="menuitem"` を使わない理由**: これらはロービングtabindex等のアプリケーションメニュー仕様一式の実装を前提とする。ここでの用途は「画面遷移リンクの集合」であり、WAI-ARIA Authoring Practices もこの用途には disclosure（開閉ボタン＋通常のボタン/リンク並び）を推奨する。Tab移動が素直に効き実装量も少ない（REQ-2.7 は「フォーカスを閉じ込める」ではなく「外へ出たら閉じる」方式）。
- **開閉状態の伝達**: `aria-expanded`（REQ-2.4）と `aria-controls`。閉じているときはパネルをDOMから外す（条件付きレンダリング。`PastValuePicker` と同じ流儀）。
- **閉じ方3種**: (1) Escキー — パネルが開いている間だけ `keydown` を購読し、`Escape` で `setOpen(false)` して `triggerRef.current?.focus()`（REQ-2.5）。(2) 外側タップ — 開いている間だけ `document` の `pointerdown` を購読し、`containerRef.current?.contains(event.target)` が偽なら閉じる（REQ-2.6）。`click` ではなく `pointerdown` なのは iOS Safari で `click` が発火しないケース（非インタラクティブ要素）を避けるため。(3) フォーカスアウト — `containerRef` に `onFocusOut`（`onBlur` がバブル）を張り、`relatedTarget` がコンテナ外なら閉じる（REQ-2.7）。いずれもフォーカス移動先が別要素にあるため、フォーカスが失われることはない。
- **フォーカス管理**: 開いた直後は最初の項目へ移す（`useEffect` で `panelRef.current?.querySelector('button')?.focus()`）。「設定」選択時は閉じてから遷移する（REQ-2.8。`onOpenSettings()` で画面全体が入れ替わり `AppMenu` はアンマウントされる）。画面遷移を伴わない「ホーム画面に追加の案内」は選択後も `AppMenu` が一覧画面に残るため、パネルがDOMから外れる前にフォーカスが `body` へ落ちないよう（REQ-2.7が禁じる状態）**閉じるときは常に `triggerRef.current?.focus()` でメニューボタンへ戻す**。Esc・外側タップ・項目選択のいずれも共通の `close()` 関数を通す設計にする。
- **スタンドアロン起動時の項目非表示**: `isStandalone()`（`src/platform/environment.ts`、機能検出ベース。REQ-5.7）が真のときは「ホーム画面に追加の案内」を描画しない（REQ-2.17。判定はパネルのレンダリング時に都度行い、状態には保持しない）。**無効化（`disabled`）ではなく非表示**とするのは、押せない項目より意味のある項目だけを見せるほうが分かりやすいため。結果、スタンドアロン起動時のメニュー項目は「設定」1つになる。

モーダルなドロワー（画面左からスライド、フォーカストラップ＋背景の `inert` ＋オーバーレイクリックで閉じるが必要）は不採用。非モーダルの disclosure を採用（[未確定事項 3](./requirements.md#未確定事項確認したい点)で確定）。

CSS:

| セレクタ | 指定 | 意図 |
| --- | --- | --- |
| `.app-menu` | `position: relative` | パネルの位置基準 |
| `.app-menu__trigger` | `min-width: 44px` / `min-height: 44px` / `padding: 0.5rem` / `font-size: 1.25rem` | タップ領域（REQ-2.9）。アイコンは `1em` 追従 |
| `.app-menu__panel` | `position: absolute` / `top: 100%` / `right: 0` / `z-index: 30` / `background: var(--surface)` / `border: 1px solid var(--border)` / `border-radius: 8px` / `box-shadow: 0 4px 12px rgb(0 0 0 / 0.2)` / `min-width: 12rem` | ヘッダー直下に右寄せで開く。FAB（`z-index: 20`）より前面（REQ-2.10） |
| `.app-menu__item` | `display: block` / `width: 100%` / `text-align: left` / `border: none` / `background: transparent` / `min-height: 44px` | 一覧項目としての見た目とタップ領域（REQ-2.9） |

パネルはヘッダー直下（画面上部）に開くため、右下のFABとは視覚的に重ならない（REQ-2.10）。

### 2-4. 設定画面の構成（データ管理）

`SyncSettingsView` の**機能は追加も削除もしない**（REQ-2.11）。行うのは見出しの整理のみ。

```
設定
└ データ管理
  ├ Google Drive 同期     （同期未構成のビルドでは非表示。google-drive-sync REQ-1.9）
  └ ストレージの状態
```

- 実装: 既存の2つの `<section>` を1つの `<section>` でくくり、`<h2>データ管理</h2>` の下に既存の見出しを `<h3>` として並べる（[未確定事項 2](./requirements.md#未確定事項確認したい点)と併せて判断）。
- 同期未構成のビルドでは「データ管理」セクションの中身が「ストレージの状態」だけになるが、設定画面への導線は維持する（REQ-2.13）。
- 戻る導線（`← 一覧に戻る`）は現状のまま維持する（REQ-2.14）。

### 2-5. インストール案内の再表示

メニューの2つ目の項目「ホーム画面に追加の案内」（REQ-2.16〜REQ-2.24）の実装方式。

#### 2-5-1. 現状（調査結果）

`src/components/InstallGuide.tsx` は props を取らない自己完結コンポーネントで、`DiveLogListView` の先頭に `<InstallGuide />` と置かれているだけ。

`DISMISSED_KEY = 'dive-log-app:install-guide-dismissed'` はモジュール内プライベート。`useState(readDismissed)` で `localStorage` を**マウント時の1回だけ**読み、`dismiss()` が `localStorage.setItem(DISMISSED_KEY, 'true')`（`try/catch` で保存不可環境を握りつぶす）と `setDismissed(true)` を行う。`if (isStandalone() || dismissed) return null` の早期returnはフック呼び出しより**後**にあり、内部の `useInstallPrompt()` が `beforeinstallprompt` を捕捉して `canInstall` を出している。

**設計を縛る重要な事実**: `beforeinstallprompt` はページ読み込み時に一度だけ発火する。`InstallGuide` は非表示（`return null`）の間もマウントされたままで、`useInstallPrompt` の `useEffect` がイベントを捕捉し続けている。したがって **`InstallGuide` をアンマウント→再マウントすると捕捉済みイベントを失い、Android の「インストール」ボタンを出せなくなる**（[mobile-compatibility REQ-2.1](../mobile-compatibility/requirements.md) の劣化、REQ-2.22 に反する）。再表示の実装方式はこの制約を満たす必要がある。

#### 2-5-2. 方式の選定

再表示シグナル（任意の数値prop）＋ `useEffect` で `dismissed` を戻す方式（案イ）を採用。変更量が最小（任意prop 1つ＋`useEffect` 1つ、表示ロジック・文言は不変）で、マウントを維持するため `beforeinstallprompt` の捕捉も保持される。

不採用の代替案とその理由: 「状態のリセットは `key` で」というReactの一般的な指針に沿えば、親が `key` をインクリメントして再マウントする案が本来第一候補だが、再マウントで `useInstallPrompt` が初期化され `beforeinstallprompt` の捕捉を**失う**（2-5-1の制約に反する）ため不採用。`dismissed` と永続化を親へ完全に持ち上げる案は、コンポーネントの自己完結性が失われるため不採用。`useSyncExternalStore` 等で `localStorage` の変更を購読する案は、1画面内の単発操作に対して機構が重いため不採用。`useImperativeHandle` で `reopen()` を公開する案は、宣言的な書き方で足りるため不採用。この選定理由はコード上のコメントにも残す。

#### 2-5-3. 採用案（案イ）の実装

`src/components/InstallGuide.tsx`（差分のみ。表示部分は現状のまま）:

```tsx
interface InstallGuideProps {
  /**
   * 値が変化するたびに案内を再表示する（メニューからの明示的な再表示。REQ-2.18）。
   * 既定値 0 は「再表示の要求なし」を意味する。
   * 再マウント（key の付け替え）にしないのは、beforeinstallprompt が一度しか発火せず、
   * 作り直すと Android の「インストール」ボタンを出せなくなるため。
   */
  reopenSignal?: number
}

export function InstallGuide({ reopenSignal = 0 }: InstallGuideProps) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const { canInstall, promptInstall } = useInstallPrompt()

  useEffect(() => {
    if (reopenSignal === 0) return // 初回マウント時は何もしない
    try {
      localStorage.removeItem(DISMISSED_KEY)
    } catch {
      // 保存できない環境では「閉じた」記憶も残っていないため、何もしなくてよい（REQ-2.23）
    }
    setDismissed(false)
  }, [reopenSignal])

  if (isStandalone() || dismissed) return null
  // …以降は現状のまま（dismiss / handleInstallClick / 表示）…
}
```

prop は**任意**なので既存の呼び出し `<InstallGuide />` はそのままでも動く。`DISMISSED_KEY` は引き続き `InstallGuide.tsx` 内部に閉じ、キー名・保存先を変更しない（REQ-5.10。既存利用者の「閉じた」状態をリリースでリセットしない）。`setItem('false')` ではなく `removeItem` を使うのは、「未設定＝まだ閉じていない」という `readDismissed()` の判定（`=== 'true'`）と素直に噛み合うため。これにより再表示後にリロードしても案内は出たままになり（＝本当に「閉じていない状態」へ戻る）、再度閉じれば `dismiss()` が `'true'` を書き戻して通常の記憶に戻る（REQ-2.20）。

フックは早期returnより前に置く（フックの規則。既存の `useState` / `useInstallPrompt` の並びに `useEffect` を足すだけで呼び出し順は安定する）。表示中にシグナルが増えても `setDismissed(false)` は同値のため二重表示は起きず（REQ-2.21）、スタンドアロン起動時は `isStandalone()` の早期returnで非表示のまま（メニュー項目自体も出ないため二重の安全策）。自動表示の条件（未インストール かつ ブラウザタブ起動）自体には手を入れない（REQ-2.24）。

`src/views/DiveLogListView.tsx`:

```tsx
const [installGuideSignal, setInstallGuideSignal] = useState(0)

function handleShowInstallGuide() {
  setInstallGuideSignal((prev) => prev + 1)
  window.scrollTo({ top: 0 }) // 案内は一覧の先頭にあるため（REQ-2.19）
}

return (
  <div className="view view--list">
    <InstallGuide reopenSignal={installGuideSignal} />
    <div className="view__header">
      <h1>ダイビングログ</h1>
      <AppMenu onOpenSettings={onOpenSettings} onShowInstallGuide={handleShowInstallGuide} />
    </div>
    … 一覧または空状態 …
    <Fab label="新規記録" onClick={onNewDive} />
  </div>
)
```

- `DiveLogListView` の props（`onSelectDive` / `onNewDive` / `onOpenSettings`）は変更しない。`App.tsx` も無変更のまま（REQ-2.15）。
- スクロール（REQ-2.19）: 案内はヘッダーより上にあるため、ページ先頭へ移動すれば必ず視野に入る。ページのスクロールコンテナは `document` 自身（内側にスクロール領域を作っていない）なので `window.scrollTo` で足りる。`behavior: 'smooth'` は指定しない（アニメーション不要で、`prefers-reduced-motion` の考慮も不要になる）。
- フォーカスはメニューボタンへ戻る（[2-3](#2-3-メニューの実装案a) の共通 `close()`）。案内側へフォーカスを移す／読み上げで通知する案は [未確定事項 9](./requirements.md#未確定事項確認したい点)。

#### 2-5-4. 表示文言についての注意（実装時に踏むかもしれない罠）

Android で一度「インストール」ボタンを押すと `deferredPrompt` が `null` になり `canInstall` が偽になる。この状態で案内を再表示すると、本文の「…下のボタンからインストールできます。」に対応するボタンが存在しない表示になる（現状はプロンプト後に案内が閉じるため表面化していなかった既存挙動）。再表示の導線ができると目にする機会が増えるが、**本仕様では文言を変更しない**（REQ-2.22）。改善する場合は [mobile-compatibility REQ-2.2](../mobile-compatibility/requirements.md) 側の変更として別途起票する。

---

## 3. 天候入力のセグメントコントロール化

### 3-1. 現状（調査結果）

型は `src/types/diveLog.ts` の `export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'other'` で**自由テキストではない**（git履歴上も初回コミットからこの直和型で、自由記述だった時期はない）。入力は `DiveLogFormView` の `<select>`（`選択なし` / 晴れ / 曇り / 雨 / その他、空文字選択時は `undefined` に変換して保存）。表示は `DiveLogDetailView` にローカル定義された `const weatherLabel: Record<string, string>` で日本語化（`diveLog.weather ? weatherLabel[diveLog.weather] : '-'`）。

**後方互換の論点**: 型上は4値だが実体はIndexedDBに入った文字列であり、型検査は保存時に働かない。[Google Drive同期](../google-drive-sync/design.md)経由で別バージョンの端末から取り込んだログや、将来選択肢を増減した場合に**4値以外のコード値を持つレコードが存在しうる**。現在の詳細画面はこのとき `weatherLabel[unknownCode]` が `undefined` となり、**`<dd>` が空欄になる**（「-」も出ない）。本仕様でここも直す（REQ-3.9）。器材の選択リストは `src/types/gearOptions.ts` に「型＋ラベル配列＋`gearLabel()`（未知値は `-`）」として集約済み（[dive-log-crud/design.md](../dive-log-crud/design.md)）であり、天候も同じ形に揃えるのが自然。

### 3-2. ラベルの集約（`src/types/weatherOptions.ts`、新規）

```ts
import type { Weather } from './diveLog'

export interface WeatherOption {
  value: Weather
  label: string
}

export const weatherOptions: WeatherOption[] = [
  { value: 'sunny', label: '晴れ' },
  { value: 'cloudy', label: '曇り' },
  { value: 'rainy', label: '雨' },
  { value: 'other', label: 'その他' },
]

/** 未選択（undefined）や未知のコード値は '-' を返す（REQ-3.9）。gearLabel と同じ方針。 */
export function weatherLabel(value: string | undefined): string
```

- アイコンの対応付け（`sunny → SunIcon` など）は**表示の関心事**なので `types/` には置かず、`WeatherSelect.tsx` 側で `Record<Weather, IconComponent>` として持つ（[概要のアーキテクチャ](../00-overview.md)の依存の向きを保つ）。
- `DiveLogDetailView` のローカル `weatherLabel` マップは削除し、この関数を使う。`currentLabel`（流れ）は今回は触らない（[未確定事項 5](./requirements.md#未確定事項確認したい点)）。
- 実装時、[dive-log-crud/design.md](../dive-log-crud/design.md) の「ローカルの `weatherLabel` / `currentLabel` はそのまま残す」という記述を本仕様に合わせて更新すること（[ui-polish-level1](../ui-polish-level1/design.md) が `dive-log-list-item__main` の記述を更新したのと同じ扱い）。

### 3-3. 実装方式

`fieldset` + `input[type=radio]`（視覚的に非表示）＋ `label` 装飾を採用。矢印キー・Spaceがネイティブで効き、支援技術の読み上げ（「ラジオボタン、晴れ、5個中2番目」等）も自動で揃うため実装量が最小で済む。`<div role="radiogroup">` + `<button role="radio">` で自前実装する案は、ロービングtabindexと矢印キー処理を自前で書く必要があり不採用。`<select>` の見た目だけ変更する案は、選択肢が常時見えず要件を満たさないため不採用。

`:has()` セレクタで選択状態・フォーカス状態を装飾する。既存 `src/App.css` に `label:has(input[type='checkbox'])` の先例があり、Tier 1 プラットフォーム（iOS 16.4+ / Android Chrome 最新）で利用可能（[mobile-compatibility のサポート表](../mobile-compatibility/requirements.md)）。

### 3-4. コンポーネント

```tsx
// src/components/WeatherSelect.tsx
interface WeatherSelectProps {
  value: Weather | undefined
  onChange: (value: Weather | undefined) => void
}
```

```tsx
<fieldset className="weather-select">
  <legend className="weather-select__legend">天候</legend>
  <div className="weather-select__options">
    <label className="weather-select__option">
      <input type="radio" name="weather" value="" checked={value === undefined} onChange={() => onChange(undefined)} />
      <NoneIcon className="weather-select__icon" />
      <span className="weather-select__label">選択なし</span>
    </label>
    {weatherOptions.map((option) => (
      <label key={option.value} className="weather-select__option">
        <input
          type="radio"
          name="weather"
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
        />
        {weatherIcons[option.value]({ className: 'weather-select__icon' })}
        <span className="weather-select__label">{option.label}</span>
      </label>
    ))}
  </div>
</fieldset>
```

- `DiveLogFormView` 側の差し替え（REQ-3.13。環境情報 `<fieldset>` 内、透明度と流れの間の位置は不変）:
  ```tsx
  <WeatherSelect value={draft.weather} onChange={(v) => updateField('weather', v)} />
  ```
  従来の `<label>天候 <select …></label>` を丸ごと置き換える。`updateField` / `DiveLogDraft` は変更しない。

**未知のコード値**（REQ-3.8）: `value` がどの選択肢とも一致しないため `checked` はすべて `false` になり「どれも選択されていない」表示になる。`draft.weather` は書き換わらず、保存時も元の値が保持される（`updateDiveLog` は `draft` をそのまま渡す）。**警告表示や自動変換は行わない**（器材の未知コード値と同じ扱い。[dive-log-crud/design.md](../dive-log-crud/design.md)）。`name` 属性はフォーム内に1つしかないため固定文字列 `weather` でよい。`input[type=radio]` は送信を誘発しない（REQ-3.12）。「選択なし」のアイコンは丸に斜線（`NoneIcon`）または区切りのダッシュを想定し、[未確定事項 4](./requirements.md#未確定事項確認したい点) で確定する。ラベル文言も幅320pxで収まらない場合は「なし」への短縮を検討する。

### 3-5. CSS

```css
.dive-log-form .weather-select {
  /* .dive-log-form fieldset の枠線・パディングを打ち消す（入れ子の fieldset のため）。
     セレクタを .weather-select 単体にすると詳細度 (0,1,0) が App.css の
     .dive-log-form fieldset (0,1,1) を下回り、外側の fieldset の枠線が残ってしまうため、
     .dive-log-form を前置して詳細度 (0,2,0) を確保する（実装時に判明・修正済み）。 */
  border: none;
  padding: 0;
  margin: 0;
  gap: 0.25rem;
}

.weather-select__legend {
  padding: 0;
  font-size: 0.9rem;   /* .dive-log-form label と同じ */
}

.weather-select__options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.weather-select__option {
  flex: 1 1 3rem;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  padding: 0.3rem 0.2rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
}

.weather-select__option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.weather-select__option:has(input:checked) {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
  font-weight: 700;
}

.weather-select__option:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.weather-select__icon { font-size: 1.25rem; }
.weather-select__label { font-size: 0.72rem; line-height: 1.2; }
```

| 指定 | 意図 / 関連要件 |
| --- | --- |
| `.dive-log-form fieldset` の打ち消し | 既存CSSが**すべての** `fieldset` に枠線・パディング・縦並びを与えているため、入れ子の `weather-select` で明示的に打ち消す |
| `input` を視覚的に非表示 | ネイティブのラジオ丸を隠して装飾ラベルだけを見せる。`display: none` ではなく1px＋`opacity: 0` にしてフォーカス可能性を残す（`display: none` だとキーボードで到達できない） |
| `:has(input:checked)` の塗り＋`font-weight: 700` | 選択状態を色だけに依存させない（REQ-3.4）。塗り面と文字のコントラストは `--on-accent` / `--accent` で4.5:1以上（[ui-polish-level2](../ui-polish-level2/design.md)） |
| `:has(input:focus-visible)` のアウトライン | キーボードフォーカスの可視化（REQ-3.6）。ネイティブのフォーカスリングは非表示の `input` に付くため、自前で親に描く |
| `min-height: 44px` / `min-width: 44px` / `flex-wrap` | タップ領域（REQ-3.11）と、狭い画面での折り返し（REQ-3.10） |
| `font-size: 0.72rem`（ラベル）| 表示テキストのみの縮小であり、`input` / `select` / `textarea` の文字サイズは変えない（REQ-3.14） |

幅320pxでの寸法見積り: `#root` の左右パディング 1rem×2 と `.dive-log-form fieldset` のパディング 0.75rem×2 を引いた実効幅は約 **264px**。5分割＋gap 0.25rem×4（16px）で1つあたり約 **49.6px** となり、44px の最小タップ幅を満たす（REQ-3.11）。「選択なし」を1行に収められない場合は `flex-wrap` で2行になる（REQ-3.10）。

### 3-6. 詳細画面

- `weatherLabel(diveLog.weather)` に置き換える。未選択・未知値のいずれも `-`（REQ-3.9）。
- 詳細画面の `<dl>` にはアイコンを追加しない（[ui-polish-level1 REQ-4.3](../ui-polish-level1/requirements.md) を維持）。天候アイコンを詳細画面にも出すかは将来の検討事項。

---

## 4. アイコンの追加（`src/components/icons.tsx`）

既存の `commonProps`（`viewBox="0 0 24 24"` / `width=height="1em"` / `fill="none"` / `stroke="currentColor"` / `strokeWidth={2}` / 線端丸 / `aria-hidden` / `focusable={false}`）をそのまま使う（REQ-4.1, REQ-4.2）。塗りは使わず線画で統一する。

| アイコン | 用途 | 形状の目安（最終的な `d` は実装者が調整してよい） |
| --- | --- | --- |
| `PlusIcon` | FAB | `M12 5v14` / `M5 12h14` |
| `MenuIcon` | メニュー開閉ボタン | `M4 7h16` / `M4 12h16` / `M4 17h16` |
| `SunIcon` | 天候: 晴れ | `<circle cx="12" cy="12" r="4.5" />` ＋ 8方向の光線（`M12 2v2` / `M12 20v2` / `M4.2 4.2l1.4 1.4` …） |
| `CloudIcon` | 天候: 曇り | 雲の輪郭 1パス（例: `M7 18a4 4 0 0 1 .6-8A5.5 5.5 0 0 1 18 11.5a3.5 3.5 0 0 1-.5 6.5z`） |
| `RainIcon` | 天候: 雨 | `CloudIcon` を上部に縮めて配置し、下に雨脚2〜3本（`M9 19l-1 2` / `M13 19l-1 2` / `M17 19l-1 2`） |
| `WeatherOtherIcon` | 天候: その他 | 候補: 雲＋太陽の組み合わせ／疑問符／横並びの点3つ（→ [未確定事項 6](./requirements.md#未確定事項確認したい点)） |
| `NoneIcon` | 天候: 選択なし | `<circle cx="12" cy="12" r="8" />` ＋ `M8.5 15.5l7-7`（丸に斜線） |

`SunIcon` は光線が多く小サイズ表示だと潰れるため `weather-select__icon` は1.25remで表示する（詳細画面には出さないため小サイズ表示の心配はない）。追加6〜7個でバンドル増は1KB未満の見込み（[ui-polish-level1](../ui-polish-level1/design.md) と同オーダー）。`icons.tsx` の分割は将来の検討事項とし、今はフラットな単一ファイルを維持する（[ui-polish-level1](../ui-polish-level1/design.md) の方針どおり）。

---

## 影響しない箇所

- データモデル（`src/types/diveLog.ts`）、Dexieスキーマ（`src/db/db.ts`）、リポジトリ関数、`src/sync/`、`src/platform/`: 変更なし（REQ-5.1）。同期の `schemaVersion` も据え置き。天候の保存値・キー名も不変のため、[Google Drive同期](../google-drive-sync/design.md)の `toRemoteLogBody()`（rest スプレッド）に対する影響もない。
- `src/App.tsx` の `Route` 定義と画面切り替え、`DiveLogListView` の props、`useDiveLogs` のクエリ: 変更なし（REQ-2.15）。
- 詳細画面・フォームのその他の項目、写真ピッカー、サインパッド、`PastValuePicker`: 変更なし。
- `InstallGuide`: 再表示のための任意prop（`reopenSignal`）の追加のみで、表示条件・文言・「インストール」ボタンの挙動・`localStorage` のキー名は変更しない（→ [2-5](#2-5-インストール案内の再表示)、REQ-2.22, REQ-2.24, REQ-5.10）。`src/hooks/useInstallPrompt.ts` と `src/platform/environment.ts` は無変更（`isStandalone()` を `AppMenu` から参照するのみ）。
- [ui-polish-level2](../ui-polish-level2/design.md) で追加予定の `CardThumbnail` / `getAttachmentBlob`: 本仕様とは独立（一覧カードの内側には手を入れない）。

## 手動確認観点

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。

1. 一覧を最下部までスクロールし、最後のカードがFABに隠れず、タップして詳細に遷移できること（REQ-1.9）。
2. iOS のホーム画面起動（スタンドアロン）で、FABがホームインジケーターと重ならないこと（REQ-1.8）。ブラウザタブ起動時に Safari の下部ツールバーと重ならないことも確認する。
3. 記録0件のとき、空状態メッセージとFABが同時に表示され、FABから新規作成に進めること（REQ-1.12）。
4. フォーム・詳細・設定の各画面でFABが表示されないこと（REQ-1.11）。
5. デスクトップの広い画面（幅1280px想定）でFABがコンテンツ列の右下付近に表示され、画面の端に取り残されないこと（REQ-1.13）。
6. メニューを開き、Escキーで閉じてフォーカスがメニューボタンに戻ること（REQ-2.5）。
7. メニューを開いた状態で画面の他の場所をタップして閉じること（REQ-2.6）。iOS Safari の実機でも確認する。
8. キーボードのTab移動が「メニューボタン → （開いていればメニュー項目）→ 一覧カード → FAB」の順で進み、各要素でフォーカスが見えること（REQ-1.10, REQ-2.7）。
9. スクリーンリーダー（iOS VoiceOver / Android TalkBack）で、FABが「新規記録」、メニューボタンが「メニュー」と読まれること（REQ-1.7, REQ-2.2）。
10. `VITE_GOOGLE_CLIENT_ID` 未設定のビルドでも、メニューから設定画面へ行き「ストレージの状態」が読めること（REQ-2.13）。
11. 天候をタップで選択・変更でき、選択中のセグメントが一目で分かること（ライト／ダーク両方）（REQ-3.4, REQ-5.5）。
12. 天候をキーボードの矢印キーで選択でき、フォーカスが見えること（REQ-3.6）。
13. 天候を選んだ後に「選択なし」へ戻して保存し、詳細画面が `-` になること（REQ-3.5, REQ-3.9）。
14. 天候を選んで保存 → 詳細画面の表示 → 再編集したときに、選択状態が復元されること（REQ-3.2）。
15. 画面幅320px / 375px / 640px で、天候のセグメントとヘッダーが横スクロールを起こさないこと（REQ-3.10, REQ-5.3）。
16. 機内モードでリロードしても、FAB・メニュー・天候アイコンがすべて表示されること（REQ-5.6）。
17. ブラウザタブ起動で、インストール案内を閉じた後にメニューの「ホーム画面に追加の案内」を選び、メニューが閉じて案内が再表示されること。一覧を下までスクロールした状態から実行した場合も、案内が見える位置まで表示が移動すること（REQ-2.18, REQ-2.19）。
18. 再表示した案内をもう一度閉じ、リロード後に案内が表示されないこと（＝「閉じた」記憶が復活すること）（REQ-2.20）。
19. 案内が表示されている状態でメニューの同項目を選んでも、案内が二重に出たり消えたりしないこと（REQ-2.21）。
20. ホーム画面から起動（スタンドアロン）したとき、メニューに「ホーム画面に追加の案内」が表示されないこと（REQ-2.17）。iOS / Android の両方で確認する。
21. Android Chrome で、案内を閉じる → メニューから再表示、の順に操作したときに「インストール」ボタンが引き続き表示されること（再マウントによる `beforeinstallprompt` の喪失が起きていないこと）（REQ-2.22、[2-5-1](#2-5-1-現状調査結果)）。
22. 再表示の直後、キーボードのTabがメニューボタンの次の要素へ進むこと（フォーカスが `body` に落ちていないこと）（REQ-2.7）。

## 既知のトレードオフ・将来への布石

- **メニュー項目は「設定」「ホーム画面に追加の案内」の2つ**（スタンドアロン起動時は「設定」のみ）。スタンドアロン起動のユーザーには項目1つのメニューとなり、設定への到達にワンタップ増える点はトレードオフとして残る（[未確定事項 1](./requirements.md#未確定事項確認したい点), [未確定事項 8](./requirements.md#未確定事項確認したい点)）。
- **インストール案内の再表示は「記憶の一時的な取り消し」**であり、記憶の仕組み自体のオン/オフ設定は設けない（REQ-2.20）。「今後表示しない」を明示的に切り替えたいという要望が出た場合は、設定画面側の項目として別途検討する。
- **ブラウザの戻る操作でメニューを閉じられない**。自前ルーターはアプリ内部の遷移履歴スタックを持つが（[marine-life-observation/design.md](../marine-life-observation/design.md) 10節）、ブラウザの履歴API（`history.pushState` / `popstate`）とは連動しないため（[dive-log-crud/design.md](../dive-log-crud/design.md) の既知のトレードオフ）、Android の戻る操作はメニューを閉じずにアプリ／タブを離れる。ブラウザ履歴との統合を行う場合は本仕様とは別に「画面遷移とURL」の仕様が必要。
- **FABは一覧画面専用**。詳細画面の「編集」や、フォームの「保存」をFAB化するかは今回判断しない（保存ボタンはフォーム末尾のほうが入力完了との対応が分かりやすいため、現状維持を推奨）。
- **天候だけがセグメント化される**ため、環境情報セクション内で「流れ」だけがプルダウンのまま残る（[未確定事項 5](./requirements.md#未確定事項確認したい点)）。器材セクションの選択リストも同様にプルダウンのまま。
- **`:has()` に依存**する（選択状態・フォーカス表示）。Tier 1 プラットフォームでは問題ないが、古い環境では選択状態が視覚的に分からなくなる。`:has()` が使えない環境向けのフォールバックが必要になった場合は、`input` を `appearance` 付きで表示する（ネイティブのラジオ丸を見せる）方針とする。
- 天候ラベルを `src/types/weatherOptions.ts` に集約することで、将来「流れ」も同じ形に揃えられる。選択肢そのものの増減（雪・雷の追加など）は保存値の変更＝[dive-log-crud](../dive-log-crud/requirements.md) の項目定義変更であり、本仕様の範囲外。
