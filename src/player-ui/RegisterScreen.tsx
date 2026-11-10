import { lazy, Suspense, useState } from 'react'
import { KitButton } from './kit'

const Journal = lazy(() => import('@/journal/PlayerJournalPanel').then(module => ({ default: module.PlayerJournalPanel })))
const Match = lazy(() => import('@/match/MatchRegisterPanel').then(module => ({ default: module.MatchRegisterPanel })))
const Chronicles = lazy(() => import('@/components/battle/BattleArchivePanel').then(module => ({ default: module.BattleArchivePanel })))
export type RegisterTab = 'journal' | 'match' | 'chronicles'
const tabs: { id: RegisterTab; label: string }[] = [
  { id: 'journal', label: 'Diario' }, { id: 'match', label: 'Eventi del match' }, { id: 'chronicles', label: 'Cronache delle battaglie' },
]

/** One entry point, three existing archives. No migration or duplication of saved history. */
export function RegisterScreen({ playerId, initialTab = 'match' }: { playerId: 1 | 2; initialTab?: RegisterTab }) {
  const [tab, setTab] = useState<RegisterTab>(initialTab)
  return <section className="pu-register-screen" aria-label="Registro della partita">
    <nav className="pu-register-tabs" aria-label="Archivi del registro">{tabs.map(entry => <KitButton key={entry.id} active={tab === entry.id}
      aria-pressed={tab === entry.id} aria-controls="pu-register-content" onClick={() => setTab(entry.id)}>{entry.label}</KitButton>)}</nav>
    <div id="pu-register-content">
      <Suspense fallback={<p role="status">Caricamento archivio…</p>}>
        {tab === 'journal' ? <Journal key={playerId} initialPlayerId={playerId} /> : tab === 'match' ? <Match key={playerId} initialPlayerId={playerId} /> : <Chronicles />}
      </Suspense>
    </div>
  </section>
}
