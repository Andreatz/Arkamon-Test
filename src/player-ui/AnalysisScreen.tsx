import { usePlayerUiMemory, usePublishPlayerUiSelection } from './playerUiSession'
import { useContext, useEffect } from 'react'
import { UiPreviewViewContext } from '@/ui-studio/UiPreviewViewContext'
import { getPokemon, TABELLA_TIPI } from '@data/index'
import { calcolaHPMax } from '@engine/battleEngine'
import { useGameStore } from '@store/gameStore'
import { HealthBar, KitButton, KitIcon, KitPanel, PokemonHero, PokemonMoves, TypeBadge } from './kit'
import { liveOwnedPokemon } from './currentRoster'

export interface AnalysisScreenProps { playerId: 1 | 2; instanceId?: string }
type AnalysisTab = 'scheda' | 'mosse' | 'status'

export function AnalysisScreen(props: AnalysisScreenProps) {
  return <PlayerAnalysisScreen key={`${props.playerId}:${props.instanceId ?? ''}`} {...props} />
}

function PlayerAnalysisScreen({ playerId, instanceId }: AnalysisScreenProps) {
  const previewView = useContext(UiPreviewViewContext)
  const player = useGameStore((state) => playerId === 1 ? state.giocatore1 : state.giocatore2)
  const battle = useGameStore((state) => state.battaglia)
  const [chosenId, setChosenId] = usePlayerUiMemory(playerId, 'analysis.instance', () => instanceId ?? '')
  const [tab, setTab] = usePlayerUiMemory<AnalysisTab>(playerId, 'analysis.tab', previewView === 'mosse' || previewView === 'status' ? previewView : 'scheda')
  useEffect(() => { if (instanceId) setChosenId(instanceId) }, [instanceId, setChosenId])
  useEffect(() => { if (previewView === 'mosse' || previewView === 'status') setTab(previewView) }, [previewView, setTab])
  const owned = [...player.squadra, ...Object.values(player.deposito)]
  const selected = owned.find((pokemon) => pokemon.istanzaId === chosenId) ?? owned[0]
  const pokemon = selected ? liveOwnedPokemon(selected, battle) : undefined
  const species = pokemon ? getPokemon(pokemon.specieId) : undefined
  const teamIndex = pokemon ? player.squadra.findIndex((entry) => entry.istanzaId === pokemon.istanzaId) : -1
  const depositEntry = pokemon ? Object.entries(player.deposito).find(([, entry]) => entry.istanzaId === pokemon.istanzaId) : undefined
  const evolution = species?.evoluzioneId ? getPokemon(species.evoluzioneId) : undefined
  const status = pokemon?.stato
  usePublishPlayerUiSelection(playerId, { instanceId: pokemon?.istanzaId, speciesId: pokemon?.specieId })

  return (
    <section className="pu-screen pu-analysis-screen" aria-labelledby="pu-analysis-title" data-ui-view={tab}>
      <header className="pu-screen-heading">
        <div><p className="pu-kicker">Scheda del compagno · {player.nome}</p><h1 id="pu-analysis-title">Analisi Arkamon</h1><p>Conosci il tuo compagno. Prepara la prossima mossa.</p></div>
        <label className="pu-analysis-selector">Arkamon da analizzare
          <select value={selected?.istanzaId ?? ''} disabled={!owned.length} onChange={(event) => setChosenId(event.target.value)}>
            {!owned.length && <option value="">Nessun Arkamon</option>}
            {player.squadra.map((entry, index) => <option key={entry.istanzaId} value={entry.istanzaId}>Squadra {index + 1} · {entry.nome} · Lv. {entry.livello}</option>)}
            {Object.entries(player.deposito).map(([slot, entry]) => <option key={entry.istanzaId} value={entry.istanzaId}>Box {slot.replace(':', ', posto ')} · {entry.nome} · Lv. {entry.livello}</option>)}
          </select>
        </label>
      </header>
      {pokemon ? <div className="pu-analysis-layout">
        <div className="pu-hero-column"><PokemonHero pokemon={pokemon} /></div>
        <KitPanel className="pu-detail-panel">
          <nav className="pu-tabs" aria-label="Sezioni analisi Arkamon">
            {([['scheda', 'Scheda'], ['mosse', 'Mosse'], ['status', 'Status e cure']] as const).map(([key, label]) => <KitButton key={key} active={tab === key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</KitButton>)}
          </nav>
          <p className="pu-kicker">{teamIndex >= 0 ? `La tua squadra · Posto ${teamIndex + 1}` : `Deposito · Box ${depositEntry?.[0].replace(':', ', posto ') ?? ''}`} · N° {String(pokemon.specieId).padStart(3, '0')}</p>
          <div className="pu-detail-heading"><h2>{pokemon.nome}</h2>{species && <TypeBadge type={species.tipo} />}</div>
          {tab === 'scheda' && <>
            <div className="pu-stat-grid">
              <div className="pu-stat"><span>Livello</span><strong>{pokemon.livello}</strong></div>
              <div className="pu-stat"><span>Punti vita</span><strong>{pokemon.hp} / {calcolaHPMax(pokemon)}</strong></div>
              <div className="pu-stat"><span>Crescita</span><strong>{species?.categoria ?? 'Non disponibile'}</strong></div>
            </div>
            <HealthBar pokemon={pokemon} />
            <dl className="pu-data-list pu-analysis-facts">
              <div><dt>Specie</dt><dd>{species?.nome ?? pokemon.nome}</dd></div>
              <div><dt>Prossima evoluzione</dt><dd>{evolution && species?.livelloEvoluzione ? `${evolution.nome} · Lv. ${species.livelloEvoluzione}` : 'Forma finale'}</dd></div>
              <div><dt>Condizione</dt><dd>{pokemon.hp <= 0 ? 'KO' : status?.tipo ?? 'In salute'}</dd></div>
            </dl>
          </>}
          {tab === 'mosse' && <>
            <h3>Mosse disponibili al livello {pokemon.livello}</h3><PokemonMoves pokemon={pokemon} detailed />
            <KitPanel className="pu-note pu-supreme-note"><KitIcon id="icon-activity" /><div><strong>Mossa Suprema · potenza doppia</strong><p>Danno al bersaglio e salita di livello prima del contraccolpo: metà degli HP massimi. Nel doppio KO vince l’attaccante.</p></div></KitPanel>
          </>}
          {tab === 'status' && <>
            <h3>{pokemon.hp <= 0 ? 'Arkamon esausto' : status?.tipo ?? 'In salute'}</h3><HealthBar pokemon={pokemon} />
            {status?.tipo === 'Paralizzato' && <p className="pu-note">Agisce per secondo. Con 1–2 sul d6 non attacca; con 3–6 attacca. La paralisi termina soltanto con una mossa di cura o un oggetto.</p>}
            {status?.tipo === 'Addormentato' && <p className="pu-note">Turni di sonno rimasti: {status.turniRimanenti}. Il primo turno è obbligatorio; dal secondo un 4–6 sul d6 permette di svegliarsi.</p>}
            {status?.tipo === 'Avvelenato' && <p className="pu-note">Turni di veleno già trascorsi: {status.turniTrascorsi ?? 0}. Il danno cresce dal 10% degli HP massimi di altri 10 punti percentuali ogni turno.</p>}
            {status?.tipo === 'Confuso' && <p className="pu-note">La confusione influenza l’azione durante la battaglia.</p>}
            {!status && pokemon.hp > 0 && <p className="pu-note">Nessuno stato alterato attivo.</p>}
            <p className="pu-note">Gli HP residui vengono conservati. Consulta la borsa per usare una cura, oppure raggiungi un Centro Arkamon.</p>
            {species && <div className="pu-status-affinities"><h3>Affinità difensive</h3><div className="pu-affinity-grid pu-affinity-compact">{TABELLA_TIPI.tipi.map((type) => <div key={type}><TypeBadge type={type} /><strong>×{TABELLA_TIPI.efficacia[type]?.[species.tipo] ?? 1}</strong></div>)}</div><p className="pu-note">Danno ricevuto per tipo di attacco.</p></div>}
          </>}
        </KitPanel>
      </div> : <KitPanel className="pu-empty-state"><KitIcon id="icon-analysis" /><h2>Nessun Arkamon da analizzare</h2><p>La scheda sarà disponibile dopo la scelta del tuo starter o una cattura.</p></KitPanel>}
    </section>
  )
}
