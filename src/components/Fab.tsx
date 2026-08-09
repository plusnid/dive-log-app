import { PlusIcon } from './icons'
import './Fab.css'

interface FabProps {
  /** アクセシブルな名前（例: '新規記録'）。表示は記号（＋）のみのため必須（REQ-1.7）。 */
  label: string
  onClick: () => void
}

/** 一覧画面の右下に固定表示する、新規記録作成用のフローティングアクションボタン。 */
export function Fab({ label, onClick }: FabProps) {
  return (
    <button type="button" className="fab" aria-label={label} onClick={onClick}>
      <PlusIcon />
    </button>
  )
}
