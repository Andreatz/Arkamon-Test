import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { SceneNavigationContext, SceneInputContext } from '@/components/transitions/SceneNavigationContext'
import { PlayerUi } from '@/player-ui/PlayerUi'
import { PLAYER_UI_OPEN_EVENT, type PlayerUiOpenRequest, type PlayerUiAuxiliary, type PlayerUiScreen } from '@/player-ui/navigation'
import { createDefaultDesign, normalizeDesign } from './designModel'
import { createPreviewFixture, previewCreature } from './previewFixtures'
import { getSplashArtwork } from '@/player-ui/reference/splashArtwork'
import { usePlayerUiSession } from '@/player-ui/playerUiSession'
import { UiDesignRuntime } from './UiDesignRuntime'
import { UI_STUDIO_SCREENS, UI_STUDIO_SCREEN_VIEWS, type UiDesignDocument, type UiStudioMessage } from './types'
import { isUiStudioPreview } from './previewMode'
import { UiPreviewViewContext } from './UiPreviewViewContext'
import { UiDesignPreviewContext } from './battleLayout'
import { UI_CONCEPTS } from '@/player-ui/concepts/uiConcepts'
import { useInteractionStore } from '@/interactions/interactionStore'
import { getLocalMap } from '@/data/localMaps'

const Titolo = lazy(() => import('@/scenes/TitoloScene').then(module => ({ default: module.TitoloScene })))
const Laboratorio = lazy(() => import('@/scenes/LaboratorioScene').then(module => ({ default: module.LaboratorioScene })))
const MainMap = lazy(() => import('@/scenes/MappaPrincipaleScene').then(module => ({ default: module.MappaPrincipaleScene })))
const City = lazy(() => import('@/scenes/CittaScene').then(module => ({ default: module.CittaScene })))
const Route = lazy(() => import('@/scenes/PercorsoScene').then(module => ({ default: module.PercorsoScene })))
const Grid = lazy(() => import('@/scenes/MappaGrigliaScene').then(module => ({ default: module.MappaGrigliaScene })))
const Battle = lazy(() => import('@/scenes/BattagliaScene').then(module => ({ default: module.BattagliaScene })))
const League = lazy(() => import('@/league/LeagueScene').then(module => ({ default: module.LeagueScene })))
const Evolution = lazy(() => import('@/scenes/EvoluzioneScene').then(module => ({ default: module.EvoluzioneScene })))
const auxiliaries = ['register', 'race', 'recap', 'journal', 'backup', 'settings', 'chronicles', 'match', 'challenges']
const management = ['menu', 'squadra', 'deposito', 'arkadex', 'analisi', 'borsa', 'negozio', ...auxiliaries]
function Scene({ screen, onClose = () => {} }: { screen: string; onClose?: () => void }) {
  if (management.includes(screen)) return <PlayerUi key={screen} initialScreen={(screen === 'menu' || auxiliaries.includes(screen) ? 'partita' : screen) as PlayerUiScreen} initialPlayerId={1} initialAuxiliary={auxiliaries.includes(screen) ? screen as PlayerUiAuxiliary : undefined} initialShopInteractionId={screen === 'negozio' ? 'ui-studio-demo' : undefined} onClose={onClose} />
  if (screen === 'laboratorio') return <Laboratorio />
  if (screen === 'mappa-principale') return <MainMap />
  if (screen === 'citta') return <City />
  if (screen === 'percorso') return <Route />
  if (screen === 'mappa-griglia') return <Grid />
  if (screen === 'battaglia') return <Battle />
  if (screen === 'lega') return <League />
  if (screen === 'evoluzione') return <Evolution />
  return <Titolo />
}

/** Only the isolated iframe route mounts this component; it never opens PlayerTools. */
export function UiStudioPreview() {
  const query = new URLSearchParams(window.location.search)
  const conceptPreview = query.get('uiConceptFluid') === '1' && (query.get('uiConcept') === 'aurora' || UI_CONCEPTS.some(concept => concept.id === query.get('uiConcept')))
  const [screen, setScreen] = useState(() => {
    const requested = query.get('screen')
    return conceptPreview && UI_STUDIO_SCREENS.some(([id]) => id === requested) ? requested! : 'titolo'
  }), [prepared, setPrepared] = useState('')
  const [design, setDesign] = useState<UiDesignDocument>(createDefaultDesign)
  const [, setSelected] = useState<string | null>(null)
  const [snapshotRevision, setSnapshotRevision] = useState(0)
  useLayoutEffect(() => {
    if (!isUiStudioPreview()) return
    const fixture = createPreviewFixture(screen)
    const revision = useGameStore.getState().campaignRevision + 1
    const splashSpecies = Number(query.get('splash'))
    const splash = conceptPreview && query.get('uiConcept') === 'aurora' && ['squadra','arkadex'].includes(screen) ? getSplashArtwork(splashSpecies) : undefined
    if (splash) {
      // Explicit art inspection changes demonstration data only, never the campaign.
      const creature = previewCreature(splash.speciesId, 0)
      creature.istanzaId = `ui-splash-preview-1-${splash.speciesId}`
      fixture.giocatore1.squadra = [creature, ...fixture.giocatore1.squadra.filter(entry => entry.specieId !== splash.speciesId)].slice(0, 6)
      const session = usePlayerUiSession.getState()
      session.remember(`${revision}:1:team.instance`, creature.istanzaId)
      session.remember(`${revision}:1:dex.species`, splash.speciesId)
      session.remember(`${revision}:1:dex.page`, Math.floor((splash.speciesId - 1) / 6))
    }
    useGameStore.setState({ ...fixture, challengeContext: null, teamRuleMessage: null, saveRecoveryWarnings: [], campaignRevision: revision })
    if (conceptPreview && query.get('uiConcept') === 'aurora' && (screen === 'negozio' || screen === 'citta')) {
      // The preview catalog is volatile too; normal shop access still requires a real map interaction.
      useInteractionStore.setState({ interactions: [{ id: 'ui-studio-demo', mapId: 'Venezia', nodeId: getLocalMap('Venezia')!.startNode,
        title: 'Arkastore', dialogue: 'Le scorte per il prossimo viaggio.', scope: 'player', enabled: true, repeatable: true,
        requirements: { gymIds: [], minLevel: 0, minCoins: 0, items: {}, completedInteractions: [] },
        cost: { coins: 0, items: {} }, reward: { coins: 0, items: {} }, action: { kind: 'shop' } }] })
    }
    setPrepared(screen)
  }, [screen])
  useEffect(() => {
    if (!conceptPreview || query.get('uiConcept') !== 'aurora') return
    const open = (event: Event) => {
      const request = (event as CustomEvent<PlayerUiOpenRequest>).detail
      if (!request || request.screen === 'negozio' && request.shopInteractionId !== 'ui-studio-demo') return
      if (management.includes(request.screen) || request.screen === 'partita') setScreen(request.screen === 'partita' ? 'menu' : request.screen)
    }
    window.addEventListener(PLAYER_UI_OPEN_EVENT, open)
    return () => window.removeEventListener(PLAYER_UI_OPEN_EVENT, open)
  }, [conceptPreview])
  useEffect(() => {
    const receive = (event: MessageEvent<UiStudioMessage>) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.source !== 'arkamon-ui-studio') return
      const message = event.data
      if (message.type === 'design') { try { setDesign(normalizeDesign(message.design)) } catch { /* Invalid drafts cannot enter a live renderer. */ } }
      if (message.type === 'screen') {
        const [base, view] = message.screen.split(':')
        if (UI_STUDIO_SCREENS.some(([id]) => id === base) && (!view || UI_STUDIO_SCREEN_VIEWS[base]?.some(([id]) => id === view))) setScreen(message.screen)
      }
      if (message.type === 'select') setSelected(message.id)
      if (message.type === 'request-snapshot') setSnapshotRevision(value => value + 1)
    }
    window.addEventListener('message', receive)
    window.parent.postMessage({ source: 'arkamon-ui-preview', type: 'ready' }, window.location.origin)
    return () => window.removeEventListener('message', receive)
  }, [])
  if (!isUiStudioPreview()) return <p>Questa anteprima è disponibile soltanto nello Studio UI.</p>
  const navigation = useGameStore.getState().scenaCorrente
  return <MotionConfig reducedMotion="always"><div data-ui-studio-preview-screen={screen} className="ui-studio-preview-stage" style={{ position: 'relative', width: conceptPreview ? '100%' : '1920px', height: conceptPreview ? '100dvh' : '1080px', overflow: conceptPreview ? 'auto' : 'hidden', background: '#0b1728' }}>
    {prepared === screen && <UiDesignPreviewContext.Provider value={{ design, screen }}><UiPreviewViewContext.Provider value={screen.split(':')[1] ?? null}><SceneNavigationContext.Provider value={navigation}><SceneInputContext.Provider value={!conceptPreview}><Suspense fallback={<p role="status">Caricamento schermata…</p>}><Scene key={screen} screen={screen.split(':')[0]} onClose={conceptPreview ? () => setScreen('citta') : undefined} /></Suspense></SceneInputContext.Provider></SceneNavigationContext.Provider></UiPreviewViewContext.Provider></UiDesignPreviewContext.Provider>}
    {!conceptPreview && <UiDesignRuntime preview design={design} screen={screen} key={`runtime-${snapshotRevision}`} />}
  </div></MotionConfig>
}
