import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { EraserIcon } from './icons'
import './SignatureDialog.css'

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

const LINE_WIDTH = 2.5
const STROKE_STYLE = '#1a1a1a'

/**
 * 全画面サイン入力モーダル。描画するcanvasはアプリ内でこの1つだけ（design.md 4節）。
 * `<dialog>` + `showModal()` によりフォーカストラップ・背面の不活性化をブラウザ標準に委ねる。
 * 閉じる操作は常に「確定して閉じる」（design.md 6節 案A）。
 */
export function SignatureDialog({ initialImageUrl, onCommit, onClose }: SignatureDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const emptyRef = useRef(!initialImageUrl)
  const [isEmpty, setIsEmpty] = useState(!initialImageUrl)
  // 直前に setupCanvas した時点の CSS サイズ。画面回転時の縦横比維持（REQ-3.7）に使う。
  const prevCssSizeRef = useRef<{ width: number; height: number } | null>(null)
  // close イベントでの確定処理を1回だけ行うためのフラグ（design.md 2節「確定処理の非同期性」）。
  const committedRef = useRef(false)
  // クリーンアップ由来の close() を、ユーザー操作由来の close と区別して抑止する
  // （React StrictMode の開発時二重実行対策。ImageLightbox の suppressCloseRef と同じ方針。design.md 1-4）。
  const suppressCloseRef = useRef(false)

  // 1) showModal() を先に実行する。canvas セットアップの effect より宣言順で上に置くことで、
  //    直後の getBoundingClientRect() が 0x0 にならないようにする（design.md 1-2 (c)）。
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal() // REQ-2.1, REQ-7.1〜REQ-7.3
    return () => {
      if (dialog.open) {
        suppressCloseRef.current = true
        dialog.close()
      }
    }
  }, [])

  // 2) canvas のセットアップ・既存画像の復元・リサイズ追従
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function setupCanvas(preserveContent: boolean) {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas!.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const prevCssSize = prevCssSizeRef.current
      let snapshot: HTMLCanvasElement | null = null
      if (preserveContent && !emptyRef.current) {
        snapshot = document.createElement('canvas')
        snapshot.width = canvas!.width
        snapshot.height = canvas!.height
        snapshot.getContext('2d')?.drawImage(canvas!, 0, 0)
      }

      canvas!.width = rect.width * dpr
      canvas!.height = rect.height * dpr
      const ctx = canvas!.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.lineWidth = LINE_WIDTH
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = STROKE_STYLE

      if (snapshot && prevCssSize) {
        // 縦横比を保って中央に収める（REQ-3.7、design.md 5節）。引き伸ばして歪ませない。
        const scale = Math.min(rect.width / prevCssSize.width, rect.height / prevCssSize.height)
        const drawW = prevCssSize.width * scale
        const drawH = prevCssSize.height * scale
        ctx.drawImage(
          snapshot,
          0,
          0,
          snapshot.width,
          snapshot.height,
          (rect.width - drawW) / 2,
          (rect.height - drawH) / 2,
          drawW,
          drawH,
        )
      }

      prevCssSizeRef.current = { width: rect.width, height: rect.height }
    }

    setupCanvas(false)

    if (initialImageUrl) {
      const img = new Image()
      img.onload = () => {
        const ctx = canvas!.getContext('2d')
        const rect = canvas!.getBoundingClientRect()
        if (!ctx || rect.width === 0 || rect.height === 0) return
        ctx.drawImage(img, 0, 0, rect.width, rect.height)
        emptyRef.current = false
        setIsEmpty(false)
        prevCssSizeRef.current = { width: rect.width, height: rect.height }
      }
      img.src = initialImageUrl
    }

    const observer = new ResizeObserver(() => setupCanvas(true))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [initialImageUrl])

  /** close イベント（Escape・OSの戻る・「完了」いずれもこの経路を通る）で確定処理を1回だけ行う。 */
  function handleNativeClose() {
    if (suppressCloseRef.current) {
      suppressCloseRef.current = false
      return
    }
    if (committedRef.current) return
    committedRef.current = true

    const canvas = canvasRef.current
    if (!canvas || emptyRef.current) {
      onCommit(null) // REQ-4.9（未描画のまま閉じた）
      onClose()
      return
    }
    canvas.toBlob((blob) => {
      onCommit(blob) // REQ-4.5
      onClose()
    }, 'image/png')
  }

  /** 「完了」ボタンは close() を呼ぶだけ。確定処理は handleNativeClose に集約する（design.md 2節）。 */
  function requestClose() {
    dialogRef.current?.close()
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    emptyRef.current = true
    setIsEmpty(true) // REQ-3.6, REQ-3.9
  }

  function getPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawingRef.current = true
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (emptyRef.current) {
      emptyRef.current = false
      setIsEmpty(false)
    }
  }

  // ポインタキャプチャ中は pointermove/pointerup が canvas へ配送され続けるため、
  // 指が描画領域の外へ出て戻っても1本のストロークとして扱われる（REQ-3.4）。
  // onPointerLeave は使わない。全画面では「領域外へ出たら即終了」が誤動作になるため
  // （画面端まで書いた線が途切れる。design.md 1-2 (b)）。
  function endStroke() {
    drawingRef.current = false
  }

  return (
    <dialog
      ref={dialogRef}
      className="signature-dialog"
      aria-label="ガイドのサインを入力" /* REQ-7.4 */
      onClose={handleNativeClose}
    >
      <div className="signature-dialog__header">
        <button type="button" className="signature-dialog__clear" onClick={handleClear}>
          <EraserIcon /> クリア {/* REQ-3.6, REQ-6.4 */}
        </button>
        <h2 className="signature-dialog__title">ガイドのサイン</h2>
        <button type="button" className="signature-dialog__done" onClick={requestClose}>
          完了 {/* REQ-4.1 */}
        </button>
      </div>

      <div className="signature-dialog__stage">
        <canvas
          ref={canvasRef}
          className="signature-dialog__canvas"
          aria-label="サインの描画領域。指またはスタイラスでサインを描いてください。" /* REQ-7.7 */
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onLostPointerCapture={endStroke}
        />
        {isEmpty && (
          <p className="signature-dialog__placeholder" aria-hidden="true">
            ここにサインしてください
          </p>
        )}
      </div>
    </dialog>
  )
}
