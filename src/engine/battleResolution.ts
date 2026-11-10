import { applicaStato, applicaXPDopoKO, esitoSquadre, risolviAttaccanteDopoMossa } from './battleEngine'
import type { Lato, PokemonIstanza, RisultatoMossa } from '@/types'

export const updateBattleSquad = (squad: PokemonIstanza[], updated: PokemonIstanza) =>
  squad.map((pokemon) => pokemon.istanzaId === updated.istanzaId ? updated : pokemon)

/** Shared A/B settlement, with target KO and progression strictly before recoil. No randomness. */
export function resolveBattleAttack(result: RisultatoMossa, side: Lato, squadA: PokemonIstanza[], squadB: PokemonIstanza[], maxLevelA = 100, maxLevelB = 100) {
  let defender = { ...result.difensore, hp: Math.max(0, result.difensore.hp - result.dannoFinale) }
  if (result.statoApplicato && defender.hp > 0) defender = applicaStato(defender, result.statoApplicato)
  const defenderAfterImpact = defender
  const attackerProgression = risolviAttaccanteDopoMossa(result, side === 'A' ? maxLevelA : maxLevelB)
  const attacker = attackerProgression.istanza
  // An attacker who takes down the target owns a double KO. Otherwise the
  // surviving target receives the recoil KO reward, once, at its residual HP.
  const defenderProgression = defender.hp > 0 && attacker.hp <= 0
    ? applicaXPDopoKO(defender, result.attaccante, attacker, side === 'A' ? maxLevelB : maxLevelA) : undefined
  if (defenderProgression) defender = defenderProgression.istanza
  const nextA = updateBattleSquad(squadA, side === 'A' ? attacker : defender)
  const nextB = updateBattleSquad(squadB, side === 'B' ? attacker : defender)
  const winnerSide = result.difensore.hp > 0 && result.difensoreSvenuto ? side
    : attacker.hp <= 0 && defender.hp > 0 ? side === 'A' ? 'B' : 'A' : undefined
  return {
    attacker, defender, defenderAfterImpact, attackerProgression, defenderProgression,
    squadA: nextA, squadB: nextB, winnerSide,
    outcome: esitoSquadre(nextA, nextB, result.difensoreSvenuto ? side : undefined),
  }
}

export type BattleAttackResolution = ReturnType<typeof resolveBattleAttack>
