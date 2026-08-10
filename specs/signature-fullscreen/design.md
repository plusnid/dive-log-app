# 設計: サイン入力の全画面化

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [ガイドサインの設計](../guide-signature/design.md) / [写真の拡大表示の設計](../photo-lightbox/design.md) / [iOS/Android動作保証の設計](../mobile-compatibility/design.md) / [ダイビングログCRUDの設計](../dive-log-crud/design.md) / [Google Drive同期](../google-drive-sync/requirements.md) / [UI仕上げ レベル1設計](../ui-polish-level1/design.md) / [UI仕上げ レベル2設計](../ui-polish-level2/design.md)

ステータス: 実装済み。[要件の未確定事項](./requirements.md#未確定事項確認したい点) 1〜9 はすべてユーザー確定済み（2026-08-10、いずれも本書の推奨案どおり）。

## 設計方針（確定した方針）

- **ブラウザ標準の `<dialog>` に乗る**（→ [1](#1-実装方式ネイティブ-dialog-を使うか)）。[photo-lightbox](../photo-lightbox/design.md) で導入済みの方式を踏襲し、フォーカストラップ・背面の不活性化・Escape・トップレイヤーを自前実装しない。
- **描画する canvas は1つだけにする**（→ [4](#4-既存-signaturepad-との関係)）。フォーム内の欄と全画面の二重管理をやめ、ラスタ画像の拡大転写による劣化・歪みを原理的に起こさない。
- **閉じる操作でユーザーの入力を失わない**（→ [6](#6-閉じる操作の意味と-escape)）。Escape と OS の戻る操作は UA が制御しており確実には抑止できないため、「閉じる＝確定」に倒す。
- **保存フローは変えない**（→ [8](#8-フォームへのデータの受け渡し)）。`SignaturePadHandle.exportBlob()` の三値契約（`undefined` / `null` / `Blob`）と `diveLogRepository` の分岐（[guide-signature/design.md](../guide-signature/design.md)）をそのまま維持する。
- **依存パッケージは追加しない**（REQ-8.1）。
- **配色トークンに従う**。photo-lightbox が背景を例外扱いにしたのに対し、本モーダルは「アプリの入力画面」であるためテーマに追従させる。ただし描画領域だけは白固定（REQ-3.8、[mobile-compatibility REQ-6.5](../mobile-compatibility/requirements.md) の除外規定）。

## 変更対象ファイル

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/components/SignatureDialog.tsx` | 新規 | `<dialog>` による全画面サイン入力（描画・クリア・確定・閉じる・フォーカス管理） | REQ-2.x, REQ-3.x, REQ-4.x, REQ-7.x |
| `src/components/SignatureDialog.css` | 新規 | モーダルのレイアウト・描画領域・操作要素のスタイル | REQ-6.x |
| `src/components/SignaturePad.tsx` | 変更 | 描画機能を `SignatureDialog` へ移し、状態の提示・起動・フォームへの受け渡しに役割を変更 | REQ-1.x, REQ-5.x |
| `src/components/SignaturePad.css` | 変更 | 埋め込みキャンバスのスタイルを、プレビューと起動ボタンのスタイルへ置き換え | REQ-5.6, REQ-6.x |
| `src/components/icons.tsx` | 変更 | `ExpandIcon`（全画面で入力）・`EraserIcon`（クリア）の追加（→ [11](#11-スタイルとアイコン)） | REQ-6.3 |
| `src/App.css` | 変更 | `.detail-signature` に `max-height` / `object-fit` を追加（保存画像の縦横比が可変になる場合） | REQ-6.7 |

**変更しないファイル**: `src/views/DiveLogFormView.tsx`（[8](#8-フォームへのデータの受け渡し) 案A採用のため）、`src/types/`、`src/db/`、`src/sync/`、`src/hooks/`、`src/platform/`、`src/App.tsx`（REQ-8.3, REQ-8.4, REQ-9.1）。

---

## 0. 実装前の現状（変更の前提となった事実）

### `src/components/SignaturePad.tsx`（変更前）

- `forwardRef` + `useImperativeHandle` で `SignaturePadHandle { clear, exportBlob }` を公開。**`clear()` はどこからも呼ばれておらず**削除対象（`DiveLogFormView` が使うのは `exportBlob()` のみ、`src/views/DiveLogFormView.tsx:285`）。
- `showExisting` state（初期値 `Boolean(existingSignatureUrl)`）で「既存サインの静止画表示」と「描画キャンバス」を切り替え。表示中は `exportBlob()` が `undefined`（＝変更なし）を返す。`emptyRef`（`boolean` の ref）で未描画を判定し `null` を返す条件に使う。
- 描画は `setPointerCapture` ベース、終了判定に `onPointerLeave` を含む現状実装（全画面化での扱いは [1-2(b)](#b-ポインタイベントとヒットテスト)）。座標は `getBoundingClientRect()` からの相対値（`clientX - rect.left`）。
- `setupCanvas(preserveContent)` が `devicePixelRatio` に合わせて `canvas.width/height` を設定し `ctx.scale(dpr, dpr)` する。**`rect.width === 0 || rect.height === 0` のときは何もせず return する**——これが全画面化で顕在化する「canvasサイズ確定タイミング」問題の原因（→ [1-2(c)](#c-canvas-のサイズ確定タイミング--最も注意が必要な点)）。
- `ResizeObserver` でサイズ変化を検知し `setupCanvas(true)` を呼ぶ。復元は**縦横比を保たずに引き伸ばす**実装だった（高さ160px固定のため実害は小さかったが、全画面化で向きが変わると歪みが致命的になる → [5](#5-描画領域の形と書き出し画像の縦横比) で contain 方式に変更）。
- 書き出しは `canvas.toBlob(cb, 'image/png')`。**背景は塗っておらず、保存PNGは透明背景に黒線**（→ [9](#9-書き出し解像度と保存サイズ) でこの挙動を維持）。`ctx.lineWidth = 2.5`、`lineCap`/`lineJoin` は `'round'`、`strokeStyle = '#1a1a1a'`。

### `src/views/DiveLogFormView.tsx`（変更なし箇所）

```
 91: const [existingSignatureUrl, setExistingSignatureUrl] = useState<string | null>(null)
 94: const signaturePadRef = useRef<SignaturePadHandle>(null)
139: setExistingSignatureUrl(signature ? URL.createObjectURL(signature.blob) : null)
245: if (existingSignatureUrl) URL.revokeObjectURL(existingSignatureUrl)
285: const signatureBlob = await signaturePadRef.current?.exportBlob()
567: <SignaturePad ref={signaturePadRef} existingSignatureUrl={existingSignatureUrl} />
```

`SignaturePad` は `<form className="view dive-log-form">` → `<fieldset>` の子孫として描画される。この入れ子関係が [1-2(d)](#d-form-の中に-dialog-を置くことの制約) の制約に効く。

### 既存モーダルの前例（`src/components/ImageLightbox.tsx`）

- `canShowLightbox`（`HTMLDialogElement.prototype.showModal` の存在判定）をモジュールスコープで1度だけ評価する。
- `useEffect` で `showModal()`、クリーンアップで `close()`。
- **`suppressCloseRef`**: React StrictMode の開発時二重実行でクリーンアップの `dialog.close()` が `close` イベントを発火させ、`onClose` 経由で親 state を巻き戻してしまう問題への対策。本仕様でも同じ対策が必要で、しかも本モーダルでは `close` が「確定」を意味しうるため（[6](#6-閉じる操作の意味と-escape)）**取り違えるとサインが二重に確定・消失する**。より慎重な実装が要る。

---

## 1. 実装方式（ネイティブ `<dialog>` を使うか）

**`<dialog>` + `showModal()` を採用。** photo-lightbox で導入・検証済みの方式であり、フォーカストラップ・背面の不活性化（`inert` 相当）・トップレイヤーでの重なり順をUAに任せられ、アプリ内のモーダル実装方式を1種類に統一できる。自前オーバーレイ（`position: fixed`）は不採用——唯一の優位点は「Escapeを完全に握れる」ことだが、[6](#6-閉じる操作の意味と-escape) で「閉じる＝確定」に倒せば不要になる。なお **Chrome 120以降、OSの戻る操作は `CloseWatcher` と統合され `<dialog>` の close に消費される見込み**（自前オーバーレイでは戻る操作に反応せずアプリ／タブを離れてしまう）。

サポート対象（[mobile-compatibility](../mobile-compatibility/requirements.md) Tier 1: iOS/iPadOS 16.4以降 Safari、Android 10以降 Chrome）における `<dialog>` 対応状況は [photo-lightbox/design.md 1](../photo-lightbox/design.md#1-実装方式の比較) で確認済み。本仕様で追加で必要になるAPIは次のとおりで、いずれも Tier 1 で利用可能である。

| API | 用途 | Safari | Chrome |
| --- | --- | --- | --- |
| Pointer Events / `setPointerCapture` | 描画（現状の `SignaturePad` で使用中） | 13 以降 | 55 以降 |
| `ResizeObserver` | 描画領域のサイズ追従（現状使用中） | 13.1 以降 | 64 以降 |
| `HTMLCanvasElement.toBlob` | PNG書き出し（現状使用中） | 11 以降 | 50 以降 |
| `lostpointercapture` イベント | ストローク終了判定（[1-2(b)](#b-ポインタイベントとヒットテスト)） | 13 以降 | 55 以降 |

### 1-2. canvas を `<dialog>` の中に置いたときの技術的検証

懸念点（「dialog のトップレイヤー化が canvas の座標計算に影響しないか」「pointer capture の範囲」）への回答。

#### (a) 座標計算への影響 — **影響しない**

- トップレイヤーは**ペイント順序**の概念であり要素の幾何（レイアウト座標）を変えない。`getBoundingClientRect()`/`PointerEvent.clientX/Y` は引き続きビューポート基準の CSS ピクセル座標のため、現状の `getPos()` の式（`clientX - rect.left`）はそのまま成立する。モーダルの包含ブロックは初期包含ブロック（ビューポート）になり `#root { max-width: 640px }` に縛られず全画面化できる（photo-lightbox で実証済み。祖先に `transform`/`filter`/`backdrop-filter`/`will-change` があると前提が崩れうるが現状 `.dive-log-form` の祖先にはない）。
- `<canvas>` の描画バッファ座標（`canvas.width/height`、デバイスピクセル）は CSS 表示サイズと独立しており、現状どおり `ctx.scale(dpr, dpr)` で揃えるため計算式はモーダル化しても変わらない。

#### (b) ポインタイベントとヒットテスト

- トップレイヤーの要素は**最前面でヒットテストされる**ため、背面のフォーム要素にイベントを奪われない。
- `setPointerCapture(pointerId)` は**要素単位の API** でトップレイヤーとは独立して機能する。キャプチャ中は `pointermove`/`pointerup` が canvas に配送され続けるため、**指が描画領域の外（ヘッダーやボタンの上）へ出て戻っても1本の連続したストロークとして扱われる**（REQ-3.4）。
- **現状の `onPointerLeave={endStroke}` は全画面では外すべきである。** ポインタキャプチャ中の `pointerleave` の発火タイミングには実装差があり、全画面では描画領域が画面のほぼ全体を占めるため「領域外へ出たら即終了」はむしろ誤動作（画面端まで書いた線が途切れる）になる。終了判定は次の3つのみにする。

  ```
  onPointerUp / onPointerCancel / onLostPointerCapture → endStroke()
  ```

- `touch-action: none` は canvas に指定する（現状どおり、REQ-3.2）。加えて `<dialog>` 自身に `overscroll-behavior: contain` を指定し、引っ張って更新を抑止する（`body` には既に `overscroll-behavior-y: contain` がある）。`-webkit-touch-callout: none`/`user-select: none` も現状どおり canvas に指定する（REQ-3.3）。
- **iOS Safari のブラウザタブ起動では、画面の左端／右端からの横スワイプがブラウザの「戻る／進む」ジェスチャーに消費される。** 描画領域を画面端いっぱいに置くと左端から書き始めた線が取られる可能性があるため、左右に余白（8px程度＋セーフエリア）を確保する（[11](#11-スタイルとアイコン)）。完全には防げないため既知の制約に記載する。

#### (c) canvas のサイズ確定タイミング — **最も注意が必要な点**

閉じている `<dialog>` は UA スタイルシートで `display: none` である。この状態では `getBoundingClientRect()` が 0×0 を返し、現状の `setupCanvas()` は早期 return して**描画バッファが既定値（300×150）のまま**になる。対策は次の3点を組み合わせる。

1. **開いているときだけマウントする**。親が `{open && <SignatureDialog … />}` で条件レンダリングし「マウント＝開く、アンマウント＝閉じる」に揃える（photo-lightbox と同じ）。
2. **`showModal()` を canvas セットアップより先に実行する**。同一コンポーネント内の `useEffect` は宣言順に実行されるため `showModal()` の effect を canvas セットアップの effect より上に書く。`showModal()` はレイアウトを同期的に確定させるため、直後の `getBoundingClientRect()` は正しい値を返す。
3. **`ResizeObserver` を保険として残す**。1・2の順序に依存しきらず、サイズが 0 → 実サイズに変わった時点で再セットアップされるようにする（現状の実装を流用）。

#### (d) `<form>` の中に `<dialog>` を置くことの制約

`SignaturePad` は `<form className="view dive-log-form">` の子孫にあるため、その中に置いた `<dialog>` も **DOM 上はフォームの子孫**になる（トップレイヤーに表示されても DOM ツリー上の位置は変わらない）。ここから次の制約が生じる。

| 制約 | 対処 |
| --- | --- |
| `<button>` の既定 `type` は `submit`。モーダル内のボタンに `type` を付け忘れると**ダイビングログが保存されてしまう** | モーダル内のすべてのボタンに `type="button"` を明示する（既存の `SignaturePad` も同様に付与済み） |
| `<form method="dialog">` による閉じ方は使えない（入れ子 `<form>` は HTML 的に不正） | 閉じる操作は `dialogRef.current.close()` の明示呼び出しで行う |
| モーダル内にテキスト入力があると Enter で暗黙のフォーム送信が起きうる | REQ-2.7 によりモーダル内に入力欄を置かない（ガイド名はフォーム側のまま） |
| `<fieldset disabled>` を将来使うとモーダル内のボタンも無効化される | 現状 `disabled` な fieldset は使っていない。使う場合は portal 化を検討する |

`createPortal` でフォームの外に出す代替案は採らない——構造が読みにくくなる上、React の合成イベントは portal でもツリー通りに伝播しフォーム側へバブルするため根本解決にならず、上記の対処で十分なため。

### 1-3. Escape と `cancel` イベントの制約

- `<dialog>` は Escape で `cancel` → `close` の順にイベントを発火する。`cancel` で `preventDefault()` すれば閉じるのを止められる。
- ただし **Chrome には「短時間のうちに2回目の Escape が押された場合、`cancel` のキャンセルを無視して強制的に閉じる」挙動**がある（無限に閉じられないダイアログを防ぐ仕様）。したがって「Escape では絶対に閉じない」は保証できない。
- Android の戻る操作（CloseWatcher 統合）も同じ `cancel` → `close` の経路を通るため、同じ制約を受ける。
- **結論**: Escape を握って確認ダイアログを挟む設計は確実には成立しない。これが「閉じる＝確定」（[6](#6-閉じる操作の意味と-escape)）を採る技術的根拠である。

### 1-4. StrictMode 二重実行への対策

`ImageLightbox` の `suppressCloseRef` と同じ対策が必要。本モーダルでは `close` が確定処理を伴うため、以下を守る。

- クリーンアップ由来の `dialog.close()` の前にフラグを立て、`close` ハンドラでフラグが立っていたら**確定処理も `onClose()` も実行しない**。
- 確定処理（`canvas.toBlob`）は `close` ハンドラの中で1回だけ実行し、実行済みフラグで二重実行を防ぐ。

---

## 2. `SignatureDialog` のAPI

```tsx
interface SignatureDialogProps {
  /**
   * 開いた時点で描画済みとして復元する画像のURL（確定済みサインのオブジェクトURL）。
   * null / 省略なら未描画から開始する（REQ-5.4）。
   */
  initialImageUrl?: string | null
  /**
   * 確定（REQ-4.5）。閉じる直前に必ず1回だけ呼ばれる。
   * null = 未描画のまま閉じた（サインなし）。Blob = 描画されたサイン。
   */
  onCommit: (blob: Blob | null) => void
  /** 確定処理の完了後に呼ばれる。親はこれを受けてアンマウントする */
  onClose: () => void
}

/** ブラウザが `<dialog>` のモーダル表示に対応しているか（REQ-8.7）。モジュールスコープで1度だけ判定する。 */
export const canUseSignatureDialog: boolean =
  typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function'
```

- **開いているときだけマウントする**（[1-2(c)](#c-canvas-のサイズ確定タイミング--最も注意が必要な点)）。
- 部品は DB にも Dexie にもアクセスしない（REQ-8.5）。`Blob` を親へ返すだけで、永続化はフォーム送信時（`diveLogRepository`）に行う。
- `initialImageUrl` は `SignaturePad` が保持する確定済み Blob のプレビューURLをそのまま渡す（新規に `createObjectURL` しない。REQ-8.6）。

### マークアップの骨子

```tsx
<dialog
  ref={dialogRef}
  className="signature-dialog"
  aria-label="ガイドのサインを入力"       {/* REQ-7.4 */}
  onClose={handleNativeClose}             {/* Escape / OSの戻る / close() をすべてここで受ける */}
>
  <div className="signature-dialog__header">
    <button type="button" className="signature-dialog__clear" onClick={handleClear}>
      <EraserIcon /> クリア                {/* REQ-3.6, REQ-6.4 */}
    </button>
    <h2 className="signature-dialog__title">ガイドのサイン</h2>
    <button type="button" className="signature-dialog__done" onClick={requestClose}>
      完了                                  {/* REQ-4.1 */}
    </button>
  </div>

  <div className="signature-dialog__stage">
    <canvas
      ref={canvasRef}
      className="signature-dialog__canvas"
      aria-label="サインの描画領域。指またはスタイラスでサインを描いてください。"   {/* REQ-7.7 */}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onLostPointerCapture={endStroke}     {/* onPointerLeave は使わない（1-2(b)） */}
    />
    {empty && <p className="signature-dialog__placeholder" aria-hidden="true">ここにサインしてください</p>}  {/* REQ-3.9 */}
  </div>
</dialog>
```

- プレースホルダーは canvas の**外側**に重ねて配置する（`position: absolute`）。canvas に描き込まないため、書き出される画像には含まれない（REQ-3.9 後段）。
- `<h2>` をモーダル内に置くが、`aria-label` をダイアログ自身に与えているため見出しとの二重読み上げは起きない。
- 「完了」は `button[type='submit']` ではないため、グローバルの accent 塗りが当たらない。primary 相当の見た目は `.signature-dialog__done` で明示する（[11](#11-スタイルとアイコン)）。

### 確定処理の非同期性（実装上の落とし穴）

`canvas.toBlob()` は**非同期**である一方 `close` イベントは同期的に発火し、その直後に親が state を更新してアンマウントしうる。そのため `close` ハンドラ（または「完了」ボタン）を受けたら**その場で同期的に** `canvas.toBlob(cb, 'image/png')` を呼び（この時点では canvas はまだ存在する）、コールバックで `onCommit(blob)` → `onClose()` を呼んで親が初めてアンマウントする、という順序を守る。canvas が DOM から外れた後でもコールバックは動作する（`HTMLCanvasElement` への参照が生きていれば描画バッファは有効）ため、コールバックが遅れても結果は失われない。

「完了」ボタン経由と `close` イベント経由が二重に走らないよう `committedRef` で1回だけ実行し、`requestClose()` は `dialogRef.current.close()` を呼ぶだけにして**確定処理は `close` ハンドラ1箇所に集約する**（Escape・OSの戻る・完了ボタンのすべてが同じ経路を通る＝ [6](#6-閉じる操作の意味と-escape) と整合する）。

---

## 3. サインモーダルを開く操作

**サイン欄をプレビュー＋起動ボタンに変更する方式を採用。** 埋め込みキャンバス＋拡大ボタンや「タップで自動的に開く」方式は不採用。決め手は「タップで自動的に開く」方式では `pointerdown` でモーダルを開くとその指の動きがモーダル内 canvas に届かず**最初のストロークが失われる**こと。この方式の唯一の欠点は**デスクトップでサイン欄に直接描けなくなる退行**だが、[概要 NFR-3](../00-overview.md) のとおり主要利用シーンはスマートフォンでありデスクトップは Tier 2（[mobile-compatibility](../mobile-compatibility/requirements.md)）のため許容する。

### サイン欄の見た目

| 状態 | サイン欄の表示 | 操作要素 |
| --- | --- | --- |
| 未サイン | 「未サイン」の破線枠プレースホルダー | 「サインを入力する」（`ExpandIcon` ＋ テキスト） |
| 既存サインあり（編集時） | 既存サイン画像のプレビュー | 「サインをやり直す」／「サインを削除」（→ [7](#7-既存サインの削除と未描画で閉じたときの扱い)） |
| 新しく描いたサインあり | 確定済み Blob のプレビュー | 「サインを描き直す」／「サインを削除」 |

3状態が視覚的に区別できること（REQ-5.6）を、プレースホルダー／プレビューとボタン文言で満たす。

---

## 4. 既存 `SignaturePad` との関係

**描画 canvas はモーダル内の1つだけとする。** 埋め込みとモーダルの2つを `drawImage` で相互転写する方式は不採用。決め手は画質と歪み: iPhone 相当（`devicePixelRatio = 3`）で試算すると埋め込み欄（358×160、約2.24:1横長）と全画面（約374×690、約0.54:1縦長）とで縦横比が反転し、単純な `drawImage` では**縦に約4.3倍引き伸ばされる**。`contain` で縦横比を保つと今度は実効解像度が埋め込み欄基準（358×160相当）のままになる。**大小2つの描画領域を行き来させる設計は、縦横比が大きく異なる時点で破綻する。**

### `SignaturePad` の新しい責務

描画ロジックを `SignatureDialog` へ移し、`SignaturePad` は次の状態機械を持つ「状態の提示＋起動＋受け渡し」の部品になる。

```ts
type SignatureState =
  | { kind: 'existing' }                        // 既存サインを維持（exportBlob → undefined）
  | { kind: 'none' }                            // 未サイン／削除（exportBlob → null）
  | { kind: 'drawn'; blob: Blob; url: string }  // 新規描画（exportBlob → blob）

const [state, setState] = useState<SignatureState>(
  existingSignatureUrl ? { kind: 'existing' } : { kind: 'none' },
)
```

- `exportBlob()` は `state` を三値へ写像するだけになる（**`canvas.toBlob()` の非同期処理がフォーム送信経路から消える**ため送信時の失敗要因が1つ減る、副次的な改善）。`clear()` は使われていないため handle から削除し（[0節](#0-実装前の現状変更の前提となった事実)）、`SignaturePadHandle` は `exportBlob` のみになる。
- `existingSignatureUrl` が後から変化したときは `kind: 'drawn'` を上書きしないよう「変化時のみ」に限定して `state` を再初期化する（現状の `showExisting` 同期と同じ役割）。
- `kind: 'drawn'` の `url` は `URL.createObjectURL(blob)` で作り、**差し替え時と `SignaturePad` のアンマウント時に `revokeObjectURL` する**（REQ-8.6）。

### REQ-5.4（開き直して続きから描く）の実現

`SignaturePad` が `state.kind === 'drawn'` のとき、モーダルへ `initialImageUrl={state.url}` を渡す。`SignatureDialog` は `setupCanvas()` の直後に `<img>` へ読み込んで `drawImage` する。**同じ描画領域サイズへ戻すため拡大縮小は起きず、劣化は実質ない**（PNG は可逆圧縮）。読み込みが非同期（`img.decode()`/`onload`）であるため、次の順序を守る。

1. `showModal()` → レイアウト確定
2. `setupCanvas(false)`
3. `initialImageUrl` があれば `img.onload` で `ctx.drawImage(img, 0, 0, rect.width, rect.height)` し、`emptyRef.current = false` にする
4. 復元が完了するまでプレースホルダー（REQ-3.9）を出さない

---

## 5. 描画領域の形と書き出し画像の縦横比

**採用: ヘッダーを除く画面全体を描画領域にする**（iPhone相当・390×844CSSpx試算で約374×690、現状比で面積約4.5倍）。保存画像の縦横比は端末の向きに応じて可変になる（縦向き0.54:1／横向き2.4:1）ため `.detail-signature` に `max-height`（REQ-6.7）が必要になる。「最大2:1の矩形に収める」案は現状とほぼ変わらない面積（約1.2倍）にとどまり要望（画面いっぱい）を満たさないため不採用。「90°回転して横長に使う」案は次の理由で不採用。

### 90°回転を採用しない理由

`transform: rotate(90deg)` を canvas に当てると、`getBoundingClientRect()` は**回転後のバウンディングボックス**（軸に平行な外接矩形）を返す。現状の `getPos()`（`clientX - rect.left`）はそのままでは使えず、回転の逆変換を自前で行う必要がある。

```
// 90°回転時の逆変換（要自前実装）
const localX = e.clientY - rect.top
const localY = rect.width - (e.clientX - rect.left)
```

さらに `devicePixelRatio` のスケール、`ResizeObserver` による再セットアップ、画面の向きが変わったときの再計算が全て回転を考慮する必要があり、**このアプリでポインタ処理の不具合が最も起きやすい箇所**になる。自動テストがない（[概要](../00-overview.md)）ため回帰も検知できない。得られる面積（採用案とほぼ同じ）に対してリスクが見合わない。

### 採用案の対処

1. **`.detail-signature` の調整**（REQ-6.7）: 現状 `max-width: 300px` のみで `max-height` がないため、縦長画像が詳細画面で縦に伸びる。

   ```css
   .detail-signature {
     max-width: 300px;
     max-height: 40svh;   /* 追加 */
     object-fit: contain; /* 追加 */
     /* border / border-radius / background は現状のまま */
   }
   ```

   `SignaturePad` のプレビューにも同様の指定を行う。

2. **画面の向きが変わったときのストローク保持**（REQ-3.7）: 現状の `setupCanvas(true)` は縦横比を無視して引き伸ばす（[0節](#0-実装前の現状変更の前提となった事実)）。全画面では歪みが致命的になるため、**縦横比を保って中央に収める（contain）** 方式へ変更する。

   ```ts
   const scale = Math.min(rect.width / prevCssWidth, rect.height / prevCssHeight)
   const drawW = prevCssWidth * scale
   const drawH = prevCssHeight * scale
   ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height,
                 (rect.width - drawW) / 2, (rect.height - drawH) / 2, drawW, drawH)
   ```

   縦→横の回転では縮小方向になるため画質劣化は小さい。横→縦では拡大になりぼやけるが、ストロークが消えるよりは良い（[mobile-compatibility REQ-5.5](../mobile-compatibility/requirements.md) は「保持するか、失われる旨を認識できる状態」を求めており、保持側で満たす）。

3. **書き出しは描画領域の実サイズのまま行う**（トリミングしない）。余白は透明のまま保存され、表示側の `object-fit: contain` で吸収される。

---

## 6. 閉じる操作の意味と Escape

**採用: オートコミット**（「クリア」「完了」の2ボタンのみ。完了・Escape・OSの戻る操作いずれも確定して閉じる）。「キャンセル」や「破棄して閉じる」を含む多ボタン構成は不採用。

決め手は [1-3](#1-3-escape-と-cancel-イベントの制約) の技術的制約である。Escape と OS の戻る操作は UA が制御しており、`cancel` の `preventDefault()` は Chrome の強制クローズによって確実には効かない。したがって「閉じる＝破棄」にすると、**ユーザーが意図せず入力を失う経路が原理的に残る**。「閉じる＝確定」にすればこの経路が消え、確定処理も `close` ハンドラ1箇所に集約できる（REQ-4.3）。

案の操作の意味は次のとおり。

| 操作 | 結果 |
| --- | --- |
| 「完了」ボタン | 描画内容を確定して閉じる |
| Escape | 同上 |
| OSの戻る操作（Chrome 120以降） | 同上 |
| 「クリア」ボタン | 描画内容を全消去（モーダルは開いたまま） |
| 描画領域上のポインタ操作 | 描画のみ。閉じない（REQ-4.4） |
| 背景（描画領域外の余白）のタップ | **閉じない**（photo-lightbox REQ-5.2 とは異なる。入力中に余白へ指が触れて閉じるのを避けるため） |

「破棄したい」場合は「クリア」→ 閉じる、という2手になる。

---

## 7. 既存サインの削除と「未描画で閉じたとき」の扱い

**本仕様で唯一、既存の要件（[guide-signature REQ-6](../guide-signature/requirements.md)）の変更を伴う論点である。**

現状の `SignaturePad` は「既存サインの静止画表示」から「サインをやり直す」を押すと空のキャンバスに切り替わり、そのまま何も描かずに保存すると `exportBlob()` が `null` を返して**既存サインが削除される**（[guide-signature REQ-6](../guide-signature/requirements.md) の2番目の分岐）。現状は空のキャンバスが視覚的に見えるため「消えた」ことが分かるが、モーダル化すると「やり直すつもりで開き、やっぱりやめて閉じる」操作が自然に発生し（全画面が心理的な区切りになる）、フォームに戻ったときに既存サインが黙って消えることになる。

**採用: 未描画のまま閉じても既存サインは維持する。** 削除は明示的な「サインを削除」ボタン（サイン欄側、モーダル外）でのみ行う——モーダル内だと「クリア」（描画中の内容を消す）との違いが分かりにくく誤操作を招くため。「やり直す」→何もしない、で暗黙に削除される現状踏襲案は、[6](#6-閉じる操作の意味と-escape)（オートコミット）と組み合わせると「モーダルの開閉だけではデータが減らない」という一貫した性質になり不採用。削除は破壊的操作なので `window.confirm('保存済みのサインを削除しますか？')` を挟むかは実装時に決める（アプリの既存の削除確認は `window.confirm`。[概要の既知の制約](../00-overview.md)）。リポジトリへの影響はなし（三値契約は不変。REQ-8.4）。

### `guide-signature` の更新（本仕様の確定に伴う反映）

[guide-signature/requirements.md](../guide-signature/requirements.md) の REQ-5・REQ-6 を次のように改める。

- REQ-5: 「空の描画キャンバスに切り替え」→「全画面のサイン入力を未描画の状態で開く」。
- REQ-6 の2番目の分岐: 「やり直す後クリアされたまま/未描画の場合は削除」→「**ユーザーが明示的にサインの削除を選択した場合**に削除」。

---

## 8. フォームへのデータの受け渡し

**採用: `exportBlob()` の三値契約を維持する**（`DiveLogFormView` へ state を持ち上げる案は不採用）。三値は [guide-signature/design.md](../guide-signature/design.md) のとおりリポジトリの3分岐と1:1で対応しており、持ち上げてもフォーム側に同じ三値が現れるだけで変更範囲が広がるわりに得るものがなく、`DiveLogFormView` は無変更で済む（回帰リスクが低い）。なお `SignaturePad` が状態を持つ設計は「親が状態を持つ」という photo-lightbox の方針から外れるが、これは**本仕様で新たに導入する逸脱ではなく現状の `SignaturePad` が既にそうなっている**（`showExisting`/`emptyRef`/描画内容を内部に持つ）ものを明示的な `SignatureState`（[4](#4-既存-signaturepad-との関係)）に整理するだけで、むしろ現状より見通しがよくなる。

### データフロー

```
[編集フォーム読み込み]
  DiveLogFormView: signature → URL.createObjectURL → existingSignatureUrl (line 139)
  SignaturePad:    state = { kind: 'existing' }、プレビューに existingSignatureUrl を表示

[「サインをやり直す」]
  SignaturePad:    setOpen(true) → <SignatureDialog initialImageUrl={null} … /> をマウント

[モーダルで描いて閉じる]
  SignatureDialog: close ハンドラ → canvas.toBlob → onCommit(blob) → onClose()
  SignaturePad:    旧 url を revoke → state = { kind: 'drawn', blob, url: createObjectURL(blob) }
                   → プレビューを差し替え、モーダルをアンマウント、フォーカスを起動ボタンへ戻す

[フォーム送信]
  DiveLogFormView: await signaturePadRef.current.exportBlob()   ← 変更なし (line 285)
  SignaturePad:    state.kind === 'drawn'    → state.blob
                   state.kind === 'existing' → undefined
                   state.kind === 'none'     → null
  diveLogRepository: 既存の3分岐（変更なし）
```

### オブジェクトURLの生成・解放の責務（REQ-8.6）

| URL | 生成 | 解放 |
| --- | --- | --- |
| `existingSignatureUrl`（既存サインのプレビュー） | `DiveLogFormView`（line 139） | `DiveLogFormView`（line 245）**現状のまま** |
| 確定済み Blob のプレビューURL | `SignaturePad`（`onCommit` 時） | `SignaturePad`（次の確定で差し替えるとき／削除されたとき／アンマウント時） |
| モーダルの復元用URL（`initialImageUrl`） | 生成しない（上のプレビューURLを再利用） | — |

`SignaturePad` 側の解放は、`state` を更新する箇所と `useEffect` のクリーンアップの**両方**が必要になる（`useState` の更新関数の中で `revoke` すると StrictMode の二重実行で二重解放になりうるため、直前の値を ref で持って解放する）。

---

## 9. 書き出し解像度と保存サイズ

**採用: 解像度に上限を設けない**（現状の `setupCanvas` のまま。`dpr` と長辺をクランプする案は不採用）。

試算（`devicePixelRatio = 3`、[5](#5-描画領域の形と書き出し画像の縦横比) 採用案）: 現状（埋め込み欄 358×160、描画バッファ約51.6万px）に対し、全画面は縦向きで約232.3万px（約4.5倍）、横向きで約210.6万px（約4.1倍）になる。保存されるのは**透明背景に濃い線（`#1a1a1a`、線幅2.5）だけ**の画像であり、PNGは可逆圧縮でほぼ全域を占める透明部分を強く圧縮するため、**ファイルサイズはピクセル数に対して線形には増えない**。実測前の見積もりは現状概ね10〜30KB、全画面で概ね30〜90KBを想定する。[photo-attachment](../photo-attachment/requirements.md) の写真（1枚2〜5MB、縮小・サイズ制限なし）と比べサイン画像の増分は写真1枚の1/50以下であり、IndexedDBの容量や[Google Drive同期](../google-drive-sync/requirements.md)の転送量への影響は無視できる。

**決め手**: 実害が小さく実装を増やさない。ただし実装後に実サイズを実測し、想定を大きく超える場合は `min(dpr, 2)` ＋ 長辺1600px超はオフスクリーンcanvasで縮小、という案へ切り替える（`SignatureDialog` の内部だけで完結する変更で済む）。

### 透明背景を維持する（重要）

現状 canvas は白で塗りつぶしておらず、**保存される PNG は透明背景**である。見た目が白いのは表示側（`.detail-signature`/`.signature-pad__preview` の `background: #fff`）が白を敷いているため。**本仕様ではこの挙動を変更しない。** 書き出し時に白で塗りつぶすと、(1) 既存の透明背景画像と新規の白背景画像が混在する、(2) 全域が不透明になりファイルサイズが増える、(3) [Google Drive同期](../google-drive-sync/requirements.md)で端末間に混在データが行き来する、という不整合が生じるため。**描画領域の白は CSS の `background` で表現し、canvas には描き込まない。**

---

## 10. 画面遷移の履歴との関係

**採用: ローカル state のみで管理する**（`src/App.tsx` の `Route` に載せる案は不採用）。`Route` 案は「OSの戻る操作で閉じたい」動機に見えるが、既存設計ではアプリ内履歴がOSの戻る操作と連動しないため（[marine-life-observation REQ-11.19](../marine-life-observation/requirements.md)）その効果は得られず、逆に [marine-life-observation REQ-11.5](../marine-life-observation/requirements.md)（履歴は画面種別＋識別子のみ）に反し、`src/App.tsx` の `Route` 型・分岐・`isSameRoute` の変更が必要になる。`<dialog>` を採用したことで（[1](#1-実装方式ネイティブ-dialog-を使うか)）ブラウザ標準の機能として戻る操作が「閉じる」に割り当てられるため、これで十分である。

**[6](#6-閉じる操作の意味と-escape) との連動**: OS の戻る操作で閉じられるということは、閉じる＝破棄の設計を採っていれば戻る操作でサインが消えることを意味する。オートコミットを採ったためこの問題は生じない。

REQ-9.2（画面遷移時にモーダルを残さない）・REQ-9.4（リロードで保持しない）は、`DiveLogFormView` がアンマウントされれば `SignaturePad` の `open` state ごと消えるため自動的に満たされる。

---

## 11. スタイルとアイコン

### `SignatureDialog.css`

| クラス | 主な指定 | 根拠 |
| --- | --- | --- |
| `.signature-dialog` | `width: 100dvw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: var(--bg); color: var(--text); overflow: hidden; overscroll-behavior: contain; display: flex; flex-direction: column` | UA既定の打ち消し＋全画面（REQ-2.1）。photo-lightbox と違い**配色トークンに従う**（REQ-6.1） |
| `.signature-dialog::backdrop` | `background: rgb(0 0 0 / 0.5)` | 全画面を覆うため通常は見えないが、UA差で隙間が出た場合の保険 |
| `.signature-dialog__header` | `display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: calc(0.5rem + env(safe-area-inset-top)) calc(0.5rem + env(safe-area-inset-right)) 0.5rem calc(0.5rem + env(safe-area-inset-left)); border-bottom: 1px solid var(--border); flex-shrink: 0` | REQ-2.6（セーフエリア）、REQ-2.2 |
| `.signature-dialog__title` | `margin: 0; font-size: 1rem; font-weight: 600` | 見出しがヘッダーの高さを押し上げないように `<h2>` の既定を打ち消す |
| `.signature-dialog__clear` / `__done` | `min-height: 44px; min-width: 44px`（グローバル `button` を活かす）。`__done` は `background: var(--accent); color: var(--on-accent); border-color: var(--accent)` | REQ-2.8。`type="submit"` にできない（[1-2(d)](#d-form-の中に-dialog-を置くことの制約)）ため accent 塗りを明示 |
| `.signature-dialog__stage` | `position: relative; flex: 1; min-height: 0; display: flex; padding: 8px calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left))` | REQ-2.6。左右の 8px は iOS の端スワイプ回避（[1-2(b)](#b-ポインタイベントとヒットテスト)） |
| `.signature-dialog__canvas` | `flex: 1; width: 100%; height: 100%; background: #fff; border: 1px solid var(--border); border-radius: 8px; touch-action: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; cursor: crosshair` | REQ-3.2, REQ-3.3, REQ-3.8。**背景の白は CSS のみ**（[9](#9-書き出し解像度と保存サイズ)） |
| `.signature-dialog__placeholder` | `position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: #9aa7b4; font-size: 0.95rem; pointer-events: none` | REQ-3.9。白背景の上に置くためトークンではなく固定色。`pointer-events: none` で描画を妨げない |
| `.signature-dialog button:focus-visible` | `outline: 2px solid var(--accent); outline-offset: 2px` | REQ-7.9 |

`100dvh` を使う理由は photo-lightbox と同じ（iOS のアドレスバー分のずれ）。`env(safe-area-inset-*)` は `<dialog>` がトップレイヤーにあり `#root` の padding の外側になるため、モーダル側で改めて確保する（REQ-2.6）。

### `SignaturePad.css` の変更

| クラス | 変更 |
| --- | --- |
| `.signature-pad__canvas` | **削除**（埋め込みキャンバスを廃止する場合） |
| `.signature-pad__preview` | `max-height` を追加し `object-fit: contain` を維持（[5](#5-描画領域の形と書き出し画像の縦横比) で縦横比が可変になるため） |
| `.signature-pad__placeholder`（新規） | 未サイン時の破線枠。`border: 1px dashed var(--border); border-radius: 6px; min-height: 88px; display: grid; place-items: center; color: var(--text-muted)` |
| `.signature-pad__actions`（新規） | ボタンを横並びにする `display: flex; gap: 0.5rem; flex-wrap: wrap` |

### アイコン（`src/components/icons.tsx`）

既存の共通属性（`viewBox="0 0 24 24"`/`stroke="currentColor"`/`strokeWidth={2}`/線端丸/`aria-hidden`）で追加する（REQ-6.3）。**いずれもテキストと併用する**（REQ-6.4）。

| 名前 | 用途 | 形状の目安 |
| --- | --- | --- |
| `ExpandIcon` | 「サインを入力する」ボタン | `M4 9V4h5` ＋ `M20 15v5h-5` ＋ `M4 4l6 6` ＋ `M20 20l-6-6` |
| `EraserIcon` | 「クリア」ボタン | `M7 21h10` ＋ `M4 16l6-6 6 6-3 3H7z`（角丸の消しゴム） |

既存の `CloseIcon`（photo-lightbox で追加済み）は、[6](#6-閉じる操作の意味と-escape) で「完了」がテキストボタンのため未使用。既存の `PencilIcon` を「サインをやり直す」に転用することも検討する（アイコン追加を減らせる）。

---

## 12. 手動確認観点

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。Tier 1 実機（iOS Safari / Android Chrome）とデスクトップの両方で行う。**個人情報保護のため、確認には実在するガイドの氏名・サインを使わない**（REQ-8.9）。

### 描画の基本

1. 新規作成フォームでサイン欄の「サインを入力する」を押すと、画面いっぱいのモーダルが開くこと（REQ-1.1, REQ-2.1）。
2. 描画領域が現状（高さ160px）より明確に広いこと（REQ-2.3）。
3. 指で連続したストロークが描け、線が滲まないこと（REQ-3.1, REQ-3.5）。
4. 描画中にページがスクロールしない・ピンチズームしない・引っ張って更新が起きないこと（REQ-3.2）。
5. 描画領域を長押ししてもOS標準メニュー（テキスト選択・画像を保存）が出ないこと（REQ-3.3）。
6. 描画領域の端から書き始めて指が外へ出て戻っても、1本の線として繋がること（REQ-3.4、[1-2(b)](#b-ポインタイベントとヒットテスト)）。
7. **iOS Safari のブラウザタブ起動で、画面左端から書き始めたときにブラウザの「戻る」が発動しないこと**（発動する場合は既知の制約に記録）。
8. 「クリア」で全消去され、プレースホルダーが再表示されること（REQ-3.6, REQ-3.9）。
9. 未描画時のプレースホルダーが、確定した画像に写り込んでいないこと（REQ-3.9）。

### モーダルの座標・レイアウト

10. モーダルが `#root` の `max-width: 640px` に縛られず画面全幅を覆うこと（[1-2(a)](#a-座標計算への影響--影響しない)）。
11. **描いた線が指の位置とずれないこと**（座標計算の検証。特にデスクトップでウィンドウ幅を 640px 超にした場合）。
12. モーダルを開いた直後の1本目のストロークが正しい太さ・位置で描けること（canvas のサイズ確定タイミングの検証。[1-2(c)](#c-canvas-のサイズ確定タイミング--最も注意が必要な点)）。
13. 描画中に画面の向きを変えても、描いたストロークが**縦横比を保ったまま**残ること（REQ-3.7、[5](#5-描画領域の形と書き出し画像の縦横比)）。
14. ノッチ／ホームインジケーターのある端末で、ヘッダーのボタンと描画領域が隠れないこと（REQ-2.6）。
15. 幅320px / 375px / 640px、縦向き・横向きで横スクロールが発生しないこと（REQ-6.5）。
16. iOS のホーム画面起動（スタンドアロン）で正しく全画面になること（`100dvh`）。

### 閉じる・確定

17. 「完了」でモーダルが閉じ、サイン欄に描いた内容のプレビューが出ること（REQ-4.5, REQ-5.6）。
18. Escape（外部キーボード）で閉じたとき、[6](#6-閉じる操作の意味と-escape) のとおり確定されること（REQ-4.2, REQ-4.3）。
19. **Androidの戻る操作（ジェスチャー／ボタン）でモーダルが閉じ、アプリを離れないこと。またそのときサインが失われないこと**（REQ-9.5、[10](#10-画面遷移の履歴との関係)）。
20. 描画領域上をタップ・スワイプしてもモーダルが閉じないこと（REQ-4.4）。
21. 閉じたあと、フォーカスが起動ボタンに戻っていること（REQ-4.6）。
22. 閉じたあと、フォームの他の入力内容とスクロール位置が保たれていること（REQ-4.7）。
23. モーダル内のボタンを押してもフォームが送信されない（ログが保存されない）こと（[1-2(d)](#d-form-の中に-dialog-を置くことの制約)）。
24. **開発ビルド（StrictMode）で、モーダルを開いた直後に勝手に閉じないこと・サインが二重に確定されないこと**（[1-4](#1-4-strictmode-二重実行への対策)）。

### 保存フロー（[guide-signature REQ-6](../guide-signature/requirements.md) の回帰確認）

25. 新規作成でサインを描いて保存 → 詳細画面にサインが表示されること。
26. 編集フォームを開いて何も触らずに保存 → 既存サインが変わらないこと（`exportBlob() === undefined`）。
27. 編集フォームで「サインをやり直す」→ 新しく描いて保存 → サインが置き換わり、古い添付が残っていないこと。
28. **編集フォームで「サインをやり直す」→ 何も描かずに閉じる → 保存**したとき、既存サインが維持されること（[7](#7-既存サインの削除と未描画で閉じたときの扱い)）。
29. 「サインを削除」で未サイン状態になり、保存後に詳細画面が「未サイン」になること（REQ-5.7）。
30. サインを確定した後にフォームの他項目を編集しても、サインが保持されること（REQ-5.3）。
31. サインを確定した後にモーダルを開き直したとき、続きから描けること（REQ-5.4、[4](#4-既存-signaturepad-との関係)）。
32. 保存せずにキャンセルした場合、サインが保存されていないこと（REQ-5.5）。

### アクセシビリティ・表示

33. Tab の連続操作で背面のフォームへフォーカスが移らないこと（REQ-7.3）。
34. モーダル表示中に背面のフォームをタップしても作動しないこと・背面がスクロールしないこと（REQ-2.4, REQ-2.5）。
35. スクリーンリーダー（VoiceOver / TalkBack）で、起動ボタン名・ダイアログ名・各操作ボタン名・描画領域の説明が読み上げられること（REQ-7.4〜REQ-7.7）。
36. キーボードのみでモーダルを開き、何も描かずに安全に閉じられること（REQ-7.8）。
37. OSをライト／ダークに切り替えても、モーダルのヘッダー・ボタンが読め、**描画領域は白のまま**であること（REQ-3.8, REQ-6.1, REQ-6.2）。
38. 詳細画面のサイン表示・一覧のサイン有無アイコンが、縦長のサイン画像でも破綻しないこと（REQ-6.7）。
39. モーダルを10回以上開閉しても、プレビューが表示されなくなる（オブジェクトURLの解放漏れ・二重解放）事象が起きないこと（REQ-8.6）。
40. 機内モードで一連の操作が動作すること（REQ-8.2）。
41. **保存されたサイン画像のファイルサイズを実測し、[9](#9-書き出し解像度と保存サイズ) の見積もり（30〜90KB）の範囲に収まること**。大きく超える場合は [9](#9-書き出し解像度と保存サイズ) の解像度クランプ案への切り替えを検討する。
42. 保存された PNG が**透明背景**のままであること（[9](#9-書き出し解像度と保存サイズ)）。

---

## 既知の制約・トレードオフ

- **デスクトップでサイン欄に直接描けなくなる**（[3](#3-サインモーダルを開く操作) / [4](#4-既存-signaturepad-との関係)）。必ずモーダルを開く操作が1つ増える。デスクトップは Tier 2（[mobile-compatibility](../mobile-compatibility/requirements.md)）であり、主要利用シーンはスマートフォンであることを根拠に受け入れる。
- **iOS Safari のブラウザタブ起動では、画面の左右端からのスワイプがブラウザの戻る／進むに消費されうる**（[1-2(b)](#b-ポインタイベントとヒットテスト)）。描画領域の左右に余白を設けて緩和するが完全には防げない。ホーム画面起動（スタンドアロン）では発生しない。
- **Escape とOSの戻る操作を抑止できない**（[1-3](#1-3-escape-と-cancel-イベントの制約)）。これを前提に「閉じる＝確定」に倒す（[6](#6-閉じる操作の意味と-escape)）。
- **保存画像の縦横比が可変になる**（[5](#5-描画領域の形と書き出し画像の縦横比)）。既存の保存済みサイン（約2.24:1の横長）と新規保存分（縦向きなら縦長）が混在する。表示側は `object-fit: contain` で吸収するが、詳細画面での見え方は端末の向きによって変わる。
- **画面の向きを横→縦に変えるとストロークが拡大されてわずかにぼやける**（[5](#5-描画領域の形と書き出し画像の縦横比) の contain 復元）。消えるよりは良いという判断。
- **取り消し（Undo）がない**。書き損じたら「クリア」で全消去して描き直す（現状と同じ）。ストロークをベクトルデータとして保持すれば Undo も高DPI再描画も可能になるが、保存形式は PNG のままなので恩恵は描画中に限られ、実装量に見合わないと判断した。
- **`<dialog>` に依存する**（[1](#1-実装方式ネイティブ-dialog-を使うか)）。`showModal()` を持たない環境では現状の埋め込みキャンバスにフォールバックする（`canUseSignatureDialog`、REQ-8.7）。フォールバック実装のため描画ロジックは `DialogSignaturePad`/`EmbeddedSignaturePad` の2箇所に残る。
- **背面スクロールの抑止はブラウザ依存**。photo-lightbox と同じく `document.body.style.overflow = 'hidden'` で防御し、iOS Safari で完全に止まらない場合は「モーダルが全画面のため実害は小さい」として受け入れる（[photo-lightbox/design.md 3-4](../photo-lightbox/design.md#3-4-背面スクロールの抑止)）。
- **サイン画像の閲覧用拡大表示は引き続き提供しない**（[photo-lightbox REQ-1.8](../photo-lightbox/requirements.md)）。本仕様は入力のみを扱う。
- **`SignaturePad` は引き続き自身で状態を持つ**（[8](#8-フォームへのデータの受け渡し)）。`PhotoPicker`/`ObservationEditor`/`ImageLightbox` の「親が状態を持つ」方針とは異なるが、これは現状からの継続であり本仕様で新たに導入する逸脱ではない。

## 実装後に更新が必要な既存ドキュメント

| ファイル | 更新内容 |
| --- | --- |
| [`specs/00-overview.md`](../00-overview.md) | 機能一覧の本仕様の状態を「実装済み」に更新。「既知の制約」の「アプリ独自のモーダル・オーバーレイ部品」に、本仕様が2つ目のモーダルであることを追記 |
| [`specs/guide-signature/requirements.md`](../guide-signature/requirements.md) | REQ-2/REQ-5（描画キャンバスの提示方法）を全画面モーダルへの参照に更新。REQ-6 の2番目の分岐も[7](#7-既存サインの削除と未描画で閉じたときの扱い)のとおり更新する |
| [`specs/guide-signature/design.md`](../guide-signature/design.md) | 「UIコンポーネント」節を `SignaturePad`＋`SignatureDialog` の構成に更新。`SignaturePadHandle` から `clear` を削除したことを反映 |
| [`specs/mobile-compatibility/design.md`](../mobile-compatibility/design.md) | `SignaturePad` に関する記述（`ResizeObserver` による再スケール、44pxのタップ領域）の対象が `SignatureDialog` へ移ることを追記。動作確認マトリクス M-10〜M-12 の対象も更新 |
| [`specs/photo-lightbox/design.md`](../photo-lightbox/design.md) | 「汎用のモーダル部品にはしない」の記述に、2つ目のモーダル（本仕様）が同じ `<dialog>` 方式を採ったことを追記（任意） |
