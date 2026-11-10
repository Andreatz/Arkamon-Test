import { describe, expect, it } from 'vitest'
import { nextBattleSide } from './battleRoundOrder'
import { applicaStato, determinaIniziativa, risolviStatoInizioTurno } from '@/engine/battleEngine'
import type { Lato } from '@/types'
describe('round initiative', () => {
  it('new paralysis changes the next round, with one action per side in the current round', () => {
    const acted = new Set<Lato>()
    expect(nextBattleSide(acted, 'A', 'A')).toBe('B')
    expect(nextBattleSide(acted, 'B', 'A', 'Paralizzato')).toBe('B')
    expect(nextBattleSide(acted, 'B', 'A', 'Paralizzato')).toBe('A')
    expect(nextBattleSide(acted, 'A', 'A', 'Paralizzato')).toBe('B')
  })
  it('recovery restores the initial priority after both actions, not mid-round', () => {
    const acted = new Set<Lato>()
    expect(nextBattleSide(acted, 'B', 'A', 'Paralizzato')).toBe('A')
    expect(nextBattleSide(acted, 'A', 'A')).toBe('A')
    expect(nextBattleSide(acted, 'A', 'A')).toBe('B')
  })
  it('a failed capture consumes A’s action, including when A acts second', () => {
    const acted = new Set<Lato>()
    // First round: B attacks, A uses its action on a failed capture.
    expect(nextBattleSide(acted, 'B', 'B')).toBe('A')
    expect(nextBattleSide(acted, 'A', 'B')).toBe('B')
    expect(acted.size).toBe(0)
    // The next attack/capture round has exactly the same order.
    expect(nextBattleSide(acted, 'B', 'B')).toBe('A')
    expect(nextBattleSide(acted, 'A', 'B')).toBe('B')
  })
  it('a start-turn poison KO still consumes the side’s action before its replacement enters', () => {
    const acted = new Set<Lato>()
    const pokemon = applicaStato({ istanzaId: 'poisoned', specieId: 1, nome: 'Test', livello: 5, hp: 1, xp: 0 }, 'Avvelenato')
    const result = risolviStatoInizioTurno(pokemon, 12)
    expect(result.istanza.hp).toBe(0)
    expect(result.puoAgire).toBe(false)
    expect(nextBattleSide(acted, 'A', 'A')).toBe('B')
    // B’s recoil/poison KO with another reserve completes, rather than restarting, the round.
    expect(nextBattleSide(acted, 'B', 'A')).toBe('A')
    expect(acted.size).toBe(0)
    expect(nextBattleSide(acted, 'A', 'A')).toBe('B')
  })
  it('restores level priority after recovery from pre-existing paralysis', () => {
    const opening = determinaIniziativa(20, 5, () => 0, 'Paralizzato')
    expect(opening).toBe('B')
    const baseline = determinaIniziativa(20, 5, () => opening === 'B' ? 1 : 0)
    const acted = new Set<Lato>()
    expect(nextBattleSide(acted, opening, baseline, 'Paralizzato')).toBe('A')
    // A recovered on its visible status die: the next round returns to higher-level A.
    expect(nextBattleSide(acted, 'A', baseline)).toBe('A')
    expect(nextBattleSide(acted, 'A', baseline)).toBe('B')
  })
})
