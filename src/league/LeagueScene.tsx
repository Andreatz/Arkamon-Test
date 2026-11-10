import { useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import { RpgCommand as GameButton } from '@/components/rpg'
import { assetUrl } from '@/utils/assetUrl'
import '@/scenes/rpgScenes.css'
import { CreaturePortrait, HealthBar, KitIcon, KitPanel } from '@/player-ui/kit'
import { getShopItem } from '@/shop/catalog'
import { hasUnlockedSecretLocation } from '@/data/secretLocation'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { leagueConfigurationProblems, leagueOpponents } from './leagueModel'
import type { OggettoId } from '@/types'
import './league.css'

/** A playable competition screen. Names, opponents and rules come only from saved configuration. */
export function LeagueScene() {
  const league = useGameStore((s) => s.league)
  const currentPlayerId = useGameStore((s) => s.giocatoreAttivo)
  const payloadPlayer = useGameStore((s) => s.scenaCorrente.payload?.playerId)
  const player1 = useGameStore((s) => s.giocatore1), player2 = useGameStore((s) => s.giocatore2)
  const [message, setMessage] = useState('')
  const [itemId, setItemId] = useState<OggettoId>('potion')
  const [instanceId, setInstanceId] = useState('')
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const { reducedMotion } = useGameMotionPreferences()
  const shownPlayerId = league.winner?.playerId ?? (payloadPlayer === 1 || payloadPlayer === 2 ? payloadPlayer : currentPlayerId)
  const player = shownPlayerId === 1 ? player1 : player2, progress = league.players[shownPlayerId]
  const configurationProblems = leagueConfigurationProblems(league.config)
  const opponents = league.config ? leagueOpponents(league.config) : []
  const winner = league.winner
  const running = progress.status === 'running'
  const runAction = (action: () => { ok: boolean; message: string }) => { const result = action(); setMessage(result.message) }
  const team = winner?.team ?? player.squadra
  const ownedItems = (Object.entries(player.inventario) as [OggettoId, number][]).filter(([id, quantity]) => id !== 'masterball' && quantity > 0)
  return <main className="league-scene" data-league-scene data-reduced-motion={reducedMotion}>
    <header className="league-heading">
      <div><p className="league-eyebrow">Arkamon · campionato della regione</p><h1>{winner ? 'Campione della regione' : 'La Lega Arkamon'}</h1>
        <p>{winner ? `${winner.name} ha conquistato la Lega e vinto la campagna.` : 'Quattro incontri consecutivi. Un solo turno. Una squadra.'}</p></div>
      <KitPanel className="league-player-card"><KitIcon id="icon-team" /><strong>G{shownPlayerId} · {player.nome}</strong><span>{winner ? 'Vittoria della campagna' : `Medaglie: ${hasUnlockedSecretLocation(player) ? '8 / 8' : 'da completare'}`}</span></KitPanel>
    </header>
    <div className="league-content">
      <KitPanel className="league-path"><h2>{winner ? 'Il cammino del Campione' : 'Il percorso della Lega'}</h2>
        <ol className="league-stages">{Array.from({ length: Math.max(4, opponents.length) }, (_, index) => {
          const opponent = opponents[index], complete = progress.completedStages.includes(index), active = running && progress.nextStage === index
          return <li key={index} className={`${complete ? 'is-completed' : ''} ${active ? 'is-current' : ''}`} aria-current={active ? 'step' : undefined}>
            <img className="league-stage-emblem" src={assetUrl(`/ui/studio/progression/league-${index + 1}.svg`)} alt="" /><span className="league-stage-number">{complete ? '✓' : String(index + 1).padStart(2, '0')}</span><div><strong>{opponent?.name || `Superquattro ${index + 1}`}</strong><small>{complete ? 'Sconfitto' : active ? 'Prossimo incontro' : opponent?.team.length ? `${opponent.team.length} Arkamon` : 'Da configurare'}</small></div>
          </li>
        })}</ol>
        <p className="league-rule-note">{league.config?.defeat === 'restart' ? 'Una sconfitta richiede un nuovo tentativo dal primo incontro.' : league.config?.defeat === 'retry-stage' ? 'Dopo una sconfitta puoi riprendere dall’incontro raggiunto.' : 'Regola della sconfitta da confermare.'}</p>
      </KitPanel>
      <KitPanel className="league-team"><h2>{winner ? 'La squadra del Campione' : 'La tua squadra'}</h2>
        <div className="league-team-grid">{team.map((pokemon) => <div key={pokemon.istanzaId} className="league-team-member"><CreaturePortrait pokemon={pokemon} /><div><strong title={pokemon.nome}>{pokemon.nome}</strong><span>Lv. {pokemon.livello}{pokemon.hp <= 0 ? ' · KO' : pokemon.stato ? ` · ${pokemon.stato.tipo}` : ''}</span><HealthBar pokemon={pokemon} /></div></div>)}</div>
        {winner ? <p className="league-announcement" role="status">🏆 {winner.name} vince la corsa alla Lega. La campagna e il registro restano disponibili.</p>
          : configurationProblems.length ? <div className="league-notice"><strong>Lega da completare</strong><ul>{configurationProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul><p>Livio può configurarla nella sezione Lega dell’Admin.</p></div>
          : running ? <div className="league-intermission"><strong>Incontro {progress.nextStage + 1} di {opponents.length}</strong><p>Gli HP residui restano nella squadra. Il turno è ancora di {player.nome}.</p>
            {league.config?.betweenBattleItems ? <div className="league-item-use">
              <label>Oggetto<select aria-label="Oggetto fra gli incontri della Lega" value={itemId} onChange={(event) => setItemId(event.target.value as OggettoId)}>{ownedItems.map(([id, quantity]) => <option key={id} value={id}>{getShopItem(id)?.name} ×{quantity}</option>)}{!ownedItems.some(([id]) => id === itemId) && <option value={itemId}>{getShopItem(itemId)?.name} · esaurito</option>}</select></label>
              <label>Arkamon<select aria-label="Arkamon da curare nella Lega" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}><option value="">Scegli un Arkamon</option>{player.squadra.map((p) => <option key={p.istanzaId} value={p.istanzaId}>{p.nome} · {p.hp} HP</option>)}</select></label>
              <GameButton disabled={!instanceId || !(player.inventario[itemId] ?? 0)} onClick={() => runAction(() => useGameStore.getState().usaOggettoLega(itemId, instanceId))}>Usa oggetto</GameButton>
            </div> : <p>Gli oggetti fra gli incontri non sono consentiti.</p>}
          </div> : <div className="league-notice"><strong>{progress.status === 'defeated' ? 'Tentativo concluso' : 'Preparati alla Lega'}</strong><p>{progress.status === 'defeated' ? `Hai vinto ${progress.completedStages.length} incontri. Cura esplicitamente la squadra prima del prossimo tentativo.` : 'Raggiungi Roma con tutte le otto medaglie. I quattro scontri useranno lo stesso turno.'}</p>{shownPlayerId !== currentPlayerId && <p>Ora tocca a G{currentPlayerId}.</p>}</div>}
      </KitPanel>
    </div>
    <footer className="league-footer"><p role="status">{message || (winner ? 'Vittoria salvata nella partita e nei backup.' : `Tentativo ${progress.attempt} · ${progress.completedStages.length}/${opponents.length || 4} incontri completati`)}</p>
      <div className="league-actions">{running ? <><GameButton disabled={confirmAbandon} onClick={() => runAction(() => useGameStore.getState().prossimoIncontroLega())}>Affronta il prossimo incontro</GameButton>
        <GameButton onClick={() => setConfirmAbandon(!confirmAbandon)}>{confirmAbandon ? 'Mantieni il tentativo' : 'Termina il tentativo'}</GameButton>
        {confirmAbandon && <GameButton onClick={() => runAction(() => useGameStore.getState().abbandonaLega())}>Conferma fine tentativo</GameButton>}</>
        : <>{!winner && <GameButton disabled={configurationProblems.length > 0 || shownPlayerId !== currentPlayerId} onClick={() => runAction(() => useGameStore.getState().iniziaLega())}>{progress.status === 'defeated' ? 'Nuovo tentativo' : 'Entra nella Lega'}</GameButton>}
          <GameButton onClick={() => useGameStore.getState().vaiAScena('mappa-principale')}>Torna alla mappa</GameButton></>}
      </div>
    </footer>
  </main>
}
