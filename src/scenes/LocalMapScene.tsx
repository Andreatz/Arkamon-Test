import { GameButton } from '@/components/ui/GameButton'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LocalMapBoard, type LocalMapPlayer } from '@/components/map/LocalMapBoard'
import { getLocalMap, type LocalMapDefinition } from '@/data/localMaps'
import { SECRET_LOCATION_ID, SECRET_LOCATION_ORIGIN, canAccessSecretLocation, hasUnlockedSecretLocation } from '@/data/secretLocation'
import { getAdjacentLocalMapNodes, getLocalMapNode } from '@/engine/localMapMovement'
import { useGameStore } from '@/store/gameStore'
import { useSceneInputBlocked } from '@/components/transitions/SceneNavigationContext'
import { makeDialogBackgroundInert } from '@/components/battle/modalFocus'
import { useInteractionStore } from '@/interactions/interactionStore'
import { ConfiguredInteractionPanel } from '@/interactions/ConfiguredInteractionPanel'
import { TurnSummary } from '@/journal/TurnSummary'
import { useAdminStore } from '@/store/adminStore'
import './localMapScene.css'
import { isReferenceUi } from '@/player-ui/reference/referenceTheme'
import { CreaturePortrait, HealthBar, KitIcon } from '@/player-ui/kit'
import { assetUrl } from '@/utils/assetUrl'
import { openPlayerUi } from '@/player-ui/navigation'
import './referenceLocalMap.css'

function ActivityDialog({ open, onClose, children, title = 'Attività del luogo' }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const release = makeDialogBackgroundInert(element)
    close.current?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const controls = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((control) => control.getClientRects().length)
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    element.addEventListener('keydown', keyboard)
    return () => { element.removeEventListener('keydown', keyboard); release(); before?.focus() }
  }, [open, onClose])
  return <div ref={dialog} hidden={!open} role="dialog" aria-modal="true" aria-label={title} className="local-map-activities">
    <header><div><h2>{title}</h2><p>Un’interazione conclude il turno.</p></div><GameButton ref={close} onClick={onClose}>Chiudi attività</GameButton></header>
    <div className="local-map-activities-content">{children}</div>
  </div>
}

/** Le azioni sono condivise con la mappa principale; cambiare vista non spende un'azione. */
export function LocalMapScene({ map, activities }: { map: LocalMapDefinition; activities: ReactNode }) {
  const actor = useGameStore((s) => s.giocatoreAttivo)
  const turn = useGameStore((s) => s.turnoOverworld)
  const world1 = useGameStore((s) => s.posizione1)
  const world2 = useGameStore((s) => s.posizione2)
  const positions1 = useGameStore((s) => s.posizioniLocali1)
  const positions2 = useGameStore((s) => s.posizioniLocali2)
  const player1 = useGameStore((s) => s.giocatore1)
  const player2 = useGameStore((s) => s.giocatore2)
  const battle = useGameStore((s) => s.battaglia)
  const definitions = useInteractionStore((s) => s.interactions)
  const initialize = useGameStore((s) => s.inizializzaPosizioneLocale)
  const move = useGameStore((s) => s.muoviAvatarMappaLocale)
  const pass = useGameStore((s) => s.passaTurnoMappaLocale)
  const navigate = useGameStore((s) => s.vaiAScena)
  const crossSecretPassage = useGameStore((s) => s.attraversaPassaggioSegreto)
  const blocked = useSceneInputBlocked()
  const [activitiesOpen, setActivitiesOpen] = useState(false)
  const closeActivities = useCallback(() => setActivitiesOpen(false), [])
  useEffect(() => {
    const openGmActivities = () => { if (useAdminStore.getState().enabled && !blocked) setActivitiesOpen(true) }
    window.addEventListener('arkamon:gm-activities', openGmActivities)
    return () => window.removeEventListener('arkamon:gm-activities', openGmActivities)
  }, [blocked])
  const [selected, setSelected] = useState<string | null>(null)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const closeInteraction = useCallback(() => setInteractionOpen(false), [])
  const samePlace = (world: typeof world1) => world.mappaId === 'mappa-principale' && world.luogo === map.id
  const allowedPlayer = (world: typeof world1, player: typeof player1) => samePlace(world)
    && (map.id !== SECRET_LOCATION_ID || canAccessSecretLocation(player, world))

  useEffect(() => {
    if (allowedPlayer(world1, player1)) initialize(1, map.id)
    if (allowedPlayer(world2, player2)) initialize(2, map.id)
    setSelected(null)
    setActivitiesOpen(false)
    setInteractionOpen(false)
  }, [map.id, world1.luogo, world1.mappaId, world2.luogo, world2.mappaId, initialize, actor])

  const players: LocalMapPlayer[] = []
  if (allowedPlayer(world1, player1)) players.push({ id: 1, name: player1.nome, nodeId: getLocalMapNode(map, positions1[map.id]).id })
  if (allowedPlayer(world2, player2)) players.push({ id: 2, name: player2.nome, nodeId: getLocalMapNode(map, positions2[map.id]).id })
  const current = players.find((p) => p.id === actor)
  const remaining = turn.giocatoreAttivo === actor ? turn.azioniRimaste : 0
  const canMove = !!current && remaining > 0 && !blocked && !battle
  const adjacent = current ? getAdjacentLocalMapNodes(map, current.nodeId) : []
  const currentNode = current ? getLocalMapNode(map, current.nodeId) : null
  const pointInteractions = definitions.filter((entry) => entry.enabled && entry.mapId === map.id && entry.nodeId === currentNode?.id)
  const interactionLabels = Object.fromEntries(definitions.filter((entry) => entry.enabled && entry.mapId === map.id).map((entry) => [entry.nodeId, entry.title]))
  const nodeLabel = (id: string) => getLocalMapNode(map, id).label ?? id
  const player = actor === 1 ? player1 : player2
  const actorWorld = actor === 1 ? world1 : world2
  const secret = map.id === SECRET_LOCATION_ID
  const secretAccess = canAccessSecretLocation(player, actorWorld)
  const secretPassageVisible = map.id === SECRET_LOCATION_ORIGIN && !!current && hasUnlockedSecretLocation(player)
  const moveTo = (id: string) => {
    if (!canMove) return false
    const moved = move(actor, map.id, id)
    if (moved) setSelected(null)
    return moved
  }
  const passTurn = () => {
    if (blocked) return
    useGameStore.getState().eseguiTransazione(read => {
      if (!pass()) return
      const state = read()
      const world = state.giocatoreAttivo === 1 ? state.posizione1 : state.posizione2
      const target = world.mappaId === 'mappa-principale' ? getLocalMap(world.luogo ?? '') : undefined
      if (target && state.apriMappaLocale(state.giocatoreAttivo, target.id)) {
        navigate(target.id.startsWith('Percorso_') ? 'percorso' : 'citta', { luogo: target.id })
      } else navigate('mappa-principale')
    })
  }

  if (secret && !secretAccess) return <section className="local-map-scene" aria-label="Luogo non disponibile">
    <p>Questo luogo non è disponibile per il giocatore attivo.</p>
    <GameButton onClick={() => navigate('mappa-principale')}>Mappa principale</GameButton>
  </section>

  return <section className="local-map-scene" data-reference-ui={isReferenceUi() ? 'aurora' : undefined} aria-label={`Esplorazione ${map.id.replace(/_/g, ' ')}`}>
    <header className="local-map-toolbar">
      <GameButton disabled={blocked} onClick={() => navigate('mappa-principale')}>{secret ? '← Passaggio di ritorno' : '← Mappa principale'}</GameButton>
      <div className="local-map-heading"><h1>{map.id.replace(/_/g, ' ')}</h1><span>G{actor} · {player.nome}</span></div>
      <span className="local-map-budget" role="status">{remaining} {remaining === 1 ? 'azione' : 'azioni'}</span>
      {isReferenceUi() && <div className="ref-local-players" aria-label="Giocatori">{[player1,player2].map(owner=><span key={owner.id} data-active={owner.id===actor}><img src={assetUrl(`/ui/player${owner.id}_avatar.png`)} alt=""/><span>{owner.nome || `Giocatore ${owner.id}`} · G{owner.id}<small>{owner.id===actor?'Turno attuale':'In attesa'}</small></span></span>)}</div>}
      {(secretPassageVisible || secret) && <GameButton
        disabled={!canMove || activitiesOpen || interactionOpen} onClick={() => { if (!blocked) crossSecretPassage(actor) }}>
        {secret ? 'Torna a Roma' : 'Passaggio segreto'} · 1 movimento
      </GameButton>}
      <GameButton tone="primary" disabled={blocked} onClick={passTurn}>Passa turno</GameButton>
    </header>
    <div className="local-map-play-area">
      <LocalMapBoard map={map} players={players} activePlayerId={actor} remainingActions={remaining} canMove={canMove}
        inputBlocked={blocked || activitiesOpen || interactionOpen} interactionLabels={interactionLabels} onMove={moveTo} onSelectNode={(id) => {
          setSelected(id)
          if (definitions.some((entry) => entry.enabled && entry.mapId === map.id && entry.nodeId === id)) setInteractionOpen(true)
        }} />
    </div>
    <footer className="local-map-footer">
      {isReferenceUi() && <div className="ref-local-squad" aria-label={`Squadra di ${player.nome}`}>{player.squadra.map(pokemon=><button type="button" key={pokemon.istanzaId} onClick={()=>openPlayerUi('squadra',{playerId:actor,instanceId:pokemon.istanzaId})} aria-label={`Apri squadra: ${pokemon.nome}`}><CreaturePortrait pokemon={pokemon}/><strong>{pokemon.nome}</strong><span>Lv. {pokemon.livello}</span><HealthBar pokemon={pokemon}/></button>)}</div>}
      <div className="local-map-point-info" role="status">
        {currentNode ? <><strong>{pointInteractions[0]?.title ?? nodeLabel(selected ?? currentNode.id)}</strong><span>{pointInteractions.length ? `${pointInteractions.length} interazioni disponibili sul punto` : 'Nessuna interazione configurata sul punto'}</span></> : <span>Questo giocatore si trova in un altro luogo.</span>}
      </div>
      <nav aria-label="Punti raggiungibili" className="local-map-neighbours">
        {adjacent.map((id) => <GameButton key={id} disabled={!canMove} onClick={() => moveTo(id)}>Vai a {nodeLabel(id)} · 1 azione</GameButton>)}
      </nav>
      {pointInteractions.length > 0 && <GameButton disabled={blocked} onClick={() => setInteractionOpen(true)}>Interagisci sul punto</GameButton>}
      <p>{remaining > 0 ? 'Due movimenti, oppure un movimento e un’interazione.' : 'Turno concluso. Passa il controllo all’altro giocatore.'}</p>
      <TurnSummary />
      {isReferenceUi() && <button type="button" className="ref-local-menu" onClick={()=>openPlayerUi('partita',{playerId:actor})}><KitIcon id="icon-home"/>Menù</button>}
    </footer>
    <ActivityDialog open={activitiesOpen} onClose={closeActivities} title="Scorciatoie del Game Master">{activities}</ActivityDialog>
    {currentNode && <ActivityDialog open={interactionOpen} onClose={closeInteraction} title="Interazioni del punto">
      <ConfiguredInteractionPanel mapId={map.id} nodeId={currentNode.id} inputBlocked={blocked} onShopOpened={closeInteraction} />
    </ActivityDialog>}
  </section>
}
