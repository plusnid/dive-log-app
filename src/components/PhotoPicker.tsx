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
          {visibleExisting.map((photo) => (
            <div className="photo-picker__thumb" key={`existing-${photo.id}`}>
              <img src={existingUrls.get(photo.id)} alt="ダイビング写真" />
              <button type="button" onClick={() => onRemoveExisting(photo.id)}>
                削除
              </button>
            </div>
          ))}
          {newFiles.map((file, index) => (
            <div className="photo-picker__thumb" key={`new-${file.name}-${index}`}>
              <img src={newUrls[index]} alt="ダイビング写真" />
              <button type="button" onClick={() => handleRemoveNew(index)}>
                削除
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleFileChange}
      />
    </div>
  )
}
