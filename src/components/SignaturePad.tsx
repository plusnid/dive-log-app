import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react'
import './SignaturePad.css'

export interface SignaturePadHandle {
  clear: () => void
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

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
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
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1a1a'
    emptyRef.current = true
  }, [showExisting])

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      emptyRef.current = true
    },
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
