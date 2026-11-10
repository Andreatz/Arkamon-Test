import { lazy, Suspense, useMemo, useState } from 'react'
import { POKEMON_BASE, TABELLA_TIPI, getMossa } from '@/data'
import { calcolaHPMax, getMossaAlLivello } from '@/engine/battleEngine'
import { useGameStore } from '@/store/gameStore'
import { assetUrl } from '@/utils/assetUrl'
import { getArkamonAnimationAsset } from '@/components/arkamon/arkamonAnimationManifest'
import type { MossaDef, PokemonIstanza, TipoPokemon } from '@/types'
import {
  arkadexEvolutionLabel, deriveArkadexProgress, getArkadexEntries, getArkadexSpecimens,
  type ArkadexFilter, type ArkadexSnapshot,
} from './arkadexModel'
import './arkadex.css'

const AnimatedArkamon = lazy(async () => ({ default: (await import('@/components/arkamon/ArkamonBattleSprite')).ArkamonBattleSprite }))
const statusLabels = { unknown: 'Da scoprire', seen: 'Visto', caught: 'Ottenuto' } as const

function moveEffectLabel(move: MossaDef): string {
  switch (move.effetto) {
    case 'CURA': return `Recupera ${move.valoreEffetto ?? 0} HP e cura veleno o paralisi`
    case 'CURA_PCT': return `Recupera ${move.valoreEffetto ?? 0}% degli HP massimi e cura veleno o paralisi`
    case 'PARALISI': return 'Può paralizzare il bersaglio'
    case 'SONNO': return 'Può addormentare il bersaglio'
    case 'VELENO': return 'Può avvelenare il bersaglio'
    case 'CONFUSIONE': return 'Può confondere il bersaglio'
    case 'SUPREMA': return 'Danno doppio; contraccolpo pari a metà degli HP massimi'
    case 'RIDUZIONE': return 'Riduce il danno subito'
    default: return ''
  }
}

/** Browse discoveries without changing progress or requesting 110 large animation sheets. */
export function ArkadexPanel({ initialPlayerId }: { initialPlayerId?: 1 | 2 } = {}) {
  const [playerId, setPlayerId] = useState<1 | 2>(() => initialPlayerId ?? useGameStore.getState().giocatoreAttivo)
  const player1 = useGameStore((state) => state.giocatore1)
  const player2 = useGameStore((state) => state.giocatore2)
  const activePlayerId = useGameStore((state) => state.giocatoreAttivo)
  const battle = useGameStore((state) => state.battaglia)
  const savedProgress = useGameStore((state) => state.arkadex)
  const snapshot: ArkadexSnapshot = useMemo(() => ({ giocatore1: player1, giocatore2: player2, giocatoreAttivo: activePlayerId, battaglia: battle }), [player1, player2, activePlayerId, battle])
  const progress = useMemo(() => deriveArkadexProgress(savedProgress, snapshot), [savedProgress, snapshot])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ArkadexFilter>('all')
  const [type, setType] = useState<TipoPokemon | 'all'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [animatedSpeciesId, setAnimatedSpeciesId] = useState<number | null>(null)
  const entries = getArkadexEntries(progress, playerId, { search, status, type })
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries.find((entry) => entry.status !== 'unknown') ?? entries[0]
  const specimens = selected ? getArkadexSpecimens(snapshot, playerId, selected.id) : []
  const specimen = specimens.find((entry) => entry.pokemon.istanzaId === selectedInstanceId) ?? specimens[0]
  const species = selected?.species
  const pokemon: PokemonIstanza | undefined = species ? specimen?.pokemon ?? {
    istanzaId: 'arkadex-reference', specieId: species.id, nome: species.nome, livello: 5, hp: species.hpBase, xp: 0,
  } : undefined
  const player = playerId === 1 ? player1 : player2
  const seen = progress[playerId === 1 ? 'seen1' : 'seen2'].length
  const caught = progress[playerId === 1 ? 'caught1' : 'caught2'].length
  const animated = !!species && animatedSpeciesId === species.id && !!getArkamonAnimationAsset(species.id, 'front', 'idle')
  return <section className="arkadex-panel" aria-label="Arkadex">
    <div><h2>Arkadex</h2><p>Le {POKEMON_BASE.length} specie del mondo di Arkamon. Ogni giocatore conserva le proprie scoperte.</p></div>
    <label>Giocatore dell’Arkadex<select value={playerId} onChange={(event) => { setPlayerId(Number(event.target.value) as 1 | 2); setSelectedInstanceId(null); setAnimatedSpeciesId(null) }}>
      <option value={1}>G1 · {player1.nome || 'Giocatore 1'}</option><option value={2}>G2 · {player2.nome || 'Giocatore 2'}</option>
    </select></label>
    <p className="arkadex-counts"><strong>{player.nome || `Giocatore ${playerId}`}</strong><span>{seen} / {POKEMON_BASE.length} viste · {caught} / {POKEMON_BASE.length} ottenute</span></p>
    <div className="arkadex-filters">
      <label>Cerca specie scoperta o numero<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome o numero" /></label>
      <label>Scoperta<select aria-label="Scoperta" value={status} onChange={(event) => setStatus(event.target.value as ArkadexFilter)}><option value="all">Tutte</option><option value="unknown">Da scoprire</option><option value="seen">Viste, ancora da ottenere</option><option value="caught">Ottenute</option></select></label>
      <label>Tipo conosciuto<select aria-label="Tipo conosciuto" value={type} onChange={(event) => setType(event.target.value as TipoPokemon | 'all')}><option value="all">Tutti i tipi</option>{TABELLA_TIPI.tipi.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
    </div>
    <p role="status" className="arkadex-result-count">{entries.length} schede corrispondenti. I filtri per nome e tipo includono soltanto specie già scoperte.</p>
    <div className="arkadex-layout">
      <div className="arkadex-grid" aria-label="Specie dell’Arkadex">{entries.map((entry) => <button type="button" key={entry.id} aria-pressed={selected?.id === entry.id} aria-label={`Numero ${entry.id}: ${entry.species?.nome ?? 'specie da scoprire'} · ${statusLabels[entry.status]}`} onClick={() => { setSelectedId(entry.id); setSelectedInstanceId(null); setAnimatedSpeciesId(null) }}>
        {entry.species ? <img loading="lazy" decoding="async" src={assetUrl(`/sprites/small_sprites/Sprite Small ${entry.id}.png`)} alt="" /> : <span className="arkadex-silhouette" aria-hidden="true">?</span>}
        <span>#{String(entry.id).padStart(3, '0')}</span><strong>{entry.species?.nome ?? '???'}</strong><small>{statusLabels[entry.status]}</small>
      </button>)}</div>
      {!selected ? <p className="arkadex-detail">Nessuna specie corrisponde ai filtri scelti.</p> : !species || !pokemon ? <article className="arkadex-detail" aria-label="Scheda da scoprire"><span className="arkadex-silhouette arkadex-silhouette--large" aria-hidden="true">?</span><h3>#{String(selected.id).padStart(3, '0')} · Specie da scoprire</h3><p>Incontra questa specie durante la partita per rivelarne nome, tipo e mosse.</p></article> : <article className="arkadex-detail" aria-label={`Scheda di ${species.nome}`}>
        <div className="arkadex-art">{animated ? <Suspense fallback={<p>Caricamento animazione…</p>}><AnimatedArkamon speciesId={species.id} name={species.nome} side="front" animation="idle" /></Suspense> : <img loading="lazy" decoding="async" src={assetUrl(`/sprites/front_sprites/${species.id}.png`)} alt={species.nome} />}</div>
        <h3>#{String(species.id).padStart(3, '0')} · {species.nome}</h3><p>{species.tipo} · {species.categoria} · {statusLabels[selected.status]}</p>
        {!!getArkamonAnimationAsset(species.id, 'front', 'idle') && <button type="button" onClick={() => setAnimatedSpeciesId(animated ? null : species.id)} aria-pressed={animated}>{animated ? 'Ferma animazione' : 'Mostra animazione'}</button>}
        {specimens.length > 1 && <label>Esemplare<select value={specimen?.pokemon.istanzaId} onChange={(event) => setSelectedInstanceId(event.target.value)}>{specimens.map((entry) => <option key={`${entry.source}-${entry.pokemon.istanzaId}`} value={entry.pokemon.istanzaId}>{entry.pokemon.nome} · Lv. {entry.pokemon.livello} · {entry.source}</option>)}</select></label>}
        <p>{specimen ? `Esemplare in ${specimen.source}: ${pokemon.nome}, livello ${pokemon.livello}.` : 'Dati di riferimento al livello 5: nessun esemplare di questa specie disponibile.'}</p>
        <dl className="arkadex-stats"><div><dt>HP massimi</dt><dd>{calcolaHPMax(pokemon)}</dd></div><div><dt>HP attuali</dt><dd>{specimen ? pokemon.hp : '—'}</dd></div><div><dt>Tasso cattura</dt><dd>{species.tassoCattura} / 5</dd></div></dl>
        {specimen && <p>Status: {pokemon.stato?.tipo ?? 'nessuno'}.</p>}
        <h4>Mosse al livello {pokemon.livello}</h4><ul className="arkadex-moves">{species.mosse.filter((id) => id > 0).map((id) => {
          const move = getMossa(id)
          if (!move) return null
          const stats = getMossaAlLivello(move, pokemon.livello)
          const effect = moveEffectLabel(move)
          return <li key={id}><strong>{move.nome} · {move.tipo}</strong><span>{move.soloStato ? 'Mossa di status' : move.effetto === 'CURA' || move.effetto === 'CURA_PCT' ? 'Mossa di cura' : `${stats.dadi}d6 ${stats.incremento >= 0 ? '+' : '−'} ${Math.abs(stats.incremento)}`}{effect && ` · ${effect}`}</span></li>
        })}</ul><p>{arkadexEvolutionLabel(species, progress, playerId)}</p>
      </article>}
    </div>
  </section>
}
