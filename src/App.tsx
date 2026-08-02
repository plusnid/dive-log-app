import { useEffect, useState } from 'react'
import { DiveLogListView } from './views/DiveLogListView'
import { DiveLogFormView } from './views/DiveLogFormView'
import { DiveLogDetailView } from './views/DiveLogDetailView'
import { SyncSettingsView } from './views/SyncSettingsView'
import { requestPersistentStorage } from './platform/storage'
import { initAutoSync, isSyncConfigured } from './sync/syncEngine'
import './App.css'

type Route = { view: 'list' } | { view: 'form'; id?: number } | { view: 'detail'; id: number } | { view: 'settings' }

function App() {
  const [route, setRoute] = useState<Route>({ view: 'list' })

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
    return <SyncSettingsView onBack={() => setRoute({ view: 'list' })} />
  }

  if (route.view === 'form') {
    return (
      <DiveLogFormView
        id={route.id}
        onSaved={(id) => setRoute({ view: 'detail', id })}
        onCancel={() => setRoute({ view: 'list' })}
      />
    )
  }

  if (route.view === 'detail') {
    return (
      <DiveLogDetailView
        id={route.id}
        onBack={() => setRoute({ view: 'list' })}
        onEdit={(id) => setRoute({ view: 'form', id })}
        onDeleted={() => setRoute({ view: 'list' })}
      />
    )
  }

  return (
    <DiveLogListView
      onSelectDive={(id) => setRoute({ view: 'detail', id })}
      onNewDive={() => setRoute({ view: 'form' })}
      onOpenSettings={() => setRoute({ view: 'settings' })}
    />
  )
}

export default App
