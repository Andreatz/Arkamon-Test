import { useEffect } from 'react'
import { useGameStore } from '@/store/gameStore'
import { usePlayerUiSession } from '@/player-ui/playerUiSession'
import { buildPublicManagement, PRESENTABLE_SCREENS, type PresentableScreen } from './managementPresentation'
import { usePublicManagement } from './publicManagementStore'

export function PresentManagementControl({ screen, playerId, instanceId }: { screen: string; playerId: 1 | 2; instanceId?: string }) {
  const selection = usePlayerUiSession(state => state.selection[playerId])
  const game = useGameStore()
  const request = usePublicManagement(state => state.request)
  const present = usePublicManagement(state => state.present)
  const hide = usePublicManagement(state => state.hide)
  useEffect(() => { hide(); return hide }, [screen, playerId, hide])
  if (!PRESENTABLE_SCREENS.includes(screen as PresentableScreen) || game.challengeContext || typeof location !== 'undefined' && new URLSearchParams(location.search).has('uiStudioPreview')) return null
  const next = { screen: screen as PresentableScreen, playerId, ...selection, instanceId: selection?.instanceId ?? instanceId }
  const allowed = !!buildPublicManagement(game, next)
  return <div className="pu-present-control" data-ui-id="present-management">
    <button type="button" disabled={!allowed} onClick={() => present(next)} aria-pressed={!!request} aria-label="Presenta scheda selezionata" title="Presenta scheda selezionata"><span className="pu-present-symbol" aria-hidden="true">◉</span><span className="pu-present-label">Presenta scheda selezionata</span></button>
    {request ? <button type="button" onClick={hide} aria-label="Nascondi dalla live" title="Nascondi dalla live"><span className="pu-present-symbol" aria-hidden="true">■</span><span className="pu-present-label">Nascondi dalla live</span></button> : null}
    <span className="pu-present-hint">{request ? 'In onda: solo la scheda scelta' : 'Privato · presenta solo il dettaglio selezionato'}</span>
  </div>
}
