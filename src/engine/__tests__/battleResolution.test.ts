import { describe, expect, it } from 'vitest'
import { calcolaAzioneSuprema, calcolaDanno } from '../battleEngine'
import { resolveBattleAttack } from '../battleResolution'
import type { Lato, PokemonIstanza } from '@/types'

const creature = (id: string, level: number, hp: number): PokemonIstanza => ({ istanzaId: id, specieId: 1, nome: id, livello: level, hp, xp: 0 })
function squads(attacker: PokemonIstanza, defender: PokemonIstanza, side: Lato) { return side === 'A' ? [[attacker], [defender]] : [[defender], [attacker]] }

describe('risoluzione comune ai due lati', () => {
  it.each(['A', 'B'] as const)('risolve doppio KO da Suprema %s con XP prima del costo e vittoria dell’attaccante', (side) => {
    const attacker = creature('attacker', 14, 13)
    const defender = creature('defender', 5, 1)
    const result = calcolaAzioneSuprema(attacker, defender, 0, () => 0)!
    const [a, b] = squads(attacker, defender, side)
    const resolved = resolveBattleAttack(result, side, a, b)
    expect(resolved.attackerProgression.istanzaPrimaDelContraccolpo).toMatchObject({ livello: 15, hp: 13 })
    expect(resolved.attackerProgression.autodanno).toBe(13)
    expect(resolved.attacker).toMatchObject({ livello: 15, hp: 0 })
    expect(resolved.defender.hp).toBe(0)
    expect(resolved.defenderProgression).toBeUndefined()
    expect(resolved.winnerSide).toBe(side)
    expect(resolved.outcome).toBe(side === 'A' ? 'vittoria' : 'sconfitta')
    expect(attacker).toMatchObject({ livello: 14, hp: 13 })
    expect(defender.hp).toBe(1)
  })

  it.each(['A', 'B'] as const)('premia il bersaglio sopravvissuto quando %s cede al contraccolpo', (side) => {
    const attacker = creature('attacker', 10, 1)
    const defender = creature('defender', 20, 20)
    const result = calcolaAzioneSuprema(attacker, defender, 0, () => 0)!
    const [a, b] = squads(attacker, defender, side)
    const resolved = resolveBattleAttack(result, side, a, b)
    expect(resolved.attackerProgression.xpAssegnata).toBe(0)
    expect(resolved.defenderProgression?.xpAssegnata).toBe(1)
    expect(resolved.defender).toMatchObject({ livello: 21, hp: 20 - result.dannoFinale })
    expect(resolved.defenderAfterImpact.livello).toBe(20)
    expect(resolved.winnerSide).toBe(side === 'A' ? 'B' : 'A')
  })

  it('un normale attacco conserva il danno e non applica costi o XP senza KO', () => {
    const a = creature('A', 5, 12)
    const b = creature('B', 5, 12)
    const result = calcolaDanno(a, b, 0, () => 0, false)!
    const resolved = resolveBattleAttack(result, 'A', [a], [b])
    expect(resolved.attacker.hp).toBe(12)
    expect(resolved.defender.hp).toBe(12 - result.dannoFinale)
    expect(resolved.attackerProgression.xpAssegnata).toBe(0)
    expect(resolved.winnerSide).toBeUndefined()
    expect(resolved.outcome).toBeNull()
  })
})
