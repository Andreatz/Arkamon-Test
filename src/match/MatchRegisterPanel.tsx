import { useState } from 'react'
import { ALLENATORI } from '@/data'
import { useGameStore } from '@/store/gameStore'
import { MATCH_EVENT_KINDS, MATCH_EVENT_LABELS, MATCH_LOG_LIMIT, filterMatchEvents, matchEventsAsJson, matchEventsAsText, type MatchEventKind } from './matchLog'
import './match.css'
import { HistoryPagination } from '@/components/ui/HistoryPagination'

function downloadRegister(text: string, format: 'json' | 'txt'): void {
  const url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = `arkamon-registro-${new Date().toISOString().slice(0, 10)}.${format}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Campaign activity is distinct from the battle archive, which retains dice-by-dice replay. */
export function MatchRegisterPanel({ initialPlayerId }: { initialPlayerId?: 1 | 2 } = {}) {
  const log = useGameStore((state) => state.matchLog)
  const player1 = useGameStore((state) => state.giocatore1)
  const player2 = useGameStore((state) => state.giocatore2)
  const position1 = useGameStore((state) => state.posizione1)
  const position2 = useGameStore((state) => state.posizione2)
  const [player, setPlayer] = useState<1 | 2 | 'all'>(initialPlayerId ?? 'all')
  const [kind, setKind] = useState<MatchEventKind | 'all'>('all')
  const [search, setSearch] = useState('')
  const [order, setOrder] = useState<'recent' | 'first'>('recent')
  const [downloadMessage, setDownloadMessage] = useState('')
  const [page, setPage] = useState(0)
  const events = filterMatchEvents(log, { playerId: player, kind, search })
  const ordered = order === 'recent' ? [...events].reverse() : events
  const pageSize = 2
  const currentPage = Math.min(page, Math.max(0, Math.ceil(ordered.length / pageSize) - 1))
  const gyms = new Set(ALLENATORI.filter((trainer) => trainer.tipo === 'Capopalestra').map((trainer) => trainer.id))
  return <section className="match-register" aria-label="Registro del match">
    <div><h2>Registro del match</h2><p>Il percorso della campagna: spostamenti, scoperte, acquisti e risultati dei due giocatori. Le cronache delle battaglie conservano separatamente il dettaglio dei dadi.</p></div>
    <div className="match-overview"><div className="match-summary">{[player1, player2].filter((entry) => player === 'all' || entry.id === player).map((entry) => <article key={entry.id}>
      <h3>G{entry.id} · {entry.nome || `Giocatore ${entry.id}`}</h3><span>{(entry.id === 1 ? position1 : position2).luogo?.replace(/_/g, ' ') ?? 'Posizione non definita'}</span>
      <span>{entry.monete} monete · {entry.squadra.length} in squadra · {Object.keys(entry.deposito).length} in deposito</span>
      <span>{[...entry.allenatoriSconfitti].filter((id) => gyms.has(id)).length} medaglie · {entry.allenatoriSconfitti.size} allenatori sconfitti · {entry.cespugliVisitati.size} cespugli esplorati</span>
    </article>)}</div>
    <div className="match-filters"><label>Giocatore del registro<select value={player} onChange={(event) => setPlayer(event.target.value === 'all' ? 'all' : Number(event.target.value) as 1 | 2)}><option value="all">Entrambi</option><option value={1}>G1 · {player1.nome}</option><option value={2}>G2 · {player2.nome}</option></select></label>
      <label>Tipo di evento<select value={kind} onChange={(event) => setKind(event.target.value as MatchEventKind | 'all')}><option value="all">Tutti gli eventi</option>{MATCH_EVENT_KINDS.map((eventKind) => <option key={eventKind} value={eventKind}>{MATCH_EVENT_LABELS[eventKind]}</option>)}</select></label>
      <label>Ordine degli eventi<select value={order} onChange={(event) => setOrder(event.target.value as 'recent' | 'first')}><option value="recent">Più recenti prima</option><option value="first">Dall’inizio</option></select></label>
      <label className="match-search">Cerca nel registro<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Luogo, risultato o attività" /></label>
    </div>
    <div className="match-export"><button type="button" disabled={!events.length} onClick={() => { downloadRegister(matchEventsAsJson(events), 'json'); setDownloadMessage('Registro JSON esportato con i filtri selezionati.') }}>Esporta registro JSON</button><button type="button" disabled={!events.length} onClick={() => { downloadRegister(matchEventsAsText(events), 'txt'); setDownloadMessage('Registro testo esportato con i filtri selezionati.') }}>Esporta registro testo</button></div>
    <p role="status">{downloadMessage || `${events.length} eventi corrispondenti su ${log.events.length}.`}</p>

    </div><div className="match-history">    {!log.events.length && <p className="match-notice">Non sono ancora state registrate azioni. Nei salvataggi precedenti lo storico non era disponibile; il riepilogo mostra i progressi attuali.</p>}
    {!!log.events.length && !events.length && <p>Nessun evento corrisponde ai filtri selezionati.</p>}
    {log.events.length >= MATCH_LOG_LIMIT && <p className="match-notice">Sono conservati gli ultimi {MATCH_LOG_LIMIT} eventi. Esporta il registro per conservare la cronologia precedente.</p>}<ol className="match-events">{ordered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((event) => <li key={event.id}><div><strong>#{event.sequence} · {event.title}</strong><span>{MATCH_EVENT_LABELS[event.kind]} · {event.playerId ? `G${event.playerId}` : 'Partita'}</span></div><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleString('it-IT')}</time>{event.place && <span>{event.place.replace(/_/g, ' ')}</span>}<p>{event.message}</p></li>)}</ol>
    <HistoryPagination page={currentPage} count={ordered.length} pageSize={pageSize} onPageChange={setPage} label="Pagine degli eventi del match" /></div>
  </section>
}
