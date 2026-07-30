# 設計: ガイドサインの記録

関連: [要件](./requirements.md)

## データモデル

サインは `attachments` テーブルに `type: 'signature'` として保存される（[photo-attachment/design.md](../photo-attachment/design.md) と同じ `Attachment` 型・テーブルを共有）。`DiveLog.signatureId?: number` が対象サインを参照する。`guideName?: string` はログ本体のフィールド。

## UIコンポーネント (`src/components/SignaturePad.tsx`)

`forwardRef` + `useImperativeHandle` で、親（`DiveLogFormView`）から命令的に呼べるハンドルを公開する。

```ts
interface SignaturePadHandle {
  clear: () => void
  // undefined = 既存サイン未変更 / null = サインなし・削除 / Blob = 新規描画
  exportBlob: () => Promise<Blob | null | undefined>
}
```

この三値（`undefined` / `null` / `Blob`）が REQ-6 の3分岐にそのまま対応する。

- **描画**: `<canvas>` に `onPointerDown/Move/Up/Cancel/Leave` でストロークを描く。`devicePixelRatio` に合わせて `canvas.width/height` をスケールし、高DPI端末でも滲まないようにする。`touchAction: 'none'` でブラウザのスクロール/ズームジェスチャーと競合しないようにする。
- **既存サインの表示**: `existingSignatureUrl` が渡されている間は `showExisting = true` とし、`<img>` で静止画表示 + 「サインをやり直す」ボタンのみを表示（キャンバスは描画しない）。ボタン押下で `showExisting = false` にしてキャンバスへ切り替える。
- **空判定**: `emptyRef`（描画の有無を追跡する ref）で「一度もストロークが引かれていない」状態を判定し、`exportBlob` が `null` を返す条件に使う。
- **書き出し**: `canvas.toBlob(..., 'image/png')` でPNG Blobを生成。

## 保存フロー（`src/db/diveLogRepository.ts`）

- 新規作成: `signatureBlob: Blob | null` を受け取り、`Blob` があれば `addAttachment('signature', blob)` を実行し `signatureId` にセット。`null` なら `signatureId` は `undefined` のまま。
- 更新: `newSignatureBlob?: Blob | null`（省略可能＝ `undefined` は「変更なし」を意味する）
  - `undefined`: 既存 `signatureId` をそのまま維持。
  - `null`: 既存サインがあれば削除し、`signatureId` を `undefined` に。
  - `Blob`: 既存サインがあれば削除してから新規保存し、`signatureId` を新IDに差し替え。
- 削除: ログ削除時に `signatureId` があれば `photoIds` と合わせて `bulkDelete`。

## 表示（詳細画面）

`views/DiveLogDetailView.tsx` が `signature: Attachment | null` を `URL.createObjectURL` で画像化して表示し、なければ「未サイン」を表示する。
