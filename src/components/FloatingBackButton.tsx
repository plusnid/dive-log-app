import { ChevronLeftIcon } from './icons'
import './FloatingBackButton.css'

interface FloatingBackButtonProps {
  onClick: () => void
}

/** 対象3画面（詳細・設定・生物検索）の左上に固定表示する、1つ前の画面へ戻るボタン。 */
export function FloatingBackButton({ onClick }: FloatingBackButtonProps) {
  return (
    <button type="button" className="floating-back" aria-label="戻る" onClick={onClick}>
      <ChevronLeftIcon />
    </button>
  )
}
