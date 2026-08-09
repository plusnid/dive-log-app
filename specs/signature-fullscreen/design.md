# 設計: サイン入力の全画面化

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [ガイドサインの設計](../guide-signature/design.md) / [写真の拡大表示の設計](../photo-lightbox/design.md) / [iOS/Android動作保証の設計](../mobile-compatibility/design.md) / [ダイビングログCRUDの設計](../dive-log-crud/design.md) / [Google Drive同期](../google-drive-sync/requirements.md) / [UI仕上げ レベル1設計](../ui-polish-level1/design.md) / [UI仕上げ レベル2設計](../ui-polish-level2/design.md)

ステータス: 実装済み。[要件の未確定事項](./requirements.md#未確定事項確認したい点) 1〜9 はすべてユーザー確定済み（2026-08-10、いずれも推奨案どおり）。

## 設計方針（推奨案を採る前提）

- **ブラウザ標準の `<dialog>` に乗る**（→ [1](#1-実装方式ネイティブ-dialog-を使うか)）。[photo-lightbox](../photo-lightbox/design.md) で導入済みの方式を踏襲し、フォーカストラップ・背面の不活性化・Escape・トップレイヤーを自前実装しない。手書き入力という新しい性質については [1-2](#1-2-canvas-を-dialog-の中に置いたときの技術的検証) で個別に検証する。
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

**変更しないファイル**: `src/views/DiveLogFormView.tsx`（[8](#8-フォームへのデータの受け渡し) 案A を採る場合）、`src/types/`、`src/db/`、`src/sync/`、`src/hooks/`、`src/platform/`、`src/App.tsx`（REQ-8.3, REQ-8.4, REQ-9.1）。

---

## 0. 現状（コードで確認した事実）

### `src/components/SignaturePad.tsx`

- `forwardRef` + `useImperativeHandle` で `SignaturePadHandle { clear, exportBlob }` を公開する。
- **`clear()` はどこからも呼ばれていない**。`DiveLogFormView` が使うのは `exportBlob()` のみ（`src/views/DiveLogFormView.tsx:285`）。本仕様の実装時に handle から削除してよい。
- `showExisting` state（初期値 `Boolean(existingSignatureUrl)`）で「既存サインの静止画表示」と「描画キャンバス」を切り替える。`showExisting === true` の間、`exportBlob()` は `undefined`（＝変更なし）を返す。
- `emptyRef`（`boolean` の ref）で未描画を判定し、`exportBlob()` が `null` を返す条件に使う。
- 描画は `onPointerDown` で `setPointerCapture` → `moveTo`、`onPointerMove` で `lineTo` + `stroke`、`onPointerUp` / `onPointerCancel` / `onPointerLeave` で終了。
- 座標は `e.currentTarget.getBoundingClientRect()` からの相対位置（`clientX - rect.left`）。
- `setupCanvas(preserveContent)` が `devicePixelRatio` に合わせて `canvas.width/height` を設定し `ctx.scale(dpr, dpr)` する。`rect.width === 0 || rect.height === 0` のときは**何もせず return する**。
- `ResizeObserver` で表示サイズ変化を検知し `setupCanvas(true)` を呼ぶ。復元は次の1行で、**縦横比を保たずに引き伸ばす**。

  ```ts
  ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, rect.width, rect.height)
  ```

  現状は高さが 160px 固定で幅しか変わらないため実害が小さいが、全画面化して画面の向きが変わると縦横比が大きく変わり、サインが極端に歪む（→ [5](#5-描画領域の形と書き出し画像の縦横比) で対処）。
- 書き出しは `canvas.toBlob(cb, 'image/png')`。**背景は塗っていない**ため、保存される PNG は**透明背景に黒線**である（→ [9](#9-書き出し解像度と保存サイズ)）。
- `ctx.lineWidth = 2.5` / `lineCap`・`lineJoin` は `'round'` / `strokeStyle = '#1a1a1a'`。

### `src/components/SignaturePad.css`

`.signature-pad__canvas` は `width: 100%; height: 160px; background: #fff; touch-action: none; -webkit-touch-callout: none; user-select: none`。`.signature-pad button` は `min-height/min-width: 44px`。

### `src/views/DiveLogFormView.tsx`

```
 91: const [existingSignatureUrl, setExistingSignatureUrl] = useState<string | null>(null)
 94: const signaturePadRef = useRef<SignaturePadHandle>(null)
139: setExistingSignatureUrl(signature ? URL.createObjectURL(signature.blob) : null)
245: if (existingSignatureUrl) URL.revokeObjectURL(existingSignatureUrl)
285: const signatureBlob = await signaturePadRef.current?.exportBlob()
567: <SignaturePad ref={signaturePadRef} existingSignatureUrl={existingSignatureUrl} />
```

`SignaturePad` は `<form className="view dive-log-form">` → `<fieldset>` の子孫として描画される。この入れ子関係が [1-2 (d)](#d-form-の中に-dialog-を置くことの制約) の制約に効く。

### `src/index.css` / `src/App.css`

- グローバル `button` に `background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.9rem; min-height: 44px; min-width: 44px`。`button[type='submit']` は `--accent` 塗り。**モーダル内のボタンでこれを打ち消す／活かす方針を決める必要がある**（[11](#11-スタイルとアイコン)）。
- `#root { max-width: 640px; min-height: 100svh; padding: 1rem + env(safe-area-inset-*) }`。
- `.detail-signature { max-width: 300px; border: 1px solid var(--border); border-radius: 8px; background: #fff }`。**`max-height` が無い**ため、縦長のサイン画像を保存すると詳細画面で縦に長く表示される（REQ-6.7 の対処対象）。

### 既存モーダルの前例（`src/components/ImageLightbox.tsx`）

- `canShowLightbox`（`HTMLDialogElement.prototype.showModal` の存在判定）をモジュールスコープで1度だけ評価する。
- `useEffect` で `showModal()`、クリーンアップで `close()`。
- **`suppressCloseRef`**: React StrictMode の開発時二重実行でクリーンアップの `dialog.close()` が `close` イベントを発火させ、`onClose` 経由で親 state を巻き戻してしまう問題への対策。本仕様でも同じ対策が必要で、しかも本モーダルでは `close` が「確定」を意味しうるため（[6](#6-閉じる操作の意味と-escape)）**取り違えるとサインが二重に確定・消失する**。より慎重な実装が要る。

---

## 1. 実装方式（ネイティブ `<dialog>` を使うか）

[要件の未確定事項 1](./requirements.md#未確定事項確認したい点)。

| 観点 | **案A: `<dialog>` + `showModal()`（推奨）** | 案B: `position: fixed` の自前オーバーレイ |
| --- | --- | --- |
| フォーカストラップ（REQ-7.3） | UAが実装 | Tab を捕捉して自前で循環させる |
| 背面の不活性化（REQ-2.4） | UAが実装（`inert` 相当） | `inert` / `aria-hidden` を自前で付与 |
| 重なり順 | トップレイヤー（`#root { max-width: 640px }` と `.fab` の `z-index` の影響を受けない） | `z-index` を自前管理（FAB との衝突を検討） |
| Escape（REQ-4.2） | UAが実装。**抑止は確実にはできない**（[1-3](#1-3-escape-と-cancel-イベントの制約)） | 完全に制御できる（確認ダイアログを挟める） |
| OSの戻る操作 | Chrome 120以降は CloseWatcher と統合され「閉じる」に消費される見込み | 反応しない（アプリ／タブを離れる） |
| 手書き入力との相性 | [1-2](#1-2-canvas-を-dialog-の中に置いたときの技術的検証) のとおり問題なし | 同左（トップレイヤー以外は同じ） |
| 既存パターンとの整合 | photo-lightbox と同一方式で統一できる | 2つ目のモーダルで別方式になる |
| 実装量 | 小 | 中〜大 |

**案Aを推奨する。** photo-lightbox で既に導入・検証済みの方式であり、アプリ内にモーダルの実装方式が2種類できることを避けられる。案Bの唯一の優位点は「Escape を握れる」ことだが、それは [6](#6-閉じる操作の意味と-escape) で「閉じる＝確定」に倒せば不要になる。

サポート対象（[mobile-compatibility](../mobile-compatibility/requirements.md) Tier 1: iOS/iPadOS 16.4以降 Safari、Android 10以降 Chrome）における対応状況は [photo-lightbox/design.md 1](../photo-lightbox/design.md#1-実装方式の比較) で確認済み。本仕様で追加で必要になるAPIは次のとおりで、いずれも Tier 1 で利用可能である。

| API | 用途 | Safari | Chrome |
| --- | --- | --- | --- |
| Pointer Events / `setPointerCapture` | 描画（現状の `SignaturePad` で使用中） | 13 以降 | 55 以降 |
| `ResizeObserver` | 描画領域のサイズ追従（現状使用中） | 13.1 以降 | 64 以降 |
| `HTMLCanvasElement.toBlob` | PNG書き出し（現状使用中） | 11 以降 | 50 以降 |
| `lostpointercapture` イベント | ストローク終了判定（[1-2 (b)](#b-ポインタイベントとヒットテスト)） | 13 以降 | 55 以降 |

### 1-2. canvas を `<dialog>` の中に置いたときの技術的検証

要望の中心的な懸念（「dialog のトップレイヤー化が canvas の座標計算に影響しないか」「pointer capture の範囲」）への回答。

#### (a) 座標計算への影響 — **影響しない**

- トップレイヤーは**ペイント順序（描画順）**の概念であり、要素の幾何（レイアウト座標）を変えるものではない。`getBoundingClientRect()` は引き続き**ビューポート基準の CSS ピクセル座標**を返し、`PointerEvent.clientX/clientY` も同じ座標系である。したがって現状の `getPos()` の式（`e.clientX - rect.left`）はそのまま成立する。
- モーダルダイアログの**包含ブロックは初期包含ブロック（ビューポート）**になる。祖先の `#root { max-width: 640px }` や `<form>` のレイアウトに縛られず全画面化できる。これは photo-lightbox で実証済み。
- **注意点**: 祖先要素に `transform` / `filter` / `backdrop-filter` / `will-change` が付いていると、トップレイヤー要素の包含ブロックの解釈にブラウザ差が生じた時期がある。現状 `.dive-log-form` の祖先にこれらの指定はない（`src/App.css` / `src/index.css` で確認）。将来 [ui-polish](../ui-polish-level2/requirements.md) 系でフォームにトランジションやアニメーションを入れる場合の注意事項として残す。
- `<canvas>` の描画バッファ座標は `canvas.width/height`（デバイスピクセル）で、CSS 表示サイズとは独立している。現状どおり `ctx.scale(dpr, dpr)` で CSS ピクセル座標系に揃えるため、モーダル化しても計算式は変わらない。

#### (b) ポインタイベントとヒットテスト

- トップレイヤーの要素は**最前面でヒットテストされる**ため、背面のフォームの入力欄・ボタンにイベントを奪われることがない。埋め込み欄よりむしろ安全になる。
- `setPointerCapture(pointerId)` は**要素単位の API** であり、トップレイヤーとは独立して機能する。キャプチャ中は `pointermove` / `pointerup` が canvas に配送されるため、**指が描画領域の外（ヘッダーやボタンの上）へ出て戻っても1本の連続したストロークとして扱われる**（REQ-3.4 を満たす）。
- **ただし現状の `onPointerLeave={endStroke}` は全画面では外すべきである。** ポインタキャプチャ中の `pointerleave` の発火タイミングには実装差があり、また全画面では描画領域が画面のほぼ全体を占めるため「領域外へ出たら即終了」はむしろ誤動作（画面端まで書いた線が途切れる）になる。終了判定は次の3つにする。

  ```
  onPointerUp / onPointerCancel / onLostPointerCapture → endStroke()
  ```

- `touch-action: none` は canvas 要素に指定する（現状どおり。REQ-3.2）。加えて `<dialog>` 自身に `overscroll-behavior: contain` を指定し、引っ張って更新を抑止する（`body` には既に `overscroll-behavior-y: contain` がある）。
- `-webkit-touch-callout: none` / `user-select: none` は現状どおり canvas に指定する（REQ-3.3）。
- **iOS Safari のブラウザタブ起動では、画面の左端／右端からの横スワイプがブラウザの「戻る／進む」ジェスチャーに消費される**。描画領域を画面端いっぱいに置くと、左端から書き始めた線が取られる可能性がある。対策として描画領域の左右に余白（8px 程度＋セーフエリア）を確保する（[11](#11-スタイルとアイコン)）。完全には防げないため既知の制約に記載する。

#### (c) canvas のサイズ確定タイミング — **最も注意が必要な点**

閉じている `<dialog>` は UA スタイルシートで `display: none` である。この状態では `getBoundingClientRect()` が 0×0 を返し、現状の `setupCanvas()` は早期 return して**描画バッファが既定値（300×150）のまま**になる。

対策は次の3点を組み合わせる。

1. **開いているときだけマウントする**。親が `{open && <SignatureDialog … />}` で条件レンダリングし、「マウント＝開く、アンマウント＝閉じる」に揃える（photo-lightbox と同じ）。
2. **`showModal()` を canvas セットアップより先に実行する**。同一コンポーネント内の `useEffect` は宣言順に実行されるため、`showModal()` の effect を canvas セットアップの effect より上に書く。`showModal()` はレイアウトを同期的に確定させるため、直後の `getBoundingClientRect()` は正しい値を返す。
3. **`ResizeObserver` を保険として残す**。1・2 の順序に依存しきらず、サイズが 0 → 実サイズに変わった時点で再セットアップされるようにする（現状の実装を流用）。

#### (d) `<form>` の中に `<dialog>` を置くことの制約

`SignaturePad` は `<form className="view dive-log-form">` の子孫にあるため、その中に置いた `<dialog>` も **DOM 上はフォームの子孫**になる（トップレイヤーに表示されても DOM ツリー上の位置は変わらない）。ここから次の制約が生じる。

| 制約 | 対処 |
| --- | --- |
| `<button>` の既定 `type` は `submit`。モーダル内のボタンに `type` を付け忘れると**ダイビングログが保存されてしまう** | モーダル内のすべてのボタンに `type="button"` を明示する（既存の `SignaturePad` も同様に付与済み） |
| `<form method="dialog">` による閉じ方は使えない（入れ子 `<form>` は HTML 的に不正） | 閉じる操作は `dialogRef.current.close()` の明示呼び出しで行う |
| モーダル内にテキスト入力があると Enter で暗黙のフォーム送信が起きうる | REQ-2.7 によりモーダル内に入力欄を置かない（ガイド名はフォーム側のまま） |
| `<fieldset disabled>` を将来使うとモーダル内のボタンも無効化される | 現状 `disabled` な fieldset は使っていない。使う場合は portal 化を検討する |

**代替案: `createPortal(…, document.body)` でフォームの外に出す。** `react-dom` は既存の依存であり追加インストールは不要。フォームとの結合を断てるが、(1) コンポーネントの構造が読みにくくなる、(2) React の合成イベントは portal でもツリー通りに伝播するため結局フォーム側へバブルする、(3) 上記の対処で十分、という理由から**採らない**。

### 1-3. Escape と `cancel` イベントの制約

- `<dialog>` は Escape で `cancel` → `close` の順にイベントを発火する。`cancel` で `preventDefault()` すれば閉じるのを止められる。
- ただし **Chrome には「短時間のうちに2回目の Escape が押された場合、`cancel` のキャンセルを無視して強制的に閉じる」挙動**がある（無限に閉じられないダイアログを防ぐための仕様）。したがって「Escape では絶対に閉じない」は保証できない。
- Android の戻る操作（CloseWatcher 統合）も同じ `cancel` → `close` の経路を通るため、同じ制約を受ける。
- **結論**: Escape を握って「破棄しますか？」の確認を挟む設計（[6](#6-閉じる操作の意味と-escape) 案B）は、確実には成立しない。これが「閉じる＝確定」（案A）を推奨する技術的根拠である。

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

- **開いているときだけマウントする**（[1-2 (c)](#c-canvas-のサイズ確定タイミング--最も注意が必要な点)）。
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
      onLostPointerCapture={endStroke}     {/* onPointerLeave は使わない（1-2 (b)） */}
    />
    {empty && <p className="signature-dialog__placeholder" aria-hidden="true">ここにサインしてください</p>}  {/* REQ-3.9 */}
  </div>
</dialog>
```

- プレースホルダーは canvas の**外側**に重ねて配置する（`position: absolute`）。canvas に描き込まないため、書き出される画像には含まれない（REQ-3.9 後段）。
- `<h2>` をモーダル内に置くが、`aria-label` をダイアログ自身に与えているため見出しとの二重読み上げは起きない（`aria-labelledby` にしてもよい。実装時に統一する）。
- 「完了」は `button[type='submit']` ではないため、グローバルの accent 塗りが当たらない。primary 相当の見た目は `.signature-dialog__done` で明示する（[11](#11-スタイルとアイコン)）。

### 確定処理の非同期性（実装上の落とし穴）

`canvas.toBlob()` は**非同期**である。一方 `close` イベントは同期的に発火し、その直後に親が state を更新してアンマウントする可能性がある。次の順序を守る。

1. `close` イベント（または「完了」ボタン）を受ける。
2. **その場で同期的に** `canvas.toBlob(cb, 'image/png')` を呼ぶ（この時点では canvas はまだ存在する）。
3. コールバックで `onCommit(blob)` → `onClose()` を呼ぶ。親はここで初めてアンマウントする。
4. canvas が DOM から外れた後でもコールバックは動作する（`HTMLCanvasElement` への参照が生きていれば描画バッファは有効）ため、手順3が遅れても結果は失われない。

「完了」ボタン経由と `close` イベント経由が二重に走らないよう、`committedRef` で1回だけ実行する。`requestClose()` は `dialogRef.current.close()` を呼ぶだけにし、**確定処理は `close` ハンドラ1箇所に集約する**（Escape・OSの戻る・完了ボタンのすべてが同じ経路を通る＝ [6](#6-閉じる操作の意味と-escape) 案Aと整合する）。

---

## 3. サインモーダルを開く操作

[要件の未確定事項 2](./requirements.md#未確定事項確認したい点)。

| 観点 | **案A: サイン欄をプレビュー＋起動ボタンに変更（推奨）** | 案B: 埋め込みキャンバス＋「拡大して入力」ボタン | 案C: 埋め込みキャンバスのタップで自動的に開く |
| --- | --- | --- | --- |
| 描画状態の所在 | モーダル内の1箇所 | 2箇所（同期が必要。→ [4](#4-既存-signaturepad-との関係)） | 2箇所（同上） |
| 最初のストロークの扱い | 問題なし | 問題なし | **`pointerdown` でモーダルを開くと、その指の動きはモーダル内 canvas に届かず最初のストロークが失われる** |
| 誤操作 | 明示的なボタンのみ | 明示的なボタンのみ | フォームのスクロール中に指が触れて開くことがある |
| 支援技術 | ボタンとして自然に伝わる（REQ-7.6） | 同左 | canvas に `role="button"` を付けることになり、描画領域としての説明と矛盾する |
| デスクトップ | 小さい欄に直接描けなくなる（**退行**） | 従来どおり描ける | 従来どおり描けない（開いてから描く） |
| 実装量 | 小 | 中（2つの canvas の同期） | 中〜大（上記の欠点への対処が必要） |

**案Aを推奨する。** 案Cは「最初のストロークが失われる」時点で採用しがたい。案Bは「小さい欄でも描ける」利点があるが、[4](#4-既存-signaturepad-との関係) の二重管理コストを常時抱えることになる。

案Aの唯一の欠点は**デスクトップでの退行**（サイン欄に直接マウスで描けなくなる）である。ただし [概要 NFR-3](../00-overview.md) および [mobile-compatibility](../mobile-compatibility/requirements.md) のとおり本アプリの主要利用シーンはスマートフォンであり、デスクトップは Tier 2（動作するが最適化対象外）である。**この退行を受け入れるかはユーザー判断とする。**

### 案Aでのサイン欄の見た目

| 状態 | サイン欄の表示 | 操作要素 |
| --- | --- | --- |
| 未サイン | 「未サイン」の破線枠プレースホルダー | 「サインを入力する」（`ExpandIcon` ＋ テキスト） |
| 既存サインあり（編集時） | 既存サイン画像のプレビュー | 「サインをやり直す」／「サインを削除」（→ [7](#7-既存サインの削除と未描画で閉じたときの扱い)） |
| 新しく描いたサインあり | 確定済み Blob のプレビュー | 「サインを描き直す」／「サインを削除」 |

3状態が視覚的に区別できること（REQ-5.6）を、プレースホルダー／プレビューとボタン文言で満たす。

---

## 4. 既存 `SignaturePad` との関係

[要件の未確定事項 3](./requirements.md#未確定事項確認したい点)。

| 観点 | **案A: 描画 canvas はモーダル内の1つだけ（推奨）** | 案B: 埋め込みとモーダルの2つを `drawImage` で相互転写 |
| --- | --- | --- |
| 画質 | 劣化なし（描いた解像度のまま書き出す） | **小→大の転写はラスタ拡大でぼやける** |
| 縦横比 | 常に1つの領域で完結 | 領域の縦横比が異なると歪む（下記） |
| 状態の同期 | 不要 | `emptyRef` / `showExisting` / 描画内容の3つを双方向に同期 |
| コード量 | `SignaturePad` から描画ロジックを移すだけ | 転写・同期のロジックが純増 |
| デスクトップの体験 | 欄に直接描けない | 従来どおり |

**案Aを推奨する。** 案Bの画質・歪みの問題は具体的には次のとおりである（iPhone 相当・`devicePixelRatio = 3` で試算）。

| | 埋め込み欄 | 全画面（[5](#5-描画領域の形と書き出し画像の縦横比) 案A） |
| --- | --- | --- |
| CSS サイズ | 358 × 160 | 約 374 × 690 |
| 縦横比 | 約 2.24 : 1（横長） | 約 0.54 : 1（縦長） |
| 描画バッファ | 1074 × 480 | 1122 × 2070 |

縦横比が 2.24:1 から 0.54:1 へ反転するため、単純な `drawImage(全体→全体)` では**縦に約4.3倍引き伸ばされる**。`contain` で縦横比を保って収めると歪みは消えるが、今度は上下に巨大な余白ができ、実効解像度は 358×160 のまま（＝せっかく大きな領域に書いても、埋め込み欄から持ち込んだ線だけが粗い）になる。**大小2つの描画領域を行き来させる設計は、縦横比が大きく異なる時点で破綻する。**

### 案Aでの `SignaturePad` の新しい責務

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

- `exportBlob()` は `state` を三値へ写像するだけになる。**`canvas.toBlob()` の非同期処理がフォーム送信経路から消える**ため、送信時の失敗要因が1つ減る（副次的な改善）。
- `clear()` は使われていないため handle から削除する（[0節](#0-現状コードで確認した事実)）。`SignaturePadHandle` は `exportBlob` のみになる。
- `existingSignatureUrl` が後から変化したときは `state` を再初期化する（現状の `useEffect` による `showExisting` の同期と同じ役割）。ただし `kind: 'drawn'` を上書きしないよう、既存の `useEffect` と同様に「`existingSignatureUrl` の変化時のみ」に限定する。
- `kind: 'drawn'` の `url` は `URL.createObjectURL(blob)` で作り、**差し替え時と `SignaturePad` のアンマウント時に `revokeObjectURL` する**（REQ-8.6）。

### REQ-5.4（開き直して続きから描く）の実現

`SignaturePad` が `state.kind === 'drawn'` のとき、モーダルへ `initialImageUrl={state.url}` を渡す。`SignatureDialog` は `setupCanvas()` の直後に `<img>` へ読み込んで `drawImage` する。**同じ描画領域サイズへ戻すため拡大縮小は起きず、劣化は実質ない**（PNG は可逆圧縮）。

ただし読み込みが非同期（`img.decode()` / `onload`）であるため、次の順序を守る。

1. `showModal()` → レイアウト確定
2. `setupCanvas(false)`
3. `initialImageUrl` があれば `img.onload` で `ctx.drawImage(img, 0, 0, rect.width, rect.height)` し、`emptyRef.current = false` にする
4. 復元が完了するまでプレースホルダー（REQ-3.9）を出さない

「開き直したら常に未描画から」とする選択もある（実装は単純になるが、線を1本足したいだけのときに全部描き直しになる）。**どちらにするかはユーザー判断とする。**

---

## 5. 描画領域の形と書き出し画像の縦横比

[要件の未確定事項 4](./requirements.md#未確定事項確認したい点)。iPhone 相当（390×844 CSS px、上部セーフエリア 47px・下部 34px）での試算。

| | 現状 | **案A: ヘッダーを除く全体（弱い推奨）** | 案B: 最大の 2:1 矩形 | 案C: 90°回転 | 案D: 案B＋横向き案内 |
| --- | --- | --- | --- | --- | --- |
| 描画領域（CSS px） | 358 × 160 | 約 374 × 690 | 374 × 187 | 690 × 345（回転して配置） | 374 × 187 |
| 面積 | 57,280 | 258,060（**約4.5倍**） | 69,938（約1.2倍） | 238,050（約4.2倍） | 69,938 |
| 縦向きでの書き味 | 狭い | 縦長だが十分広い | **現状とほぼ変わらない** | 横長で自然 | 現状とほぼ変わらない |
| 保存画像の縦横比 | 一定（約2.24:1） | **可変**（縦向き0.54:1 / 横向き2.4:1） | 一定（2:1） | 一定（2:1） | 一定（2:1） |
| 詳細画面への影響 | なし | `.detail-signature` に `max-height` が必要（REQ-6.7） | なし | なし | なし |
| 実装リスク | — | 低 | 低 | **高**（下記） | 最低 |
| 要望の充足 | — | ○ | △（「画面いっぱい」にならない） | ○ | △ |

### 案C（90°回転）を推奨しない理由

`transform: rotate(90deg)` を canvas に当てると、`getBoundingClientRect()` は**回転後のバウンディングボックス**（軸に平行な外接矩形）を返す。現状の `getPos()`（`clientX - rect.left`）はそのままでは使えず、回転の逆変換を自前で行う必要がある。

```
// 90°回転時の逆変換（要自前実装）
const localX = e.clientY - rect.top
const localY = rect.width - (e.clientX - rect.left)
```

さらに `devicePixelRatio` のスケール、`ResizeObserver` による再セットアップ、画面の向きが変わったときの再計算が全て回転を考慮する必要があり、**このアプリでポインタ処理の不具合が最も起きやすい箇所**になる。自動テストがない（[概要](../00-overview.md)）ため回帰も検知できない。得られるもの（案Aとほぼ同じ面積）に対してリスクが見合わない。

### 案Aを採る場合の対処

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

2. **画面の向きが変わったときのストローク保持**（REQ-3.7）: 現状の `setupCanvas(true)` は縦横比を無視して引き伸ばす（[0節](#0-現状コードで確認した事実)）。全画面では歪みが致命的になるため、**縦横比を保って中央に収める（contain）** 方式へ変更する。

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

[要件の未確定事項 5](./requirements.md#未確定事項確認したい点)。

| 観点 | **案A: オートコミット（推奨）** | 案B: 完了／キャンセルの2択 | 案C: 完了／破棄／閉じるの3択 |
| --- | --- | --- | --- |
| ボタン構成 | 「クリア」「完了」 | 「クリア」「キャンセル」「完了」 | 「クリア」「破棄して閉じる」「完了」 |
| Escape | 確定して閉じる | 破棄（＝入力が消える） | 破棄 |
| OSの戻る操作 | 確定して閉じる | 破棄 | 破棄 |
| **入力を失う可能性** | **なし** | **ある**（[1-3](#1-3-escape-と-cancel-イベントの制約) により確認ダイアログでも確実には防げない） | ある |
| 「やっぱりやめる」 | 「クリア」してから閉じる（既存サインの復元は [7](#7-既存サインの削除と未描画で閉じたときの扱い) の削除ボタンと組み合わせる） | 「キャンセル」で開く前に戻る | 同左 |
| 実装 | 確定処理が `close` ハンドラ1箇所に集約される | 経路ごとの分岐が必要 | 同左 |
| REQ-4.3 の充足 | ○ | △（警告を出しても Chrome の強制クローズは防げない） | △ |

**案Aを推奨する。** 決め手は [1-3](#1-3-escape-と-cancel-イベントの制約) の技術的制約である。Escape と OS の戻る操作は UA が制御しており、`cancel` の `preventDefault()` は Chrome の強制クローズによって確実には効かない。したがって「閉じる＝破棄」にすると、**ユーザーが意図せず入力を失う経路が原理的に残る**。「閉じる＝確定」にすればこの経路が消え、確定処理も1箇所に集約できる。

案Aでの操作の意味は次のとおり。

| 操作 | 結果 |
| --- | --- |
| 「完了」ボタン | 描画内容を確定して閉じる |
| Escape | 同上 |
| OSの戻る操作（Chrome 120以降） | 同上 |
| 「クリア」ボタン | 描画内容を全消去（モーダルは開いたまま） |
| 描画領域上のポインタ操作 | 描画のみ。閉じない（REQ-4.4） |
| 背景（描画領域外の余白）のタップ | **閉じない**（photo-lightbox REQ-5.2 とは異なる。入力中に余白へ指が触れて閉じるのを避けるため） |

「破棄したい」場合は「クリア」→ 閉じる、という2手になる。これを不便とみなすなら案C（3ボタン）だが、ヘッダーが混み、Escape の扱いが案Bと同じ問題を抱える。

---

## 7. 既存サインの削除と「未描画で閉じたとき」の扱い

[要件の未確定事項 6](./requirements.md#未確定事項確認したい点)。**本仕様で唯一、既存の要件（[guide-signature REQ-6](../guide-signature/requirements.md)）の変更を伴いうる論点である。**

### 現状の挙動

`SignaturePad` は「既存サインの静止画表示（`showExisting = true`）」から「サインをやり直す」を押すと空のキャンバスに切り替わり、`exportBlob()` は `undefined` ではなく `null`（未描画）を返すようになる。つまり**「やり直す」を押して何も描かずに保存すると、既存サインが削除される**（[guide-signature REQ-6](../guide-signature/requirements.md) の2番目の分岐）。

現状は「やり直す」を押した直後に空のキャンバスがその場に見えており、「消えた」ことが視覚的に分かる。しかし**モーダル化すると「やり直すつもりで開き、やっぱりやめて閉じる」という操作が自然に発生する**（全画面が開くこと自体が心理的な区切りになる）。このとき現状の挙動では、フォームに戻ったときに既存サインが黙って消えている。

### 状態遷移の比較

| 開く前の状態 | モーダルでの操作 | **案A: 未描画なら維持（推奨）** | 案B: 現状踏襲（未描画なら削除） |
| --- | --- | --- | --- |
| 既存サインあり | 何も描かずに閉じる | `existing`（維持） | `none`（**削除**） |
| 既存サインあり | 描いて閉じる | `drawn`（置き換え） | `drawn`（置き換え） |
| 既存サインあり | 描いてからクリアして閉じる | `existing`（維持） | `none`（削除） |
| 既存サインあり | サイン欄の「サインを削除」 | `none`（削除） | （ボタンなし） |
| 未サイン | 何も描かずに閉じる | `none` | `none` |
| 未サイン | 描いて閉じる | `drawn` | `drawn` |
| 描画済み（未保存） | クリアして閉じる | `none` | `none` |

### 比較

| 観点 | **案A（推奨）** | 案B |
| --- | --- | --- |
| 誤ってサインを失う | しない | **する**（開いて閉じるだけで消える） |
| 削除の意思表示 | 「サインを削除」ボタンで明示 | 「やり直す」→ 何もしない、という暗黙の操作 |
| 既存仕様への影響 | [guide-signature REQ-6](../guide-signature/requirements.md) の2番目の分岐の記述更新が必要 | なし |
| 追加UI | サイン欄に「サインを削除」ボタン（1つ） | なし（代わりに「閉じるとサインが削除されます」の警告表示が必要。REQ-4.9） |
| リポジトリへの影響 | なし（三値契約は不変。REQ-8.4） | なし |

**案Aを推奨する。** [6](#6-閉じる操作の意味と-escape) 案A（オートコミット）と組み合わせると、「モーダルの開閉だけではデータが減らない」という一貫した性質になり、Escape・OSの戻る操作でも安全になる。

「サインを削除」ボタンの置き場所は**モーダル外（サイン欄）**とする。モーダル内に置くと「クリア」との違いが分かりにくく（クリア＝描画中の内容を消す、削除＝保存済みサインを消す）、誤操作を招くため。削除は破壊的操作なので、実行時に `window.confirm('保存済みのサインを削除しますか？')` を挟むかは実装時に決める（アプリの既存の削除確認は `window.confirm`。[概要の既知の制約](../00-overview.md)）。

### 案Aを採る場合の `guide-signature` の更新

[guide-signature/requirements.md](../guide-signature/requirements.md) の REQ-5・REQ-6 を次のように改める必要がある（本仕様の確定後に別途反映する）。

- REQ-5: 「空の描画キャンバスに切り替え」→「全画面のサイン入力を未描画の状態で開く」。
- REQ-6 の2番目の分岐: 「やり直す後クリアされたまま/未描画の場合は削除」→「**ユーザーが明示的にサインの削除を選択した場合**に削除」。

---

## 8. フォームへのデータの受け渡し

[要件の未確定事項 7](./requirements.md#未確定事項確認したい点)。

| 観点 | **案A: `exportBlob()` の三値契約を維持（推奨）** | 案B: `DiveLogFormView` へ state を持ち上げる |
| --- | --- | --- |
| `DiveLogFormView` の変更 | **なし** | `signature` state・`onChange`・`existingSignatureUrl` の扱いの変更 |
| リポジトリAPIとの対応 | 三値が `createDiveLog` / `updateDiveLog` の引数と1:1のまま | フォーム側で三値を組み立て直す |
| photo-lightbox の「親が状態を持つ」方針 | 反する（`SignaturePad` が状態を持つ） | 揃う |
| 既存の他部品との整合 | `SignaturePad` は元々 `forwardRef` + 命令的ハンドルであり、`PhotoPicker` / `ObservationEditor` とは元から方針が違う | `PhotoPicker` 等と揃う |
| 回帰リスク | 低（保存経路は無変更） | 中（保存経路に手が入る） |

**案Aを推奨する。** `exportBlob()` の三値は [guide-signature/design.md](../guide-signature/design.md) のとおりリポジトリの3分岐と1:1で対応しており、この対応関係が仕様と実装をつないでいる。持ち上げてもフォーム側に同じ三値が現れるだけで、変更範囲が広がるわりに得るものがない。

なお `SignaturePad` が状態を持つ設計は「親が状態を持つ」という photo-lightbox の方針から外れるが、これは**本仕様で新たに導入する逸脱ではなく、現状の `SignaturePad` が既にそうなっている**（`showExisting` / `emptyRef` / canvas の描画内容をすべて内部に持つ）。本仕様はその状態を明示的な `SignatureState`（[4](#4-既存-signaturepad-との関係)）に整理するもので、むしろ現状より見通しがよくなる。

### データフロー（案A）

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

[要件の未確定事項 8](./requirements.md#未確定事項確認したい点)。

### 現状と全画面化後の試算（`devicePixelRatio = 3`、[5](#5-描画領域の形と書き出し画像の縦横比) 案A）

| | 現状（埋め込み欄） | 全画面（縦向き） | 全画面（横向き） |
| --- | --- | --- | --- |
| CSS サイズ | 358 × 160 | 374 × 690 | 約 780 × 300 |
| 描画バッファ（px） | 1074 × 480 | 1122 × 2070 | 2340 × 900 |
| 総ピクセル数 | 約 51.6万 | 約 232.3万（**約4.5倍**） | 約 210.6万（約4.1倍） |

### PNG のファイルサイズへの影響

保存されるのは**透明背景に濃い線（`#1a1a1a`、線幅2.5）だけ**の画像である（[0節](#0-現状コードで確認した事実)）。PNG は可逆圧縮であり、フィルタ後に同一値が連続する領域（＝ほぼ全域を占める透明部分）を強く圧縮するため、**ファイルサイズはピクセル数に対して線形には増えない**。実測前の見積もりとして次を想定する。

| | 想定サイズ |
| --- | --- |
| 現状 | 概ね 10〜30 KB |
| 全画面（案A） | 概ね 30〜90 KB |

比較対象として、[photo-attachment](../photo-attachment/requirements.md) の写真は縮小せずに保存し、1枚あたりのサイズ制限も設けていない（[mobile-compatibility REQ-4.6](../mobile-compatibility/requirements.md)）。近年のスマートフォンの写真は1枚2〜5MBであるため、**サイン画像の増分（数十KB）は写真1枚の 1/50 以下**である。IndexedDB の使用量（[mobile-compatibility REQ-3.7](../mobile-compatibility/requirements.md) の容量超過）および [Google Drive同期](../google-drive-sync/requirements.md) の転送量への影響は無視できる。

### 選択肢

| 観点 | **案A: 上限を設けない（推奨）** | 案B: `dpr` と長辺をクランプ |
| --- | --- | --- |
| 実装 | 追加なし（現状の `setupCanvas` のまま） | `min(dpr, 2)` ＋ 長辺 1600px 超ならオフスクリーン canvas で縮小してから `toBlob` |
| 画質 | 端末の解像度をそのまま活かす | わずかに劣化（線画なので実用上は差が小さい） |
| 将来の高 dpr 端末 | ピクセル数が線形に増える | 上限で頭打ち |
| 既存データとの一貫性 | 保たれる | 保たれる |

**案Aを推奨する。** 上記の試算のとおり実害が小さく、実装を増やさない。ただし実装後に実サイズを実測し、想定を大きく超える場合は案Bへ切り替える（そのとき `SignatureDialog` の内部だけで完結する変更で済む）。

### 透明背景を維持する（重要）

現状 canvas は白で塗りつぶしておらず、**保存される PNG は透明背景**である。見た目が白いのは表示側（`.detail-signature` / `.signature-pad__preview` の `background: #fff`）が白を敷いているためである。

本仕様では**この挙動を変更しない**。書き出し時に白で塗りつぶすと、

- 既に保存済みのサイン画像（透明背景）と新規保存分（白背景）が混在する
- 全域が不透明になるためファイルサイズが増える
- [Google Drive同期](../google-drive-sync/requirements.md) で端末間に混在したデータが行き来する

という不整合が生じる。**描画領域の白は CSS の `background` で表現し、canvas には描き込まない。**

---

## 10. 画面遷移の履歴との関係

[要件の未確定事項 9](./requirements.md#未確定事項確認したい点)。

| 観点 | **案A: ローカル state のみ（推奨）** | 案B: `src/App.tsx` の `Route` に載せる |
| --- | --- | --- |
| [marine-life-observation REQ-11.5](../marine-life-observation/requirements.md)（履歴は画面種別＋識別子のみ） | 維持できる | 反する |
| 入力途中のフォーム状態 | `DiveLogFormView` の state のまま無関係 | **履歴を戻ると入力途中のフォームを復元する必要が生じる**（現状そのような仕組みはない） |
| `src/App.tsx` の変更 | なし | `Route` 型・分岐・`isSameRoute` の変更が必要 |
| OSの戻る操作 | `<dialog>` の UA 挙動（Chrome 120以降）で閉じる見込み | アプリ内履歴は OS の戻ると連動しないため効果なし |
| photo-lightbox との整合 | 同一方針 | 分岐する |

**案Aを強く推奨する。** 案Bは「OSの戻る操作で閉じたい」ための案に見えるが、既存設計ではアプリ内履歴が OS の戻る操作と連動しないため（[marine-life-observation REQ-11.19](../marine-life-observation/requirements.md)）その効果は得られない。`<dialog>` を採れば（[1](#1-実装方式ネイティブ-dialog-を使うか)）ブラウザ標準の機能として戻る操作が「閉じる」に割り当てられる。

**論点5との連動**: OS の戻る操作で閉じられるということは、[6](#6-閉じる操作の意味と-escape) で案B（閉じる＝破棄）を採ると**戻る操作でサインが消える**ことを意味する。案A（オートコミット）ならこの問題は生じない。

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
| `.signature-dialog__clear` / `__done` | `min-height: 44px; min-width: 44px`（グローバル `button` を活かす）。`__done` は `background: var(--accent); color: var(--on-accent); border-color: var(--accent)` | REQ-2.8。`type="submit"` にできない（[1-2 (d)](#d-form-の中に-dialog-を置くことの制約)）ため accent 塗りを明示 |
| `.signature-dialog__stage` | `position: relative; flex: 1; min-height: 0; display: flex; padding: 8px calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left))` | REQ-2.6。左右の 8px は iOS の端スワイプ回避（[1-2 (b)](#b-ポインタイベントとヒットテスト)） |
| `.signature-dialog__canvas` | `flex: 1; width: 100%; height: 100%; background: #fff; border: 1px solid var(--border); border-radius: 8px; touch-action: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; cursor: crosshair` | REQ-3.2, REQ-3.3, REQ-3.8。**背景の白は CSS のみ**（[9](#9-書き出し解像度と保存サイズ)） |
| `.signature-dialog__placeholder` | `position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: #9aa7b4; font-size: 0.95rem; pointer-events: none` | REQ-3.9。白背景の上に置くためトークンではなく固定色。`pointer-events: none` で描画を妨げない |
| `.signature-dialog button:focus-visible` | `outline: 2px solid var(--accent); outline-offset: 2px` | REQ-7.9 |

`100dvh` を使う理由は photo-lightbox と同じ（iOS のアドレスバー分のずれ）。`env(safe-area-inset-*)` は `<dialog>` がトップレイヤーにあり `#root` の padding の外側になるため、モーダル側で改めて確保する（REQ-2.6）。

### `SignaturePad.css` の変更

| クラス | 変更 |
| --- | --- |
| `.signature-pad__canvas` | **削除**（埋め込みキャンバスを廃止する場合） |
| `.signature-pad__preview` | `max-height` を追加し `object-fit: contain` を維持（[5](#5-描画領域の形と書き出し画像の縦横比) 案Aで縦横比が可変になるため） |
| `.signature-pad__placeholder`（新規） | 未サイン時の破線枠。`border: 1px dashed var(--border); border-radius: 6px; min-height: 88px; display: grid; place-items: center; color: var(--text-muted)` |
| `.signature-pad__actions`（新規） | ボタンを横並びにする `display: flex; gap: 0.5rem; flex-wrap: wrap` |

### アイコン（`src/components/icons.tsx`）

既存の共通属性（`viewBox="0 0 24 24"` / `stroke="currentColor"` / `strokeWidth={2}` / 線端丸 / `aria-hidden`）で追加する（REQ-6.3）。**いずれもテキストと併用する**（REQ-6.4）。

| 名前 | 用途 | 形状の目安 |
| --- | --- | --- |
| `ExpandIcon` | 「サインを入力する」ボタン | `M4 9V4h5` ＋ `M20 15v5h-5` ＋ `M4 4l6 6` ＋ `M20 20l-6-6` |
| `EraserIcon` | 「クリア」ボタン | `M7 21h10` ＋ `M4 16l6-6 6 6-3 3H7z`（角丸の消しゴム） |

既存の `CloseIcon`（photo-lightbox で追加済み）は、[6](#6-閉じる操作の意味と-escape) 案Aでは「完了」がテキストボタンになるため使わない。案B・案Cを採る場合は「キャンセル」に転用できる。既存の `PencilIcon` を「サインをやり直す」に使うことも検討する（アイコン追加を減らせる）。

---

## 12. 手動確認観点

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。Tier 1 実機（iOS Safari / Android Chrome）とデスクトップの両方で行う。**個人情報保護のため、確認には実在するガイドの氏名・サインを使わない**（REQ-8.9）。

### 描画の基本

1. 新規作成フォームでサイン欄の「サインを入力する」を押すと、画面いっぱいのモーダルが開くこと（REQ-1.1, REQ-2.1）。
2. 描画領域が現状（高さ160px）より明確に広いこと（REQ-2.3）。
3. 指で連続したストロークが描け、線が滲まないこと（REQ-3.1, REQ-3.5）。
4. 描画中にページがスクロールしない・ピンチズームしない・引っ張って更新が起きないこと（REQ-3.2）。
5. 描画領域を長押ししてもOS標準メニュー（テキスト選択・画像を保存）が出ないこと（REQ-3.3）。
6. 描画領域の端から書き始めて指が外へ出て戻っても、1本の線として繋がること（REQ-3.4、[1-2 (b)](#b-ポインタイベントとヒットテスト)）。
7. **iOS Safari のブラウザタブ起動で、画面左端から書き始めたときにブラウザの「戻る」が発動しないこと**（発動する場合は既知の制約に記録）。
8. 「クリア」で全消去され、プレースホルダーが再表示されること（REQ-3.6, REQ-3.9）。
9. 未描画時のプレースホルダーが、確定した画像に写り込んでいないこと（REQ-3.9）。

### モーダルの座標・レイアウト

10. モーダルが `#root` の `max-width: 640px` に縛られず画面全幅を覆うこと（[1-2 (a)](#a-座標計算への影響--影響しない)）。
11. **描いた線が指の位置とずれないこと**（座標計算の検証。特にデスクトップでウィンドウ幅を 640px 超にした場合）。
12. モーダルを開いた直後の1本目のストロークが正しい太さ・位置で描けること（canvas のサイズ確定タイミングの検証。[1-2 (c)](#c-canvas-のサイズ確定タイミング--最も注意が必要な点)）。
13. 描画中に画面の向きを変えても、描いたストロークが**縦横比を保ったまま**残ること（REQ-3.7、[5](#5-描画領域の形と書き出し画像の縦横比)）。
14. ノッチ／ホームインジケーターのある端末で、ヘッダーのボタンと描画領域が隠れないこと（REQ-2.6）。
15. 幅320px / 375px / 640px、縦向き・横向きで横スクロールが発生しないこと（REQ-6.5）。
16. iOS のホーム画面起動（スタンドアロン）で正しく全画面になること（`100dvh`）。

### 閉じる・確定

17. 「完了」でモーダルが閉じ、サイン欄に描いた内容のプレビューが出ること（REQ-4.5, REQ-5.6）。
18. Escape（外部キーボード）で閉じたとき、[6](#6-閉じる操作の意味と-escape) の決定どおりの結果になること（案Aなら確定される）（REQ-4.2, REQ-4.3）。
19. **Androidの戻る操作（ジェスチャー／ボタン）でモーダルが閉じ、アプリを離れないこと。またそのときサインが失われないこと**（REQ-9.5、[10](#10-画面遷移の履歴との関係)）。
20. 描画領域上をタップ・スワイプしてもモーダルが閉じないこと（REQ-4.4）。
21. 閉じたあと、フォーカスが起動ボタンに戻っていること（REQ-4.6）。
22. 閉じたあと、フォームの他の入力内容とスクロール位置が保たれていること（REQ-4.7）。
23. モーダル内のボタンを押してもフォームが送信されない（ログが保存されない）こと（[1-2 (d)](#d-form-の中に-dialog-を置くことの制約)）。
24. **開発ビルド（StrictMode）で、モーダルを開いた直後に勝手に閉じないこと・サインが二重に確定されないこと**（[1-4](#1-4-strictmode-二重実行への対策)）。

### 保存フロー（[guide-signature REQ-6](../guide-signature/requirements.md) の回帰確認）

25. 新規作成でサインを描いて保存 → 詳細画面にサインが表示されること。
26. 編集フォームを開いて何も触らずに保存 → 既存サインが変わらないこと（`exportBlob() === undefined`）。
27. 編集フォームで「サインをやり直す」→ 新しく描いて保存 → サインが置き換わり、古い添付が残っていないこと。
28. **編集フォームで「サインをやり直す」→ 何も描かずに閉じる → 保存**したとき、[7](#7-既存サインの削除と未描画で閉じたときの扱い) の決定どおりの結果になること（案Aなら既存サインが維持される）。
29. 「サインを削除」（案Aを採る場合）で未サイン状態になり、保存後に詳細画面が「未サイン」になること（REQ-5.7）。
30. サインを確定した後にフォームの他項目を編集しても、サインが保持されること（REQ-5.3）。
31. サインを確定した後にモーダルを開き直したとき、[4](#4-既存-signaturepad-との関係) の決定どおりになること（続きから描ける／未描画から始まる）（REQ-5.4）。
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
41. **保存されたサイン画像のファイルサイズを実測し、[9](#9-書き出し解像度と保存サイズ) の見積もり（30〜90KB）の範囲に収まること**。大きく超える場合は [9](#9-書き出し解像度と保存サイズ) 案Bへの切り替えを検討する。
42. 保存された PNG が**透明背景**のままであること（[9](#9-書き出し解像度と保存サイズ)）。

---

## 既知の制約・トレードオフ

- **デスクトップでサイン欄に直接描けなくなる**（[3](#3-サインモーダルを開く操作) / [4](#4-既存-signaturepad-との関係) 案A）。必ずモーダルを開く操作が1つ増える。デスクトップは Tier 2（[mobile-compatibility](../mobile-compatibility/requirements.md)）であり、主要利用シーンはスマートフォンであることを根拠に受け入れる。
- **iOS Safari のブラウザタブ起動では、画面の左右端からのスワイプがブラウザの戻る／進むに消費されうる**（[1-2 (b)](#b-ポインタイベントとヒットテスト)）。描画領域の左右に余白を設けて緩和するが完全には防げない。ホーム画面起動（スタンドアロン）では発生しない。
- **Escape とOSの戻る操作を抑止できない**（[1-3](#1-3-escape-と-cancel-イベントの制約)）。これを前提に「閉じる＝確定」に倒す（[6](#6-閉じる操作の意味と-escape) 案A）。
- **保存画像の縦横比が可変になる**（[5](#5-描画領域の形と書き出し画像の縦横比) 案A）。既存の保存済みサイン（約2.24:1の横長）と新規保存分（縦向きなら縦長）が混在する。表示側は `object-fit: contain` で吸収するが、詳細画面での見え方は端末の向きによって変わる。
- **画面の向きを横→縦に変えるとストロークが拡大されてわずかにぼやける**（[5](#5-描画領域の形と書き出し画像の縦横比) の contain 復元）。消えるよりは良いという判断。
- **取り消し（Undo）がない**。書き損じたら「クリア」で全消去して描き直す（現状と同じ）。ストロークをベクトルデータとして保持すれば Undo も高DPI再描画も可能になるが、保存形式は PNG のままなので恩恵は描画中に限られ、実装量に見合わないと判断した。
- **`<dialog>` に依存する**（[1](#1-実装方式ネイティブ-dialog-を使うか) 案A）。`showModal()` を持たない環境では現状の埋め込みキャンバスにフォールバックする（REQ-8.7）。フォールバックを実装する場合、描画ロジックが2箇所に残ることになるため、フォールバックの要否は [未確定事項 1](./requirements.md#未確定事項確認したい点) で確定させる。
- **背面スクロールの抑止はブラウザ依存**。photo-lightbox と同じく `document.body.style.overflow = 'hidden'` で防御し、iOS Safari で完全に止まらない場合は「モーダルが全画面のため実害は小さい」として受け入れる（[photo-lightbox/design.md 3-4](../photo-lightbox/design.md#3-4-背面スクロールの抑止)）。
- **サイン画像の閲覧用拡大表示は引き続き提供しない**（[photo-lightbox REQ-1.8](../photo-lightbox/requirements.md)）。本仕様は入力のみを扱う。
- **`SignaturePad` は引き続き自身で状態を持つ**（[8](#8-フォームへのデータの受け渡し) 案A）。`PhotoPicker` / `ObservationEditor` / `ImageLightbox` の「親が状態を持つ」方針とは異なるが、これは現状からの継続であり本仕様で新たに導入する逸脱ではない。

## 実装後に更新が必要な既存ドキュメント

| ファイル | 更新内容 |
| --- | --- |
| [`specs/00-overview.md`](../00-overview.md) | 機能一覧に本仕様の行を追加（本仕様の策定時に実施済み）。実装後、状態を「実装済み」に更新する。「既知の制約」の「アプリ独自のモーダル・オーバーレイ部品」に関する記述に、本仕様が2つ目のモーダルであることを追記する |
| [`specs/guide-signature/requirements.md`](../guide-signature/requirements.md) | REQ-2 / REQ-5（描画キャンバスの提示方法）を全画面モーダルへの参照に更新。[7](#7-既存サインの削除と未描画で閉じたときの扱い) 案Aを採る場合は REQ-6 の2番目の分岐も更新する |
| [`specs/guide-signature/design.md`](../guide-signature/design.md) | 「UIコンポーネント」節を `SignaturePad` ＋ `SignatureDialog` の構成に更新。`SignaturePadHandle` から `clear` を削除したことを反映 |
| [`specs/mobile-compatibility/design.md`](../mobile-compatibility/design.md) | `SignaturePad` に関する記述（`ResizeObserver` による再スケール、44pxのタップ領域）の対象が `SignatureDialog` へ移ることを追記。動作確認マトリクス M-10〜M-12 の対象も更新 |
| [`specs/photo-lightbox/design.md`](../photo-lightbox/design.md) | 「汎用のモーダル部品にはしない」の記述に、2つ目のモーダル（本仕様）が同じ `<dialog>` 方式を採ったことを追記（任意） |
