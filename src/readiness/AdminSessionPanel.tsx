import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useInteractionStore } from '@/interactions/interactionStore'
import { useInteractionRecoveryStatus } from '@/interactions/interactionRecovery'
import { useAudienceStore } from '@/audience/useAudienceStore'
import { useRegiaStore } from '@/regia/regiaStore'
import { useAdminStore } from '@/store/adminStore'
import { getLocalMap } from '@/data/localMaps'
import { assetUrl } from '@/utils/assetUrl'
import { buildReadinessReport, currentRaceProgress, type ReadinessDestination } from './readinessModel'
import { exportCampaignPackage, parseCampaignPackage, type CampaignPackage } from './campaignPackage'
import { applyCampaignConfiguration } from './campaignApply'
import './readiness.css'

function downloadConfiguration(json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'Arkamon-configurazione-campagna.json'; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function AdminSessionPanel({ onNavigate }: { onNavigate: (tab: ReadinessDestination) => void }) {
  const game = useGameStore()
  const interactions = useInteractionStore(state => state.interactions)
  const catalogRecovery = useInteractionRecoveryStatus(state => state.recovery)
  const audience = useAudienceStore()
  const { paused, busy, busyReason, setPaused } = useRegiaStore()
  const [configuration, setConfiguration] = useState<CampaignPackage | null>(null)
  const importRevision = useRef(0)
  const [message, setMessage] = useState('')
  const [mediaStatus, setMediaStatus] = useState('Immagini non ancora verificate in questa visita.')
  const [checking, setChecking] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => () => { importRevision.current++ }, [])
  const report = useMemo(() => buildReadinessReport(game, interactions, audience, now, catalogRecovery?.error), [game, interactions, audience, now, catalogRecovery])
  const progress = currentRaceProgress(game)
  const broadcast = new URL(window.location.href)
  broadcast.searchParams.set('view', 'broadcast'); broadcast.hash = ''
  const locked = !!game.battaglia || !!game.challengeContext || game.league.players[1].attempt > 0 || game.league.players[2].attempt > 0

  async function checkImages() {
    setChecking(true)
    const paths = [...new Set([
      ...[...game.giocatore1.squadra, ...game.giocatore2.squadra].map(member => `/sprites/front_sprites/${member.specieId}.png`),
      ...[game.posizione1, game.posizione2].map(position => getLocalMap(position.luogo ?? position.mappaId)?.image).filter((path): path is string => !!path),
    ])]
    const results = await Promise.all(paths.map(path => new Promise<string | null>(resolve => {
      const image = new Image()
      const timeout = window.setTimeout(() => finish(path), 12_000)
      const finish = (error: string | null) => { window.clearTimeout(timeout); image.onload = null; image.onerror = null; resolve(error) }
      image.onload = () => finish(image.naturalWidth > 0 ? null : path)
      image.onerror = () => finish(path)
      image.src = assetUrl(path)
    })))
    const failed = results.filter((path): path is string => !!path)
    setMediaStatus(!paths.length ? 'Nessuna squadra o mappa locale corrente da verificare.' : failed.length ? `Immagini non raggiungibili: ${failed.join(', ')}. Riprova o controlla il catalogo.` : `${paths.length} immagini correnti caricate. Questo controllo non certifica audio, animazioni o collegamento OBS.`)
    setChecking(false)
  }

  async function previewImport(file: File | undefined) {
    const revision = ++importRevision.current
    setConfiguration(null); setMessage('')
    if (!file) return
    if (file.size > 2_000_000) { setMessage('Il pacchetto supera il limite di 2 MB.'); return }
    try {
      const text = await file.text()
      if (revision !== importRevision.current) return
      const result = parseCampaignPackage(text)
      setConfiguration(result.configuration)
      setMessage(result.error ?? 'Anteprima pronta. Nessuna modifica applicata.')
    } catch { if (revision === importRevision.current) setMessage('Non è stato possibile leggere il file. Nessuna modifica applicata.') }
  }

  return <section aria-label="Regia e preparazione della sessione" className="arka-session space-y-5">
    <header><h3 className="text-lg font-bold">Regia della live</h3><p>Console privata di Livio. Configurazione e stato reale della gara; storia e interpretazione restano a voce.</p></header>
    <div className="arka-session-actions">
      <a className="arka-session-button" href={broadcast.href} target="_blank" rel="noopener noreferrer">Apri vista In onda</a>
      <button type="button" className="arka-session-button" disabled={!paused && busy} onClick={() => setPaused(!paused)}>{paused ? 'Riprendi la regia' : 'Pausa di regia'}</button>
    </div>
    <p className="text-sm">La vista In onda si collega alla console nello stesso browser e profilo. In OBS usa Cattura finestra; una Browser Source in un profilo separato non riceve questo collegamento locale.</p>
    {['citta', 'percorso'].includes(game.scenaCorrente.scena) && getLocalMap(String(game.scenaCorrente.payload?.luogo ?? '')) && <button type="button" className="arka-session-button" disabled={busy || paused} onClick={() => {
      window.dispatchEvent(new Event('arkamon:gm-activities')); useAdminStore.getState().setPanelOpen(false)
    }}>Scorciatoie del Game Master</button>}
    <p className="text-sm">Le interazioni delle giocatrici restano sui pallini. Le scorciatoie del GM permettono eccezioni esplicite senza simulare uno spostamento.</p>
    <p role="status">{paused ? 'Regia in pausa: nessun risultato viene ricalcolato.' : busy ? `Azione in corso${busyReason ? `: ${busyReason}` : ''}. La pausa sarà disponibile al termine.` : 'Regia attiva. La pausa è disponibile fra le azioni.'}</p>

    <section aria-label="Avanzamento della gara"><h4 className="font-bold">Melia e Maggi · situazione corrente</h4><div className="arka-session-race">{progress.map(player => <article key={player.id}>
      <strong>{player.name} · G{player.id}</strong><p>{player.place.replace(/_/g, ' ')}</p><p>Medaglie {player.badges}/{player.totalBadges} · squadra {player.team}/6</p>
      <p>Lega: {player.leagueStages}/{player.leagueTotal} incontri completati{player.leagueStatus === 'running' ? ' · tentativo in corso' : player.leagueStatus === 'completed' ? ' · completata' : ''}</p>
    </article>)}</div></section>

    <section aria-label="Controllo preparazione"><h4 className="font-bold">Pronto per la sessione</h4><p>{report.counts.errors} errori · {report.counts.warnings} punti da verificare. Le tappe narrative vuote non bloccano la partita.</p>
      <ul className="arka-session-checks">{report.checks.map(check => <li key={check.id} data-readiness-level={check.level}>
        <strong>{check.level === 'ok' ? '✓' : check.level === 'error' ? '!' : check.level === 'warning' ? '△' : 'i'} {check.title}</strong><p>{check.message}</p>
        {check.destination && <button type="button" className="arka-session-link" onClick={() => onNavigate(check.destination!)}>{check.destination === 'audience' ? 'Apri connessioni' : check.destination === 'league' ? 'Apri Lega' : check.destination === 'assets' ? 'Apri asset' : 'Apri interazioni'}</button>}
      </li>)}</ul>
      <details><summary>Copertura delle mappe a pallini</summary><table><thead><tr><th>Mappa</th><th>Pallini</th><th>Interazioni</th><th>Negozi</th></tr></thead><tbody>{report.maps.map(map => <tr key={map.id}><th>{map.id.replace(/_/g, ' ')}</th><td>{map.points}</td><td>{map.configured}</td><td>{map.shops}</td></tr>)}</tbody></table></details>
      <button type="button" className="arka-session-button" disabled={checking} onClick={() => void checkImages()}>{checking ? 'Verifica immagini…' : 'Verifica immagini correnti'}</button><p role="status">{mediaStatus}</p>
    </section>

    <section aria-label="Configurazione portabile della campagna"><h4 className="font-bold">Pacchetto di configurazione</h4><p>Trasporta solo interazioni e regole/squadre avversarie della Lega. Non importa squadre delle giocatrici, monete, oggetti, cronologia, posizioni o credenziali.</p>
      <button type="button" className="arka-session-button" disabled={!!catalogRecovery} onClick={() => downloadConfiguration(exportCampaignPackage('Configurazione Arkamon', { version: 1, interactions }, game.league.config))}>Esporta configurazione</button>
      {catalogRecovery && <p>Il catalogo salvato richiede recupero. Scarica l’originale nell’editor delle interazioni prima di esportare o importare la configurazione.</p>}
      <label className="block mt-3">Importa configurazione per anteprima<input type="file" accept="application/json,.json" aria-label="Importa configurazione campagna" className="block mt-2 max-w-full" onChange={event => { void previewImport(event.target.files?.[0]); event.target.value = '' }} /></label>
      {configuration && <div className="arka-session-import" aria-label="Anteprima configurazione campagna"><strong>{configuration.name}</strong><p>{configuration.catalog.interactions.length} interazioni ({configuration.catalog.interactions.filter(entry => entry.enabled).length} attive) · {configuration.league ? 'Lega inclusa' : 'Lega non configurata'}.</p>
        <p>Verranno sostituiti {interactions.length} elementi del catalogo e la configurazione della Lega. I progressi e gli identificativi delle tappe già completate rimangono invariati.</p>
        {locked && <p>Importazione sospesa durante battaglie, sfide o dopo il primo tentativo della Lega.</p>}
        <div className="arka-session-actions"><button type="button" className="arka-session-button" disabled={locked} onClick={() => { const result = applyCampaignConfiguration(configuration); setMessage(result.message); if (result.ok) { importRevision.current++; setConfiguration(null) } }}>Applica configurazione verificata</button><button type="button" className="arka-session-button" onClick={() => { importRevision.current++; setConfiguration(null); setMessage('Anteprima annullata. Nessuna modifica applicata.') }}>Annulla importazione</button></div>
      </div>}
      <p role="status">{message}</p>
    </section>

    <section aria-label="Riepilogo di ripresa"><h4 className="font-bold">Ripresa della sessione</h4><p>Turno di {game[game.giocatoreAttivo === 1 ? 'giocatore1' : 'giocatore2'].nome} · {game.turnoOverworld.azioniRimaste} azioni disponibili.</p>
      {game.matchLog.events.length ? <ol className="arka-session-events">{game.matchLog.events.slice(-6).reverse().map(event => <li key={event.id}><strong>{event.title}</strong><p>{event.message}</p>{event.place && <small>{event.place.replace(/_/g, ' ')}</small>}</li>)}</ol> : <p>Nessun evento registrato. Non vengono ricostruite o inventate azioni precedenti.</p>}
    </section>
  </section>
}
