# ダイビングログアプリ — 概要仕様

## プロダクト概要

個人のダイビング記録（ログブック）をブラウザ内だけで管理する、オフライン優先のPWA（Progressive Web App）。
既定ではサーバーやログイン機能を持たず、すべてのデータは利用端末のブラウザ内（IndexedDB）にのみ保存される。

- 対象ユーザー: 自分のダイビング記録を残したいダイバー本人（既定は単一デバイス・単一ユーザー利用を前提）
- 主要言語: 日本語UI固定（i18n対応なし）
- オフライン: 初回読み込み後はネットワーク接続なしで全機能が利用可能
- 例外: [google-drive-sync](./google-drive-sync/requirements.md) をユーザーが明示的に有効化した場合に限り、本人のGoogleアカウントによる認証と、本人のGoogle Driveへのデータ送信が発生する

## 機能一覧

| 機能 | 仕様 | 状態 |
| --- | --- | --- |
| ダイビングログの記録・閲覧・編集・削除 | [dive-log-crud](./dive-log-crud/requirements.md) | 実装済み |
| 写真の添付 | [photo-attachment](./photo-attachment/requirements.md) | 実装済み |
| ガイドサインの記録 | [guide-signature](./guide-signature/requirements.md) | 実装済み |
| オフライン動作・PWA化 | [offline-pwa](./offline-pwa/requirements.md) | 実装済み |
| iOS / Android での動作保証（モバイル対応） | [mobile-compatibility](./mobile-compatibility/requirements.md) | 実装済み |
| Google Drive 同期（バックアップ・複数端末同期） | [google-drive-sync](./google-drive-sync/requirements.md) | 実装済み |

## 技術スタック

- **フレームワーク**: React 19 + TypeScript、Vite でビルド
- **ルーティング**: なし（`src/App.tsx` の `Route` 判別共用体 + `useState` による自前の画面切り替え（一覧・フォーム・詳細・設定の4画面）。React Router 等は未導入）
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

- **NFR-1**: データはすべて端末ローカルの IndexedDB に保存する。既定では外部サーバーへ一切送信しない。
  - **NFR-1-a（例外規定）**: ユーザーが [google-drive-sync](./google-drive-sync/requirements.md) を明示的に有効化した場合に限り、ユーザー本人のGoogle Driveへログ・写真・サイン画像を送信してよい。この場合も、開発者が管理するサーバーや解析サービスを含む「本人のGoogle Drive以外の宛先」へは送信しない。
  - **NFR-1-b**: 同期機能を有効化していない状態では、Googleのスクリプト・APIを含むいかなる外部リソースへのリクエストも発生させない（同期関連のスクリプトは機能を使うときにのみ遅延読み込みする）。
- **NFR-2**: 初回アクセス後はオフラインで一覧・詳細・新規作成・編集・削除のすべてが可能であること（詳細は [offline-pwa](./offline-pwa/requirements.md)）。Google Drive同期のみネットワークを必要とし、オフライン時は次回オンライン復帰まで保留される。
- **NFR-3**: モバイル端末（スマートフォン）でのカメラ撮影・タッチ操作（署名描画）を主要な利用シーンとする。サポート対象プラットフォームと保証範囲は [mobile-compatibility](./mobile-compatibility/requirements.md) で定義する。
- **NFR-4**: 既定では認証・ユーザー管理を行わない（単一ユーザー・単一ブラウザプロファイル前提）。
  - **NFR-4-a（例外規定）**: [google-drive-sync](./google-drive-sync/requirements.md) を有効化した場合に限り、ユーザー本人のGoogleアカウントによるOAuth認証を行う。アプリ独自のアカウント・パスワード管理は行わず、アクセストークンは永続化しない。
  - **NFR-4-b**: 同期を有効化した場合、データの利用範囲は「同一ユーザーが所有する複数端末」までとし、他ユーザーとの共有は行わない。

## 既知の制約・未実装事項（現状のスナップショット）

これらは「バグ」ではなく、現状のアプリが対応していない範囲の記録。将来機能として仕様化する際の起点にする。

- バックアップ・複数デバイス間の同期機能 → [google-drive-sync](./google-drive-sync/requirements.md) として実装済み（既定は無効。ユーザーが設定画面で明示的に有効化した場合のみ、本人のGoogle Driveと同期する）
- iOS / Android 固有の差異（ホーム画面追加の導線、ストレージ削除ポリシー、カメラ入力の挙動、タッチ操作）への対応 → [mobile-compatibility](./mobile-compatibility/requirements.md) として実装済み（入力欄タップ時のiOS自動ズーム対策のみ対応保留、詳細は同design.mdの既知の制約・リスクを参照）
- 手動のエクスポート／インポート（JSON/CSVファイル）は未仕様（Google Drive同期とは別機能として要検討）
- 一覧の検索・フィルタ・並び替え（日付降順固定）なし
- 削除確認は `window.confirm` によるブラウザ標準ダイアログ
- 自動テスト（unit/e2e）なし

mobile-compatibility の実装により `src/platform/` レイヤーを追加済み（Dexieには非依存）。google-drive-sync の実装により、`src/db/db.ts` の Dexie スキーマに version 2（`uuid` / 墓標 `tombstones` / 同期記録 `syncRecords` / 同期メタ `syncMeta`）が追加され、React にも Dexie にも依存しない `src/sync/` レイヤー（`googleAuth.ts` / `driveClient.ts` / `syncEngine.ts` 等）が加わった。同期は既定で無効であり、`VITE_GOOGLE_CLIENT_ID` が未設定のビルドでは同期関連のUIは表示されない（REQ-1.9）。詳細は各 design.md を参照。
