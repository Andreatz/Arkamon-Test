import { SpatialNavigation } from '@/components/rpg/SpatialNavigation'
import { usePlayerUiMemory, usePublishPlayerUiSelection } from './playerUiSession'
import { useEffect, useState, type CSSProperties } from 'react'
import { getPokemon } from '@data/index'
import { SQUADRA_MAX } from '@engine/deposito'
import { isTeamWithinLevelCap, teamLevelRange, TEAM_LEVEL_GAP } from '@/engine/teamLevelCap'
import { calcolaHPMax } from '@/engine/battleEngine'
import { useGameStore } from '@store/gameStore'
import { canManagePlayerTeam } from '@/store/game/commandPolicy'
export { canManagePlayerTeam } from '@/store/game/commandPolicy'
import { liveOwnedPokemon } from './currentRoster'
export { liveOwnedPokemon } from './currentRoster'
import { StudioCommand, StudioSurface } from '@/components/ui/StudioArtwork'
import { assetUrl } from '@/utils/assetUrl'
import { CreaturePortrait, HealthBar, KitIcon, PokemonMoves, TypeBadge } from './kit'
import { MENU_SVG_ARTWORK_ENABLED } from './uiAppearancePolicy'
import { isReferenceUi } from './reference/referenceTheme'
import { useSplashArtwork } from './reference/SplashArtworkContext'

const squadCenters = [137.5, 302.5, 467.5, 632.5, 797.5, 962.5]
const teamArtwork = (name: string) => `/ui/studio/Scuro/${name}.svg`

export interface TeamScreenProps {
  playerId: 1 | 2
  onAnalyse: (instanceId: string) => void
  onBag: () => void
  onDeposit: () => void
}

export function TeamScreen(props: TeamScreenProps) {
  return <PlayerTeamScreen key={props.playerId} {...props} />
}

function PlayerTeamScreen({ playerId, onAnalyse, onBag, onDeposit }: TeamScreenProps) {
  const player = useGameStore((state) => playerId === 1 ? state.giocatore1 : state.giocatore2)
  const battle = useGameStore((state) => state.battaglia)
  const mayManage = useGameStore((state) => canManagePlayerTeam(state, playerId))
  const ruleMessage = useGameStore((state) => state.teamRuleMessage)
  const leagueRunning = useGameStore((state) => Object.values(state.league?.players ?? {}).some(progress => progress.status === 'running'))
  const [selectedId, setSelectedId] = usePlayerUiMemory<string | null>(playerId, 'team.instance', null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [navigationColumns, setNavigationColumns] = useState(6)
  const [referenceTab, setReferenceTab] = useState<'riepilogo' | 'mosse' | 'statistiche'>('riepilogo')
  const selected = player.squadra.find((pokemon) => pokemon.istanzaId === selectedId) ?? player.squadra[0]
  const current = selected ? liveOwnedPokemon(selected, battle) : undefined
  const range = teamLevelRange(player.squadra)
  const balanced = isTeamWithinLevelCap(player.squadra)
  const currentSpecies = current ? getPokemon(current.specieId) : undefined
  const reference = isReferenceUi()
  const readySplash = useSplashArtwork()
  const splash = reference && readySplash?.playerId === playerId && readySplash.speciesId === current?.specieId ? readySplash : null
  usePublishPlayerUiSelection(playerId, { instanceId: current?.istanzaId, speciesId: current?.specieId })

  useEffect(() => {
    const compact = window.matchMedia('(max-width: 760px)')
    const update = () => setNavigationColumns(compact.matches ? 3 : 6)
    update()
    compact.addEventListener('change', update)
    return () => compact.removeEventListener('change', update)
  }, [])

  function chooseSlot(index: number) {
    const state = useGameStore.getState()
    const livePlayer = playerId === 1 ? state.giocatore1 : state.giocatore2
    const target = livePlayer.squadra[index]
    if (!movingId) {
      if (target) setSelectedId(target.istanzaId)
      return
    }
    if (!canManagePlayerTeam(state, playerId)) {
      setMovingId(null)
      setMessage('La squadra è in consultazione. Potrai riordinarla durante il tuo turno.')
      return
    }
    const sourceIndex = livePlayer.squadra.findIndex((pokemon) => pokemon.istanzaId === movingId)
    if (sourceIndex < 0 || !target) {
      setMovingId(null)
      setMessage('Scegli un posto occupato per cambiare l’ordine della squadra.')
      return
    }
    if (sourceIndex !== index) {
      const result = state.scambiaSlot(playerId, { tipo: 'squadra', indice: sourceIndex }, { tipo: 'squadra', indice: index })
      setMessage(result.ok ? 'Ordine della squadra aggiornato.' : result.message)
    }
    setMovingId(null)
  }

  if (reference) {
    const evolution = currentSpecies?.evoluzioneId ? getPokemon(currentSpecies.evoluzioneId) : undefined
    const condition = current ? current.hp <= 0 ? 'Esausto' : current.stato?.tipo ?? 'In salute' : 'Nessun compagno selezionato'
    return <section className="pu-screen pu-team-screen pu-live-team pu-reference-team" aria-labelledby="pu-team-title" data-splash-artwork={splash ? 'ready' : undefined}>
      <header className="pu-screen-heading">
        <div><p className="pu-kicker">Compagni di viaggio</p><h1 id="pu-team-title">La tua squadra</h1><p>Scegli un compagno, preparati alla prossima avventura.</p></div>
        <span className="pu-count">G{playerId} · {player.nome} <span aria-hidden="true">◆</span> {player.squadra.length} / {SQUADRA_MAX}</span>
      </header>
      <div className="pu-team-layout pu-reference-team-workspace">
        <aside className="pu-reference-roster" aria-label={`Compagni di ${player.nome}`}>
          <div className="pu-reference-column-heading"><span>La squadra</span><span>{player.squadra.length} / {SQUADRA_MAX}</span></div>
          <SpatialNavigation columns={1} selectOnFocus={!movingId} className="pu-team-list" role="group" aria-label={`Squadra di ${player.nome}`}>
            {Array.from({ length: SQUADRA_MAX }, (_, index) => {
              const owned = player.squadra[index]
              const pokemon = owned ? liveOwnedPokemon(owned, battle) : undefined
              const selectedSlot = !!pokemon && pokemon.istanzaId === current?.istanzaId
              return <button data-rpg-item key={index} type="button"
                className={`pu-team-slot${selectedSlot ? ' is-selected' : ''}${movingId && mayManage && pokemon ? ' is-move-target' : ''}`}
                aria-label={`Squadra, posto ${index + 1}: ${pokemon ? `${pokemon.nome}, livello ${pokemon.livello}` : 'vuoto'}`}
                aria-pressed={selectedSlot} disabled={!pokemon} onClick={() => chooseSlot(index)}>
                <span className="pu-slot-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="pu-live-team-slot-art" aria-hidden="true">{pokemon ? <CreaturePortrait pokemon={pokemon} selected={selectedSlot} /> : <span className="pu-reference-slot-empty">+</span>}</span>
                {pokemon ? <span className="pu-team-slot-content">
                  <span className="pu-team-slot-title"><strong>{pokemon.nome}</strong><span>Lv. {pokemon.livello}</span></span>
                  <HealthBar pokemon={pokemon} />
                  {(pokemon.hp <= 0 || pokemon.stato) && <span className={`pu-reference-slot-status${pokemon.hp <= 0 ? ' is-ko' : ''}`}>{pokemon.hp <= 0 ? 'KO' : pokemon.stato?.tipo}</span>}
                </span> : <span className="pu-empty-slot">Posto libero</span>}
                <span className="pu-reference-slot-arrow" aria-hidden="true">›</span>
              </button>
            })}
          </SpatialNavigation>
          <p className="pu-reference-roster-hint">{movingId ? 'Scegli il compagno con cui scambiare il posto.' : 'Seleziona un Arkamon per conoscerlo meglio.'}</p>
        </aside>

        <div className="pu-hero-column pu-reference-team-stage">
          {current ? <section className="pu-hero" aria-label={`Arkamon selezionato: ${current.nome}`}>
            <div className="pu-reference-hero-title"><span className="pu-species-number">N° {String(current.specieId).padStart(3, '0')}</span><h2>{current.nome}</h2><span className="pu-reference-hero-level">Livello {current.livello}</span></div>
            <div className="pu-reference-portrait-space">
              {splash ? <div className="pu-splash-hero-presence" role="img" aria-label={splash.label} data-splash-species={current.specieId} data-splash-source={splash.src} /> : <>
                <div className="pu-reference-portrait-orbit" aria-hidden="true" />
                <div className="pu-live-team-portrait"><CreaturePortrait pokemon={current} large /></div>
                <span className="pu-reference-portrait-ground" aria-hidden="true" />
              </>}
            </div>
            <div className="pu-hero-caption">{currentSpecies && <TypeBadge type={currentSpecies.tipo} />}<span className={`pu-status-pill${current.hp <= 0 ? ' pu-status-ko' : ''}`}>{condition}</span></div>
            <p className="pu-reference-hero-caption">{currentSpecies?.nome ?? current.nome}<span aria-hidden="true"> · </span>Il tuo compagno di viaggio</p>
          </section> : <div className="pu-empty-state"><h2>Il viaggio sta per cominciare</h2><p>La tua squadra apparirà qui dopo la scelta dello starter.</p></div>}
        </div>

        <section className="pu-team-tactics pu-reference-team-dossier" aria-label="Scheda e comandi del compagno">
          <div className="pu-reference-dossier-title"><span className="pu-kicker">Scheda del compagno</span><span aria-hidden="true">✦</span></div>
          <div className="pu-tabs pu-reference-dossier-tabs" role="tablist" aria-label="Sezioni del compagno">
            {(['riepilogo', 'mosse', 'statistiche'] as const).map(tab => <button type="button" role="tab" key={tab} id={`pu-team-tab-${tab}`} aria-selected={referenceTab === tab} aria-controls="pu-team-dossier-content" className={referenceTab === tab ? 'is-active' : ''} onClick={() => setReferenceTab(tab)}>{tab === 'riepilogo' ? 'Riepilogo' : tab === 'mosse' ? 'Mosse' : 'Statistiche'}</button>)}
          </div>
          <div className="pu-reference-dossier-content" id="pu-team-dossier-content" role="tabpanel" aria-labelledby={`pu-team-tab-${referenceTab}`}>
            {current ? <>
              {referenceTab === 'riepilogo' && <>
                <div className="pu-reference-dossier-name"><h2>{current.nome}</h2><span>Lv. {current.livello}</span></div>
                <div className="pu-reference-dossier-health"><div><span>Punti vita</span><strong>{current.hp} <small>/ {calcolaHPMax(current)} HP</small></strong></div><HealthBar pokemon={current} /></div>
                <dl className="pu-reference-team-facts">
                  <div><dt>Tipo</dt><dd>{currentSpecies && <TypeBadge type={currentSpecies.tipo} />}</dd></div>
                  <div><dt>Condizione</dt><dd>{condition}</dd></div>
                  <div><dt>Crescita</dt><dd>{currentSpecies?.categoria ?? 'Non disponibile'}</dd></div>
                </dl>
                <p className="pu-reference-dossier-note">Gli HP restano dopo ogni scontro. Cura il tuo compagno dalla borsa o presso un Centro Arkamon.</p>
              </>}
              {referenceTab === 'mosse' && <><div className="pu-reference-dossier-name"><h2>Mosse disponibili</h2><span>Lv. {current.livello}</span></div><PokemonMoves pokemon={current} detailed /></>}
              {referenceTab === 'statistiche' && <>
                <div className="pu-reference-dossier-name"><h2>Statistiche</h2><span>N° {String(current.specieId).padStart(3, '0')}</span></div>
                <dl className="pu-reference-team-facts pu-reference-statistics">
                  <div><dt>Specie</dt><dd>{currentSpecies?.nome ?? current.nome}</dd></div>
                  <div><dt>Livello</dt><dd>{current.livello}</dd></div>
                  <div><dt>HP attuali</dt><dd>{current.hp} / {calcolaHPMax(current)}</dd></div>
                  <div><dt>Crescita</dt><dd>{currentSpecies?.categoria ?? 'Non disponibile'}</dd></div>
                  <div><dt>Prossima evoluzione</dt><dd>{evolution && currentSpecies?.livelloEvoluzione ? `${evolution.nome} · Lv. ${currentSpecies.livelloEvoluzione}` : 'Forma finale'}</dd></div>
                </dl>
              </>}
            </> : <p className="pu-empty-copy">Seleziona un compagno dalla tua squadra.</p>}
          </div>
          <div className="pu-actions">
            <StudioCommand selected disabled={!current} onClick={() => current && onAnalyse(current.istanzaId)}>Analizza Arkamon <span aria-hidden="true">›</span></StudioCommand>
            <StudioCommand disabled={!current} onClick={onBag}>Apri borsa</StudioCommand>
            <StudioCommand onClick={onDeposit}>Apri deposito</StudioCommand>
            <StudioCommand disabled={!current || !mayManage} onClick={() => { setMovingId(movingId ? null : current?.istanzaId ?? null); setMessage('') }}>{movingId ? 'Annulla spostamento' : 'Cambia ordine'}</StudioCommand>
          </div>
        </section>
      </div>
      <div className={`pu-team-cap${balanced ? '' : ' pu-warning'}`}>
        <span className="pu-reference-cap-symbol" aria-hidden="true">◇</span>
        <div className="pu-team-cap-copy"><strong>{balanced ? 'Squadra in equilibrio' : 'Squadra fuori fascia'} · Δ {range.gap} livelli</strong><p>{player.squadra.length ? `Fascia attuale: Lv. ${range.min}–${range.max}.` : 'Scegli il tuo starter per iniziare.'} Differenza massima: {TEAM_LEVEL_GAP}.</p></div>
        <div className="pu-team-feedback">
          {!mayManage && <p className="pu-readonly" role="status">{leagueRunning ? 'Consultazione: concludi il tentativo della Lega prima di cambiare squadra.' : 'Consultazione: il riordino è disponibile nel tuo turno, fuori dalla battaglia.'}</p>}
          {(message || (mayManage && ruleMessage)) && <p className="pu-note" role="status">{message || ruleMessage}</p>}
          {movingId && mayManage && <p className="pu-note" role="status">Scegli un altro Arkamon della squadra per scambiare i due posti.</p>}
        </div>
      </div>
    </section>
  }

  return (
    <section className="pu-screen pu-team-screen pu-live-team" aria-labelledby="pu-team-title">
      <header className="pu-screen-heading">
        <div><p className="pu-kicker">Compagni di viaggio</p><h1 id="pu-team-title">La squadra di {player.nome}</h1></div>
        <span className="pu-count"><KitIcon id="icon-team" /> {player.squadra.length} / {SQUADRA_MAX} Arkamon</span>
      </header>
      <div className="pu-team-layout">
        <div className="pu-hero-column">
          {current ? <section className="pu-hero" aria-label={`Arkamon selezionato: ${current.nome}`}>
            <StudioSurface source={teamArtwork('cornice-arkamon')} width={540} height={520} className="pu-live-team-portrait">
              <CreaturePortrait pokemon={current} large />
            </StudioSurface>
            <div className="pu-hero-caption">
              <span className="pu-species-number">ARKA / {String(current.specieId).padStart(3, '0')}</span>
              {currentSpecies && <TypeBadge type={currentSpecies.tipo} />}
              {current.hp <= 0 ? <span className="pu-status-pill pu-status-ko">KO</span>
                : current.stato && <span className="pu-status-pill">{current.stato.tipo}</span>}
            </div>
          </section> : <div className="pu-empty-state"><KitIcon id="icon-team" /><h2>Il viaggio sta per cominciare</h2><p>La tua squadra apparirà qui dopo la scelta dello starter.</p></div>}
        </div>
        <div className="pu-detail-panel">
          <StudioSurface source={teamArtwork('box-2')} width={1060} height={330} className="pu-live-team-facts">
            <div><span>{current ? `LIVELLO ${current.livello}` : 'COMPAGNI DI VIAGGIO'}</span>
              <strong title={current?.nome}>{current?.nome ?? 'La tua squadra'}</strong>
              <small>{current ? current.hp <= 0 ? 'Arkamon esausto' : current.stato?.tipo ?? 'Pronto al viaggio' : 'Nessun Arkamon selezionato'}</small></div>
          </StudioSurface>
          {current && <><HealthBar pokemon={current} /><p className="pu-note pu-live-team-health-note">Gli HP restano dopo ogni scontro. La cura è sempre esplicita.</p></>}
        </div>
        <section className="pu-team-tactics" aria-label="Mosse e comandi del compagno">
          {current && <><h2>Mosse disponibili</h2><PokemonMoves pokemon={current} /></>}
          <div className="pu-actions">
            <StudioCommand selected disabled={!current} onClick={() => current && onAnalyse(current.istanzaId)}><KitIcon id="icon-analysis" /> Analizza Arkamon</StudioCommand>
            <StudioCommand disabled={!current} onClick={onBag}><KitIcon id="icon-bag" /> Apri borsa</StudioCommand>
            <StudioCommand onClick={onDeposit}><KitIcon id="icon-deposit" /> Apri deposito</StudioCommand>
            <StudioCommand disabled={!current || !mayManage} onClick={() => { setMovingId(movingId ? null : current?.istanzaId ?? null); setMessage('') }}>{movingId ? 'Annulla spostamento' : 'Cambia ordine'}</StudioCommand>
          </div>
        </section>
      </div>
      <SpatialNavigation columns={navigationColumns} selectOnFocus={!movingId} className="pu-team-list" role="group" aria-label={`Squadra di ${player.nome}`}>
        <StudioSurface source={teamArtwork('squadra')} width={1100} height={240} className="pu-live-team-strip" />
          {Array.from({ length: SQUADRA_MAX }, (_, index) => {
            const owned = player.squadra[index]
            const pokemon = owned ? liveOwnedPokemon(owned, battle) : undefined
            const species = pokemon ? getPokemon(pokemon.specieId) : undefined
            return (
              <button data-rpg-item key={index} type="button"
                className={`pu-team-slot${pokemon && pokemon.istanzaId === current?.istanzaId ? ' is-selected' : ''}${movingId && mayManage && pokemon ? ' is-move-target' : ''}`}
                style={{ '--team-slot-x': `${squadCenters[index] / 11}%` } as CSSProperties}
                aria-label={`Squadra, posto ${index + 1}: ${pokemon ? `${pokemon.nome}, livello ${pokemon.livello}` : 'vuoto'}`}
                aria-pressed={!!pokemon && pokemon.istanzaId === current?.istanzaId}
                disabled={!pokemon}
                onClick={() => chooseSlot(index)}>
                <span className="pu-live-team-slot-art" aria-hidden="true">{MENU_SVG_ARTWORK_ENABLED && <img className="pu-live-team-slot-frame" src={assetUrl(teamArtwork(pokemon && pokemon.istanzaId === current?.istanzaId ? 'cornice-piccola-selezionata' : 'cornice-piccola'))} alt="" draggable={false} />}
                  {pokemon && <CreaturePortrait pokemon={pokemon} selected={pokemon.istanzaId === current?.istanzaId} />}
                </span>
                <span className="pu-slot-number" aria-hidden="true">{index + 1}</span>
                {pokemon ? <>
                  <span className="pu-team-slot-content">
                    <span className="pu-team-slot-title"><strong>{pokemon.nome}</strong><span>Lv. {pokemon.livello}</span></span>
                    <HealthBar pokemon={pokemon} />
                    <span className="pu-team-slot-meta">
                      {species && <TypeBadge type={species.tipo} />}
                      {pokemon.hp <= 0 ? <span className="pu-status-pill pu-status-ko">KO</span>
                        : pokemon.stato && <span className="pu-status-pill">{pokemon.stato.tipo}</span>}
                    </span>
                  </span>
                </> : <span className="pu-empty-slot">Posto libero</span>}
              </button>
            )
          })}
      </SpatialNavigation>
          <div className={`pu-team-cap${balanced ? '' : ' pu-warning'}`}>
            <KitIcon id="icon-activity" />
            <div className="pu-team-cap-copy"><strong>{balanced ? 'Squadra in equilibrio' : 'Squadra fuori fascia'} · Δ {range.gap} livelli</strong>
              <p>{player.squadra.length ? `Fascia attuale: Lv. ${range.min}–${range.max}.` : 'Scegli il tuo starter per iniziare.'} Differenza massima: {TEAM_LEVEL_GAP}.</p></div>
            <div className="pu-team-feedback">
              {!mayManage && <p className="pu-readonly" role="status">{leagueRunning ? 'Consultazione: concludi il tentativo della Lega prima di cambiare squadra.' : 'Consultazione: il riordino è disponibile nel tuo turno, fuori dalla battaglia.'}</p>}
              {(message || (mayManage && ruleMessage)) && <p className="pu-note" role="status">{message || ruleMessage}</p>}
              {movingId && mayManage && <p className="pu-note" role="status">Scegli un altro Arkamon della squadra per scambiare i due posti.</p>}
            </div>
          </div>
    </section>
  )
}
