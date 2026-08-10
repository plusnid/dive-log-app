# dive-log-app — プロジェクトルール

個人のダイビング記録をブラウザ内（IndexedDB）だけで管理する、オフライン優先のPWA。GitHub Pagesでホストする**公開リポジトリ**。詳細な機能一覧・非機能要件は `specs/00-overview.md` を参照（本ファイルでは重複させない）。

## 技術スタック（要点のみ）

- React 19 + TypeScript + Vite、Dexie（IndexedDB）、`vite-plugin-pwa`
- ルーティング自前実装: `src/App.tsx` の `Route` 判別共用体＋履歴スタック
- 依存の向き: `views` → `hooks` / `db/*Repository.ts` → `db/db.ts`（Dexie）。UIはDexieを直接触らない
- Google Drive同期は既定オフ。有効化時のみ本人のDriveへ送信（`src/sync/`、Reactにも Dexieにも非依存）
- Lintはoxlint。自動テストなし（`npm run lint` / `npm run build` が唯一の機械チェック）

## 仕様駆動開発フロー

1. 新機能・仕様変更は必ず `specs/<feature-slug>/requirements.md`（EARS形式）＋ `design.md` を先に用意する。
2. `planner` サブエージェントが仕様のみ作成・更新（`src/` は触らない）。`developer` サブエージェントが仕様に厳密に従って実装（`specs/` は触らない）。`reviewer` サブエージェントが仕様と実装の乖離を検査（読み取り専用）。
3. **plannerが仕様を作成・更新したら、developerを起動する前に必ずユーザーに確認を取る**（未確定事項があれば`AskUserQuestion`で選択肢を提示し、推奨案があっても押し付けない。ユーザーが推奨と異なる選択をしたら、その選択に沿って仕様を更新してから実装に進む）。
4. 新しい最上位機能を追加したら `specs/00-overview.md` の機能一覧テーブルに行を追加する。既存行のステータス（実装済み/仕様策定中）を誤って戻していないか、コミット前に確認する。

## コミット前の必須チェック

- **このリポジトリは公開（GitHub Pages）。コミット・プッシュ前に必ず差分から個人情報・秘密情報（メールアドレス、APIキー、トークン等）が含まれていないか確認する。**
- 明示的に依頼されない限りコミット・プッシュしない。

## 実装時の慣習

- 新規テーブル追加よりも、既存Dexieレコードへの非キー項目追加を優先する（スキーマ変更・同期エンジン変更を避けられるため。過去の判断根拠は各`design.md`を参照）。
- モーダル/オーバーレイUIはネイティブ `<dialog>` + `showModal()` を使う（新規ライブラリ追加なし）。StrictModeの二重effect実行と`dialog`の`close`イベントの相互作用に注意（`suppressCloseRef`パターン、`src/components/ImageLightbox.tsx`参照）。
- 依存パッケージは既存の方針に反しない限り追加しない。
