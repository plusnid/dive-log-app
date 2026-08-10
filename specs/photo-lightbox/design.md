# 設計: 写真の拡大表示（ライトボックス）

関連: [要件](./requirements.md) / [概要](../00-overview.md) / [写真の添付設計](../photo-attachment/design.md) / [観察した生物の設計](../marine-life-observation/design.md) / [ダイビングログCRUD設計](../dive-log-crud/design.md) / [iOS/Android動作保証の設計](../mobile-compatibility/design.md) / [UI仕上げ レベル1設計](../ui-polish-level1/design.md) / [UI仕上げ レベル2設計](../ui-polish-level2/design.md) / [UI仕上げ レベル3設計](../ui-polish-level3/design.md) / [ダイビングプラン画像の添付設計](../dive-plan-image/design.md)

ステータス: 実装済み。[要件の未確定事項](./requirements.md#未確定事項確認したい点) 1〜8 はすべてユーザー確定済み（2026-08-09、いずれも推奨案どおり: 1=`<dialog>` / 2=前後ボタン / 3=観察記録の写真だけ / 5=3種の閉じ方 / 6=ローカルstate / 7=位置ベースの名前 / 8=ズームなし）。

第3のトリガー: 詳細画面のダイビングプラン画像一覧（[dive-plan-image/design.md](../dive-plan-image/design.md)）が、写真・メモ／観察記録の写真に続く3箇所目の呼び出し元として本コンポーネントを**無変更で**利用する（[要件](./requirements.md) 概要の対象3箇所、[dive-plan-image REQ-4.8](../dive-plan-image/requirements.md)）。`images.length` に応じて前後ナビゲーション・位置表示・alt文言を出し分ける汎用設計にしたため、呼び出し元が増えても本ファイルの変更は不要だった。

## 設計方針

- **ブラウザ標準の `<dialog>` に乗る**。フォーカストラップ・背面の不活性化・Escape・トップレイヤーは自前実装せず、UAの実装を使う（→ [1](#1-実装方式の比較)）。このアプリで初めてのモーダルであり、自前実装のアクセシビリティ不具合を持ち込まないことを最優先する。
- **写真の実体には触れない**。詳細画面が既に生成しているオブジェクトURL（`photoUrls`）を渡すだけとし、`ImageLightbox` は DB も `URL.createObjectURL` も触らない（REQ-9.5, REQ-9.7）。
- **状態は `DiveLogDetailView` に1つだけ持つ**。共通部品はコントロールドコンポーネントとし、`PhotoPicker` / `ObservationEditor` / `SignaturePad` と同じ「親が状態を持つ」方針に揃える（REQ-1.4）。
- **`src/App.tsx` の履歴スタックには載せない**（→ [6](#6-画面遷移の履歴との関係)）。拡大表示は画面ではなく、詳細画面の一時的な表示である。
- **依存パッケージは追加しない**（REQ-9.1）。
- **配色トークンは背景に関してのみ例外とする**（→ [9](#9-スタイルimagelightboxcss)）。写真を見るための面であり、ライト／ダークで明るさを切り替えると写真の見え方が一定しないため。

## 変更対象ファイル

| ファイル | 区分 | 変更内容 | 関連要件 |
| --- | --- | --- | --- |
| `src/components/ImageLightbox.tsx` | 新規 | `<dialog>` によるライトボックス本体（表示・切り替え・閉じる・フォーカス管理） | REQ-2.x, REQ-3.x, REQ-5.x, REQ-7.x |
| `src/components/ImageLightbox.css` | 新規 | オーバーレイ・画像・操作要素のスタイル | REQ-8.x |
| `src/views/DiveLogDetailView.tsx` | 変更 | 2箇所のサムネイルをボタン化、拡大表示の状態を1つ保持、対象の集合の導出 | REQ-1.x, REQ-4.x |
| `src/App.css` | 変更 | `.detail-photos` / `.observation-list__thumb` をボタンにすることに伴う調整（グローバル `button` スタイルの打ち消し・タップ領域） | REQ-1.6, REQ-9.4 |
| `src/components/icons.tsx` | 変更 | `CloseIcon` / `ChevronLeftIcon` / `ChevronRightIcon` の追加 | REQ-8.3 |

`src/types/` / `src/db/` / `src/sync/` / `src/hooks/` / `src/platform/` / `src/App.tsx` は**変更しない**（REQ-9.3, REQ-6.1）。`PhotoPicker` / `ObservationEditor` / `CardThumbnail` も変更しない（[対象外](./requirements.md#対象外今回やらないこと)）。

---

## 0. 現状（コードで確認した事実）

`src/views/DiveLogDetailView.tsx` は、`getDiveLogDetail(id)` の結果（`detail.photos: Attachment[]`）から `useEffect` でオブジェクトURLの配列 `photoUrls: string[]` を生成し、クリーンアップで `revokeObjectURL` している。`photoUrls[i]` は `detail.photos[i]` に対応する。

```tsx
const photoUrlByUuid = new Map(detail.photos.map((p, i) => [p.uuid, photoUrls[i]]))   // 既存
...
{photoUrls.map((url) => (<img key={url} src={url} alt="ダイビング写真" />))}           // 写真・メモ
...
{thumbUrl && <img className="observation-list__thumb" src={thumbUrl} alt="" />}       // 観察記録の行
```

したがって**拡大表示に必要な画像URLはすでに揃っている**。追加の読み込み・オブジェクトURL生成は不要（REQ-9.5）。観察記録が保持するのは `photoUuids: string[]`（[marine-life-observation/design.md 2](../marine-life-observation/design.md)）であり、`photoUrlByUuid` で解決できる。解決できない uuid は `undefined` になるため、そのまま除外すれば REQ-4.3 を満たす。

`src/index.css` はグローバルに `button { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.9rem; min-height: 44px; min-width: 44px }` を当てている。**サムネイルを `<button>` で包む際はこの既定を打ち消す必要がある**（打ち消さないと写真の周りに枠と余白が付き、見た目が変わって REQ-9.4 に反する）。

---

## 1. 実装方式の比較

[要件の未確定事項 1](./requirements.md#未確定事項確認したい点)。**`<dialog>` + `showModal()` を採用**（自前の `position: fixed` オーバーレイは不採用）。

決め手はアクセシビリティの実装リスクである。フォーカストラップ・背面の不活性化（`inert` 相当）・Escapeでの閉じる・トップレイヤーでの重なり順をすべてUAに委ねられ、本アプリ初のモーダルで自前実装のフォーカストラップ等に回帰を持ち込むリスク（テストコードのない本プロジェクト、[概要](../00-overview.md)）を避けられる。サポート対象（[mobile-compatibility Tier 1](../mobile-compatibility/requirements.md): iOS/iPadOS 16.4以降 Safari、Android 10以降 Chrome 最新安定版とその1つ前）は `<dialog>` / `showModal()` / `::backdrop` / `close`・`cancel` イベントのいずれも対応済み（Safari 15.4以降、Chrome 37以降でカバー）。Androidの戻る操作はChrome 120以降のCloseWatcher統合により「閉じる」操作として消費される見込み（要実機確認。[6](#6-画面遷移の履歴との関係)で詳述）。背面スクロールの抑止はブラウザにより実装差があるため、[3-4](#3-4-背面スクロールの抑止)で `body { overflow: hidden }` を併用して防御する。

なお、`<dialog>` は「モーダルとしての振る舞い」を提供するだけであり、見た目（全画面・暗い背景・画像の配置）はすべてCSSで作る点は自前実装と変わらない。

### 案Aで注意すべき既知の落とし穴

1. **UAの既定スタイルの打ち消し**: `dialog` には既定で `padding: 1em` / `border: solid` / `background: Canvas` / `max-width: calc(100% - 6px - 2em)` が付く。全画面化するには `width/height: 100%`（`100dvw` / `100dvh`）・`max-width/max-height: none`・`padding: 0`・`border: 0`・`background: transparent` を明示する。
2. **`::backdrop` はカスタムプロパティを継承しない場合がある**（実装により継承元が異なる時期があった）。背景色は**トークンではなくリテラル**（`rgb(0 0 0 / 0.88)`）で指定する。REQ-8.1（テーマによらず一定の暗い背景）とも整合する。
3. **`showModal()` は命令的APIである**。React では `ref` + `useEffect` で呼ぶ。宣言的な `open` 属性（`<dialog open>`）は**非モーダル**になり、フォーカストラップも `::backdrop` も効かないため使わない。
4. **`close` / `cancel` イベントで React 側の state を必ず同期する**。Escape やUAによる閉じる操作は React を経由しないため、`onClose` で `onClose()` コールバックを呼び、親の state を `null` にする（StrictMode時の二重実行に由来する `close` イベントをどう区別するかは [2](#2-imagelightbox-のapi) 参照）。
5. **iOSのビューポート**: `100vh` はアドレスバー分ずれるため、既存の `#root { min-height: 100svh }` と同様に `100dvh` / `100svh` 系を使う。セーフエリアは `env(safe-area-inset-*)` を dialog 側の padding で確保する（REQ-2.8。dialog はトップレイヤーにあり `#root` の padding の外側になる）。

---

## 2. `ImageLightbox` のAPI

```tsx
export interface LightboxImage {
  /** 表示に使うオブジェクトURL。生成・解放は呼び出し側（DiveLogDetailView）の責務（REQ-9.5, REQ-9.6） */
  url: string
  /** 画像の代替テキストの主部（例: 'ダイビング写真' / 'クマノミの写真'）。位置は本部品が付加する（REQ-7.7） */
  label: string
}

interface ImageLightboxProps {
  /** 対象の集合（1件以上。空配列を渡してはならない＝親が開かない） */
  images: LightboxImage[]
  /** 現在表示している位置（0 起点） */
  index: number
  /** 前後の切り替え（REQ-3.1）。親が範囲内にクランプする */
  onIndexChange: (next: number) => void
  /** 閉じる（×・背景・Escape・UAによる閉じるのすべてがこれを呼ぶ。REQ-5.1〜REQ-5.3） */
  onClose: () => void
}

/** ブラウザが `<dialog>` のモーダル表示に対応しているか（REQ-9.8）。モジュールスコープで1度だけ判定する。 */
export const canShowLightbox: boolean =
  typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function'
```

- **開いているときだけマウントする**（親が `{lightbox && <ImageLightbox … />}` で条件レンダリングする）。マウント＝開く、アンマウント＝閉じる、という単純な対応にすることで、`open` 状態を props と DOM の二重管理にしない。
- `images` / `index` を props で受け取り内部に複製しないため、親の state と表示が食い違わない（REQ-3.6 は親が集合を変えないことで満たす）。
- 部品はDBにもDexieにもアクセスしない（REQ-9.7）。

### StrictMode二重実行と `<dialog>` の `close` イベント（重要・再利用しているパターン）

`<dialog>` の `close` イベントは、ユーザー操作（Escape・×・背景クリック）による close と、コードから呼んだ `dialog.close()` による close を区別しない。ところが `showModal()` を呼ぶマウント時 `useEffect` は、`React.StrictMode` の開発時二重実行（実行→クリーンアップ→再実行）により、1回目の実行直後にクリーンアップが走って `dialog.close()` を呼んでしまう。素朴に `<dialog onClose={onClose}>` としていると、この `close` イベントがそのまま親の `onClose` に伝わり、**開発時に開いた瞬間に拡大表示が閉じてしまう**（本番ビルドはStrictModeの二重実行がなく再現しないため気付きにくい）。

**対策（`suppressCloseRef`）**: `useRef<boolean>(false)` のフラグを持ち、エフェクトのクリーンアップから `dialog.close()` を呼ぶ直前にだけ `true` に立てる。

```tsx
const suppressCloseRef = useRef(false)

useEffect(() => {
  const dialog = dialogRef.current
  if (!dialog || dialog.open) return
  dialog.showModal()                         // REQ-2.1, REQ-2.3, REQ-7.1〜REQ-7.3
  return () => {
    if (dialog.open) {
      suppressCloseRef.current = true        // 次の close イベントはプログラム起因なので抑止する
      dialog.close()
    }
  }
}, [])

function handleNativeClose() {               // <dialog onClose={handleNativeClose}> に渡す
  if (suppressCloseRef.current) { suppressCloseRef.current = false; return }
  onClose()                                  // ユーザー操作・UAによる閉じるのときだけ親へ伝える
}
```

フラグが立っていれば `handleNativeClose` はそれを消費して何もせず、立っていなければ通常どおり親の `onClose()` を呼ぶ。×ボタンは `onClick={onClose}` で直接呼び `dialog.close()` を経由しないため、この経路はフラグの影響を受けない（REQ-5.1）。

**再利用条件**: ネイティブの `<dialog>`（や、閉じる操作をユーザー操作からも命令的APIからも起動できる同種の要素）をReactでラップし、①アンマウント時クリーンアップでも命令的に閉じる可能性があり、②その「閉じた」通知を親のstateに同期するハンドラを持つ場合に必要になる。`src/components/SignatureDialog.tsx` が同じ構造（`<dialog>` + `showModal()` + アンマウント時クリーンアップでの `close()`）を持つため、この `suppressCloseRef` パターンをそのまま再利用している（同ファイルのコード内コメントが本節を参照）。他にモーダルを追加する場合もまずこの流用を検討する。

### マークアップと実装上のポイント

全体のJSX（`<dialog>` 直下に画像ステージ・閉じるボタン・前後ボタン・位置表示を並べる構造）は `src/components/ImageLightbox.tsx` を参照。ここではコードだけでは伝わらない決定事項のみ記す。

- **背景の選択判定**（REQ-5.2, REQ-5.4）: `event.target === event.currentTarget`（`<dialog>` 自身）だけを見る方式は採らない。画像を中央寄せするラッパ `.image-lightbox__stage` が全面を覆うため、実際の背景タップの多くは `__stage` が受け取ってしまうためである。代わりに**「画像・操作要素のいずれでもない要素が選択されたら閉じる」**という除外方式（`target.closest('.image-lightbox__image, .image-lightbox__counter, button')`）を用いる。`__stage` に `pointer-events: none` を当てる方法もあるが、画像側で `auto` に戻す指定や `disabled` ボタンの扱いが絡むため、判定を1箇所に集約する上記の方式を採る。
- **押下と解放がまたがるケース**: 画像上で押して背景で離した場合、`click` の発火元は共通祖先（`<dialog>`）になり閉じてしまう。実害は小さいため初回は許容し、問題があれば `pointerdown` の位置も見る判定へ拡張する（[既知の制約](#既知の制約トレードオフ)）。
- **フォーカスの初期位置**（REQ-7.2）: `showModal()` は、ダイアログ内の最初のフォーカス可能要素（「閉じる」ボタン）へ自動でフォーカスする。明示的な `autoFocus` は付けない（`AppMenu` が「開いたらパネル内先頭のボタンへ」としているのと同じ結果になる）。
- **カウンタは `aria-hidden`**: 同じ情報を画像の `alt` に含めているため、二重読み上げを避ける（REQ-2.5 の視覚表示としての役割のみ）。
- **`disabled` な前後ボタン**（REQ-3.2）: 端では無効表示にする。循環させないのは、写真の並びに「先頭・末尾」があることを利用者に伝えるため。循環させたい場合は `disabled` を外して `(index + 1) % n` にするだけで切り替えられる。
- **左右矢印キー**（REQ-3.4）はボタンと同じ `onIndexChange` を呼ぶ。Escapeは `<dialog>` の既定動作（`cancel` → `close`）に任せる（REQ-5.3）。

---

## 3. `DiveLogDetailView` 側の変更

### 3-1. 状態の持ち方

```ts
/** 拡大表示の対象。写真の実体ではなく「どこから開いたか」を持つ（オブジェクトURLの世代ずれを避けるため）。 */
type LightboxTarget =
  | { kind: 'log'; index: number }                    // 写真・メモから（REQ-4.1）
  | { kind: 'observation'; uuid: string; index: number }  // 観察記録の行から（REQ-4.2）

const [lightbox, setLightbox] = useState<LightboxTarget | null>(null)
```

- **`LightboxImage[]` を state に入れない**。`photoUrls` は `detail` が変わるたびに作り直され古いURLは `revoke` されるため、state に URL を持つと解放済みURLを表示しうる。state には「開いた場所と位置」だけを持ち、描画のたびに `photoUrls` から導出する。
- `detail` が変化したとき（＝写真URLが作り直されたとき）は `setLightbox(null)` で閉じる防御を入れる（現状 `detail` は `id` 変更時のみ再取得されるため実際にはまれ）。
- 詳細画面がアンマウントされれば state ごと消えるため、REQ-6.2（画面遷移時に残さない）と REQ-6.5（リロードで保持しない）は自動的に満たされる。

### 3-2. 対象の集合の導出（描画時）

```ts
/** 拡大表示に渡す画像。photoUrls / observations から毎レンダリングで導出する（REQ-4.1〜REQ-4.3）。 */
function lightboxImages(target: LightboxTarget): LightboxImage[] {
  if (target.kind === 'log') {
    return photoUrls.map((url) => ({ url, label: 'ダイビング写真' }))
  }
  const observation = observations.find((o) => o.uuid === target.uuid)
  if (!observation) return []
  return observation.photoUuids
    .map((u) => photoUrlByUuid.get(u))
    .filter((url): url is string => url !== undefined)          // REQ-4.3
    .map((url) => ({ url, label: `${observation.name}の写真` }))  // REQ-7.7
}
```

- 集合が空、または `index` が範囲外のときは拡大表示を開かない／閉じる（`images.length === 0` なら `setLightbox(null)`）。

### 3-3. サムネイルをボタン化する

- **写真・メモ**（REQ-1.1）: `.detail-photos` の各サムネイルを `<button aria-label={`写真${i + 1}を拡大表示`}>` で包み、クリックで `setLightbox({ kind: 'log', index: i })`（REQ-7.8）。内側の `<img>` は `alt=""`（ボタン名が意味を担うため装飾扱い）。
- **観察記録の行**（REQ-1.2）: サムネイルがあるときだけ `<button aria-label={`${o.name}の写真を拡大表示`}>` で包み、クリックで `setLightbox({ kind: 'observation', uuid: o.uuid, index: 0 })`。行内には既に `observation-list__name`（`<button>`）があるが、**兄弟として並ぶだけで入れ子にはならない**ため問題ない（詳細画面の行は `ObservationEditor` と違い行全体がボタンではない）。
- **機能検出**（REQ-9.8）: `canShowLightbox` が `false` のときは上記のボタンで包まず、現状どおり `<img>` をそのまま出す（`canShowLightbox ? <button>…</button> : <img …/>` と分岐。`onSelectCreature` の有無で名前をボタン／テキストに切り替えている既存の書き方と同じ形）。

### 3-4. 背面スクロールの抑止

`showModal()` 中の背面スクロールの扱いはブラウザにより差があるため、防御的に次を行う（REQ-2.4）。

```ts
useEffect(() => {
  if (!lightbox) return
  const previous = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  return () => { document.body.style.overflow = previous }
}, [lightbox])
```

- `body` には既に `overscroll-behavior-y: contain` が指定されている（`src/index.css`）ため、引っ張って更新（pull-to-refresh）は起きない。
- 併せて `.image-lightbox` に `overscroll-behavior: contain` を指定する。
- **iOS Safari では `body { overflow: hidden }` だけではスクロールが完全に止まらない既知の癖がある**（`position: fixed` + `top` の退避が必要になる場合がある）。ただしその手法はスクロール位置の復元（REQ-5.6）を自前で行う必要があり副作用が大きいため、まず上記で実機確認し、問題があれば「拡大表示中の背面スクロールは許容する」を既知の制約として受け入れる（拡大表示は全画面であり、背面が動いても視覚上は見えない）。

---

## 4. 対象の集合の決定

[要件の未確定事項 3](./requirements.md#未確定事項確認したい点)。**観察記録から開いたときは、その観察記録に紐づく写真だけを対象にする**（ログの全写真を対象にする案、その1枚だけを対象にする案は不採用）。

決め手: 観察記録には2枚以上の写真を紐づけられる（[marine-life-observation REQ-3.1](../marine-life-observation/requirements.md)）が、一覧の行には先頭1枚しか表示されず、2枚目以降の存在に利用者が気付けない。観察記録スコープの拡大表示にすることで、この情報欠落を位置表示「1 / 2」で自然に補える。加えて代替テキストに生物名を含められる（例:「クマノミの写真（1枚目 / 全2枚）」）。ログの全写真を対象にする案だと、前後に無関係な写真が混ざり、どれが対象の生物の写真か利用者が判別できなくなる。実装も `observation.photoUuids` を解決するだけで完結する（[3-2](#3-2-対象の集合の導出描画時)）。

「開く箇所によらず同じ集合」という一貫性を重視する立場からはログ全体を対象にする案も妥当だが、上記の情報欠落の解消を優先してこの案を確定した。

---

## 5. 写真の切り替え

[要件の未確定事項 2](./requirements.md#未確定事項確認したい点)。**前後ボタン＋位置表示＋左右矢印キー**を採用（切り替えなし、スワイプ追加のいずれも不採用）。

決め手: スワイプはiOSのブラウザタブでの「戻る」ジェスチャーと画面端の横スワイプが競合しうること、支援技術のためにどのみちボタンが必要になり実装が二重になることから、初回スコープでは見送った。前後ボタン方式の実装であれば、あとからスワイプ判定を足しても `ImageLightbox` の内部だけで完結する。

---

## 6. 画面遷移の履歴との関係

[要件の未確定事項 6](./requirements.md#未確定事項確認したい点)。`src/App.tsx` は `Route[]` の履歴スタックを持ち、`push` / `replace` / `back` / `dropLog` で操作する（[marine-life-observation/design.md 10-2](../marine-life-observation/design.md)）。この履歴は**ブラウザ履歴とは連動しない**（[marine-life-observation REQ-11.19](../marine-life-observation/requirements.md)）。

**拡大表示はこの履歴スタックに載せず、`DiveLogDetailView` のローカル state だけで完結させる**（`Route` に載せる案は不採用）。決め手は2点。①`Route` に載せると REQ-11.5（履歴は識別子のみを持つ）に反し、写真の集合と位置という表示状態を履歴の型に持ち込むことになる。②「Androidの戻る操作で閉じられるようにする」ことが `Route` 化の主な動機になり得るが、既存設計ではアプリ内履歴はOSの戻る操作と連動していないため、`Route` に載せてもその効果は得られない。一方、`<dialog>` を採用したことで（[1](#1-実装方式の比較)）、ブラウザ標準機能としてAndroidの戻る操作が「閉じる」に割り当てられる見込みがあり（Chrome 120以降のCloseWatcher統合）、履歴に載せずに目的を達成できる。

**明記事項**: 自前オーバーレイ（未確定事項1の不採用案）を採っていた場合、Androidの戻る操作は拡大表示を閉じずにアプリ／タブを離れる。これは「アプリ内の遷移はブラウザ履歴と連動しない」という既存の設計方針（[marine-life-observation REQ-11.19](../marine-life-observation/requirements.md)、[dive-log-crud/design.md](../dive-log-crud/design.md) / [ui-polish-level3/design.md](../ui-polish-level3/design.md) の既知のトレードオフ）と整合する挙動であり、本仕様でその方針は変更しない。

---

## 7. 代替テキストとスクリーンリーダー

[要件の未確定事項 7](./requirements.md#未確定事項確認したい点)。現状は `.detail-photos` の画像が `alt="ダイビング写真"`、観察記録のサムネイルが `alt=""`（装飾扱い）である。

| 要素 | 現状 | 変更後（案A） | 根拠 |
| --- | --- | --- | --- |
| 写真・メモのサムネイル | `<img alt="ダイビング写真">` | `<button aria-label="写真1を拡大表示"><img alt=""></button>` | ボタンの名前が全て同じだと何枚目か区別できない。位置ベースの名前は `ObservationEditor` の写真トグル（`aria-label="写真1を選択"` ＋ `alt=""`）と同じ方式 |
| 観察記録のサムネイル | `<img alt="">` | `<button aria-label="クマノミの写真を拡大表示"><img alt=""></button>` | 行の中で「この生物の写真」であることが伝わる |
| 拡大表示のダイアログ | - | `aria-label="写真の拡大表示"` | REQ-7.6 |
| 拡大表示の画像 | - | `alt="ダイビング写真（2枚目 / 全5枚）"` ／ `alt="クマノミの写真（1枚目 / 全2枚）"`。1枚のときは位置を付けない | REQ-7.7。ダイアログを開いた直後に読み上げられる内容として、何を見ているかと現在位置が伝わる |
| 位置表示（視覚） | - | `aria-hidden="true"` | 画像の `alt` と重複するため |
| 前後・閉じるボタン | - | `aria-label="前の写真" / "次の写真" / "閉じる"`、アイコンは `aria-hidden`（`icons.tsx` の共通属性） | REQ-7.4, REQ-7.5, REQ-8.3 |

**限界**: 写真にキャプション・タグは保存していない（[photo-attachment/design.md](../photo-attachment/design.md) の `Attachment` は `type` / `blob` / `mimeType` / `createdAt` のみ）ため、代替テキストで写真の内容そのものは説明できない。位置と紐づく生物名までが提供できる文脈情報の限界である（詳細は[既知の制約・トレードオフ](#既知の制約トレードオフ)）。

---

## 8. ズーム操作

[要件の未確定事項 8](./requirements.md#未確定事項確認したい点)。**ズーム機能は実装しない**（実寸表示＋スクロール、自前のピンチ／パンのいずれも不採用。意図的にスコープ外）。

決め手: 要望は「タップすると拡大表示できるようにしたい」であり、画面いっぱいの表示（`max-width/height: 100%` + `object-fit: contain`）で満たせる。細部を見たい場合はページ全体のOS/ブラウザのピンチズームが引き続き使える（`user-scalable=no` は指定しない。REQ-7.10）。実寸表示＋スクロールは実装後に `ImageLightbox` の内部だけで追加でき、自前のピンチ／パンは回帰リスクが大きい（`SignaturePad` に次ぐポインタ処理の塊が増える）ため、必要になった時点で別の改善要望として扱う。

---

## 9. スタイル（`ImageLightbox.css`）

| クラス | 主な指定 | 根拠 |
| --- | --- | --- |
| `.image-lightbox` | `width: 100dvw; height: 100dvh; max-width: none; max-height: none; padding: 0; border: 0; margin: 0; background: transparent; overflow: hidden; overscroll-behavior: contain` | UA既定の打ち消し＋全画面（REQ-2.1, [1](#案aで注意すべき既知の落とし穴)） |
| `.image-lightbox::backdrop` | `background: rgb(0 0 0 / 0.88)` | REQ-8.1。カスタムプロパティを使わずリテラル指定 |
| `.image-lightbox__stage` | `width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: calc(0.5rem + env(safe-area-inset-top)) calc(0.5rem + env(safe-area-inset-right)) calc(0.5rem + env(safe-area-inset-bottom)) calc(0.5rem + env(safe-area-inset-left))` | REQ-2.8 |
| `.image-lightbox__image` | `max-width: 100%; max-height: 100%; object-fit: contain` （`width` は指定しない） | REQ-2.2（実寸を上限に引き伸ばさない） |
| `.image-lightbox__close` | `position: absolute; top: calc(0.5rem + env(safe-area-inset-top)); right: calc(0.5rem + env(safe-area-inset-right)); width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: rgb(17 17 17 / 0.7); color: #fff` | REQ-5.1, REQ-8.2, REQ-8.6、グローバル `button` の打ち消し |
| `.image-lightbox__nav` | `position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px;`（`--prev` は左端、`--next` は右端。背景・色は `__close` と同じ） | REQ-3.1, REQ-8.6 |
| `.image-lightbox__nav:disabled` | `opacity: 0.35`（加えてクリック不可はブラウザの `disabled` に任せる） | REQ-3.2 |
| `.image-lightbox__counter` | `position: absolute; bottom: calc(0.75rem + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); margin: 0; padding: 0.2rem 0.6rem; border-radius: 999px; background: rgb(17 17 17 / 0.7); color: #fff; font-size: 0.85rem` | REQ-2.5, REQ-8.2 |
| `.image-lightbox__error` | `color: #fff; font-size: 0.9rem; text-align: center` | REQ-2.6 |
| `.image-lightbox button:focus-visible` | `outline: 2px solid #fff; outline-offset: 2px` | REQ-7.9（暗い背景上でも見えるフォーカスリング） |

**配色トークンを使わない理由（REQ-8.1）**: 拡大表示は「写真を見るための面」であり、ライトモードで背景が明るくなると写真の縁が溶けて視認性が下がる。`--surface` / `--text` を使うとテーマにより明暗が反転してしまうため、この面に限りテーマ非依存の固定色（暗い背景＋白の前景）とする。[ui-polish-level2](../ui-polish-level2/design.md) の配色体系に対する明示的な例外であり、他の画面には影響しない。

**コントラスト（REQ-8.2）**: 操作要素は自前の暗いチップ（`rgb(17 17 17 / 0.7)`）を持つため、背後がどんな写真でも合成後の明度は上限が抑えられる。最悪ケース（真っ白な写真の上）でも合成色は約 `#585858` 相当で、白（`#fff`）との contrast ratio は約 7:1 となり、テキスト4.5:1・非テキスト3:1の基準を満たす。背景（`::backdrop`）の上ではさらに高い。

### `src/App.css` 側の調整

| クラス | 指定 | 根拠 |
| --- | --- | --- |
| `.detail-photos__button` | `padding: 0; border: 0; background: none; min-height: 0; min-width: 0; border-radius: 8px; line-height: 0; cursor: zoom-in` | グローバル `button` 既定の打ち消し（[0節](#0-現状コードで確認した事実)）。サムネイルの見た目を現状（120px・角丸・枠線）から変えない（REQ-9.4）。タップ領域は120×120で44px以上を満たす |
| `.detail-photos__button img` | 既存の `.detail-photos img` の指定（120×120 / `object-fit: cover` / 角丸 / 枠線）をそのまま適用 | REQ-9.4 |
| `.observation-list__thumb-button` | `width: 44px; height: 44px; padding: 6px; border: 0; background: none; min-height: 0; min-width: 0; flex-shrink: 0; display: grid; place-items: center; cursor: zoom-in` | REQ-1.6（32pxのサムネイルのままタップ領域だけ44×44にする）。行の高さは `.observation-list__name` の `min-height: 44px` により既に44px以上のため、**行の高さは変わらない**（REQ-1.6 後段） |
| `.observation-list__thumb` | 変更なし（32×32・角丸・枠線） | REQ-9.4 |

- `cursor: zoom-in` は「拡大できる」ことのデスクトップでの手掛かり。モバイルでは効かないため、視覚的な手掛かりを追加すべきかは実機確認で判断する（現状はサムネイルの見た目を変えない方針。アイコンのオーバーレイ等は写真を覆うため採らない）。

### アイコンの追加（`src/components/icons.tsx`）

既存の共通属性（`viewBox="0 0 24 24"` / `stroke="currentColor"` / `strokeWidth={2}` / 線端丸 / `aria-hidden`）で3つ追加する（REQ-8.3）。

| 名前 | 形状の目安 |
| --- | --- |
| `CloseIcon` | `M6 6l12 12` ＋ `M18 6L6 18` |
| `ChevronLeftIcon` | `M15 5l-7 7 7 7` |
| `ChevronRightIcon` | `M9 5l7 7-7 7` |

---

## 10. 手動確認観点

自動テストがない（[概要](../00-overview.md)）ため、実装後に以下を目視確認する。Tier 1 実機（iOS Safari / Android Chrome）とデスクトップの両方で行う。

1. 写真を3枚添付したログの詳細画面で、2枚目のサムネイルをタップすると2枚目が拡大表示されること（REQ-1.1, REQ-4.1）。
2. 拡大表示で「次へ」「前へ」が効き、位置表示が「2 / 3」のように更新されること。先頭で「前へ」、末尾で「次へ」が無効表示になること（REQ-3.1, REQ-3.2, REQ-3.5）。
3. 写真が1枚だけのログで、前後ボタンと位置表示が出ないこと（REQ-3.3, REQ-2.5）。
4. 観察記録の行のサムネイルをタップしたとき、[未確定事項3](./requirements.md#未確定事項確認したい点) の決定どおりの集合が表示されること（写真を2枚紐づけた観察記録で「1 / 2」と出て2枚を行き来できること）（REQ-4.2）。
5. 写真を紐づけていない観察記録の行に、サムネイル（＝開く操作要素）が出ないこと（REQ-1.5）。
6. ×ボタン・背景タップ・Escape のいずれでも閉じること。画像そのもの・前後ボタン・位置表示のタップでは閉じないこと（REQ-5.1〜REQ-5.4）。
7. 閉じたあと、フォーカスが開いたときのサムネイルに戻っていること（Tabキーで続きから移動できること）（REQ-5.5）。
8. 閉じたあと、詳細画面のスクロール位置が開く前と同じであること（REQ-5.6）。
9. 拡大表示中に Tab を繰り返しても、背面の「戻る」「編集」「削除」にフォーカスが移らないこと（REQ-7.3）。
10. 拡大表示中に背面をタップしても、背面のボタンが作動しないこと（REQ-2.3）。
11. 拡大表示中に背面がスクロールしないこと（iOS Safari のブラウザタブ／ホーム画面起動の両方。REQ-2.4、[3-4](#3-4-背面スクロールの抑止)）。
12. 縦向き・横向き、幅320px / 375px / 640px、および縦長・横長の写真のそれぞれで、画像が見切れず横スクロールも発生しないこと（REQ-2.2, REQ-8.4）。
13. ノッチ／ホームインジケーターのある端末で、閉じるボタン・位置表示が隠れないこと（REQ-2.8）。
14. **Androidの戻る操作（ジェスチャー／ボタン）で拡大表示が閉じ、アプリを離れないこと**（`<dialog>` 採用時の期待挙動。閉じずにアプリを離れる場合は [既知の制約](#既知の制約トレードオフ) に記録する。REQ-6.4）。
15. iOS のホーム画面起動（スタンドアロン）で拡大表示が正しく全画面になること（`100dvh` とセーフエリア）。
16. 外部キーボード接続時に、左右矢印で切り替え、Escape で閉じられること（REQ-3.4, REQ-5.3）。
17. スクリーンリーダー（VoiceOver / TalkBack）で、サムネイルのボタン名（「写真1を拡大表示」等）、ダイアログ名、画像の代替テキストが読み上げられること（REQ-7.4〜REQ-7.8）。
18. OSをライト／ダークに切り替えても、拡大表示の背景と操作要素の見え方が変わらず、文字とアイコンが読めること（REQ-8.1, REQ-8.2）。
19. 拡大表示を10回以上開閉しても、表示が崩れず、写真が表示されなくなる（URL解放漏れ・二重解放）事象が起きないこと（REQ-9.6）。
20. 拡大表示を開いたまま「戻る」が押せない状態で、閉じてから戻る・編集・削除が従来どおり動作すること（REQ-6.2, REQ-6.3, REQ-9.4）。
21. 機内モードで拡大表示が動作すること（REQ-9.2）。
22. サムネイルをボタン化したあとも、写真一覧の見た目（120px・間隔）と観察記録の行の高さが従来と同じであること（REQ-1.6, REQ-9.4）。

---

## 既知の制約・トレードオフ

- **写真の内容を説明する代替テキストは提供できない**（[7](#7-代替テキストとスクリーンリーダー)）。キャプションを保存する仕組みがないため、位置と文脈（生物名）までが限界である。
- **ズームできない**（[8](#8-ズーム操作)）。画面に収まる大きさでの表示に留まり、写真の細部を拡大するにはOS/ブラウザのピンチズームに頼る。
- **スワイプで送れない**（[5](#5-写真の切り替え)）。指の操作としては前後ボタンのタップになる。
- **`<dialog>` に依存する**（[1](#1-実装方式の比較)）。`showModal()` を持たない環境では拡大表示自体を提供しない（REQ-9.8）。サポート対象のTier 1・Tier 2 はいずれも対応済みだが、極端に古い環境では従来どおり「タップしても何も起きない写真」になる。
- **背面スクロールの抑止はブラウザ依存**（[3-4](#3-4-背面スクロールの抑止)）。iOS Safari で完全に止まらない場合、拡大表示は全画面のため実害は小さいと判断して受け入れる。
- **Androidの戻る操作の挙動はブラウザの実装に依存する**。アプリ内の履歴スタックには載せない（REQ-6.1）ため、UAが `<dialog>` を戻る操作の対象としない環境では、戻る操作でアプリ／タブを離れる。これは [marine-life-observation REQ-11.19](../marine-life-observation/requirements.md) の方針（ブラウザ／OSの戻る操作には対応しない）と整合する既知の挙動である。
- **画像上で押して背景で指を離すと閉じる**（[2](#マークアップと実装上のポイント)）。`click` の発火元が共通祖先になるための挙動で、初回は許容する。
- **一覧カード・入力フォームのサムネイルは拡大できない**（[対象外](./requirements.md#対象外今回やらないこと)）。拡大表示は詳細画面の閲覧専用機能に閉じる。
- **汎用のモーダル部品にはしない**。`ImageLightbox` は画像表示専用であり、削除確認（`window.confirm`）の置き換えには使わない。確認ダイアログをUI部品化する場合は別仕様とする（そのとき本部品のフォーカス管理・閉じる操作・`suppressCloseRef` の実装は参考にできる）。
- **[marine-life-observation/design.md 9-1](../marine-life-observation/design.md) の「このアプリにオーバーレイ部品は存在しない」という前提は、本機能の実装により成り立たなくなる**。ただし同節の結論（入力フォームの観察記録の編集は、モーダルではなくインライン展開とする）は変更しない。写真の選択グリッドに画面幅が必要であることと、入力中のフォームを覆わないことという理由は本機能の実装後も有効である。

## 実装後に更新が必要な既存ドキュメント

| ファイル | 更新内容 |
| --- | --- |
| [`specs/00-overview.md`](../00-overview.md) | 機能一覧に本仕様の行を追加（本仕様の策定時に実施済み）。実装後、状態を「実装済み」に更新する |
| [`specs/photo-attachment/design.md`](../photo-attachment/design.md) | 「表示（詳細画面）」に、サムネイルが拡大表示の操作要素になる旨を追記（本仕様の策定時に相互参照を追加済み）。「既知の制約」の記述と矛盾がないか実装後に再確認する |
| [`specs/photo-attachment/requirements.md`](../photo-attachment/requirements.md) | REQ-7（詳細画面での写真表示）に本仕様への参照を追記済み。REQ-7 自体の内容は変更しない |
| [`specs/marine-life-observation/requirements.md`](../marine-life-observation/requirements.md) | REQ-4.4（観察記録の行のサムネイル）に本仕様への参照を追記済み。表示内容は変更しない（REQ-9.4） |
| [`specs/marine-life-observation/design.md`](../marine-life-observation/design.md) | 9-1 の比較表の前提（オーバーレイ部品が存在しない）に注記を入れるかは任意。結論は変わらないため必須ではない |
