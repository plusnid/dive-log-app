import { useEffect, useRef, useState } from 'react'
import { getAttachmentBlob } from '../db/diveLogRepository'
import { PhotoIcon } from './icons'
import './CardThumbnail.css'

interface CardThumbnailProps {
  photoId: number
}

/**
 * 一覧カードの右側に表示する、添付写真1枚のサムネイル。
 * ビューポートに近づくまで原本Blobの読み込みを遅延させる（REQ-3.8, REQ-3.9）。
 * 装飾要素として扱うため alt="" とし、カードのアクセシブルな名前は変化させない（REQ-3.6）。
 */
export function CardThumbnail({ photoId }: CardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setImgSrc(null)
    setFailed(false)

    const load = () => {
      getAttachmentBlob(photoId)
        .then((blob) => {
          if (cancelled) return
          if (!blob) {
            setFailed(true)
            return
          }
          objectUrl = URL.createObjectURL(blob)
          setImgSrc(objectUrl)
        })
        .catch(() => {
          if (!cancelled) setFailed(true)
        })
    }

    const el = rootRef.current
    let observer: IntersectionObserver | undefined

    if (!el || typeof IntersectionObserver === 'undefined') {
      // IntersectionObserver 非対応環境では即座に読み込む（機能検出、mobile-compatibility REQ-1.3）。
      load()
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect()
            load()
          }
        },
        { rootMargin: '200px' },
      )
      observer.observe(el)
    }

    return () => {
      cancelled = true
      observer?.disconnect()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoId])

  return (
    <div className="card-thumbnail" ref={rootRef}>
      {imgSrc && !failed ? (
        <img src={imgSrc} alt="" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="card-thumbnail__placeholder">
          <PhotoIcon />
        </span>
      )}
    </div>
  )
}
