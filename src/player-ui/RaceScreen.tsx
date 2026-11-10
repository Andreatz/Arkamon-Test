import { useGameStore } from '@/store/gameStore'
import { useState } from 'react'
import { currentRaceProgress } from '@/readiness/readinessModel'
import { KitButton, KitPanel } from './kit'

export function RaceScreen({ recap = false }: { recap?: boolean }) {
  const game = useGameStore()
  const progress = currentRaceProgress(game)
  const active = progress.find(player => player.id === game.giocatoreAttivo)!
  const [page, setPage] = useState(0)
  const events = game.matchLog.events.slice(-6).reverse()
  const pageCount = Math.max(1, Math.ceil(events.length / 2))
  const currentPage = Math.min(page, pageCount - 1)
  return <section className="pu-race-screen" aria-label={recap ? 'Ripresa della sessione' : 'Situazione della gara'}>
    <p role="status">Turno di {active.name} · {game.turnoOverworld.azioniRimaste} azioni disponibili{game.battaglia ? ' · battaglia in corso' : ''}.</p>
    <div className="pu-race-cards">{progress.map(player => <KitPanel key={player.id} aria-label={`Gara di ${player.name}`}>
      <h2>{player.name} · G{player.id}</h2><p>{player.place.replace(/_/g, ' ')}</p>
      <dl><div><dt>Medaglie</dt><dd>{player.badges} / {player.totalBadges}</dd></div>
        <div><dt>Lega</dt><dd>{player.leagueStages} / {player.leagueTotal}</dd></div>
        <div><dt>Squadra</dt><dd>{player.team} / 6</dd></div></dl>
      <p>{player.leagueStatus === 'running' ? 'Serie della Lega in corso' : player.leagueStatus === 'completed' ? 'Lega completata' : player.leagueStatus === 'defeated' ? 'Ultimo tentativo della Lega interrotto' : 'Viaggio verso la Lega'}</p>
    </KitPanel>)}</div>
    {game.league.winner && <p className="pu-race-winner">Campione della regione: {game.league.winner.name}</p>}
    {recap && <section aria-label="Ultimi eventi della sessione"><h2>Da dove riprendiamo</h2>
      {events.length ? <><ol className="pu-recap-events">{events.slice(currentPage * 2, currentPage * 2 + 2).map(event => <li key={event.id}>
        <strong>{event.title}</strong><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleString('it-IT')}</time><p>{event.message}</p>
      </li>)}</ol><nav className="pu-pagination" aria-label="Pagine degli ultimi eventi"><KitButton disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</KitButton><span>Pagina {currentPage + 1} / {pageCount}</span><KitButton disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Successivi</KitButton></nav></> : <p>Nessun evento registrato. I progressi attuali sono indicati qui sopra; le azioni precedenti non vengono ricostruite.</p>}
    </section>}
  </section>
}
