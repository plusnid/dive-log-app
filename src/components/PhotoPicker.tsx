import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import './PhotoPicker.css'

interface ExistingPhoto {
  id: number
  blob: Blob
}

interface PhotoPickerProps {
  existingPhotos: ExistingPhoto[]
  removedExistingIds: number[]
  onRemoveExisting: (id: number) => void
  newFiles: File[]
  onNewFilesChange: (files: File[]) => void
}

export function PhotoPicker({
  existingPhotos,
  removedExistingIds,
  onRemoveExisting,
  newFiles,
  onNewFilesChange,
}: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [existingUrls, setExistingUrls] = useState<Map<number, string>>(new Map())
  const [newUrls, setNewUrls] = useState<string[]>([])
  const [brokenPreviews, setBrokenPreviews] = useState<Set<string>>(new Set())

  function handleImageError(key: string) {
    setBrokenPreviews((prev) => new Set(prev).add(key))
  }

  useEffect(() => {
    const urls = new Map<number, string>()
    for (const photo of existingPhotos) {
      urls.set(photo.id, URL.createObjectURL(photo.blob))
    }
    setExistingUrls(urls)
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  }, [existingPhotos])

  useEffect(() => {
    const urls = newFiles.map((file) => URL.createObjectURL(file))
    setNewUrls(urls)
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [newFiles])

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) onNewFilesChange([...newFiles, ...files])
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleRemoveNew(index: number) {
    onNewFilesChange(newFiles.filter((_, i) => i !== index))
  }

  const visibleExisting = existingPhotos.filter((p) => !removedExistingIds.includes(p.id))

  return (
    <div className="photo-picker">
      {(visibleExisting.length > 0 || newFiles.length > 0) && (
        <div className="photo-picker__grid">
          {visibleExisting.map((photo) => {
            const key = `existing-${photo.id}`
            return (
              <div className="photo-picker__thumb" key={key}>
                {brokenPreviews.has(key) ? (
                  <div className="photo-picker__placeholder">プレビューできない画像</div>
                ) : (
                  <img src={existingUrls.get(photo.id)} alt="ダイビング写真" onError={() => handleImageError(key)} />
                )}
                <button type="button" onClick={() => onRemoveExisting(photo.id)}>
                  削除
                </button>
              </div>
            )
          })}
          {newFiles.map((file, index) => {
            const key = `new-${file.name}-${index}`
            return (
              <div className="photo-picker__thumb" key={key}>
                {brokenPreviews.has(key) ? (
                  <div className="photo-picker__placeholder">プレビューできない画像</div>
                ) : (
                  <img src={newUrls[index]} alt="ダイビング写真" onError={() => handleImageError(key)} />
                )}
                <button type="button" onClick={() => handleRemoveNew(index)}>
                  削除
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
