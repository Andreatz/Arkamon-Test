import { lazy, Suspense, useEffect } from 'react'
import { useGameStore } from '@store/gameStore'

const PlayerUi = lazy(() => import('@/player-ui/PlayerUi').then(module => ({ default: module.PlayerUi })))

/** Studio edits this same composition; the historical deposit remains in its lab. */
export function DepositoScene() {
  const scenaIndietro = useGameStore(state => state.scenaIndietro)
  const giocatoreAttivo = useGameStore(state => state.giocatoreAttivo)
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[data-game-dialog], [data-battle-log-dialog]')) return
      event.preventDefault(); scenaIndietro()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [scenaIndietro])
  return <div className="pu-scene-host"><Suspense fallback={<p role="status">Caricamento deposito…</p>}>
    <PlayerUi initialScreen="deposito" initialPlayerId={giocatoreAttivo} onClose={scenaIndietro} />
  </Suspense></div>
}
