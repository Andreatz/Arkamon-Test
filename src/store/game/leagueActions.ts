import type { GameState } from '../gameStore'
import { getPokemon } from '@/data'
import { calcolaHPMax, clearStoredExperience } from '@/engine/battleEngine'
import { nuovoTurno } from '@/engine/movimento'
import { isTeamWithinLevelCap, teamCapMessage } from '@/engine/teamLevelCap'
import { resolveItemEffect } from '@/shop/itemEffects'
import { isShopItemId } from '@/shop/catalog'
import { appendMatchEvent } from '@/match/matchLog'
import { hasUnlockedSecretLocation } from '@/data/secretLocation'
import { emptyLeagueProgress, isLeagueTurnLocked, leagueConfigurationProblems, leagueOpponents, makeLeagueBattle, normalizeLeagueConfiguration } from '@/league/leagueModel'

type LeagueActions = Pick<GameState, 'configuraLega' | 'iniziaLega' | 'prossimoIncontroLega' | 'concludiBattagliaLega' | 'usaOggettoLega' | 'abbandonaLega'>

/** The League owns its reserved turn and inter-fight roster/item rules. Only
 * the store supplies persistence: this module cannot publish or save directly.
 */
export function createLeagueActions(get: () => GameState, set: (patch: Partial<GameState>) => boolean): LeagueActions {
  return {
      configuraLega: (configuration) => {
        const state = get()
        if (state.challengeContext || isLeagueTurnLocked(state.league) || state.league.players[1].attempt > 0 || state.league.players[2].attempt > 0)
          return { ok: false, message: 'La configurazione della Lega resta fissa dopo il primo tentativo.' }
        const config = normalizeLeagueConfiguration(configuration)
        if (!config) return { ok: false, message: 'La configurazione della Lega non è valida.' }
        const written = set({ league: { ...state.league, config } })
        return { ok: written, message: written ? (leagueConfigurationProblems(config).length ? 'Bozza della Lega salvata: completa i dati mancanti prima di iniziare.' : 'Lega configurata: quattro incontri consecutivi nello stesso turno.') : 'Configurazione non salvata: libera spazio nel browser.' }
      },
      iniziaLega: () => {
        const state = get(), playerId = state.giocatoreAttivo, key = playerId === 1 ? 'giocatore1' : 'giocatore2', player = state[key]
        const problems = leagueConfigurationProblems(state.league.config)
        if (state.challengeContext || state.battaglia || state.interactionProgress.pendingBattle) return { ok: false, message: 'Concludi l’attività in corso prima della Lega.' }
        if (state.league.winner) return { ok: false, message: `${state.league.winner.name} ha già vinto la Lega.` }
        if (state.league.players[1].status === 'running' || state.league.players[2].status === 'running') return { ok: false, message: 'Un tentativo della Lega è già in corso.' }
        if (problems.length) return { ok: false, message: problems.join(' ') }
        const position = state[playerId === 1 ? 'posizione1' : 'posizione2']
        if (position.mappaId !== 'mappa-principale' || position.luogo !== 'Roma' || !hasUnlockedSecretLocation(player))
          return { ok: false, message: 'Raggiungi Roma e conquista tutte le otto medaglie per entrare nella Lega.' }
        if (state.turnoOverworld.giocatoreAttivo !== playerId || state.turnoOverworld.azioniRimaste < 1) return { ok: false, message: 'Il turno di questo giocatore è concluso.' }
        if (!isTeamWithinLevelCap(player.squadra)) return { ok: false, message: teamCapMessage(player.squadra) }
        const previous = state.league.players[playerId]
        if (previous.attempt >= 100_000) return { ok: false, message: 'Il numero massimo di tentativi della Lega è stato raggiunto.' }
        const restart = state.league.config!.defeat === 'restart'
        const progress = { ...(restart ? emptyLeagueProgress() : previous), status: 'running' as const,
          runId: `league-${playerId}-${previous.attempt + 1}-${Date.now()}`, attempt: previous.attempt + 1, stageCompleted: false }
        const battle = makeLeagueBattle(state.league.config!, progress, playerId, player.squadra)
        if (!battle) return { ok: false, message: 'Nessun Arkamon può combattere. Cura esplicitamente la squadra prima di entrare.' }
        const written = set({ league: { ...state.league, players: { ...state.league.players, [playerId]: progress } }, battaglia: battle,
          turnoOverworld: { giocatoreAttivo: playerId, azioniRimaste: 0 }, scenaPrecedente: { scena: 'lega' }, scenaCorrente: { scena: 'battaglia' },
          matchLog: appendMatchEvent(state.matchLog, { kind: 'battle', playerId, title: 'Ingresso nella Lega', message: `Tentativo ${progress.attempt}: quattro incontri consecutivi nello stesso turno.`, place: 'Roma' }) })
        return { ok: written, message: written ? 'La sfida della Lega ha inizio.' : 'Tentativo non salvato: la squadra resta intatta.' }
      },
      prossimoIncontroLega: () => {
        const state = get(), playerId = state.giocatoreAttivo, progress = state.league.players[playerId]
        if (state.challengeContext || state.battaglia || state.league.winner || progress.status !== 'running' || !state.league.config) return { ok: false, message: 'Non c’è un prossimo incontro pronto.' }
        const player = state[playerId === 1 ? 'giocatore1' : 'giocatore2']
        if (!isTeamWithinLevelCap(player.squadra)) return { ok: false, message: teamCapMessage(player.squadra) }
        const battle = makeLeagueBattle(state.league.config, progress, playerId, player.squadra)
        if (!battle) return { ok: false, message: 'Nessun Arkamon può combattere. Usa una cura consentita o termina il tentativo.' }
        const written = set({ battaglia: battle, league: { ...state.league, players: { ...state.league.players, [playerId]: { ...progress, stageCompleted: false } } },
          scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'lega' }, campaignRevision: state.campaignRevision + 1 })
        return { ok: written, message: written ? 'Prossimo incontro della Lega.' : 'Incontro non salvato: riprova dopo aver liberato spazio.' }
      },
      concludiBattagliaLega: (esito, squadra, evoluzioni = []) => {
        const state = get(), battle = state.battaglia, reference = battle?.leagueBattle
        if (!reference || state.challengeContext || !state.league.config || battle?.checkpoint?.phase !== 'ended' || battle.checkpoint.outcome !== esito)
          return { ok: false, message: 'Attendi che l’esito della battaglia sia salvato prima di proseguire.' }
        const playerId = reference.playerId, progress = state.league.players[playerId], key = playerId === 1 ? 'giocatore1' : 'giocatore2'
        if (progress.status !== 'running' || progress.runId !== reference.runId || progress.nextStage !== reference.stageIndex || state.giocatoreAttivo !== playerId || state.league.winner)
          return { ok: false, message: 'Questo incontro della Lega è già stato concluso.' }
        const player = state[key], teamIds = new Set(player.squadra.map((p) => p.istanzaId))
        if (squadra.length !== player.squadra.length || new Set(squadra.map((p) => p.istanzaId)).size !== squadra.length || squadra.some((p) => !teamIds.has(p.istanzaId)))
          return { ok: false, message: 'La squadra non coincide con quella entrata nella Lega.' }
        if (squadra.some((p) => !getPokemon(p.specieId) || !Number.isSafeInteger(p.livello) || p.livello < 5 || p.livello > 100
          || !Number.isFinite(p.hp) || p.hp < 0 || p.hp > calcolaHPMax(p)) || !isTeamWithinLevelCap(squadra))
          return { ok: false, message: 'La squadra non ha un risultato valido per la Lega.' }
        const total = leagueOpponents(state.league.config).length
        const nextStage = esito === 'vittoria' ? progress.nextStage + 1 : progress.nextStage
        const completed = esito === 'vittoria' && nextStage === total
        const next = { ...progress, nextStage, status: completed ? 'completed' as const : esito === 'sconfitta' ? 'defeated' as const : 'running' as const,
          completedStages: esito === 'vittoria' ? [...progress.completedStages, reference.stageIndex] : progress.completedStages, stageCompleted: esito === 'vittoria' }
        const team = squadra.map(clearStoredExperience).map((p) => {
          if (p.stato?.tipo === 'Paralizzato') return p
          const { stato: _status, ...clean } = p
          return clean
        })
        const winner = completed ? { playerId, name: player.nome, team: team.map((p) => ({ ...p })), runId: reference.runId, completedAt: new Date().toISOString() } : null
        const written = set({ battaglia: null, [key]: { ...player, squadra: team },
          league: { ...state.league, players: { ...state.league.players, [playerId]: next }, winner },
          turnoOverworld: esito === 'sconfitta' ? nuovoTurno(playerId) : { giocatoreAttivo: playerId, azioniRimaste: 0 },
          ...(esito === 'sconfitta' ? { giocatoreAttivo: playerId === 1 ? 2 : 1 } : {}),
          scenaCorrente: evoluzioni.length ? { scena: 'evoluzione', payload: { evoluzioni, luogoRitorno: 'lega', giocatoreId: playerId } } : { scena: 'lega', payload: { playerId } },
          scenaPrecedente: null,
          matchLog: appendMatchEvent(state.matchLog, { id: `${reference.runId}-${reference.stageIndex}-result`, kind: 'battle', playerId,
            title: completed ? `${player.nome} è Campione della regione` : esito === 'vittoria' ? `Lega: incontro ${nextStage}/${total} vinto` : 'Lega: tentativo concluso',
            message: completed ? 'La corsa alla Lega è conclusa. La squadra del Campione resta nel registro.' : esito === 'vittoria' ? 'Gli HP residui restano nella squadra. Il prossimo incontro usa lo stesso turno.' : 'Gli HP residui restano nella squadra. Il turno passa all’altro giocatore.', place: 'Roma' }) })
        return { ok: written, message: written ? (completed ? `${player.nome} ha vinto la Lega!` : 'Risultato della Lega salvato.') : 'Risultato non salvato: resta su questa schermata e riprova.' }
      },
      usaOggettoLega: (itemId, instanceId) => {
        const state = get(), playerId = state.giocatoreAttivo, key = playerId === 1 ? 'giocatore1' : 'giocatore2', player = state[key]
        if (state.challengeContext || state.battaglia || state.league.players[playerId].status !== 'running' || state.league.config?.betweenBattleItems !== true)
          return { ok: false, message: 'Gli oggetti fra questi incontri non sono consentiti.' }
        if (!isShopItemId(itemId) || (player.inventario[itemId] ?? 0) < 1) return { ok: false, message: 'Questo oggetto non è nella borsa.' }
        const pokemon = player.squadra.find((p) => p.istanzaId === instanceId)
        if (!pokemon) return { ok: false, message: 'Scegli un Arkamon della squadra.' }
        const effect = resolveItemEffect(pokemon, itemId)
        if (!effect.ok || !effect.pokemon) return effect
        const written = set({ [key]: { ...player, squadra: player.squadra.map((p) => p.istanzaId === instanceId ? effect.pokemon! : p),
          inventario: { ...player.inventario, [itemId]: player.inventario[itemId]! - 1 } } } as Partial<GameState>)
        return { ok: written, message: written ? effect.message : 'Oggetto non salvato: borsa e HP restano intatti.' }
      },
      abbandonaLega: () => {
        const state = get(), playerId = state.giocatoreAttivo, progress = state.league.players[playerId]
        if (state.challengeContext || state.battaglia || progress.status !== 'running' || state.league.winner) return { ok: false, message: 'Concludi la battaglia prima di terminare il tentativo.' }
        const turn = nuovoTurno(playerId)
        const written = set({ league: { ...state.league, players: { ...state.league.players, [playerId]: { ...progress, status: 'defeated' } } },
          turnoOverworld: turn, giocatoreAttivo: turn.giocatoreAttivo, scenaCorrente: { scena: 'lega', payload: { playerId } } })
        return { ok: written, message: written ? 'Tentativo terminato. Gli HP residui restano nella squadra.' : 'Tentativo non salvato.' }
      },
  }
}
