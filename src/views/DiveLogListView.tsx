import { useState } from 'react'
import { useDiveLogs } from '../hooks/useDiveLogs'
import { DiveLogListItem } from '../components/DiveLogListItem'
import { InstallGuide } from '../components/InstallGuide'
import { AppMenu } from '../components/AppMenu'
import { Fab } from '../components/Fab'

interface DiveLogListViewProps {
  onSelectDive: (id: number) => void
  onNewDive: () => void
  onOpenSettings: () => void
  onOpenCreatures: () => void
}

export function DiveLogListView({ onSelectDive, onNewDive, onOpenSettings, onOpenCreatures }: DiveLogListViewProps) {
  const diveLogs = useDiveLogs()
  const [installGuideSignal, setInstallGuideSignal] = useState(0)

  function handleShowInstallGuide() {
    setInstallGuideSignal((prev) => prev + 1)
    window.scrollTo({ top: 0 }) // 案内は一覧の先頭にあるため（REQ-2.19）
  }

  return (
    <div className="view view--list">
      <InstallGuide reopenSignal={installGuideSignal} />
      <div className="view__header">
        <h1>ダイビングログ</h1>
        <AppMenu
          onOpenCreatures={onOpenCreatures}
          onOpenSettings={onOpenSettings}
          onShowInstallGuide={handleShowInstallGuide}
        />
      </div>
      {diveLogs == null ? (
        <p>読み込み中...</p>
      ) : diveLogs.length === 0 ? (
        <p>まだ記録がありません。右下の＋ボタンから追加しましょう。</p>
      ) : (
        <ul className="dive-log-list">
          {diveLogs.map((log) => (
            <DiveLogListItem key={log.id} diveLog={log} onSelect={onSelectDive} />
          ))}
        </ul>
      )}
      <Fab label="新規記録" onClick={onNewDive} />
    </div>
  )
}
