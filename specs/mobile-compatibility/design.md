# 設計: iOS / Android での動作保証（モバイル対応）

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [オフライン・PWA設計](../offline-pwa/design.md)

## 方針

- ネイティブ化・ラッパー導入は行わず、既存の React + Vite + `vite-plugin-pwa` 構成のまま、**プラットフォーム差異を吸収する薄いレイヤー**を追加する。
- 分岐は原則として機能検出で行い、プラットフォーム判定は「インストール手順の案内文言」だけに限定する（REQ-1.3）。
- 既存のアーキテクチャ（`views` → `hooks` / `db/diveLogRepository` → `db/db`）は変更しない。プラットフォーム関連の処理は `src/platform/` にまとめ、`views` / `components` から利用する。

## プラットフォーム差異の一覧

| 関心事 | iOS Safari (16.4+) | Android Chrome | 現状の実装 | 対応方針 |
| --- | --- | --- | --- | --- |
| インストール導線 | `beforeinstallprompt` なし。共有メニューからの手動追加のみ | `beforeinstallprompt` あり／ブラウザ標準バナー | 導線なし | プラットフォーム別の案内UI（`InstallGuide`） |
| ホーム画面アイコン | `apple-touch-icon` を優先 | Manifest の maskable アイコン | `apple-touch-icon` 未設定 | `index.html` に追加 |
| スタンドアロン判定 | `navigator.standalone` / `display-mode: standalone` | `display-mode: standalone` | 判定なし | `isStandalone()` を機能検出で実装 |
| ストレージ永続化 | `storage.persist()` は未サポートの可能性が高い。ホーム画面追加時は削除されにくい | `storage.persist()` 対応。エンゲージメントに応じて自動許可 | 未使用 | `requestPersistentStorage()`（存在しなければ握りつぶす） |
| ストレージ削除ポリシー | 未使用が続くとサイト由来データが削除され得る／タブとホーム画面Webアプリでデータが分離される場合がある | 明示消去・容量逼迫時のみ | 未考慮 | 注意文の表示（REQ-3.5 / 3.6）＋ [google-drive-sync](../google-drive-sync/requirements.md) によるバックアップ |
| ストレージ容量 | origin ごとの上限があり、写真を多数保存すると到達し得る | ディスク空き容量ベースで比較的潤沢 | 未考慮 | `estimate()` の表示＋`QuotaExceededError` のハンドリング |
| 写真入力 | `capture` 指定時はカメラ直起動になり、ライブラリ選択ができない | `capture` 指定時はカメラ直起動。`multiple` は無効化される | 単一 input に `multiple` と `capture="environment"` を同時指定 | `capture` 属性を削除し、ライブラリ/ファイル選択のみの単一 input にする（カメラ直接起動ボタンは設けない方針を確定） |
| 画像形式 | ライブラリ/ファイル経由で HEIC が渡る場合がある | JPEG/PNG が中心 | 形式チェックなし | 表示失敗時のフォールバック表示 |
| Pointer Events | 対応（Safari 13+） | 対応 | `onPointer*` 使用（そのままでよい） | 変更不要。ただし長押しメニュー抑止が必要 |
| 長押しメニュー | canvas / img の長押しでOSメニューが出る | 出ることがある | 未対策 | `-webkit-touch-callout: none` / `user-select: none` |
| 入力欄フォーカス時ズーム | フォントサイズ16px未満でズームする（iOS上のChromeも同じWebKitエンジンのため同様に発生） | ズームしない | ラベル 0.9rem を input が `font: inherit` で継承（＝14.4px）→ ズームする | **対応を保留**（ユーザー判断。iOSでの主要利用ブラウザがChromeであるため優先度低と判断。再検討時は入力要素のフォントサイズを16px以上にする） |
| セーフエリア | ノッチ／ホームインジケーターあり | 機種により切り欠きあり | `viewport-fit` 未指定、`env()` 未使用 | `viewport-fit=cover` + `env(safe-area-inset-*)` |
| ビューポート高 | アドレスバー伸縮あり | 同左 | `min-height: 100svh` を使用済み（適切） | 変更不要 |
| テーマカラー | `<meta name="theme-color">` を参照 | Manifest / meta 双方 | Manifest にのみ定義 | ビルド出力に meta が注入されているか確認、無ければ追加 |

## 現状との差分（変更が必要な箇所）

実装時に手を入れる想定のファイル。**本仕様の作成時点では未実装**。

### `index.html`

- `viewport` に `viewport-fit=cover` を追加（REQ-6.1）。`user-scalable=no` は指定しない（アクセシビリティのため拡大は許可する。フォーカス時の自動ズームは別問題であり対応保留、「既知の制約・リスク」参照）。
- `<link rel="apple-touch-icon" href="%BASE_URL%icons/icon-192.png">` を追加（REQ-2.5）。GitHub Pages のサブパス配信（下記「配信先の反映」）のため、`/icons/...` のようなルート絶対パスではなく Vite の `%BASE_URL%` プレースホルダ（ビルド時に `base` の値へ置換される）を使う。
- `<meta name="apple-mobile-web-app-capable" content="yes">` および `<meta name="apple-mobile-web-app-status-bar-style" content="default">` を追加（iOS のスタンドアロン表示・ステータスバー制御）。
- `<meta name="theme-color" content="#0b5b7a">` が `vite-plugin-pwa` によって注入されていない場合は明示的に追加。

### 配信先の反映

配信先が GitHub Pages のサブパス（`https://plusnid.github.io/dive-log-app/`）に決定したため、以下をあわせて変更する（この節は [offline-pwa/design.md](../offline-pwa/design.md) の Manifest 設定と対になる）。

- `vite.config.ts`: `defineConfig({ base: '/dive-log-app/', ... })` を追加。未設定の現状は `base: '/'` 相当のため、サブパス配信では静的アセットの参照が壊れる。
- `vite-plugin-pwa` の `manifest`: `start_url: '/dive-log-app/'`、`scope: '/dive-log-app/'`（現状 `scope` は未設定＝暗黙的に `start_url` のディレクトリになるが、明示しておく）。
- `index.html` 内の絶対パス参照（アイコン等）は `%BASE_URL%` 経由に統一し、`base` 変更だけで追従できるようにする。
- Google Drive 同期の OAuth「承認済みの JavaScript 生成元」は `https://plusnid.github.io`（オリジン単位でよく、サブパスの指定は不要）。[google-drive-sync/design.md](../google-drive-sync/design.md) の認証設計を参照。

### `src/index.css`

- `#root` の `padding` にセーフエリアを加算: `padding: 1rem calc(1rem + env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom)) calc(1rem + env(safe-area-inset-left))`（REQ-6.1）。
- `button` に `min-height: 44px` / `min-width: 44px` 相当のタップ領域を確保（REQ-6.3 / REQ-5.6）。
- `body` に `overscroll-behavior-y: contain`（pull-to-refresh 抑止の補助、REQ-5.2）。
- 入力欄のフォントサイズ変更（iOS自動ズーム対策）は対応保留のため今回は行わない（「既知の制約・リスク」参照）。

### `src/components/PhotoPicker.tsx`（[photo-attachment](../photo-attachment/design.md) と共有）

現状は `<input type="file" accept="image/*" multiple capture="environment" />` の1つで、`capture` があるためプラットフォームによってはカメラが直接起動し、ライブラリからの複数選択ができない。写真の追加はライブラリ/ファイル選択のみとする方針が確定したため、`capture` 属性を削除するだけでよい（撮影用ボタンの追加は行わない）（REQ-4.1〜4.2）。

```tsx
<input type="file" accept="image/*" multiple ... />
```

- `PhotoPicker` のコントロールド設計（親が状態を保持し、DB操作はフォーム送信時にまとめて行う）は変更しない。したがってバックグラウンド復帰でコンポーネントが再マウントされない限り選択済みファイルは保持される（REQ-4.4）。
- サムネイル `<img>` に `onError` を追加し、表示できない形式のときは「プレビューできない画像」プレースホルダを表示する（REQ-4.5）。添付処理自体は継続する。

### `src/components/SignaturePad.tsx` / `SignaturePad.css`

- `touch-action: none` は設定済み（維持）。加えて canvas と既存サイン `<img>` に `-webkit-touch-callout: none; user-select: none; -webkit-user-select: none;` を追加（REQ-5.3）。
- 現状 `canvas.width/height` の設定は `showExisting` の変化時のみ実行されるため、回転・リサイズ時に描画バッファがずれる。`ResizeObserver` で表示サイズ変化を検知し、再スケール時に既存の描画内容を退避・復元する（REQ-5.5）。復元しない方針を採る場合は、リサイズでサインが消える旨をUI上で明示する。
- 「クリア」「サインをやり直す」ボタンのタップ領域を44px以上にする（REQ-5.6）。

### `src/views/DiveLogFormView.tsx`

- 数値入力に `inputMode` を付与する（REQ-6.2）。
  - 小数を扱う項目（最大水深・水温・透明度・ウェイト）: `inputMode="decimal"`
  - 整数項目（潜水時間・タンク圧力）: `inputMode="numeric"`
- 保存時の `QuotaExceededError` を捕捉し、日本語のエラーメッセージを表示する（REQ-3.7）。現状 `handleSubmit` は `try/finally` のみで `catch` がないため、失敗が握りつぶされて画面が動かないように見える。

## 新規追加するモジュール

```
src/
  platform/
    environment.ts       # isStandalone() / isIOS() / isAndroid() / supportsInstallPrompt()
    storage.ts           # requestPersistentStorage() / getStorageEstimate()
  hooks/
    useInstallPrompt.ts  # beforeinstallprompt の捕捉と、案内表示要否の判定
  components/
    InstallGuide.tsx     # プラットフォーム別のホーム画面追加案内（閉じる操作を記憶）
```

依存の向き: `components` / `views` → `hooks` → `platform`。`platform` は Dexie に依存しない（案内の「閉じた」フラグは `localStorage` に保存し、ユーザーデータではないため IndexedDB には入れない）。

### `platform/environment.ts`

```ts
export function isStandalone(): boolean
// matchMedia('(display-mode: standalone)').matches
//   || (navigator as any).standalone === true   // iOS Safari 独自プロパティ
export function getPlatform(): 'ios' | 'android' | 'other'
```

`getPlatform()` は案内文言の切り替え専用（REQ-1.3 の例外）。機能の有無の判定には使わない。

### `platform/storage.ts`

```ts
export async function requestPersistentStorage(): Promise<'persisted' | 'denied' | 'unsupported'>
export async function getStorageEstimate(): Promise<{ usage?: number; quota?: number } | null>
```

- `navigator.storage?.persist` が存在しない場合は `'unsupported'` を返し、呼び出し側は何もしない（REQ-3.3）。
- 呼び出しタイミングはアプリ起動直後（`App` のマウント時に一度だけ）。

### `components/InstallGuide.tsx`

- 表示条件: `!isStandalone()` かつ 閉じるフラグ未設定（REQ-2.3 / 2.4）。
- Android で `beforeinstallprompt` を捕捉できている場合は「インストール」ボタンを表示し、`prompt()` を呼ぶ（REQ-2.1）。
- iOS では手順テキスト（共有ボタン →「ホーム画面に追加」）と、REQ-3.5 / REQ-3.6 の注意文を表示する。
- 一覧画面（`DiveLogListView`）の先頭に配置する想定。

### ストレージ状態の表示先（REQ-3.4）

現状 `App.tsx` の `Route` は `list | form | detail` の3画面のみで設定画面がない。ストレージ永続化状態と使用量の表示先としては、[google-drive-sync](../google-drive-sync/design.md) で追加予定の設定画面（`Route` に `{ view: 'settings' }` を追加）に相乗りするのが望ましい。同期機能を先に実装しない場合は、一覧画面の下部に折りたたみの情報表示を置く。

## 動作確認マトリクス（REQ-7）

各リリース前に、iOS 実機 / Android 実機のそれぞれで以下を確認する。「起動形態」列が空欄の項目は両形態で確認する。

| # | 確認項目 | 起動形態 | 関連要件 |
| --- | --- | --- | --- |
| M-1 | ホーム画面に追加でき、アイコンとアプリ名が正しく表示される | ブラウザタブ | REQ-2.2 / 2.5 |
| M-2 | ホーム画面アイコンから起動するとブラウザUIが表示されない | スタンドアロン | REQ-2.6 |
| M-3 | 未インストール時にインストール案内が表示され、閉じると再表示されない | ブラウザタブ | REQ-2.2 / 2.3 |
| M-4 | インストール済みでは案内が表示されない | スタンドアロン | REQ-2.4 |
| M-5 | 機内モードで起動し、一覧・詳細・新規作成・編集・削除がすべて動作する | | REQ-3.1 |
| M-6 | 機内モードで写真添付・サイン描画・保存が動作する | | REQ-3.1 |
| M-7 | ストレージ使用量／永続化状態が表示される | | REQ-3.4 |
| M-8 | 「写真を選択」でライブラリが開き、複数枚を一度に添付できる | | REQ-4.1 / 4.2 |
| M-9 | 写真選択→アプリ復帰後もフォーム入力内容が保持されている | | REQ-4.4 |
| M-10 | 指でサインを描け、描画中にページがスクロールしない | | REQ-5.1 / 5.2 |
| M-11 | サインキャンバスを長押ししてもOSメニューが出ない | | REQ-5.3 |
| M-12 | 保存したサインが滲まず、詳細画面で正しく表示される | | REQ-5.4 |
| M-13 | 数値欄で小数点が入力できる | | REQ-6.2 |
| M-14 | ノッチ／ホームインジケーターにUIが隠れない | スタンドアロン | REQ-6.1 |
| M-15 | 縦向き・幅320pxで横スクロールが発生しない | | REQ-6.4 |
| M-16 | OSのダークモード切替に追従する | | REQ-6.5 |
| M-17 | キーボード表示中も入力中の項目が見える | | REQ-6.6 |
| M-18 | 新しいバージョンをデプロイ後、再起動で更新が反映される | | [offline-pwa REQ-2](../offline-pwa/requirements.md) |

## 既知の制約・リスク

- iOS のホーム画面Webアプリとブラウザタブでストレージが分離される挙動は iOS のバージョンによって差があり、アプリ側で制御できない。恒久的な対策は端末外バックアップ（[google-drive-sync](../google-drive-sync/requirements.md)）であり、本仕様の範囲では注意喚起にとどまる。
- iOS では `beforeinstallprompt` が発火しないため、インストール導線は手順の説明にとどまる（ワンタップでのインストールは不可能）。
- 写真は無圧縮の `Blob` として保存されるため（[photo-attachment/design.md](../photo-attachment/design.md) の既知の制約）、iOS のストレージ上限に到達しやすい。リサイズ／圧縮は本仕様の対象外とし、別途検討する。
- 自動化されたクロスブラウザテストは導入しない（リポジトリにテスト基盤がないため）。動作確認マトリクスは手動実施が前提。
- 入力欄タップ時の iOS Safari 自動ズームは対応を保留した（ユーザー判断、2026-08-02）。原因はラベルの `font-size: 0.9rem`（14.4px）を input 要素が `font: inherit` で継承していること。iOS上のChromeもレンダリングエンジンはSafariと共通（WebKit）のため同一の挙動になる。主要利用がChromeであるため現時点では許容し、影響が顕在化した場合は `src/index.css` の `input, select, textarea` に `font-size: 16px` 以上を指定して対応する。
