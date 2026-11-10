import { determinaIniziativa } from '@/engine/battleEngine'
import { validateAudienceRoundRequest } from '@/audience/audienceApi'
import { audienceChannelForBattle } from './audienceBattle'
import type { BattleCheckpoint, Lato, StatoBattaglia } from '@/types'

const phases = new Set<BattleCheckpoint['phase']>([
  'player', 'opponent', 'rival-move', 'audience', 'pass-player', 'pass-rival', 'switch', 'ended',
])

/** Old saves retain their opening side; new checkpoints keep that separate from the current turn. */
export function restoreBattleCheckpoint(battle: StatoBattaglia): BattleCheckpoint {
  const saved = battle.checkpoint
  const baseline = determinaIniziativa(
    battle.pokemonA.livello, battle.pokemonB.livello,
    () => battle.turnoCorrente === 'B' ? 1 : 0,
  )
  const fallback: BattleCheckpoint = {
    version: 1,
    initialPriority: baseline,
    actedThisRound: [],
    phase: battle.turnoCorrente === 'A' ? 'player' : battle.tipo === 'PVP' ? 'pass-rival' : 'opponent',
    openingComplete: false,
    outcome: null,
    evolutions: [],
    rivalMessages: [],
  }
  if (!saved || saved.version !== 1 || !phases.has(saved.phase)
    || !['A', 'B'].includes(saved.initialPriority)
    || (saved.phase === 'ended' && saved.outcome !== 'vittoria' && saved.outcome !== 'sconfitta')
    || (saved.phase === 'switch' && (!saved.switchRequest
      || !['passaAdA', 'passaAB'].includes(saved.switchRequest.prossimoPasso)))) return fallback
  let pending: BattleCheckpoint['audiencePending']
  const audienceBattleId = typeof saved.audienceBattleId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(saved.audienceBattleId)
    ? saved.audienceBattleId : undefined
  const opponentTurnNumber = Number.isSafeInteger(saved.opponentTurnNumber) && saved.opponentTurnNumber! >= 0
    ? saved.opponentTurnNumber : undefined
  try {
    const value = saved.audiencePending
    if (value && typeof value.sessionId === 'string' && /^[a-f0-9-]{32,36}$/i.test(value.sessionId)) {
      const request = validateAudienceRoundRequest(value.request)
      const currentTurnKey = audienceBattleId && opponentTurnNumber !== undefined
        ? `${audienceBattleId}:B:${opponentTurnNumber}:${battle.pokemonB.istanzaId}` : undefined
      if (request.channel === audienceChannelForBattle(battle) && request.pokemon.instanceId === battle.pokemonB.istanzaId
        && request.pokemon.speciesId === battle.pokemonB.specieId && request.turnKey === currentTurnKey) {
        pending = { sessionId: value.sessionId, request }
      }
    }
  } catch { /* A malformed old ballot falls back to its already-prepared move stage. */ }
  const validPending = pending !== undefined
  // Recover only the unavailable ballot, keeping initiative, acted sides and
  // earned evolutions from this settled turn. An old key can never execute a
  // newer turn; returning to the prepared move stage avoids a second status tick.
  const phase = saved.phase !== 'audience' ? saved.phase
    : battle.pokemonB.hp <= 0 || battle.pokemonB.stato?.tipo === 'Addormentato' ? 'opponent'
    : validPending ? 'audience' : 'rival-move'
  return {
    ...fallback,
    initialPriority: saved.initialPriority,
    phase,
    openingComplete: saved.phase === 'ended' || saved.phase === 'audience' || saved.openingComplete === true,
    outcome: saved.phase === 'ended' ? saved.outcome : null,
    actedThisRound: [...new Set((Array.isArray(saved.actedThisRound) ? saved.actedThisRound : [])
      .filter((side): side is Lato => side === 'A' || side === 'B'))],
    switchRequest: saved.phase === 'switch' ? saved.switchRequest : undefined,
    evolutions: (Array.isArray(saved.evolutions) ? saved.evolutions : []).filter((evolution) =>
      evolution && typeof evolution.istanzaId === 'string'
      && Number.isInteger(evolution.oldSpecieId) && Number.isInteger(evolution.newSpecieId)),
    rivalMessages: (Array.isArray(saved.rivalMessages) ? saved.rivalMessages : []).filter((message) => typeof message === 'string'),
    ...(audienceBattleId ? { audienceBattleId } : {}),
    ...(opponentTurnNumber !== undefined ? { opponentTurnNumber } : {}),
    ...(phase === 'audience' && validPending ? { audiencePending: pending } : {}),
  }
}

/** Serialize only control points. Functions, timers and native playback are intentionally absent. */
export function settledBattleCheckpoint(options: {
  initialPriority: Lato
  actedThisRound: Set<Lato>
  turnA: boolean
  pvp: boolean
  chooseRivalMove: boolean
  passDirection?: 'A→B' | 'B→A'
  switchRequest?: BattleCheckpoint['switchRequest']
  outcome: BattleCheckpoint['outcome']
  openingComplete: boolean
  evolutions: BattleCheckpoint['evolutions']
  rivalMessages: string[]
  audienceBattleId?: string
  opponentTurnNumber?: number
  audiencePending?: BattleCheckpoint['audiencePending']
}): BattleCheckpoint {
  const phase = options.outcome ? 'ended'
    : options.switchRequest ? 'switch'
    : options.audiencePending ? 'audience'
    : options.passDirection === 'A→B' ? 'pass-rival'
    : options.passDirection === 'B→A' ? 'pass-player'
    : options.chooseRivalMove ? 'rival-move'
    : options.turnA ? 'player' : 'opponent'
  return {
    version: 1,
    initialPriority: options.initialPriority,
    actedThisRound: [...options.actedThisRound],
    phase,
    openingComplete: options.openingComplete,
    outcome: options.outcome,
    switchRequest: options.switchRequest,
    evolutions: options.evolutions,
    rivalMessages: options.rivalMessages,
    ...(options.audienceBattleId ? { audienceBattleId: options.audienceBattleId } : {}),
    ...(options.opponentTurnNumber !== undefined ? { opponentTurnNumber: options.opponentTurnNumber } : {}),
    ...(phase === 'audience' && options.audiencePending ? { audiencePending: options.audiencePending } : {}),
  }
}
