import { getAllenatore, getMossa, getPokemon } from '@/data'
import { èMossaCura, èMossaSoloStato, getMossaAlLivello, scegliMossaIA } from '@/engine/battleEngine'
import type { BattleCheckpoint, PokemonIstanza, StatoBattaglia } from '@/types'
import type { AudienceChannel, AudienceRoundRequest, AudienceRound } from '@/audience/types'

export function createAudienceBattleId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `battle-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function audienceChannelForBattle(battle: StatoBattaglia | null): AudienceChannel | null {
  if (!battle || battle.tipo === 'Selvatico') return null
  const trainer = battle.leagueOpponent ?? getAllenatore(battle.allenatoreId ?? 0)
  return battle.tipo === 'PVP' || trainer && trainer.tipo !== 'NPC' ? 'boss' : 'npc'
}

export function makeAudienceRoundRequest(
  battle: StatoBattaglia, pokemon: PokemonIstanza, target: PokemonIstanza,
  battleId: string, opponentTurn: number, durationSeconds: number,
): AudienceRoundRequest | null {
  const channel = audienceChannelForBattle(battle)
  const species = getPokemon(pokemon.specieId)
  if (!channel || !species || pokemon.hp <= 0) return null
  const options = species.mosse.flatMap((moveId, index) => {
    const move = moveId ? getMossa(moveId) : undefined
    if (!move) return []
    const { dadi, incremento } = getMossaAlLivello(move, pokemon.livello)
    const description = èMossaCura(move) ? `Cura ${move.valoreEffetto ?? 0}${move.effetto === 'CURA_PCT' ? '% degli HP' : ' HP'} e rimuove veleno e paralisi`
      : èMossaSoloStato(move) ? 'Applica uno status senza danni diretti'
      : `${dadi}d6${incremento ? ` + ${incremento}` : ''}`
    return [{ index: index as 0 | 1 | 2, moveId, name: move.nome, type: move.tipo, description }]
  })
  if (!options.length) return null
  const fallback = scegliMossaIA(pokemon, target)
  return {
    turnKey: `${battleId}:B:${opponentTurn}:${pokemon.istanzaId}`,
    channel, durationSeconds: channel === 'boss' ? 120 : durationSeconds,
    trainer: { name: battle.leagueOpponent?.nome ?? getAllenatore(battle.allenatoreId ?? 0)?.nome ?? (battle.tipo === 'PVP' ? 'Rivale PvP' : 'Allenatore rivale'),
      kind: battle.leagueOpponent?.tipo ?? (battle.tipo === 'PVP' ? 'PVP' : channel === 'boss' ? 'Capopalestra' : 'NPC') },
    pokemon: { instanceId: pokemon.istanzaId, speciesId: pokemon.specieId, name: pokemon.nome, level: pokemon.livello },
    options, fallbackIndex: options.some((option) => option.index === fallback) ? fallback : options[0].index,
  }
}

/** A response can only choose a real move for the still-current Pokémon and turn. */
export function validAudienceWinner(
  pending: NonNullable<BattleCheckpoint['audiencePending']>, round: AudienceRound,
  pokemon: PokemonIstanza, currentTurnKey: string,
): 0 | 1 | 2 | null {
  if (round.status !== 'closed' || round.turnKey !== currentTurnKey || pending.request.turnKey !== currentTurnKey
    || (round.channel === 'boss' && round.resolution !== 'guest') || (round.channel === 'npc' && round.resolution === 'guest')
    || round.channel !== pending.request.channel || round.pokemon.instanceId !== pokemon.istanzaId
    || pending.request.pokemon.instanceId !== pokemon.istanzaId || pokemon.hp <= 0
    || round.winnerIndex === null || ![0, 1, 2].includes(round.winnerIndex)) return null
  const option = pending.request.options.find((item) => item.index === round.winnerIndex)
  const announced = round.options.find((item) => item.index === round.winnerIndex)
  return option && announced?.moveId === option.moveId && getPokemon(pokemon.specieId)?.mosse[option.index] === option.moveId ? option.index : null
}
