import { lazy, Suspense, useState, useContext, useEffect, useRef, useMemo, type CSSProperties } from 'react'
import { DialogNavigationContext } from '@/components/ui/DialogNavigation'
import { useGameStore } from '@/store/gameStore'
import { GameSettingsPanel } from '@/settings/GameSettingsPanel'
import { launchChallenge } from '@/challenges/challengeRuntime'
import { assetUrl } from '@/utils/assetUrl'
import { BATTLE_BG_DEFAULT, DEPOSIT_BG } from '@/data/backgrounds'
import { CreaturePortrait, KitButton, KitFrame, KitIcon, formatNumber } from './kit'
import { MenuScreen } from './MenuScreen'
import { usePlayerUiSession } from './playerUiSession'
import { PresentManagementControl } from '@/regia/PresentManagementControl'
import { PLAYER_UI_SCREENS, type PlayerUiAuxiliary, type PlayerUiScreen } from './navigation'
import { StudioCommand } from '@/components/ui/StudioArtwork'
import './playerUiStyles'
import { MENU_SVG_ARTWORK_ENABLED } from './uiAppearancePolicy'
import { resolveUiConcept } from './concepts/uiConcepts'
import { isReferenceUi } from './reference/referenceTheme'
import { referenceScreenBackground } from './reference/referenceBackgrounds'
import { providedArtworkVariables } from './reference/ProvidedArtwork'
import { getSplashArtwork, supportsSplashArtwork } from './reference/splashArtwork'
import { SplashArtworkProvider, type ReadySplashArtwork } from './reference/SplashArtworkContext'
import { createSplashArtworkLoader } from './reference/splashArtworkLoader'
import { useSplashFraming } from './reference/useSplashFraming'

export { PLAYER_UI_SCREENS, PLAYER_UI_OPEN_EVENT, isPlayerUiScreen, openPlayerUi } from './navigation'
export type { PlayerUiScreen, PlayerUiAuxiliary, PlayerUiOpenRequest } from './navigation'

const TeamScreen = lazy(() => import('./TeamScreen').then(module => ({ default: module.TeamScreen })))
const DepositScreen = lazy(() => import('./DepositScreen').then(module => ({ default: module.DepositScreen })))
const AnalysisScreen = lazy(() => import('./AnalysisScreen').then(module => ({ default: module.AnalysisScreen })))
const ArkadexScreen = lazy(() => import('./ArkadexScreen').then(module => ({ default: module.ArkadexScreen })))
const BagScreen = lazy(() => import('./BagScreen').then(module => ({ default: module.BagScreen })))
const StoreScreen = lazy(() => import('./StoreScreen').then(module => ({ default: module.StoreScreen })))
const BackupPanel = lazy(() => import('@/save/BackupPanel').then(module => ({ default: module.BackupPanel })))
const RegisterScreen = lazy(() => import('./RegisterScreen').then(module => ({ default: module.RegisterScreen })))
const RaceScreen = lazy(() => import('./RaceScreen').then(module => ({ default: module.RaceScreen })))
const ChallengePanel = lazy(() => import('@/challenges/ChallengePanel').then(module => ({ default: module.ChallengePanel })))

const screens: Record<PlayerUiScreen, { label: string; title: string; kicker: string; description: string; icon: string }> = {
  partita: { label: 'Menù Partita', title: 'Menù Partita', kicker: 'La tua partita', description: 'La tua avventura, sempre a portata di mano.', icon: 'icon-home' },
  squadra: { label: 'Squadra', title: 'Gestione Squadra', kicker: 'La tua squadra', description: 'I tuoi compagni. Un’unica avventura.', icon: 'icon-team' },
  deposito: { label: 'Deposito', title: 'Deposito Arkamon', kicker: 'Squadra e riserve', description: 'Un posto per ogni compagno di viaggio.', icon: 'icon-deposit' },
  arkadex: { label: 'Arkadex', title: 'Arkadex', kicker: 'Le tue scoperte', description: 'Ogni incontro aggiunge una pagina alla tua storia.', icon: 'icon-arkadex' },
  analisi: { label: 'Analisi', title: 'Analisi Arkamon', kicker: 'Scheda del compagno', description: 'Conosci il tuo compagno. Prepara la prossima mossa.', icon: 'icon-analysis' },
  borsa: { label: 'Borsa', title: 'Borsa Oggetti', kicker: 'I tuoi strumenti', description: 'Le scorte giuste per il prossimo incontro.', icon: 'icon-bag' },
  negozio: { label: 'Negozio', title: 'Arkastore', kicker: 'Scorte di viaggio', description: 'Rifornisci la borsa. Riparti verso nuove scoperte.', icon: 'icon-shop' },
}

const auxiliary: { id: PlayerUiAuxiliary; label: string; icon: string }[] = [
  { id: 'register', label: 'Registro', icon: 'icon-book' },
  { id: 'race', label: 'Gara', icon: 'icon-activity' },
  { id: 'recap', label: 'Ripresa', icon: 'icon-activity' },
  { id: 'journal', label: 'Diario', icon: 'icon-journal' },
  { id: 'backup', label: 'Backup', icon: 'icon-box' },
  { id: 'settings', label: 'Impostazioni', icon: 'icon-options' },
  { id: 'chronicles', label: 'Cronache', icon: 'icon-chronicles' },
  { id: 'match', label: 'Registro del match', icon: 'icon-activity' },
  { id: 'challenges', label: 'Sfide', icon: 'icon-challenges' },
]
const challengeBlocked = new Set<PlayerUiScreen>(['deposito', 'borsa', 'negozio'])

export interface PlayerUiProps {
  initialScreen?: PlayerUiScreen
  initialPlayerId?: 1 | 2
  initialInstanceId?: string
  initialAuxiliary?: PlayerUiAuxiliary
  initialShopInteractionId?: string
  onClose: () => void
}

export function PlayerUi({ initialScreen = 'partita', initialPlayerId, initialInstanceId, initialAuxiliary, initialShopInteractionId, onClose }: PlayerUiProps) {
  const [screen, setScreen] = useState<PlayerUiScreen>(initialScreen === 'negozio' && !initialShopInteractionId ? 'partita' : initialScreen)
  const [playerId, setPlayerId] = useState<1 | 2>(() => initialPlayerId ?? useGameStore.getState().giocatoreAttivo)
  const [instanceId, setInstanceId] = useState(initialInstanceId)
  const [tool, setTool] = useState<PlayerUiAuxiliary | null>(() => initialAuxiliary ?? (useGameStore.getState().challengeContext ? 'challenges' : null))
  const registerBack = useContext(DialogNavigationContext)
  const shell = useRef<HTMLDivElement>(null)
  const [history, setHistory] = useState<{ screen: PlayerUiScreen; tool: PlayerUiAuxiliary | null; instanceId?: string; focus?: string }[]>([])
  const restoreFocus = useRef<string>()
  const player1 = useGameStore(state => state.giocatore1)
  const player2 = useGameStore(state => state.giocatore2)
  const position1 = useGameStore(state => state.posizione1)
  const position2 = useGameStore(state => state.posizione2)
  const activePlayerId = useGameStore(state => state.giocatoreAttivo)
  const turn = useGameStore(state => state.turnoOverworld)
  const scene = useGameStore(state => state.scenaCorrente)
  const context = useGameStore(state => state.challengeContext)
  const player = playerId === 1 ? player1 : player2
  const position = playerId === 1 ? position1 : position2
  const location = scene.scena === 'titolo' ? 'Prima dell’avventura' : scene.scena === 'laboratorio' ? 'Laboratorio' : (position.luogo ?? position.mappaId).replace(/_/g, ' ')
  const visibleTool = context && tool && tool !== 'settings' && tool !== 'challenges' ? 'challenges' : tool
  const blockedScreen = !!context && challengeBlocked.has(screen)
  const page = screens[screen]
  const toolLabel = auxiliary.find(entry => entry.id === visibleTool)?.label
  const reference = !MENU_SVG_ARTWORK_ENABLED && isReferenceUi()
  const selectedSpeciesId = usePlayerUiSession(state => state.selection[playerId]?.speciesId)
  const [loadedSplash, setLoadedSplash] = useState<{ screen: PlayerUiScreen; artwork: ReadySplashArtwork } | null>(null)
  const splashCandidate = useMemo<ReadySplashArtwork | null>(() => {
    if (!reference || visibleTool || blockedScreen || !supportsSplashArtwork(screen)) return null
    const artwork = getSplashArtwork(selectedSpeciesId)
    return artwork ? { ...artwork, src: assetUrl(artwork.src), playerId } : null
  }, [reference, visibleTool, blockedScreen, screen, selectedSpeciesId, playerId])
  // Compare the complete selection before rendering, rather than waiting for effect cleanup.
  const readySplash = splashCandidate && loadedSplash?.screen === screen
    && loadedSplash.artwork.playerId === splashCandidate.playerId && loadedSplash.artwork.speciesId === splashCandidate.speciesId
    && loadedSplash.artwork.src === splashCandidate.src ? loadedSplash.artwork : null
  useEffect(() => {
    const loader = createSplashArtworkLoader(artwork => setLoadedSplash(artwork ? { screen, artwork } : null))
    loader.load(splashCandidate)
    return () => loader.dispose()
  }, [splashCandidate, screen])

  const splashFraming = useSplashFraming(shell, readySplash, screen)

  function navigate(next: PlayerUiScreen) {
    if (next === 'negozio') return
    if (context && next !== 'partita') return
    setHistory([])
    if (next !== 'analisi') setInstanceId(undefined)
    setScreen(next); setTool(null)
  }
  function changePlayer(next: 1 | 2) { setHistory([]); setPlayerId(next); setInstanceId(undefined) }
  function rememberOrigin() {
    const focused = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
    setHistory(previous => [...previous, { screen, tool, instanceId, focus: focused?.getAttribute('aria-label') ?? focused?.textContent?.trim() }].slice(-12))
  }
  function analyse(id: string) { if (context) return; rememberOrigin(); setInstanceId(id); setScreen('analisi'); setTool(null) }
  function contextualScreen(next: PlayerUiScreen) { if (context) return; rememberOrigin(); setScreen(next); setInstanceId(undefined); setTool(null) }
  function openBag() {
    const selected = usePlayerUiSession.getState().selection[playerId]?.instanceId
    if (selected) usePlayerUiSession.getState().remember(`${useGameStore.getState().campaignRevision}:${playerId}:bag.target`, selected)
    contextualScreen('borsa')
  }
  function openTool(next: PlayerUiAuxiliary) {
    if (context && next !== 'settings' && next !== 'challenges') return
    setHistory([]); setTool(next)
  }
  function goBack(event: KeyboardEvent): boolean {
    const previous = history[history.length - 1]
    if (!previous) return false
    if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable="true"]')) return true
    event.preventDefault()
    setHistory(history.slice(0, -1)); setScreen(previous.screen); setTool(previous.tool); setInstanceId(previous.instanceId)
    restoreFocus.current = previous.focus
    return true
  }
  useEffect(() => registerBack?.(goBack), [registerBack, history])
  useEffect(() => {
    if (!restoreFocus.current) return
    let frame = 0, attempts = 0
    const restore = () => {
      const target = [...(shell.current?.querySelectorAll<HTMLElement>('button,input,select,a[href]') ?? [])].find(element => (element.getAttribute('aria-label') ?? element.textContent?.trim()) === restoreFocus.current)
      if (target) { target.focus(); restoreFocus.current = undefined }
      else if (++attempts < 30) frame = requestAnimationFrame(restore)
    }
    frame = requestAnimationFrame(restore)
    return () => cancelAnimationFrame(frame)
  }, [screen, tool])

  return <SplashArtworkProvider value={readySplash}><div ref={shell} className="pu-shell pu-live-shell" onKeyDownCapture={event => { if (!registerBack && event.key === 'Escape' && goBack(event.nativeEvent)) event.stopPropagation() }} style={{ ...(reference ? providedArtworkVariables : {}), '--pu-background': `url("${reference ? referenceScreenBackground(screen, location, readySplash) : screen === 'partita' ? BATTLE_BG_DEFAULT : DEPOSIT_BG}")`, '--pu-background-position': readySplash?.objectPosition ?? '50% 50%', '--pu-splash-position': splashFraming?.position ?? '50% 50%' } as CSSProperties}
    data-player-ui-screen={visibleTool ?? screen} data-player-ui-player={playerId}
    data-splash-frame-ready={readySplash && splashFraming ? 'true' : undefined} data-splash-frame-region={splashFraming?.region}
    data-splash-frame-mode={readySplash ? 'cover' : undefined} data-splash-focus-clear={readySplash && splashFraming ? String(splashFraming.focusFits) : undefined}
    data-reference-splash-species={readySplash?.speciesId} data-reference-splash-ready={readySplash ? 'true' : undefined}
    data-ui-concept={MENU_SVG_ARTWORK_ENABLED ? undefined : reference ? 'aurora' : resolveUiConcept(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('uiConcept'))}>
    {readySplash && <div className="pu-splash-backdrop" aria-hidden="true" />}
    <div className="pu-topbar">
      <KitFrame id="panel-wide" />
      <div className="pu-brand" role="img" aria-label="Arkamon"><img src={assetUrl('/ui/logo_arkamon.png')} className={reference ? 'pu-provided-logo' : undefined} alt="" />{!reference && <b className="pu-wordmark" aria-hidden="true">ARKAMON<span>VIAGGIA. SCOPRI. SFIDA.</span></b>}<small>Strumenti dell’allenatore</small></div>
      {reference && <h1 className="ref-screen-title"><KitIcon id={visibleTool ? auxiliary.find(entry => entry.id === visibleTool)?.icon ?? page.icon : page.icon} />{visibleTool ? toolLabel : screen === 'partita' ? 'Menù principale' : screen === 'negozio' ? 'Negozio' : screens[screen].label}</h1>}
      <div className="pu-header-meta"><small>Posizione di G{playerId}</small><strong>{location}</strong></div>
      <div className="pu-player-switch" role="group" aria-label="Giocatore degli strumenti">
        {[player1, player2].map(entry => <StudioCommand className="pu-player-option" key={entry.id} selected={playerId === entry.id} aria-pressed={playerId === entry.id}
          aria-label={`G${entry.id} · ${entry.nome || `Giocatore ${entry.id}`}`} onClick={() => changePlayer(entry.id)}>
          {entry.squadra[0] ? <CreaturePortrait pokemon={entry.squadra[0]} /> : <KitIcon id="icon-home" />}
          <span>{entry.nome || `Giocatore ${entry.id}`} · G{entry.id}</span>
        </StudioCommand>)}
      </div>
      <div className="pu-currency" aria-label={`Monete di G${playerId}: ${player.monete}`}><KitIcon id="item-coin" /><div><strong>{formatNumber(player.monete)} ₳</strong><span>Monete</span></div></div>
    </div>

    <nav className="pu-nav" aria-label="Schermate del giocatore">
      <KitFrame id="panel-wide" />
      {PLAYER_UI_SCREENS.map(id => <KitButton data-ui-id={`nav.${id === 'partita' ? 'menu' : id}`} className="pu-nav-button" key={id} active={!visibleTool && screen === id} disabled={!!context && id !== 'partita'}
        aria-pressed={!visibleTool && screen === id} onClick={() => navigate(id)}><KitIcon id={screens[id].icon} />{screens[id].label}</KitButton>)}
    </nav>

    <div className="pu-page-head"><div><span className="pu-kicker">{visibleTool ? 'Strumenti della partita' : page.kicker}</span>{visibleTool ? <h2>{toolLabel}</h2> : <h1>{page.title}</h1>}
      <p>{visibleTool ? 'Salvataggi, progressi e opzioni della tua avventura.' : page.description}</p></div>
      <div className="pu-player-context"><KitFrame id="card-default" /><KitIcon id={visibleTool ? auxiliary.find(entry => entry.id === visibleTool)!.icon : page.icon} />
        <div><small>Giocatore selezionato</small><strong>G{playerId} · {player.nome || `Giocatore ${playerId}`}</strong></div>
      </div>
    </div>

    {context && <p className="pu-challenge-notice" role="status">Sfida in corso · seed {context.session.seed}. La campagna è conservata separatamente; deposito, oggetti e acquisti restano bloccati.</p>}
    <main className={`pu-content ${visibleTool ? 'pu-content-auxiliary' : ''}`}>
      <Suspense fallback={<p role="status" className="pu-loading">Caricamento…</p>}>
        {visibleTool === 'settings' ? <GameSettingsPanel />
          : visibleTool === 'challenges' ? <ChallengePanel activeSession={context?.session} onLaunch={session => { const result = launchChallenge(session); if (result.ok) onClose(); return result }} />
          : visibleTool === 'race' || visibleTool === 'recap' ? <RaceScreen recap={visibleTool === 'recap'} />
          : visibleTool === 'register' || visibleTool === 'journal' || visibleTool === 'match' || visibleTool === 'chronicles'
            ? <RegisterScreen key={`${visibleTool}-${playerId}`} playerId={playerId} initialTab={visibleTool === 'register' ? 'match' : visibleTool} />
          : visibleTool === 'backup' ? <BackupPanel />
          : blockedScreen ? <p role="status">Questa funzione torna disponibile dopo la sfida.</p>
          : screen === 'partita' ? <MenuScreen playerId={playerId} onAuxiliary={openTool} onNavigate={navigate} onResume={onClose} />
          : screen === 'squadra' ? <TeamScreen playerId={playerId} onAnalyse={analyse} onBag={openBag} onDeposit={() => contextualScreen('deposito')} />
          : screen === 'deposito' ? <DepositScreen playerId={playerId} onAnalyse={analyse} />
          : screen === 'arkadex' ? <ArkadexScreen playerId={playerId} showPlayerPicker={false} />
          : screen === 'analisi' ? <AnalysisScreen playerId={playerId} instanceId={instanceId} />
          : screen === 'borsa' ? <BagScreen playerId={playerId} showPlayerPicker={false} />
          : <StoreScreen playerId={playerId} shopInteractionId={initialShopInteractionId} />}
      </Suspense>
    </main>

    <footer className="pu-footer"><span>Turno di G{activePlayerId}{!context && turn.giocatoreAttivo === playerId ? ` · ${turn.azioniRimaste} azioni disponibili` : ''}</span>
      <span className="pu-keyboard-hint">↑ ↓ Seleziona · Invio Conferma · Esc Indietro</span><PresentManagementControl screen={visibleTool ?? screen} playerId={playerId} instanceId={instanceId} /><StudioCommand className="pu-resume-command" data-ui-id="resume-journey" selected onClick={onClose}><KitIcon id="icon-home" />Riprendi il Viaggio</StudioCommand>
    </footer>
  </div></SplashArtworkProvider>
}
