import { useDiveLogs } from '../hooks/useDiveLogs'
import { DiveLogListItem } from '../components/DiveLogListItem'

interface DiveLogListViewProps {
  onSelectDive: (id: number) => void
  onNewDive: () => void
}

export function DiveLogListView({ onSelectDive, onNewDive }: DiveLogListViewProps) {
  const diveLogs = useDiveLogs()

  return (
    <div className="view">
      <div className="view__header">
        <h1>ダイビングログ</h1>
        <button type="button" onClick={onNewDive}>
          + 新規記録
        </button>
      </div>
      {diveLogs == null ? (
        <p>読み込み中...</p>
      ) : diveLogs.length === 0 ? (
        <p>まだ記録がありません。「+ 新規記録」から追加しましょう。</p>
      ) : (
        <ul className="dive-log-list">
          {diveLogs.map((log) => (
            <DiveLogListItem key={log.id} diveLog={log} onSelect={onSelectDive} />
          ))}
        </ul>
      )}
    </div>
  )
}
