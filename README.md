# ダイビングログ

個人のダイビング記録をブラウザ内で管理する、オフライン優先のPWA（Progressive Web App）。
React 19 + TypeScript + Vite + Dexie（IndexedDB）で作られており、既定ではサーバーやログイン機能を持たない。

仕様の詳細は [specs/00-overview.md](./specs/00-overview.md) を参照（機能一覧・非機能要件・アーキテクチャ概要）。

## 必要環境

- Node.js 20 以降
- npm

## セットアップ（ローカル開発）

```bash
npm install
npm run dev
```

`http://localhost:5173/` で開く。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 型チェック（`tsc -b`）＋本番ビルド（`dist/`に出力） |
| `npm run lint` | oxlint によるLint |
| `npm run preview` | ビルド済み `dist/` をローカルでプレビュー |

## Google Drive 同期を有効にする（任意）

Google Drive 同期は既定で無効なオプトイン機能。設定しなくてもアプリは通常どおり（完全ローカル・認証なし）動作する。有効にする場合のみ、以下の手順で Google Cloud 側の設定と環境変数が必要（仕様の詳細: [specs/google-drive-sync](./specs/google-drive-sync/requirements.md)）。

個人利用（テストユーザー限定運用）を前提とした手順。

### 1. Google Cloud プロジェクトを作成する

1. [Google Cloud Console](https://console.cloud.google.com/) で新しいプロジェクトを作成する。
2. 「APIとサービス」→「ライブラリ」から **Google Drive API** を有効化する。

### 2. OAuth 同意画面を設定する

1. 「APIとサービス」→「OAuth同意画面」で、User Type を **外部** にして作成する。
2. アプリ名・サポートメール等の必須項目を入力する。公開ステータスは **テスト** のままにする（Googleの審査は不要）。
3. スコープの追加は不要（アプリがコード側で `drive.file` を要求する）。
4. 「テストユーザー」に、実際に使う Google アカウントのメールアドレスを追加する（最大100件）。

### 3. OAuth クライアントIDを作成する

1. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuthクライアントID」。
2. アプリケーションの種類は **ウェブアプリケーション**。
3. 「承認済みの JavaScript 生成元」に、デプロイ先のオリジンを追加する:
   - 本番: `https://<GitHubユーザー名>.github.io`（サブパス配信の場合もオリジンのみでよく、パス部分は不要）
   - ローカル開発用: `http://localhost:5173`
4. 作成後に表示される「クライアントID」をコピーする。

### 4. 環境変数を設定する

- **ローカル開発**: リポジトリ直下に `.env.local` を作成し、以下を記載する（`.env.example` を参照）。
  ```
  VITE_GOOGLE_CLIENT_ID=取得したクライアントID
  ```
  `.env.local` は `.gitignore` 済みのためコミットされない。
- **本番（GitHub Pages）**: 下記「GitHub Pages へのデプロイ」の手順で GitHub Secrets に登録する。

環境変数が未設定の場合、同期関連のUI（設定画面の接続ボタン等）は表示されない。

## GitHub Pages へのデプロイ

このリポジトリはサブパス配信（例: `https://<GitHubユーザー名>.github.io/dive-log-app/`）を前提に設定済み（`vite.config.ts` の `base`、Web App Manifest の `start_url`/`scope`）。別のリポジトリ名で運用する場合はこれらを変更する必要がある。

### 初回セットアップ

1. GitHub リポジトリの **Settings → Pages** を開き、Source を **GitHub Actions** に設定する。
2. Google Drive 同期を使う場合は、**Settings → Secrets and variables → Actions** で `VITE_GOOGLE_CLIENT_ID` という名前のリポジトリ Secret を登録する（値は上記で取得したクライアントID）。同期を使わない場合は未設定のままでよい（同期UIが出ないだけで、デプロイ自体は問題なく行える）。

### デプロイの実行

`main` ブランチへの push（または手動での workflow 実行）をトリガーに、[.github/workflows/deploy.yml](./.github/workflows/deploy.yml) がビルドしてそのまま GitHub Pages に公開する。手動デプロイの操作は不要。

## モバイルでの利用

- サポート対象: iOS/iPadOS 16.4 以降の Safari、Android 10 以降の Chrome（詳細・動作確認マトリクスは [specs/mobile-compatibility](./specs/mobile-compatibility/requirements.md)）。
- オフライン動作・ホーム画面アイコン等を正しく機能させるため、ブラウザタブでの利用よりも「ホーム画面に追加」してのスタンドアロン起動を推奨。

## 仕様書

[specs/00-overview.md](./specs/00-overview.md) をハブとして、機能ごとに `specs/<feature>/requirements.md`（EARS形式の要件）と `design.md`（実装設計）を管理している。
