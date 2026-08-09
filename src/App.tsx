import { useEffect, useState } from 'react'
import { DiveLogListView } from './views/DiveLogListView'
import { DiveLogFormView } from './views/DiveLogFormView'
import { DiveLogDetailView } from './views/DiveLogDetailView'
import { SyncSettingsView } from './views/SyncSettingsView'
import { CreatureSearchView } from './views/CreatureSearchView'
import { requestPersistentStorage } from './platform/storage'
import { initAutoSync, isSyncConfigured } from './sync/syncEngine'
import type { MarineLifeGenre } from './types/marineLifeOptions'
import './App.css'

type Route =
  | { view: 'list' }
  | { view: 'form'; id?: number }
  | { view: 'detail'; id: number }
  | { view: 'settings' }
  | { view: 'creatures'; name?: string; query?: string; genre?: MarineLifeGenre }

const HOME: Route = { view: 'list' }

/** 履歴上の同一性。creatures の query / genre は同一性に含めない（検索語の変更で履歴を増やさないため、REQ-11.4）。 */
function isSameRoute(a: Route, b: Route): boolean {
  if (a.view !== b.view) return false
  if (a.view === 'detail' && b.view === 'detail') return a.id === b.id
  if (a.view === 'form' && b.view === 'form') return a.id === b.id
  if (a.view === 'creatures' && b.view === 'creatures') return (a.name ?? null) === (b.name ?? null)
  return true // list / settings
}

function App() {
  // 画面遷移の履歴スタック（REQ-11.1）。起点は一覧画面（REQ-11.3）。
  const [stack, setStack] = useState<Route[]>([HOME])
  const route = stack[stack.length - 1]

  /** 新しい画面へ進む。現在の画面と同一なら積まずに置き換える（REQ-11.4）。 */
  function push(next: Route) {
    setStack((prev) => (isSameRoute(prev[prev.length - 1], next) ? [...prev.slice(0, -1), next] : [...prev, next]))
  }

  /** 現在の画面を置き換える。置き換えた結果が直下と同一なら畳む（REQ-11.10, REQ-11.11）。 */
  function replace(next: Route) {
    setStack((prev) => {
      const base = prev.slice(0, -1)
      const under = base[base.length - 1]
      return under && isSameRoute(under, next) ? base : [...base, next]
    })
  }

  /** 1つ戻る。戻り先がなければ一覧（REQ-11.2, REQ-11.3）。 */
  function back() {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : [HOME]))
  }

  /** 削除されたログを指すエントリを履歴のすべての位置から除去する（REQ-11.13, REQ-11.14）。 */
  function dropLog(id: number) {
    setStack((prev) => {
      const kept = prev.filter((r) => !((r.view === 'detail' || r.view === 'form') && r.id === id))
      return kept.length > 0 ? kept : [HOME]
    })
  }

  useEffect(() => {
    // ブラウザによる自動的なデータ削除の対象になりにくくする（REQ-3.2）。
    // 未対応/拒否時もエラー扱いせず、通常どおり動作を継続する（REQ-3.3）。
    void requestPersistentStorage()
  }, [])

  useEffect(() => {
    // 同期が無効（OAuthクライアント未設定）の場合、maybeSync は何もしないため
    // ネットワークやGoogleのスクリプトには一切触れない（NFR-1-b）。
    if (!isSyncConfigured()) return
    return initAutoSync()
  }, [])

  if (route.view === 'settings') {
    return <SyncSettingsView onBack={back} />
  }

  if (route.view === 'form') {
    return (
      <DiveLogFormView id={route.id} onSaved={(id) => replace({ view: 'detail', id })} onCancel={back} />
    )
  }

  if (route.view === 'detail') {
    return (
      <DiveLogDetailView
        id={route.id}
        onBack={back}
        onEdit={(id) => push({ view: 'form', id })}
        onDeleted={() => dropLog(route.id)}
        onSelectCreature={(name) => push({ view: 'creatures', name })}
      />
    )
  }

  if (route.view === 'creatures') {
    return (
      <CreatureSearchView
        selectedName={route.name ?? null}
        query={route.query ?? ''}
        genre={route.genre}
        onSelectCreatureName={(name) => push({ view: 'creatures', name, query: route.query, genre: route.genre })}
        onShowCreatureList={() => replace({ view: 'creatures', query: route.query, genre: route.genre })}
        onFilterChange={({ query, genre }) => replace({ view: 'creatures', name: route.name, query, genre })}
        onBack={back}
        onSelectDive={(id) => push({ view: 'detail', id })}
      />
    )
  }

  return (
    <DiveLogListView
      onSelectDive={(id) => push({ view: 'detail', id })}
      onNewDive={() => push({ view: 'form' })}
      onOpenSettings={() => push({ view: 'settings' })}
      onOpenCreatures={() => push({ view: 'creatures' })}
    />
  )
}

export default App
