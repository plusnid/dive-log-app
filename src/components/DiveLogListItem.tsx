import type { DiveLog } from '../types/diveLog'
import { CardThumbnail } from './CardThumbnail'
import { CreatureIcon, DepthIcon, DurationIcon, PhotoIcon, SignedIcon } from './icons'
import './DiveLogListItem.css'

interface DiveLogListItemProps {
  diveLog: DiveLog
  onSelect: (id: number) => void
}

export function DiveLogListItem({ diveLog, onSelect }: DiveLogListItemProps) {
  if (diveLog.id == null) return null

  // 一覧カードの「写真」枚数・サムネイルからダイビングプラン画像を除外する（REQ-5.2, REQ-5.3）。
  // 解決できない参照が残っている場合に負にならないようクランプする（旧版端末経由のバージョン混在時）。
  const planCount = diveLog.planImageUuids?.length ?? 0
  const photoCount = Math.max(0, diveLog.photoIds.length - planCount)

  return (
    <li className="dive-log-list-item">
      <button type="button" className="dive-log-list-item__button" onClick={() => onSelect(diveLog.id!)}>
        <div className="dive-log-list-item__body">
          <span className="dive-log-list-item__date">{diveLog.date}</span>
          <span className="dive-log-list-item__site-group">
            {diveLog.area && <span className="dive-log-list-item__area">{diveLog.area}</span>}
            <span className="dive-log-list-item__site">{diveLog.siteName}</span>
          </span>
          <div className="dive-log-list-item__meta">
            {diveLog.maxDepth != null && (
              <span className="dive-log-list-item__meta-item">
                <DepthIcon className="dive-log-list-item__icon" />
                <span className="dive-log-list-item__meta-label">最大水深</span>
                <span className="dive-log-list-item__meta-value">{diveLog.maxDepth}m</span>
              </span>
            )}
            {diveLog.duration != null && (
              <span className="dive-log-list-item__meta-item">
                <DurationIcon className="dive-log-list-item__icon" />
                <span className="dive-log-list-item__meta-label">潜水時間</span>
                <span className="dive-log-list-item__meta-value">{diveLog.duration}分</span>
              </span>
            )}
            {photoCount > 0 && (
              <span className="dive-log-list-item__meta-item">
                <PhotoIcon className="dive-log-list-item__icon" />
                <span className="dive-log-list-item__meta-label">写真</span>
                <span className="dive-log-list-item__meta-value">{photoCount}枚</span>
              </span>
            )}
            {diveLog.signatureId != null && (
              <span className="dive-log-list-item__meta-item">
                <SignedIcon className="dive-log-list-item__icon" />
                <span className="dive-log-list-item__meta-value">サイン済</span>
              </span>
            )}
            {diveLog.observations != null && diveLog.observations.length > 0 && (
              <span className="dive-log-list-item__meta-item">
                <CreatureIcon className="dive-log-list-item__icon" />
                <span className="dive-log-list-item__meta-label">生物</span>
                <span className="dive-log-list-item__meta-value">{diveLog.observations.length}件</span>
              </span>
            )}
          </div>
        </div>
        {photoCount > 0 && <CardThumbnail photoId={diveLog.photoIds[0]} />}
      </button>
    </li>
  )
}
