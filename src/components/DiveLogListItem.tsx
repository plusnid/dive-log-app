import type { DiveLog } from '../types/diveLog'
import './DiveLogListItem.css'

interface DiveLogListItemProps {
  diveLog: DiveLog
  onSelect: (id: number) => void
}

export function DiveLogListItem({ diveLog, onSelect }: DiveLogListItemProps) {
  if (diveLog.id == null) return null

  return (
    <li className="dive-log-list-item">
      <button type="button" className="dive-log-list-item__button" onClick={() => onSelect(diveLog.id!)}>
        <div className="dive-log-list-item__main">
          <span className="dive-log-list-item__date">{diveLog.date}</span>
          <span className="dive-log-list-item__site-group">
            {diveLog.area && <span className="dive-log-list-item__area">{diveLog.area}</span>}
            <span className="dive-log-list-item__site">{diveLog.siteName}</span>
          </span>
        </div>
        <div className="dive-log-list-item__meta">
          {diveLog.maxDepth != null && <span>最大水深 {diveLog.maxDepth}m</span>}
          {diveLog.duration != null && <span>潜水時間 {diveLog.duration}分</span>}
          {diveLog.photoIds.length > 0 && <span title="写真あり">📷 {diveLog.photoIds.length}</span>}
          {diveLog.signatureId != null && <span title="サイン済み">✔ サイン済</span>}
        </div>
      </button>
    </li>
  )
}
