# 要件: オフライン動作・PWA化

関連: [設計](./design.md) / [概要](../00-overview.md)

## 概要

このアプリはサーバーを持たない完全クライアントサイドのPWAである。初回アクセス後はネットワーク接続なしで全機能が使え、ホーム画面への追加（インストール）にも対応する。

## 要件（EARS形式）

- REQ-1: システムは、初回アクセス時にアプリ本体（HTML/CSS/JS/アイコン等の静的アセット）をService Workerでキャッシュし、以後のアクセスをオフラインでも可能にするものとする。
- REQ-2: 新しいバージョンがデプロイされたとき、システムはユーザー操作を要さず自動的にService Workerを更新するものとする（`autoUpdate`）。
- REQ-3: ユーザーが対応ブラウザ/OSでアプリをホーム画面に追加（インストール）したとき、システムはスタンドアロン表示（ブラウザUIなし）で起動するものとする。
- REQ-4: システムは、日本語のアプリ名・説明・テーマカラーを含むWeb App Manifestを提供するものとする。
- REQ-5: システムは、通常アイコン（192px/512px）とマスカブルアイコン（512px）を提供し、各プラットフォームのホーム画面表示に対応するものとする。
- REQ-6: すべてのユーザーデータ（ダイビングログ・写真・サイン）は、システムが外部サーバーへ送信することなく、端末内のIndexedDBにのみ保存するものとする（[dive-log-crud](../dive-log-crud/requirements.md), [photo-attachment](../photo-attachment/requirements.md), [guide-signature](../guide-signature/requirements.md)）。
