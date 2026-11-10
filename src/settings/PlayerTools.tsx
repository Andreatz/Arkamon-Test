import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { GameDialog } from '@/components/ui/GameDialog'
import { GameButton } from '@/components/ui/GameButton'
import { SaveRecoveryNotice } from '@/save/SaveRecoveryNotice'
import { useGameStore } from '@/store/gameStore'
import { TeamRuleNotice } from './TeamRuleNotice'
import { isPlayerUiScreen, PLAYER_UI_OPEN_EVENT, type PlayerUiAuxiliary, type PlayerUiOpenRequest } from '@/player-ui/navigation'
import { useInteractionStore } from '@/interactions/interactionStore'
import { shopAvailabilityMessage } from '@/shop/purchase'

const PlayerUi = lazy(() => import('@/player-ui/PlayerUi').then(module => ({ default: module.PlayerUi })))
export function PlayerTools() {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState<PlayerUiOpenRequest & { auxiliary?: PlayerUiAuxiliary; revision: number }>({ screen: 'partita', revision: 0 })
  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (!detail || typeof detail !== 'object') return
      const raw = detail as Partial<PlayerUiOpenRequest>
      if (!isPlayerUiScreen(raw.screen)) return
      if (raw.screen === 'negozio' && (typeof raw.shopInteractionId !== 'string' || !raw.shopInteractionId.trim()
        || (raw.playerId !== 1 && raw.playerId !== 2))) return
      if (raw.screen === 'negozio') {
        const state = useGameStore.getState()
        const location = state.scenaCorrente.payload?.luogo
        if (typeof location !== 'string' || state.challengeContext || shopAvailabilityMessage(state, raw.playerId as 1 | 2, location,
          { interactionId: raw.shopInteractionId, interactions: useInteractionStore.getState().interactions })) return
      }
      setRequest(previous => ({ screen: raw.screen!, playerId: raw.playerId === 1 || raw.playerId === 2 ? raw.playerId : undefined,
        instanceId: typeof raw.instanceId === 'string' ? raw.instanceId : undefined,
        shopInteractionId: typeof raw.shopInteractionId === 'string' ? raw.shopInteractionId : undefined, revision: previous.revision + 1 }))
      setOpen(true)
    }
    window.addEventListener(PLAYER_UI_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(PLAYER_UI_OPEN_EVENT, handleOpen)
  }, [])
  function openDefault(auxiliary?: PlayerUiAuxiliary) {
    setRequest(previous => ({ screen: 'partita', playerId: useGameStore.getState().giocatoreAttivo, auxiliary, revision: previous.revision + 1 }))
    setOpen(true)
  }
  return <>
    {createPortal(<SaveRecoveryNotice onOpenBackup={() => openDefault('backup')} />, document.body)}
    {!open && createPortal(<TeamRuleNotice />, document.body)}
    {createPortal(<GameButton aria-haspopup="dialog" aria-expanded={open} onClick={() => openDefault()} className="fixed bottom-3 left-3 z-[950] text-sm">Partita</GameButton>, document.body)}
    {open ? <GameDialog title="La tua partita" className="player-ui-dialog" showCloseButton={false} onClose={() => setOpen(false)}>
      <TeamRuleNotice />
      <Suspense fallback={<p role="status">Caricamento…</p>}>
        <PlayerUi key={request.revision} initialScreen={request.screen} initialPlayerId={request.playerId} initialInstanceId={request.instanceId}
          initialAuxiliary={request.auxiliary} initialShopInteractionId={request.shopInteractionId} onClose={() => setOpen(false)} />
      </Suspense>
    </GameDialog> : null}
  </>
}
