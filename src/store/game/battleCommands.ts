import { getAllenatore, getPokemon } from '@/data'
import { calcolaHPMax, calcolaVariazioneMonete, clearStoredExperience, type EsitoBattaglia, type TipoAvversario } from '@/engine/battleEngine'
import { isTeamWithinLevelCap, teamCapMessage, teamLevelRange, TEAM_LEVEL_GAP } from '@/engine/teamLevelCap'
import { finalizeConfiguredBattle } from '@/interactions/runtime'
import type { GameState } from '../gameStore'
import type { NavigazioneScena, PokemonIstanza, StatoBattaglia, StatoGiocatore } from '@/types'
import { commandApplied, commandFailure, type GameCommandResult } from './commandPolicy'

export function clearBattleExperience(battle: StatoBattaglia): StatoBattaglia {
  return { ...battle, pokemonA: clearStoredExperience(battle.pokemonA), pokemonB: clearStoredExperience(battle.pokemonB),
    ...(battle.squadraA ? { squadraA: battle.squadraA.map(clearStoredExperience) } : {}),
    ...(battle.squadraB ? { squadraB: battle.squadraB.map(clearStoredExperience) } : {}),
  }
}

/** Legacy route/grid callers omit the roster. Canonicalize the active copy
 * against the complete supplied/owned squad, preserving every reserve and KO.
 */
export function prepareBattleEntry(battle: StatoBattaglia, player: StatoGiocatore): { result: GameCommandResult; battle?: StatoBattaglia } {
  const team = battle.squadraA ?? player.squadra
  const lead = team.find((pokemon) => pokemon.istanzaId === battle.pokemonA.istanzaId)
  if (!lead || !getPokemon(lead.specieId) || !Number.isInteger(lead.livello) || lead.livello < 5 || lead.livello > 100
    || !Number.isFinite(lead.hp) || lead.hp <= 0 || lead.hp > calcolaHPMax(lead))
    return { result: commandFailure('invalid-battle', 'Scegli un Arkamon vivo e valido della squadra per iniziare la battaglia.') }
  if (!isTeamWithinLevelCap(team)) return { result: commandFailure('team-level-cap', teamCapMessage(team)) }
  return { result: commandApplied('La battaglia ha inizio.'),
    battle: clearBattleExperience({ ...battle, pokemonA: lead, squadraA: team, hpMaxA: calcolaHPMax(lead) }) }
}

/** One post-battle status rule for every squad/deposit and both players.
 * Full healing affects squad HP; boxed HP and paralysis survival keep their
 * historical contract. No XP is introduced or consumed by cleanup.
 */
export function cleanupBattlePlayer(player: StatoGiocatore, fullHeal: boolean): StatoGiocatore {
  const clean = (pokemon: PokemonIstanza, team: boolean): PokemonIstanza => {
    if (team && !getPokemon(pokemon.specieId)) return pokemon
    if (!fullHeal && pokemon.stato?.tipo === 'Paralizzato') return pokemon
    const { stato: _status, ...withoutStatus } = pokemon
    return fullHeal && team ? { ...withoutStatus, hp: calcolaHPMax(withoutStatus) } : withoutStatus
  }
  return { ...player, squadra: player.squadra.map(pokemon => clean(pokemon, true)),
    deposito: Object.fromEntries(Object.entries(player.deposito).map(([slot, pokemon]) => [slot, clean(pokemon, false)])) }
}

/** Shared by the legacy reward action and the complete campaign conclusion. */
export function npcBattleReward(player: StatoGiocatore, battle: StatoBattaglia, outcome: EsitoBattaglia): StatoGiocatore {
  if (battle.leagueBattle || battle.allenatoreId === undefined || battle.tipo === 'Selvatico' || battle.ricompenseApplicate) return player
  const trainer = getAllenatore(battle.allenatoreId)
  const type: TipoAvversario = trainer?.tipo === 'Capopalestra' ? 'Capopalestra' : trainer?.tipo === 'PVP' ? 'PVP' : 'NPC'
  const defeated = new Set(player.allenatoriSconfitti)
  if (outcome === 'vittoria') defeated.add(battle.allenatoreId)
  return { ...player, monete: Math.max(0, player.monete + calcolaVariazioneMonete(outcome, type)), allenatoriSconfitti: defeated }
}

/** Only a durable ended checkpoint can settle a campaign battle. The complete
 * roster is validated before any reward, cleanup or navigation is published.
 * Captures have already been committed by their own command and stay owned.
 */
export function resolveBattleConclusion(state: GameState, outcome: EsitoBattaglia): { result: GameCommandResult; patch?: Partial<GameState> } {
  const battle = state.battaglia
  if (state.challengeContext) return { result: commandFailure('challenge-active', 'Concludi la sfida con il suo comando dedicato.') }
  if (!battle || battle.leagueBattle || state.scenaCorrente.scena !== 'battaglia'
    || battle.checkpoint?.phase !== 'ended' || battle.checkpoint.outcome !== outcome)
    return { result: commandFailure('invalid-battle', 'Attendi che l’esito della battaglia sia salvato prima di proseguire.') }

  const playerId = state.giocatoreAttivo, key = playerId === 1 ? 'giocatore1' : 'giocatore2', player = state[key]
  const settled = battle.squadraA ?? [battle.pokemonA]
  const ids = new Set(settled.map(pokemon => pokemon.istanzaId))
  const owned = new Map(player.squadra.map(pokemon => [pokemon.istanzaId, pokemon]))
  if (!settled.length || settled.length > 6 || ids.size !== settled.length || owned.size !== player.squadra.length
    || settled.some(pokemon => !owned.has(pokemon.istanzaId)) || !ids.has(battle.pokemonA.istanzaId))
    return { result: commandFailure('invalid-battle', 'La squadra del risultato non coincide con quella della campagna. Il checkpoint resta intatto.') }
  if (settled.some(pokemon => !getPokemon(pokemon.specieId) || pokemon.specieId !== owned.get(pokemon.istanzaId)!.specieId
    || !Number.isSafeInteger(pokemon.livello) || pokemon.livello < 5 || pokemon.livello > 100
    || !Number.isFinite(pokemon.hp) || pokemon.hp < 0 || pokemon.hp > calcolaHPMax(pokemon)))
    return { result: commandFailure('invalid-battle', 'La squadra non contiene un risultato valido. Il checkpoint resta intatto.') }

  const finalById = new Map(settled.map(pokemon => [pokemon.istanzaId, clearStoredExperience(pokemon)]))
  const team = player.squadra.map(pokemon => finalById.get(pokemon.istanzaId) ?? pokemon)
  // Keep the existing non-worsening policy for historical out-of-cap saves.
  // Every newly entered battle already has a gap at most five.
  if (teamLevelRange(team).gap > Math.max(TEAM_LEVEL_GAP, teamLevelRange(player.squadra).gap))
    return { result: commandFailure('team-level-cap', teamCapMessage(team)) }
  const evolutions = battle.checkpoint.evolutions
  if (new Set(evolutions.map(evolution => evolution.istanzaId)).size !== evolutions.length
    || evolutions.some(evolution => !ids.has(evolution.istanzaId)
      || finalById.get(evolution.istanzaId)!.specieId !== evolution.oldSpecieId || !getPokemon(evolution.newSpecieId)))
    return { result: commandFailure('invalid-battle', 'Le evoluzioni del risultato non coincidono con la squadra. Il checkpoint resta intatto.') }

  const rewarded = npcBattleReward({ ...player, squadra: team }, battle, outcome)
  const final = finalizeConfiguredBattle({ ...state, [key]: rewarded })
  const location = battle.luogoRitorno || 'mappa-principale'
  const destination: NavigazioneScena = evolutions.length
    ? { scena: 'evoluzione', payload: { evoluzioni: evolutions, luogoRitorno: location, giocatoreId: playerId } }
    : location === 'mappa-griglia' ? { scena: 'mappa-griglia' }
    : /^Percorso_/.test(location) ? { scena: 'percorso', payload: { luogo: location } }
    : location !== 'mappa-principale' ? { scena: 'citta', payload: { luogo: location } } : { scena: 'mappa-principale' }
  return { result: commandApplied('Risultato della battaglia salvato.'), patch: {
    ...final, battaglia: null,
    giocatore1: cleanupBattlePlayer(final.giocatore1 ?? (playerId === 1 ? rewarded : state.giocatore1), false),
    giocatore2: cleanupBattlePlayer(final.giocatore2 ?? (playerId === 2 ? rewarded : state.giocatore2), false),
    scenaPrecedente: state.scenaCorrente, scenaCorrente: destination,
    fallbackLocationActivity: destination.scena === 'citta' || destination.scena === 'percorso' ? state.fallbackLocationActivity : null,
  } }
}
