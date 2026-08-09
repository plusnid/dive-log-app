# 設計: 写真の添付

関連: [要件](./requirements.md)

## データモデル

`src/types/diveLog.ts`

```ts
interface Attachment {
  id?: number
  type: 'photo' | 'signature'
  blob: Blob
  mimeType: string
  createdAt: string
}
```

写真とガイドサインは同じ `attachments` テーブルを共有し、`type` フィールドで区別する（Dexie: `attachments: '++id, type'`）。`DiveLog.photoIds: number[]` が対象ログに属する写真の参照リスト。

[dive-plan-image](../dive-plan-image/design.md) が追加する「ダイビングプラン画像」も、実体は同じ `attachments` テーブルに `type: 'photo'` として同居する（`Attachment.type` に `'plan'` 等の新しい値は追加しない）。プラン画像の添付IDは通常の写真と同様に `DiveLog.photoIds` にも含まれるため、`attachments` テーブルだけを見ても両者は区別できない。写真かプラン画像かは `DiveLog.planImageUuids?: string[]`（プラン画像として扱う `Attachment.uuid` の配列）でのみ区別され、リポジトリ層 (`getDiveLogDetail`) がこの参照をもとに `photos`（プラン画像を除く）と `planImages` を分離して返す。

## 保存フロー（`src/db/diveLogRepository.ts`）

- 新規作成: `photoFiles: File[]` を受け取り、`Promise.all` で各ファイルを `addAttachment('photo', file)` として並列保存し、返ってきたIDの配列を `DiveLog.photoIds` にセット。
- 更新: `UpdateDiveLogOptions.newPhotoFiles` / `removedPhotoIds` を受け取り、
  1. `removedPhotoIds` を `attachments.bulkDelete`
  2. `newPhotoFiles` を追加保存してID配列を取得
  3. 既存 `photoIds` から削除分を除き、新規分を `concat` して最終的な `photoIds` を算出
- 削除: ログ削除時に `photoIds` をまとめて `bulkDelete`（[dive-log-crud/design.md](../dive-log-crud/design.md) 参照）。

## UIコンポーネント (`src/components/PhotoPicker.tsx`)

- Props: `existingPhotos`（保存済み）, `removedExistingIds`（削除マーク済みID）, `onRemoveExisting`, `newFiles`（未保存の新規ファイル）, `onNewFilesChange`。
- 状態はすべて親（`DiveLogFormView`）が保持し、`PhotoPicker` はコントロールドコンポーネント。実DB操作は行わない（送信時にまとめて確定）。
- `existingPhotos` / `newFiles` それぞれについて `URL.createObjectURL` でプレビュー用URLを生成し、`useEffect` のクリーンアップで `URL.revokeObjectURL` を確実に呼ぶ（メモリリーク防止）。
- 表示対象は `removedExistingIds` でフィルタした `visibleExisting` + `newFiles`。
- `<input type="file" accept="image/*" multiple />` で複数選択に対応（`capture` 属性は指定しない。付与するとブラウザによってはカメラが直接起動し、複数選択ができなくなるため）。選択後は `value=''` にリセットし同じファイルの再選択を可能にする。

## 表示（詳細画面）

`views/DiveLogDetailView.tsx` が `getDiveLogDetail` から返る `photos: Attachment[]` を `URL.createObjectURL` で画像URL化し、アンマウント時に `revokeObjectURL` する。

サムネイルをタップして拡大表示する機能は [photo-lightbox](../photo-lightbox/design.md) で追加する。同仕様はここで生成済みの画像URLをそのまま再利用し、写真の再読み込みや追加のオブジェクトURL生成を行わない（[photo-lightbox REQ-9.5](../photo-lightbox/requirements.md)）。

## 既知の制約

- 画像の圧縮・リサイズは行わない（選択したファイルをそのまま `Blob` として保存）。大きな画像を多数添付するとIndexedDBの容量を圧迫する可能性がある。
- 並び替え（表示順の変更）や1枚ずつのキャプション付与はできない。キャプションがないことは、拡大表示の代替テキストで写真の内容を説明できない制約にもつながる（[photo-lightbox/design.md 7](../photo-lightbox/design.md)）。
