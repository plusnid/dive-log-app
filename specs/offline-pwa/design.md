# 設計: オフライン動作・PWA化

関連: [要件](./requirements.md)

## Service Worker / Manifest (`vite.config.ts`)

`vite-plugin-pwa` の `VitePWA()` プラグインで以下を設定:

- `registerType: 'autoUpdate'`: 新しいビルドがあれば即座にService Workerを更新（ユーザーへの確認プロンプトなし）。
- `workbox.globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']`: プリキャッシュ対象の静的アセットパターン。
- `manifest`:
  - `lang: 'ja'`, `name` / `short_name`: 「ダイビングログ」, `description`, `theme_color: '#0b5b7a'`, `background_color: '#ffffff'`
  - `display: 'standalone'`, `start_url: '/dive-log-app/'`, `scope: '/dive-log-app/'`（GitHub Pages のサブパス配信のため。決定の経緯は [mobile-compatibility/design.md「配信先の反映」](../mobile-compatibility/design.md#配信先の反映)）
  - Vite 側も `base: '/dive-log-app/'` を指定する（同上）
  - `icons`: `public/icons/icon-192.png`（192x192）, `icon-512.png`（512x512）, `icon-maskable-512.png`（512x512, `purpose: 'maskable'`）

## アイコン生成

`scripts/generate-icons.cjs` が `public/icons.svg`（元アイコン）から `public/icons/` 配下の各サイズPNG（通常/マスカブル）を生成する。手動でSVGを編集した場合は再実行が必要。

## データ永続化層とオフラインの関係

アプリの状態は React コンポーネント state + Dexie（IndexedDB）のみで完結し、外部APIへのfetchは一切行わない（[dive-log-crud/design.md](../dive-log-crud/design.md) 参照）。そのためService Workerによる静的アセットのキャッシュさえ機能すれば、データ層はネットワークに依存せず動作する。

## 既知の制約

- IndexedDBはブラウザ/端末ローカルのストレージであり、ブラウザデータの消去やアプリの再インストールでデータが失われる。バックアップ/エクスポート手段は現状ない（[00-overview.md](../00-overview.md) の既知の制約を参照）。
- Service Workerの `autoUpdate` はタブを開いたままにしていると新バージョン反映までにリロードが必要な場合がある（Workbox標準動作）。
