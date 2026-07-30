import { useState } from 'react'
import { DiveLogListView } from './views/DiveLogListView'
import { DiveLogFormView } from './views/DiveLogFormView'
import { DiveLogDetailView } from './views/DiveLogDetailView'
import './App.css'

type Route = { view: 'list' } | { view: 'form'; id?: number } | { view: 'detail'; id: number }

function App() {
  const [route, setRoute] = useState<Route>({ view: 'list' })

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
    />
  )
}

export default App
