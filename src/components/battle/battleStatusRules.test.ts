import { describe, it, expect } from 'vitest'
import { applicaStato, risolviStatoInizioTurno, determinaIniziativa } from '@/engine/battleEngine'
import type { PokemonIstanza } from '@/types'
const base: PokemonIstanza = { istanzaId: 'test', specieId: 1, nome: 'Test', livello: 5, hp: 100, xp: 0 }
describe('status rules with visible die results', () => {
  it('paralysis blocks attacking on 1-2, permits it on 3-6 and remains on every face', () => {
    for (let face = 1; face <= 6; face++) {
      const result = risolviStatoInizioTurno(applicaStato(base, 'Paralizzato'), 100, () => (face - 0.5) / 6)
      expect(result.tiroStato).toBe(face)
      expect(result.puoAgire).toBe(face >= 3)
      expect(result.istanza.stato).toEqual({ tipo: 'Paralizzato', turniRimanenti: -1 })
      expect(result.istanza.hp).toBe(100)
    }
  })
  it('sleep skips its first turn without a die, wakes on 4-6 from turn two and skips at most three turns', () => {
    const first = risolviStatoInizioTurno(applicaStato(base, 'Addormentato'), 100, () => {
      throw new Error('The mandatory first sleep turn must not roll or open a die overlay')
    })
    expect(first.tiroStato).toBeUndefined()
    expect(first.puoAgire).toBe(false)
    expect(first.istanza.stato).toEqual({ tipo: 'Addormentato', turniRimanenti: 2 })
    for (let face = 1; face <= 6; face++) {
      const result = risolviStatoInizioTurno(first.istanza, 100, () => (face - 0.5) / 6)
      expect(result.tiroStato).toBe(face)
      expect(result.puoAgire).toBe(face >= 4)
      expect(result.istanza.stato === undefined).toBe(face >= 4)
    }
    let current = applicaStato(base, 'Addormentato')
    let rolls = 0
    for (let turn = 1; turn <= 3; turn++) {
      const result = risolviStatoInizioTurno(current, 100, () => { rolls += 1; return 0 })
      expect(result.tiroStato).toBe(turn === 1 ? undefined : 1)
      expect(result.puoAgire).toBe(false)
      current = result.istanza
    }
    expect(rolls).toBe(2)
    expect(current.stato).toBeUndefined()
    const fourth = risolviStatoInizioTurno(current, 100, () => {
      throw new Error('The fourth turn has no remaining sleep die')
    })
    expect(fourth.puoAgire).toBe(true)
    expect(fourth.tiroStato).toBeUndefined()
  })
  it('poison loses 10% max HP per turn, clamps at zero and has no recovery die', () => {
    const result = risolviStatoInizioTurno(applicaStato({ ...base, hp: 5 }, 'Avvelenato'), 100)
    expect(result.dannoSubito).toBe(10)
    expect(result.istanza.hp).toBe(0)
    expect(result.puoAgire).toBe(false)
    expect(result.tiroStato).toBeUndefined()
  })
  it('does not roll status recovery or apply another poison tick to an already fainted Pokémon', () => {
    for (const status of ['Paralizzato', 'Addormentato', 'Avvelenato'] as const) {
      const pokemon = applicaStato({ ...base, hp: 0 }, status)
      const result = risolviStatoInizioTurno(pokemon, 100, () => { throw new Error('A fainted Pokémon must not roll') })
      expect(result.istanza).toBe(pokemon)
      expect(result.puoAgire).toBe(false)
      expect(result.dannoSubito).toBe(0)
      expect(result.tiroStato).toBeUndefined()
    }
  })
  it('paralysis takes initiative priority below level; equal levels have fair two-sided outcome', () => {
    expect(determinaIniziativa(20, 5, () => 0, 'Paralizzato')).toBe('B')
    expect(determinaIniziativa(5, 20, () => 1, undefined, 'Paralizzato')).toBe('A')
    expect(determinaIniziativa(5, 5, () => 0.49)).toBe('A')
    expect(determinaIniziativa(5, 5, () => 0.5)).toBe('B')
  })
})
