import { useEffect, useRef, useState } from 'react'
import { MenuIcon } from './icons'
import { isStandalone } from '../platform/environment'
import './AppMenu.css'

interface AppMenuProps {
  /** 生物から探す画面を開く（marine-life-observation REQ-6.2） */
  onOpenCreatures: () => void
  onOpenSettings: () => void
  /** インストール案内の再表示（REQ-2.16〜REQ-2.19） */
  onShowInstallGuide: () => void
}

/**
 * ヘッダー右のメニュー（disclosure パターン）。`role="menu"` は使わない。
 * 画面遷移リンクの集合であり、矢印キー等のフルのアプリケーションメニュー仕様は不要なため（design.md 2-3）。
 */
export function AppMenu({ onOpenCreatures, onOpenSettings, onShowInstallGuide }: AppMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  /** 画面遷移を伴わない操作の後始末（REQ-2.5, REQ-2.7, REQ-2.8）。フォーカスをメニューボタンへ戻す。 */
  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  /**
   * iOS Safariはボタン間のフォーカス移動で`relatedTarget`が`null`になることが多く、
   * それを同期的に見て閉じるとタップ対象がクリック発火前にDOMから消えてしまう
   * （＝メニュー項目タップが無反応になる）。クリック処理後にactiveElementで
   * 判定し直すため、1マクロタスク遅延させる。
   */
  function handleFocusOut() {
    setTimeout(() => {
      if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
        setOpen(false)
      }
    }, 0)
  }

  return (
    <div className="app-menu" ref={containerRef} onBlur={handleFocusOut}>
      <button
        type="button"
        ref={triggerRef}
        className="app-menu__trigger"
        aria-label="メニュー"
        aria-expanded={open}
        aria-controls="app-menu-panel"
        onClick={() => setOpen((prev) => !prev)}
      >
        <MenuIcon />
      </button>
      {open && (
        <div id="app-menu-panel" className="app-menu__panel" ref={panelRef}>
          <button
            type="button"
            className="app-menu__item"
            onClick={() => {
              setOpen(false)
              onOpenCreatures()
            }}
          >
            生物から探す
          </button>
          <button
            type="button"
            className="app-menu__item"
            onClick={() => {
              setOpen(false)
              onOpenSettings()
            }}
          >
            設定
          </button>
          {!isStandalone() && (
            <button
              type="button"
              className="app-menu__item"
              onClick={() => {
                close()
                onShowInstallGuide()
              }}
            >
              ホーム画面に追加の案内
            </button>
          )}
        </div>
      )}
    </div>
  )
}
