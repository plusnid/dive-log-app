import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons'
import './ImageLightbox.css'

export interface LightboxImage {
  /** 表示に使うオブジェクトURL。生成・解放は呼び出し側（DiveLogDetailView）の責務（REQ-9.5, REQ-9.6） */
  url: string
  /** 画像の代替テキストの主部（例: 'ダイビング写真' / 'クマノミの写真'）。位置は本部品が付加する（REQ-7.7） */
  label: string
}

interface ImageLightboxProps {
  /** 対象の集合（1件以上。空配列を渡してはならない＝親が開かない） */
  images: LightboxImage[]
  /** 現在表示している位置（0起点） */
  index: number
  /** 前後の切り替え（REQ-3.1）。親が範囲内にクランプする */
  onIndexChange: (next: number) => void
  /** 閉じる（×・背景・Escape・UAによる閉じるのすべてがこれを呼ぶ。REQ-5.1〜REQ-5.3） */
  onClose: () => void
}

/** ブラウザが `<dialog>` のモーダル表示に対応しているか（REQ-9.8）。モジュールスコープで1度だけ判定する。 */
export const canShowLightbox: boolean =
  typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function'

/**
 * 写真の拡大表示（ライトボックス）。閲覧専用（REQ-2.7）。
 * `<dialog>` + `showModal()` によりフォーカストラップ・背面の不活性化・Escapeでの閉じるをブラウザ標準に委ねる。
 */
export function ImageLightbox({ images, index, onIndexChange, onClose }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [failed, setFailed] = useState(false)
  const current = images[index]
  const hasPrev = index > 0
  const hasNext = index < images.length - 1
  // クリーンアップ由来の close() が、ユーザー起因の close イベント（Escape・背景クリック等）と
  // 区別できないため抑止する（React StrictMode の開発時二重実行が、副作用のクリーンアップで
  // dialog.close() を呼んだ際に発火する 'close' イベントを onClose 経由で親へ伝えてしまい、
  // 開いた直後に閉じてしまう不具合の対策）。
  const suppressCloseRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal() // REQ-2.1, REQ-2.3, REQ-7.1〜REQ-7.3
    return () => {
      if (dialog.open) {
        suppressCloseRef.current = true
        dialog.close()
      }
    }
  }, [])

  function handleNativeClose() {
    if (suppressCloseRef.current) {
      suppressCloseRef.current = false
      return
    }
    onClose()
  }

  useEffect(() => {
    setFailed(false)
  }, [current?.url]) // 切り替えのたびにエラー表示をリセット

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'ArrowLeft' && hasPrev) {
      event.preventDefault()
      onIndexChange(index - 1) // REQ-3.4
    }
    if (event.key === 'ArrowRight' && hasNext) {
      event.preventDefault()
      onIndexChange(index + 1)
    }
    // Escape は <dialog> の既定動作（cancel → close）に任せる（REQ-5.3）
  }

  /** 画像・操作要素以外（＝背景）が選択されたときだけ閉じる（REQ-5.2, REQ-5.4）。 */
  function handleBackdropClick(event: ReactMouseEvent<HTMLDialogElement>) {
    const target = event.target as Element
    if (!target.closest('.image-lightbox__image, .image-lightbox__counter, button')) onClose()
  }

  if (!current) return null

  return (
    <dialog
      ref={dialogRef}
      className="image-lightbox"
      aria-label="写真の拡大表示" /* REQ-7.6 */
      onClose={handleNativeClose} /* Escape / UAによる閉じるを state に同期（クリーンアップ由来は抑止） */
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick} /* 背景の選択＝REQ-5.2 */
    >
      <div className="image-lightbox__stage">
        {failed ? (
          <p className="image-lightbox__error">写真を表示できませんでした。</p> /* REQ-2.6 */
        ) : (
          <img
            className="image-lightbox__image"
            src={current.url}
            alt={images.length > 1 ? `${current.label}（${index + 1}枚目 / 全${images.length}枚）` : current.label}
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </div>

      <button type="button" className="image-lightbox__close" aria-label="閉じる" onClick={onClose}>
        <CloseIcon /> {/* REQ-5.1, REQ-7.4 */}
      </button>

      {images.length > 1 && ( // REQ-3.3
        <>
          <button
            type="button"
            className="image-lightbox__nav image-lightbox__nav--prev"
            aria-label="前の写真"
            disabled={!hasPrev}
            onClick={() => onIndexChange(index - 1)}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="image-lightbox__nav image-lightbox__nav--next"
            aria-label="次の写真"
            disabled={!hasNext}
            onClick={() => onIndexChange(index + 1)}
          >
            <ChevronRightIcon />
          </button>
          <p className="image-lightbox__counter" aria-hidden="true">
            {index + 1} / {images.length}
          </p>
        </>
      )}
    </dialog>
  )
}
