import { useState } from 'react'
import './PastValuePicker.css'

interface PastValuePickerProps {
  /** パネル見出し（例: 「過去のエリア」） */
  title: string
  values: string[]
  onSelect: (value: string) => void
}

/**
 * `listPastPlaceValues()` の生レコードから、エリア名・ダイビングポイント名それぞれの候補配列を導く純関数（REQ-8.3〜REQ-8.5, REQ-8.10, REQ-8.12）。
 * `areaFilter` が空文字なら絞り込まず、非空なら trim 一致するレコードのみを対象にする。
 * レコードは既に「最近使った順」で渡される前提のため、先頭から走査して重複排除するだけで順序が保たれる。
 */
export function derivePlaceCandidates(
  records: { area: string; siteName: string }[],
  areaFilter: string,
): { areas: string[]; siteNames: string[] } {
  const areas = dedupeTrimmed(records.map((record) => record.area))

  const trimmedFilter = areaFilter.trim()
  const siteSourceRecords =
    trimmedFilter === '' ? records : records.filter((record) => record.area.trim() === trimmedFilter)
  const siteNames = dedupeTrimmed(siteSourceRecords.map((record) => record.siteName))

  return { areas, siteNames }
}

/** 前後の空白を除去した文字列の完全一致で重複排除する（REQ-8.4）。空文字は除外する。 */
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

export function PastValuePicker({ title, values, onSelect }: PastValuePickerProps) {
  const [open, setOpen] = useState(false)

  function handleSelect(value: string) {
    onSelect(value)
    setOpen(false)
  }

  return (
    <span className="past-value-picker">
      <button
        type="button"
        className="past-value-picker__trigger"
        disabled={values.length === 0}
        onClick={() => setOpen((prev) => !prev)}
      >
        参照
      </button>
      {open && (
        <span className="past-value-picker__panel">
          <span className="past-value-picker__header">
            <span className="past-value-picker__title">{title}</span>
            <button type="button" className="past-value-picker__close" onClick={() => setOpen(false)}>
              閉じる
            </button>
          </span>
          <span className="past-value-picker__list">
            {values.map((value) => (
              <button
                type="button"
                key={value}
                className="past-value-picker__item"
                onClick={() => handleSelect(value)}
              >
                {value}
              </button>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}
