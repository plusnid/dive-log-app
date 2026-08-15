import { useMemo } from 'react'
import { useDiveLogs } from '../hooks/useDiveLogs'
import { DiveLogListItem } from '../components/DiveLogListItem'
import type { DiveLog } from '../types/diveLog'
import { marineLifeGenreLabel, marineLifeGenreOptions, type MarineLifeGenre } from '../types/marineLifeOptions'
import './CreatureSearchView.css'

export interface CreatureEntry {
  /** 表示名（trim 済み。最初に出現した表記を採用する） */
  name: string
  /** この名前で記録されている全ジャンル（未選択は含めない、REQ-6.5） */
  genres: MarineLifeGenre[]
  /** 観察したログのID（日付の新しい順、REQ-6.9） */
  logIds: number[]
}

/** 保存済みログ（日付降順）から生物一覧を導く。同名は trim 完全一致で集約する（REQ-6.3〜REQ-6.5）。 */
export function deriveCreatureIndex(logs: DiveLog[]): CreatureEntry[] {
  const byName = new Map<string, CreatureEntry>()
  for (const log of logs) {
    if (log.id == null) continue
    const seenNamesInThisLog = new Set<string>()
    for (const observation of log.observations ?? []) {
      const name = observation.name.trim()
      if (name === '') continue

      let entry = byName.get(name)
      if (!entry) {
        entry = { name, genres: [], logIds: [] }
        byName.set(name, entry)
      }
      if (observation.genre && !entry.genres.includes(observation.genre)) {
        entry.genres.push(observation.genre)
      }
      // 同一ログ内に同じ名前の観察記録が複数あっても、logIds には1回だけ積む（件数はログ数、REQ-6.3）。
      if (!seenNamesInThisLog.has(name)) {
        seenNamesInThisLog.add(name)
        entry.logIds.push(log.id)
      }
    }
  }
  return [...byName.values()]
}

/** 検索語（部分一致）とジャンルで絞り込む（REQ-6.6, REQ-6.7）。 */
export function filterCreatures(
  entries: CreatureEntry[],
  query: string,
  genre: MarineLifeGenre | undefined,
): CreatureEntry[] {
  const trimmed = query.trim()
  return entries.filter((entry) => {
    if (trimmed !== '' && !entry.name.includes(trimmed)) return false
    if (genre !== undefined && !entry.genres.includes(genre)) return false
    return true
  })
}

interface CreatureSearchViewProps {
  onSelectDive: (id: number) => void
  /** 該当ログ一覧を開いている生物名。null なら生物一覧（改善要望2により App.tsx 管理の controlled props へ） */
  selectedName: string | null
  /** 生物を選択した（履歴に積むのは App.tsx の責務、REQ-11.15） */
  onSelectCreatureName: (name: string) => void
  /** 生物一覧へ移動する常設導線（REQ-11.17）。履歴を積まず現在のエントリを置き換える。 */
  onShowCreatureList: () => void
  /** 検索語 */
  query: string
  /** ジャンルの絞り込み */
  genre: MarineLifeGenre | undefined
  /** 検索語・絞り込みの変更（REQ-11.18）。履歴を積まず現在のエントリを置き換える。 */
  onFilterChange: (next: { query: string; genre: MarineLifeGenre | undefined }) => void
}

/**
 * 「生物から探す」画面（REQ-6）。生物一覧 ↔ 該当ログ一覧の2段階は `selectedName` の有無で切り替える。
 * Dexie は直接触らず `useDiveLogs()` を購読し、集計は純関数（上記）で行う（REQ-9.7, REQ-6.14）。
 * 段階・検索語・絞り込みはすべて App.tsx が管理する controlled props（REQ-11.15〜REQ-11.18, REQ-11.20）。
 */
export function CreatureSearchView({
  onSelectDive,
  selectedName,
  onSelectCreatureName,
  onShowCreatureList,
  query,
  genre,
  onFilterChange,
}: CreatureSearchViewProps) {
  const diveLogs = useDiveLogs()

  const entries = useMemo(() => deriveCreatureIndex(diveLogs ?? []), [diveLogs])
  const filtered = useMemo(() => filterCreatures(entries, query, genre), [entries, query, genre])
  const selectedEntry = useMemo(
    () => (selectedName ? (entries.find((e) => e.name === selectedName) ?? null) : null),
    [selectedName, entries],
  )
  const selectedLogs = useMemo(() => {
    if (!selectedEntry || diveLogs == null) return []
    return diveLogs.filter((log) => log.id != null && selectedEntry.logIds.includes(log.id))
  }, [selectedEntry, diveLogs])

  if (diveLogs == null) {
    return (
      <div className="view">
        <p>読み込み中...</p>
      </div>
    )
  }

  if (selectedName) {
    return (
      <div className="view">
        <div className="view__header creature-search__header--end">
          <button type="button" onClick={onShowCreatureList}>
            生物一覧
          </button>
        </div>
        <h1>
          {selectedEntry?.name ?? selectedName}（{selectedLogs.length}件）
        </h1>
        {selectedLogs.length === 0 ? (
          <p>該当するログが見つかりませんでした。</p>
        ) : (
          <ul className="dive-log-list">
            {selectedLogs.map((log) => (
              <DiveLogListItem key={log.id} diveLog={log} onSelect={onSelectDive} />
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="view">
      <h1>生物から探す</h1>
      <div className="creature-search__controls">
        <input
          type="text"
          value={query}
          onChange={(e) => onFilterChange({ query: e.target.value, genre })}
          placeholder="生物名で検索"
          aria-label="生物名で検索"
        />
        <select
          value={genre ?? ''}
          onChange={(e) => onFilterChange({ query, genre: (e.target.value || undefined) as MarineLifeGenre | undefined })}
          aria-label="ジャンルで絞り込み"
        >
          <option value="">すべてのジャンル</option>
          {marineLifeGenreOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {entries.length === 0 ? (
        <p>まだ生物の記録がありません。</p>
      ) : filtered.length === 0 ? (
        <p>該当する生物が見つかりませんでした。</p>
      ) : (
        <ul className="creature-search__list">
          {filtered.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                className="creature-search__item"
                onClick={() => onSelectCreatureName(entry.name)}
              >
                <span className="creature-search__item-name">{entry.name}</span>
                <span className="creature-search__item-genres">
                  {entry.genres.length > 0 ? entry.genres.map((g) => marineLifeGenreLabel(g)).join('・') : '-'}
                </span>
                <span className="creature-search__item-count">{entry.logIds.length}件</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
