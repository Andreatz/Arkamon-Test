import { useGameStore } from '@/store/gameStore'
import { useInteractionStore } from '@/interactions/interactionStore'
import { nextJournalObjective } from './journalModel'
import './journal.css'

/** Compact map HUD; reads real budget and objectives without spending an action. */
export function TurnSummary({ compact = false }: { compact?: boolean }) {
  const actor = useGameStore((s) => s.giocatoreAttivo)
  const player1 = useGameStore((s) => s.giocatore1)
  const player2 = useGameStore((s) => s.giocatore2)
  const world1 = useGameStore((s) => s.posizione1)
  const world2 = useGameStore((s) => s.posizione2)
  const battle = useGameStore((s) => s.battaglia)
  const progress = useGameStore((s) => s.interactionProgress)
  const turn = useGameStore((s) => s.turnoOverworld)
  const interactions = useInteractionStore((s) => s.interactions)
  const remaining = actor === turn.giocatoreAttivo ? turn.azioniRimaste : 0
  const objective = nextJournalObjective({ ...useGameStore.getState(), giocatore1: player1, giocatore2: player2,
    posizione1: world1, posizione2: world2, battaglia: battle, interactionProgress: progress }, actor, interactions)
  return <div className={`turn-summary${compact ? ' turn-summary--compact' : ''}`} aria-label="Riepilogo del turno">
    <span>G{actor} · {remaining} {remaining === 1 ? 'azione rimasta' : 'azioni rimaste'}</span>
    <span>{remaining === 0 ? 'Turno concluso: passa il controllo.' : '2 movimenti oppure 1 movimento + 1 interazione.'}</span>
    <span title={objective.detail}>Obiettivo: {objective.title}{objective.nextStep ? ` · via ${objective.nextStep.replace(/_/g, ' ')}` : ''}</span>
  </div>
}
