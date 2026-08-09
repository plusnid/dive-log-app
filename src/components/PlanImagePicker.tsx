import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import './PlanImagePicker.css'

interface ExistingPlanImage {
  id: number // Attachment.id（保存済み）
  blob: Blob
}

interface PlanImagePickerProps {
  /** 保存済みのプラン画像（表示順）。編集時のみ非空 */
  existingImages: ExistingPlanImage[]
  /** 取り除きマークの付いた保存済み画像のID（REQ-2.6） */
  removedExistingIds: number[]
  /** 保存済み画像の取り除き（マークするだけ。実削除は送信時＝REQ-2.8） */
  onRemoveExisting: (id: number) => void
  /** 未保存の新規プラン画像（選択順） */
  newFiles: File[]
  /** 追加・取り除きの結果としての新しい配列（REQ-2.3, REQ-2.5） */
  onNewFilesChange: (files: File[]) => void
}

/**
 * ダイビングプラン画像専用の複数枚ピッカー。`PhotoPicker` と同じ構造（既存用・新規用の2状態、
 * 2つの `useEffect` によるオブジェクトURL管理）を踏襲するが、プレビューは切り取らず全体表示にし、
 * ラベル・代替テキストをプラン画像固有の文言に固定する（dive-plan-image/design.md 3節）。
 */
export function PlanImagePicker({
  existingImages,
  removedExistingIds,
  onRemoveExisting,
  newFiles,
  onNewFilesChange,
}: PlanImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [existingUrls, setExistingUrls] = useState<Map<number, string>>(new Map())
  const [newUrls, setNewUrls] = useState<string[]>([])
  const [brokenPreviews, setBrokenPreviews] = useState<Set<string>>(new Set())

  function handleImageError(key: string) {
    setBrokenPreviews((prev) => new Set(prev).add(key))
  }

  useEffect(() => {
    const urls = new Map<number, string>()
    for (const image of existingImages) {
      urls.set(image.id, URL.createObjectURL(image.blob))
    }
    setExistingUrls(urls)
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  }, [existingImages])

  useEffect(() => {
    const urls = newFiles.map((file) => URL.createObjectURL(file))
    setNewUrls(urls)
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [newFiles])

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) onNewFilesChange([...newFiles, ...files]) // REQ-2.3: 既存の候補に追加
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleRemoveNew(index: number) {
    onNewFilesChange(newFiles.filter((_, i) => i !== index))
  }

  const visibleExisting = existingImages.filter((p) => !removedExistingIds.includes(p.id))
  const total = visibleExisting.length + newFiles.length

  return (
    <div className="plan-image-picker">
      {total > 0 && (
        <div className="plan-image-picker__list">
          {visibleExisting.map((image, i) => {
            const key = `existing-${image.id}`
            const name = total > 1 ? `ダイビングプランの画像${i + 1}` : 'ダイビングプランの画像'
            return (
              <div className="plan-image-picker__item" key={key}>
                {brokenPreviews.has(key) ? (
                  <div className="plan-image-picker__placeholder">プレビューできない画像</div>
                ) : (
                  <img src={existingUrls.get(image.id)} alt={name} onError={() => handleImageError(key)} />
                )}
                <button type="button" aria-label={`${name}を取り除く`} onClick={() => onRemoveExisting(image.id)}>
                  取り除く
                </button>
              </div>
            )
          })}
          {newFiles.map((file, index) => {
            const key = `new-${file.name}-${index}`
            const i = visibleExisting.length + index
            const name = total > 1 ? `ダイビングプランの画像${i + 1}` : 'ダイビングプランの画像'
            return (
              <div className="plan-image-picker__item" key={key}>
                {brokenPreviews.has(key) ? (
                  <div className="plan-image-picker__placeholder">プレビューできない画像</div>
                ) : (
                  <img src={newUrls[index]} alt={name} onError={() => handleImageError(key)} />
                )}
                <button type="button" aria-label={`${name}を取り除く`} onClick={() => handleRemoveNew(index)}>
                  取り除く
                </button>
              </div>
            )
          })}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFileChange} />
    </div>
  )
}
