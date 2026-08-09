import { useEffect, useRef, useState } from 'react'
import type { ObservationDraft, PhotoRef } from '../types/diveLog'
import { marineLifeGenreLabel, marineLifeGenreOptions, type MarineLifeGenre } from '../types/marineLifeOptions'
import { newUuid } from '../db/uuid'
import { PastValuePicker } from './PastValuePicker'
import { PencilIcon, SignedIcon } from './icons'
import './ObservationEditor.css'

/** 紐付け可能な写真1枚（保存済み＋未保存を統合したもの。順序は表示順）。 */
export interface AvailablePhoto {
  ref: PhotoRef
  /** プレビュー用のオブジェクトURL（親が生成・解放する） */
  url: string
  /** React の key */
  key: string
}

interface ObservationEditorProps {
  observations: ObservationDraft[]
  onChange: (next: ObservationDraft[]) => void
  /** 紐付け可能な写真（このログの写真プール） */
  availablePhotos: AvailablePhoto[]
  /** 名前の参照入力（REQ-2.6〜REQ-2.10）の元データ。行ごとに選択中のジャンルで絞り込む。 */
  nameCandidateRecords: { genre?: MarineLifeGenre; name: string }[]
}

/** 前後の空白を除去した文字列の完全一致で重複排除する。空文字は除外する。 */
function dedupeTrimmed(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const trimmed = raw.trim()
    if (trimmed === '' || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

/**
 * 過去の観察記録から、名前の参照候補を導く（REQ-2.7, REQ-2.8）。
 * `genreFilter` が undefined なら絞り込まず、指定されていればそのジャンルの記録のみを対象にする（未確定事項3の補助案）。
 */
export function deriveObservationNameCandidates(
  records: { genre?: MarineLifeGenre; name: string }[],
  genreFilter: MarineLifeGenre | undefined,
): string[] {
  const source = genreFilter === undefined ? records : records.filter((r) => r.genre === genreFilter)
  return dedupeTrimmed(source.map((r) => r.name))
}

function isSamePhotoRef(a: PhotoRef, b: PhotoRef): boolean {
  if (a.kind === 'existing' && b.kind === 'existing') return a.id === b.id
  if (a.kind === 'new' && b.kind === 'new') return a.file === b.file
  return false
}

/** observation.photos[0] を availablePhotos から引き当てる。見つからなければ undefined（REQ-3.7 と同じ扱い、REQ-10.3）。 */
function findThumbnail(photos: PhotoRef[], availablePhotos: AvailablePhoto[]): AvailablePhoto | undefined {
  if (photos.length === 0) return undefined
  return availablePhotos.find((p) => isSamePhotoRef(p.ref, photos[0]))
}

/**
 * ダイビングログの「観察した生物」区画（REQ-2.1〜REQ-2.13, REQ-3.1〜REQ-3.8, REQ-10.1〜REQ-10.22）。
 * 親（DiveLogFormView）が状態を持つコントロールドコンポーネント。DB操作は行わない。
 * 一覧は1件1行で表示し、選択された1行だけをインライン展開する（改善要望1）。
 */
export function ObservationEditor({
  observations,
  onChange,
  availablePhotos,
  nameCandidateRecords,
}: ObservationEditorProps) {
  // 展開中の行の識別子。保存対象に含めない内部 state（REQ-10.15）。同時に展開できるのは1件（REQ-10.10）。
  const [editingUuid, setEditingUuid] = useState<string | null>(null)
  const summaryRefs = useRef(new Map<string, HTMLButtonElement>())
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingUuid) nameInputRef.current?.focus() // 展開したら名前欄へ（REQ-10.13）
  }, [editingUuid])

  function updateRow(index: number, patch: Partial<ObservationDraft>) {
    onChange(observations.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }

  function addRow() {
    // REQ-10.13: 追加した行を展開し、名前欄へフォーカスする。
    const uuid = newUuid()
    onChange([...observations, { uuid, genre: undefined, name: '', photos: [] }])
    setEditingUuid(uuid)
  }

  function removeRow(index: number) {
    // REQ-10.16: 展開していた行が削除されたら、どの行も展開していない状態に戻す。
    const removed = observations[index]
    onChange(observations.filter((_, i) => i !== index))
    if (removed.uuid === editingUuid) setEditingUuid(null)
  }

  function closeRow(uuid: string) {
    // REQ-10.11, REQ-10.20: 折りたたみ、フォーカスを行のトグルへ戻す。
    setEditingUuid(null)
    summaryRefs.current.get(uuid)?.focus()
  }

  function togglePhoto(index: number, ref: PhotoRef) {
    const row = observations[index]
    const selected = row.photos.some((r) => isSamePhotoRef(r, ref))
    updateRow(index, {
      photos: selected ? row.photos.filter((r) => !isSamePhotoRef(r, ref)) : [...row.photos, ref],
    })
  }

  const hasEmptyName = observations.some((o) => o.name.trim() === '')

  return (
    <div className="observation-editor">
      {observations.length === 0 && <p className="observation-editor__empty">観察した生物を記録できます。</p>}
      {observations.length > 0 && (
        <ul className="observation-editor__list">
          {observations.map((observation, index) => {
            const editing = editingUuid === observation.uuid
            const detailId = `observation-detail-${observation.uuid}`
            const displayName = observation.name.trim()
            const thumbnail = findThumbnail(observation.photos, availablePhotos) // REQ-10.3
            const nameCandidates = deriveObservationNameCandidates(nameCandidateRecords, observation.genre)
            return (
              <li key={observation.uuid} className="observation-editor__item">
                <button
                  type="button" // REQ-10.17: フォーム送信を誘発しない
                  className="observation-editor__summary"
                  ref={(el) => {
                    if (el) summaryRefs.current.set(observation.uuid, el)
                    else summaryRefs.current.delete(observation.uuid)
                  }}
                  aria-expanded={editing} // REQ-10.18
                  aria-controls={detailId}
                  onClick={() => (editing ? closeRow(observation.uuid) : setEditingUuid(observation.uuid))}
                >
                  <span
                    className={
                      'observation-editor__summary-name' +
                      (displayName ? '' : ' observation-editor__summary-name--empty')
                    }
                  >
                    {displayName || '（名前未入力）'} {/* REQ-10.4 */}
                  </span>
                  <span className="observation-editor__summary-genre">{marineLifeGenreLabel(observation.genre)}</span>
                  {thumbnail && <img className="observation-editor__summary-thumb" src={thumbnail.url} alt="" />}
                  <PencilIcon className="observation-editor__summary-icon" />
                </button>
                {editing && (
                  <div id={detailId} className="observation-editor__detail">
                    <label className="observation-editor__genre-field">
                      ジャンル
                      <select
                        value={observation.genre ?? ''}
                        onChange={(e) =>
                          updateRow(index, { genre: (e.target.value || undefined) as MarineLifeGenre | undefined })
                        }
                      >
                        <option value="">選択なし</option>
                        {marineLifeGenreOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="observation-editor__name-field">
                      名前
                      <span className="observation-editor__input-with-picker">
                        <input
                          ref={nameInputRef}
                          type="text"
                          placeholder="例: クマノミ"
                          value={observation.name}
                          onChange={(e) => updateRow(index, { name: e.target.value })}
                        />
                        <PastValuePicker
                          title="過去の生物名"
                          values={nameCandidates}
                          onSelect={(value) => updateRow(index, { name: value })}
                        />
                      </span>
                    </label>
                    <div>
                      <span className="observation-editor__photos-label">写真</span>
                      {availablePhotos.length === 0 ? (
                        <p className="observation-editor__photo-hint">
                          先に写真を追加すると、この生物に紐づけられます。
                        </p>
                      ) : (
                        <div className="observation-editor__photos">
                          {availablePhotos.map((photo, photoIndex) => {
                            const selected = observation.photos.some((r) => isSamePhotoRef(r, photo.ref))
                            return (
                              <button
                                key={photo.key}
                                type="button"
                                className="observation-editor__photo-toggle"
                                aria-pressed={selected}
                                aria-label={`写真${photoIndex + 1}を${selected ? '選択解除' : '選択'}`}
                                onClick={() => togglePhoto(index, photo.ref)}
                              >
                                <img src={photo.url} alt="" />
                                {selected && <SignedIcon className="observation-editor__photo-check" />}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div className="observation-editor__detail-actions">
                      <button type="button" onClick={() => removeRow(index)}>
                        削除
                      </button>
                      <button type="button" onClick={() => closeRow(observation.uuid)}>
                        閉じる
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {hasEmptyName && (
        <p className="observation-editor__warning">名前が未入力の生物は保存されません。</p> // REQ-10.5 / REQ-1.3
      )}
      <button type="button" className="observation-editor__add" onClick={addRow}>
        生物を追加
      </button>
    </div>
  )
}
