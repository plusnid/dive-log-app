import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react'
import { canUseSignatureDialog, SignatureDialog } from './SignatureDialog'
import { ExpandIcon, PencilIcon } from './icons'
import './SignaturePad.css'

export interface SignaturePadHandle {
  /**
   * undefined = existing signature left untouched (edit mode, not re-signed)
   * null = no signature / cleared
   * Blob = newly drawn signature
   */
  exportBlob: () => Promise<Blob | null | undefined>
}

interface SignaturePadProps {
  existingSignatureUrl?: string | null
}

/**
 * 「ガイドのサイン」欄。`<dialog>` のモーダル表示に対応した環境ではサインモーダル
 * （`SignatureDialog`）を起動する状態提示部品として振る舞い、対応しない環境では
 * 現状どおりの埋め込みキャンバスへフォールバックする（REQ-8.7）。
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(props, ref) {
  // canUseSignatureDialog はモジュール定数（コンポーネントの生存期間中に変化しない）。
  // ここではフックを呼ばず、状態を持つ実装を別コンポーネントへ委譲するだけなので
  // Rules of Hooks には抵触しない。
  if (!canUseSignatureDialog) {
    return <EmbeddedSignaturePad ref={ref} {...props} />
  }
  return <DialogSignaturePad ref={ref} {...props} />
})

/** サインの現在の状態（design.md 4節）。 */
type SignatureState =
  | { kind: 'existing' } // 既存サインを維持（exportBlob → undefined）
  | { kind: 'none' } // 未サイン／削除（exportBlob → null）
  | { kind: 'drawn'; blob: Blob; url: string } // 新規描画（exportBlob → blob）

/** `<dialog>` 対応環境向け：状態の提示＋サインモーダルの起動＋フォームへの受け渡し。 */
const DialogSignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function DialogSignaturePad(
  { existingSignatureUrl },
  ref,
) {
  const [state, setState] = useState<SignatureState>(existingSignatureUrl ? { kind: 'existing' } : { kind: 'none' })
  const [dialogOpen, setDialogOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // 直近に確定した 'drawn' の URL。差し替え時・削除時・アンマウント時に revoke する（REQ-8.6）。
  const drawnUrlRef = useRef<string | null>(null)

  function revokeDrawnUrl() {
    if (drawnUrlRef.current) {
      URL.revokeObjectURL(drawnUrlRef.current)
      drawnUrlRef.current = null
    }
  }

  // existingSignatureUrl が変化したときだけ state を再初期化する（'drawn' を上書きしないため、
  // 依存配列を existingSignatureUrl のみに限定する。design.md 4節）。
  useEffect(() => {
    revokeDrawnUrl()
    setState(existingSignatureUrl ? { kind: 'existing' } : { kind: 'none' })
  }, [existingSignatureUrl])

  useEffect(() => {
    return () => revokeDrawnUrl()
  }, [])

  // サインモーダルを開いている間、背面をスクロールさせない（REQ-2.5、design.md「既知の制約」節。
  // ImageLightbox と同じ防御。iOS Safari 等で完全には止まらない場合があるが、モーダルが全画面のため実害は小さい）。
  useEffect(() => {
    if (!dialogOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [dialogOpen])

  useImperativeHandle(ref, () => ({
    exportBlob() {
      if (state.kind === 'existing') return Promise.resolve(undefined)
      if (state.kind === 'none') return Promise.resolve(null)
      return Promise.resolve(state.blob)
    },
  }))

  function openDialog() {
    setDialogOpen(true) // REQ-1.1〜REQ-1.4, REQ-1.7
  }

  function closeDialog() {
    setDialogOpen(false)
    triggerRef.current?.focus() // REQ-4.6
  }

  /** サインモーダルの確定を受け取る（design.md 7節 案A）。 */
  function handleCommit(blob: Blob | null) {
    if (blob) {
      revokeDrawnUrl()
      const url = URL.createObjectURL(blob)
      drawnUrlRef.current = url
      setState({ kind: 'drawn', blob, url }) // REQ-4.5
      return
    }
    // 未描画のまま閉じた場合：保存済みの既存サインは維持する。下書き（'drawn'）を全消去した場合は
    // 「未サイン」に戻す（REQ-4.9、design.md 7節の状態遷移表）。
    if (state.kind === 'existing') return
    revokeDrawnUrl()
    setState({ kind: 'none' })
  }

  function handleDelete() {
    if (!window.confirm('保存済みのサインを削除しますか？')) return
    revokeDrawnUrl()
    setState({ kind: 'none' }) // REQ-5.7
  }

  // サインモーダルへ渡す復元用URL。'drawn' のときだけ続きから編集できるようにする（REQ-5.4）。
  // 'existing' のときは未描画から開く（REQ-1.6＝「やり直す」）。
  const initialImageUrl = state.kind === 'drawn' ? state.url : null

  return (
    <div className="signature-pad">
      {state.kind === 'none' && (
        <p className="signature-pad__placeholder">未サイン</p> /* REQ-5.6 */
      )}
      {state.kind === 'existing' && (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={existingSignatureUrl ?? undefined} alt="ガイドのサイン" className="signature-pad__preview" />
      )}
      {state.kind === 'drawn' && (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={state.url} alt="ガイドのサイン" className="signature-pad__preview" />
      )}

      <div className="signature-pad__actions">
        <button type="button" ref={triggerRef} onClick={openDialog}>
          {state.kind === 'none' && (
            <>
              <ExpandIcon /> サインを入力する {/* REQ-1.1, REQ-1.2, REQ-7.6 */}
            </>
          )}
          {state.kind === 'existing' && (
            <>
              <PencilIcon /> サインをやり直す
            </>
          )}
          {state.kind === 'drawn' && (
            <>
              <PencilIcon /> サインを描き直す
            </>
          )}
        </button>
        {state.kind !== 'none' && (
          <button type="button" onClick={handleDelete}>
            サインを削除 {/* REQ-5.7 */}
          </button>
        )}
      </div>

      {dialogOpen && (
        <SignatureDialog initialImageUrl={initialImageUrl} onCommit={handleCommit} onClose={closeDialog} />
      )}
    </div>
  )
})

/**
 * フォールバック実装：`<dialog>` のモーダル表示に対応しない環境向け（REQ-8.7）。
 * 現状どおり埋め込みキャンバスへ直接描画する。
 */
const EmbeddedSignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function EmbeddedSignaturePad(
  { existingSignatureUrl },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const emptyRef = useRef(true)
  const [showExisting, setShowExisting] = useState(Boolean(existingSignatureUrl))

  useEffect(() => {
    setShowExisting(Boolean(existingSignatureUrl))
  }, [existingSignatureUrl])

  useEffect(() => {
    if (showExisting) return
    const canvas = canvasRef.current
    if (!canvas) return

    function setupCanvas(preserveContent: boolean) {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas!.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

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
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1a1a1a'

      if (snapshot) {
        ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, rect.width, rect.height)
      } else {
        emptyRef.current = true
      }
    }

    setupCanvas(false)

    const observer = new ResizeObserver(() => setupCanvas(true))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [showExisting])

  useImperativeHandle(ref, () => ({
    exportBlob() {
      if (showExisting) return Promise.resolve(undefined)
      if (emptyRef.current) return Promise.resolve(null)
      const canvas = canvasRef.current
      if (!canvas) return Promise.resolve(null)
      return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
    },
  }))

  function getPos(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawingRef.current = true
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    emptyRef.current = false
  }

  function endStroke() {
    drawingRef.current = false
  }

  function handleClearClick() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    emptyRef.current = true
  }

  if (showExisting) {
    return (
      <div className="signature-pad">
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src={existingSignatureUrl ?? undefined} alt="ガイドのサイン" className="signature-pad__preview" />
        <button type="button" onClick={() => setShowExisting(false)}>
          サインをやり直す
        </button>
      </div>
    )
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        className="signature-pad__canvas"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />
      <button type="button" onClick={handleClearClick}>
        クリア
      </button>
    </div>
  )
})
