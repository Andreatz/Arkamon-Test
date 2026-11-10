import { useEffect } from 'react'
import { calcolaHPMax } from '@/engine/battleEngine'
import type { BattleCheckpoint, BattleChronicle, PokemonIstanza, StatoBattaglia } from '@/types'
import { settledBattleCheckpoint } from './battleCheckpoint'

interface SettledCheckpointInput {
  available: boolean
  busy: boolean
  pokemonA: PokemonIstanza | null
  pokemonB: PokemonIstanza | null
  squadA: PokemonIstanza[]
  squadB: PokemonIstanza[]
  messages: string[]
  chronicle: BattleChronicle
  control: Parameters<typeof settledBattleCheckpoint>[0]
  onSettled: (patch: Partial<StatoBattaglia>) => void
}

/** A settled save contains both the revealed chronicle and its resulting HP/XP. */
export function makeSettledBattlePatch(input: Pick<SettledCheckpointInput, 'pokemonA' | 'pokemonB' | 'squadA' | 'squadB' | 'messages' | 'chronicle' | 'control'>): Partial<StatoBattaglia> | null {
  if (!input.pokemonA || !input.pokemonB) return null
  return {
    pokemonA: input.pokemonA, pokemonB: input.pokemonB, squadraA: input.squadA, squadraB: input.squadB,
    hpMaxA: calcolaHPMax(input.pokemonA), hpMaxB: calcolaHPMax(input.pokemonB),
    turnoCorrente: input.control.turnA ? 'A' : 'B',
    ...(input.messages.length ? { log: input.messages } : {}),
    cronaca: input.chronicle, checkpoint: settledBattleCheckpoint(input.control),
  }
}

export function useSettledBattleCheckpoint(input: SettledCheckpointInput) {
  const { control } = input
  const switchReason = control.switchRequest?.motivo
  const switchNext = control.switchRequest?.prossimoPasso
  const pendingRequest: BattleCheckpoint['audiencePending'] = control.audiencePending
  useEffect(() => {
    if (!input.available || input.busy) return
    const patch = makeSettledBattlePatch(input)
    if (patch) input.onSettled(patch)
    // These dependencies are the settled state. A store patch must not save
    // recursively because the parent battle object changed identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.available, input.busy, input.pokemonA, input.pokemonB, input.squadA, input.squadB,
    input.messages, input.chronicle, input.onSettled, control.initialPriority, control.turnA,
    control.pvp, control.chooseRivalMove, control.passDirection, switchReason, switchNext,
    control.outcome, control.openingComplete, control.evolutions, control.rivalMessages,
    control.audienceBattleId, control.opponentTurnNumber, pendingRequest?.sessionId, pendingRequest?.request])
}
