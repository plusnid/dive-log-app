import { useDiveLogs } from '../hooks/useDiveLogs'
import { DiveLogListItem } from '../components/DiveLogListItem'
import { InstallGuide } from '../components/InstallGuide'

interface DiveLogListViewProps {
  onSelectDive: (id: number) => void
  onNewDive: () => void
  onOpenSettings: () => void
}

export function DiveLogListView({ onSelectDive, onNewDive, onOpenSettings }: DiveLogListViewProps) {
  const diveLogs = useDiveLogs()

  return (
    <div className="view">
      <InstallGuide />
      <div className="view__header">
        <h1>ダイビングログ</h1>
        <div className="view__actions">
          <button type="button" onClick={onOpenSettings} aria-label="設定">
            設定
          </button>
          <button type="button" onClick={onNewDive}>
            + 新規記録
          </button>
        </div>
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
