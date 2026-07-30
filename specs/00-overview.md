# ダイビングログアプリ — 概要仕様

## プロダクト概要

個人のダイビング記録（ログブック）をブラウザ内だけで管理する、オフライン優先のPWA（Progressive Web App）。
サーバーやログイン機能を持たず、すべてのデータは利用端末のブラウザ内（IndexedDB）にのみ保存される。

- 対象ユーザー: 自分のダイビング記録を残したいダイバー本人（単一デバイス・単一ユーザー利用を前提）
- 主要言語: 日本語UI固定（i18n対応なし）
- オフライン: 初回読み込み後はネットワーク接続なしで全機能が利用可能

## 機能一覧

| 機能 | 仕様 |
| --- | --- |
| ダイビングログの記録・閲覧・編集・削除 | [dive-log-crud](./dive-log-crud/requirements.md) |
| 写真の添付 | [photo-attachment](./photo-attachment/requirements.md) |
| ガイドサインの記録 | [guide-signature](./guide-signature/requirements.md) |
| オフライン動作・PWA化 | [offline-pwa](./offline-pwa/requirements.md) |

## 技術スタック

- **フレームワーク**: React 19 + TypeScript、Vite でビルド
- **ルーティング**: なし（`src/App.tsx` の `Route` 判別共用体 + `useState` による自前の3画面切り替え。React Router 等は未導入）
- **永続化**: [Dexie](https://dexie.org/)（IndexedDB のラッパー）。バックエンドAPIなし
- **PWA化**: `vite-plugin-pwa`（Service Worker 自動更新、Web App Manifest）
- **Lint**: oxlint（`.oxlintrc.json`）
- **テスト**: 現状テストコードなし

## アーキテクチャ概要

```
src/
  App.tsx              # 画面遷移（list / form / detail）を state で管理するルートコンポーネント
  views/                # 画面単位のコンポーネント（一覧・フォーム・詳細）
  components/           # 画面をまたいで再利用する部品（一覧項目・写真ピッカー・サインパッド）
  hooks/                # Dexie の useLiveQuery を使ったデータ購読フック
  db/
    db.ts                # Dexie スキーマ定義（DiveLogDatabase）
    diveLogRepository.ts # 永続化ロジック（作成・更新・削除・詳細取得）をUIから分離
  types/diveLog.ts      # ドメイン型定義（DiveLog / Attachment / DiveLogDraft）
```

依存の向き: `views` → `hooks` / `db/diveLogRepository` → `db/db`（Dexie）。UIコンポーネントは Dexie を直接触らず、必ずリポジトリ関数を経由する。

## 非機能要件

- **NFR-1**: データはすべて端末ローカルの IndexedDB に保存し、外部サーバーへ送信しない。
- **NFR-2**: 初回アクセス後はオフラインで一覧・詳細・新規作成・編集・削除のすべてが可能であること（詳細は [offline-pwa](./offline-pwa/requirements.md)）。
- **NFR-3**: モバイル端末（スマートフォン）でのカメラ撮影・タッチ操作（署名描画）を主要な利用シーンとする。
- **NFR-4**: 認証・ユーザー管理は行わない（単一ユーザー・単一ブラウザプロファイル前提）。

## 既知の制約・未実装事項（現状のスナップショット）

これらは「バグ」ではなく、現状のアプリが対応していない範囲の記録。将来機能として仕様化する際の起点にする。

- データのエクスポート／インポート・バックアップ機能なし（IndexedDBを消去すると記録も消える）
- 複数デバイス間の同期機能なし
- 一覧の検索・フィルタ・並び替え（日付降順固定）なし
- 削除確認は `window.confirm` によるブラウザ標準ダイアログ
- 自動テスト（unit/e2e）なし
