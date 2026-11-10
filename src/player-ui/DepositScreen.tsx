import { SpatialNavigation } from '@/components/rpg/SpatialNavigation'
import { usePlayerUiMemory, usePublishPlayerUiSelection } from './playerUiSession'
import { useState } from 'react'
import { getPokemon, TABELLA_TIPI } from '@data/index'
import { BOX_COUNT, SLOT_PER_BOX, SQUADRA_MAX, chiaveDeposito, getInSlot, type SlotRef } from '@engine/deposito'
import { isTeamWithinLevelCap, teamLevelRange } from '@/engine/teamLevelCap'
import { useGameStore } from '@store/gameStore'
import { CreaturePortrait, HealthBar, KitButton, KitFrame, KitIcon, KitPanel, PokemonHero } from './kit'
import { canManagePlayerTeam } from '@/store/game/commandPolicy'
import { liveOwnedPokemon } from './currentRoster'
import { EMPTY_DEPOSIT_FILTERS, matchesDepositFilters, previewDepositSwap, type DepositFilters } from './depositTools'

export interface DepositScreenProps { playerId: 1 | 2; onAnalyse?: (instanceId: string) => void }

function sameSlot(a: SlotRef | null, b: SlotRef): boolean {
  if (!a || a.tipo !== b.tipo) return false
  return a.tipo === 'squadra' && b.tipo === 'squadra' ? a.indice === b.indice
    : a.tipo === 'deposito' && b.tipo === 'deposito' && a.chiave === b.chiave
}

export function DepositScreen(props: DepositScreenProps) {
  return <PlayerDepositScreen key={props.playerId} {...props} />
}

function PlayerDepositScreen({ playerId, onAnalyse }: DepositScreenProps) {
  const player = useGameStore((state) => playerId === 1 ? state.giocatore1 : state.giocatore2)
  const battle = useGameStore((state) => state.battaglia)
  const mayManage = useGameStore((state) => canManagePlayerTeam(state, playerId))
  const leagueRunning = useGameStore((state) => Object.values(state.league?.players ?? {}).some(progress => progress.status === 'running'))
  const [box, setBox] = usePlayerUiMemory(playerId, 'deposit.box', 1)
  const [selection, setSelection] = usePlayerUiMemory<SlotRef | null>(playerId, 'deposit.slot', () => {
    const firstKey = Array.from({ length: SLOT_PER_BOX }, (_, index) => chiaveDeposito(box, index + 1))
      .find((key) => player.deposito[key])
    return firstKey ? { tipo: 'deposito', chiave: firstKey }
      : player.squadra.length ? { tipo: 'squadra', indice: 0 } : null
  })
  const [moving, setMoving] = useState(false)
  const [message, setMessage] = useState('')
  const [filters, setFilters] = usePlayerUiMemory<DepositFilters>(playerId, 'deposit.filters', EMPTY_DEPOSIT_FILTERS)
  const [previewTarget, setPreviewTarget] = useState<SlotRef | null>(null)
  const selected = selection ? getInSlot(player.squadra, player.deposito, selection) : undefined
  const pokemon = selected ? liveOwnedPokemon(selected, battle) : undefined
  const species = pokemon ? getPokemon(pokemon.specieId) : undefined
  usePublishPlayerUiSelection(playerId, { instanceId: pokemon?.istanzaId, speciesId: pokemon?.specieId })
  const previousBox = ((box - 2 + BOX_COUNT) % BOX_COUNT) + 1
  const nextBox = (box % BOX_COUNT) + 1
  const boxCount = Array.from({ length: SLOT_PER_BOX }, (_, index) => !!player.deposito[chiaveDeposito(box, index + 1)]).filter(Boolean).length
  const range = teamLevelRange(player.squadra)
  const filtering = Object.entries(filters).some(([key, value]) => value !== EMPTY_DEPOSIT_FILTERS[key as keyof DepositFilters])
  const matchingEntries = Object.entries(player.deposito).filter(([, entry]) => matchesDepositFilters(liveOwnedPokemon(entry, battle), filters))
  const matchingInBox = matchingEntries.filter(([key]) => key.startsWith(`${box}:`)).length
  const matchingBoxes = [...new Set(matchingEntries.map(([key]) => Number(key.split(':')[0])))].sort((a, b) => a - b)
  const nextMatchingBox = matchingBoxes.find(number => number > box) ?? matchingBoxes[0]
  const swapPreview = moving && selection && previewTarget ? previewDepositSwap(player.squadra, player.deposito, selection, previewTarget) : null
  function changeBox(number: number) { setBox(number); setPreviewTarget(null) }

  function chooseSlot(target: SlotRef) {
    const state = useGameStore.getState()
    const owner = playerId === 1 ? state.giocatore1 : state.giocatore2
    if (!moving || !selection) {
      setSelection(getInSlot(owner.squadra, owner.deposito, target) ? target : null)
      setMessage('')
      setPreviewTarget(null)
      return
    }
    if (!canManagePlayerTeam(state, playerId)) {
      setMoving(false)
      setMessage('Le modifiche al deposito sono disponibili durante il tuo turno, fuori dalla battaglia.')
      return
    }
    if (sameSlot(selection, target)) {
      setMoving(false)
      return
    }
    const before = getInSlot(owner.squadra, owner.deposito, selection)
    if (!before) {
      setSelection(null)
      setMoving(false)
      setMessage('L’Arkamon selezionato non è più in questo posto.')
      return
    }
    const result = state.scambiaSlot(playerId, selection, target)
    const after = useGameStore.getState()
    const updated = playerId === 1 ? after.giocatore1 : after.giocatore2
    // An empty team destination appends to the compact array, regardless of its displayed slot.
    const actualTeamIndex = target.tipo === 'squadra'
      ? updated.squadra.findIndex((entry) => entry.istanzaId === before.istanzaId) : -1
    setMoving(false)
    if (result.ok && result.changed) {
      setSelection(target.tipo === 'squadra'
        ? { tipo: 'squadra', indice: actualTeamIndex }
        : target)
    }
    setMessage(result.message)
  }

  return (
    <section className="pu-screen pu-deposit-screen" aria-labelledby="pu-deposit-title">
      <header className="pu-screen-heading"><div><p className="pu-kicker">Squadra e riserve · {player.nome}</p><h1 id="pu-deposit-title">Deposito Arkamon</h1><p>Un posto per ogni compagno di viaggio.</p></div><span className="pu-count"><KitIcon id="icon-deposit" /> Box {box} / {BOX_COUNT}</span></header>
      <nav className="pu-box-toolbar" aria-label="Box del deposito">
        <KitButton artwork="previous" aria-label={`Vai al box ${previousBox}`} onClick={() => changeBox(previousBox)}>←</KitButton>
        <label>Box <select aria-label="Scegli box del deposito" value={box} onChange={(event) => changeBox(Number(event.target.value))}>{Array.from({ length: BOX_COUNT }, (_, index) => <option key={index + 1} value={index + 1}>Box {index + 1}</option>)}</select></label>
        <KitButton artwork="next" aria-label={`Vai al box ${nextBox}`} onClick={() => changeBox(nextBox)}>→</KitButton>
        {filtering && <KitButton className="pu-next-match" disabled={!nextMatchingBox || nextMatchingBox === box} onClick={() => nextMatchingBox && changeBox(nextMatchingBox)}>Prossimo box con risultati</KitButton>}
        <span>{BOX_COUNT} box · {SLOT_PER_BOX} posti ciascuno</span>
      </nav>
      <div className="pu-deposit-layout">
        <KitPanel className="pu-deposit-grid-panel">
          <div className="pu-panel-heading"><h2>Compagni in riserva</h2><span>{boxCount} / {SLOT_PER_BOX} posti</span></div>
          <div className="pu-deposit-filters" aria-label="Filtri del deposito">
            <label>Nome o numero<input type="search" value={filters.search} placeholder="Cerca Arkamon" onChange={event => setFilters({ ...filters, search: event.target.value })} /></label>
            <label>Tipo<select value={filters.type} onChange={event => setFilters({ ...filters, type: event.target.value as DepositFilters['type'] })}><option value="all">Tutti</option>{TABELLA_TIPI.tipi.map(type => <option key={type}>{type}</option>)}</select></label>
            <label>Condizione<select value={filters.condition} onChange={event => setFilters({ ...filters, condition: event.target.value as DepositFilters['condition'] })}><option value="all">Tutte</option><option value="healthy">In salute</option><option value="status">Status</option><option value="ko">KO</option></select></label>
            <label>Livello min.<input type="number" min={5} max={100} value={filters.minimum} placeholder="5" onChange={event => setFilters({ ...filters, minimum: event.target.value })} /></label>
            <label>Livello max.<input type="number" min={5} max={100} value={filters.maximum} placeholder="100" onChange={event => setFilters({ ...filters, maximum: event.target.value })} /></label>
            <KitButton disabled={!filtering} onClick={() => setFilters(EMPTY_DEPOSIT_FILTERS)}>Azzera filtri</KitButton>
          </div>
          <p className="pu-deposit-filter-result" role="status">{filtering ? `${matchingInBox} risultati in questo box · ${matchingEntries.length} in tutto il deposito. I posti restano nella loro posizione.` : 'Seleziona un compagno. I posti vuoti restano disponibili per gli spostamenti.'}</p>
          <SpatialNavigation columns={7} selectOnFocus={!moving} className="pu-box-grid" role="group" aria-label={`Contenuto del box ${box}`}>
            {Array.from({ length: SLOT_PER_BOX }, (_, index) => {
              const slot = index + 1
              const key = chiaveDeposito(box, slot)
              const owned = player.deposito[key]
              const occupant = owned ? liveOwnedPokemon(owned, battle) : undefined
              const ref: SlotRef = { tipo: 'deposito', chiave: key }
              const matching = !occupant || matchesDepositFilters(occupant, filters)
              return <button data-rpg-item key={key} type="button" className={`pu-box-slot${sameSlot(selection, ref) ? ' is-selected' : ''}${moving && mayManage ? ' is-move-target' : ''}${matching ? '' : ' is-filtered-out'}`}
                aria-label={`Box ${box}, posto ${slot}: ${occupant ? `${occupant.nome}, livello ${occupant.livello}` : 'vuoto'}`}
                aria-pressed={sameSlot(selection, ref)}
                data-filter-match={matching} title={occupant ? `${occupant.nome} · Lv. ${occupant.livello}${occupant.hp <= 0 ? ' · KO' : occupant.stato ? ` · ${occupant.stato.tipo}` : ''}` : 'Posto libero'}
                onFocus={() => moving && setPreviewTarget(ref)} onMouseEnter={() => moving && setPreviewTarget(ref)}
                onClick={() => chooseSlot(ref)}>
                <KitIcon id={sameSlot(selection, ref) ? 'circle-selected' : 'circle-default'} className="pu-empty-circle" />
                {occupant ? <><CreaturePortrait pokemon={occupant} selected={sameSlot(selection, ref)} /><span className="pu-box-slot-level">Lv. {occupant.livello}</span></> : <span className="pu-empty-slot" aria-hidden="true">{slot}</span>}
              </button>
            })}
          </SpatialNavigation>
          <h3>La tua squadra · {player.squadra.length} / {SQUADRA_MAX}</h3>
          <SpatialNavigation columns={6} selectOnFocus={!moving} className="pu-deposit-team" role="group" aria-label="Squadra">
            {Array.from({ length: SQUADRA_MAX }, (_, index) => {
              const owned = player.squadra[index]
              const occupant = owned ? liveOwnedPokemon(owned, battle) : undefined
              const ref: SlotRef = { tipo: 'squadra', indice: index }
              return <button data-rpg-item key={index} type="button" className={`pu-box-slot pu-deposit-team-slot${sameSlot(selection, ref) ? ' is-selected' : ''}${moving && mayManage ? ' is-move-target' : ''}`}
                aria-label={`Squadra, posto ${index + 1}: ${occupant ? `${occupant.nome}, livello ${occupant.livello}` : 'vuoto'}`}
                aria-pressed={sameSlot(selection, ref)} onClick={() => chooseSlot(ref)}
                onFocus={() => moving && setPreviewTarget(ref)} onMouseEnter={() => moving && setPreviewTarget(ref)}>
                <KitFrame id={sameSlot(selection, ref) ? 'slot-selected' : 'slot-default'} />
                {occupant ? <><CreaturePortrait pokemon={occupant} /><span className="pu-box-slot-level">Lv. {occupant.livello}</span><span className="pu-deposit-team-name">{occupant.nome}</span></> : <span className="pu-empty-slot">Posto {index + 1}</span>}
              </button>
            })}
          </SpatialNavigation>
          <p className="pu-note">{isTeamWithinLevelCap(player.squadra) ? 'Squadra in equilibrio' : 'Squadra fuori fascia'} · Lv. {range.min}–{range.max} · differenza {range.gap} / 5.</p>
        </KitPanel>
        <KitPanel className="pu-detail-panel pu-deposit-detail">
          {pokemon ? <><PokemonHero pokemon={pokemon} /><HealthBar pokemon={pokemon} /><div className="pu-stat-grid pu-stat-grid-pair"><div className="pu-stat"><span>Livello</span><strong>{pokemon.livello}</strong></div><div className="pu-stat"><span>Crescita</span><strong>{species?.categoria ?? '—'}</strong></div></div></>
            : <div className="pu-empty-state"><KitIcon id="icon-deposit" /><h2>Scegli un Arkamon</h2><p>Seleziona un compagno nella squadra o nel box per consultare la sua scheda.</p></div>}
          {mayManage && <p className="pu-note">{moving ? 'Scegli un posto del box o della squadra. Un posto occupato scambia i due Arkamon.' : 'Per spostare un Arkamon, selezionalo e premi «Sposta o scambia».'}</p>}
          {swapPreview && <div className={`pu-swap-preview${swapPreview.allowed ? '' : ' is-blocked'}`} role="status" aria-live="polite">
            <span className="pu-kicker">Squadra dopo lo spostamento</span>
            <strong>{swapPreview.count} / 6 · Lv. {swapPreview.range.min}–{swapPreview.range.max} · Δ {swapPreview.range.gap} / 5</strong>
            <span>{swapPreview.balanced ? 'Fascia valida' : swapPreview.allowed ? 'Rimozione consentita: continua a riordinare la squadra fuori fascia.' : 'Scambio bloccato: supera la differenza massima di 5 livelli.'}</span>
          </div>}
          {!mayManage && <p className="pu-readonly" role="status">{leagueRunning ? 'Consultazione: concludi il tentativo della Lega prima di cambiare squadra.' : 'Consultazione: nessuno scambio durante una battaglia, un’interazione in corso o il turno dell’altro giocatore.'}</p>}
          {message && <p className="pu-note" role="status">{message}</p>}
          <div className="pu-actions">
            <KitButton active disabled={!pokemon || !mayManage} onClick={() => { setMoving(!moving); setMessage(''); setPreviewTarget(null) }}>{moving ? 'Annulla spostamento' : 'Sposta o scambia'}</KitButton>
            {onAnalyse && <KitButton disabled={!pokemon} onClick={() => pokemon && onAnalyse(pokemon.istanzaId)}><KitIcon id="icon-analysis" /> Analizza Arkamon</KitButton>}
          </div>
        </KitPanel>
      </div>
    </section>
  )
}
