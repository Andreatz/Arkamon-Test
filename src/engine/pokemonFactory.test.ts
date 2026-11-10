import { describe, expect, it } from 'vitest'
import { creaIstanza } from './pokemonFactory'
import { calcolaHPMax } from './battleEngine'

describe('domain instance creation', () => {
  it('creates a real creature with full HP and no banked experience', () => {
    const pokemon = creaIstanza(1, 5, { nextId: () => 'fixture-1' })!
    expect(pokemon).toMatchObject({ istanzaId: 'fixture-1', specieId: 1, livello: 5, xp: 0 })
    expect(pokemon.hp).toBe(calcolaHPMax(pokemon))
  })
  it('can use deterministic services without loading or changing a game store', () => {
    expect(creaIstanza(900, 12, { species: () => ({ nome: 'Esempio' }), nextId: () => 'stable', maxHp: () => 31 }))
      .toEqual({ istanzaId: 'stable', specieId: 900, nome: 'Esempio', livello: 12, hp: 31, xp: 0 })
    expect(creaIstanza(99999, 5)).toBeNull()
  })
})
