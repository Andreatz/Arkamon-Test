import { describe, it, expect } from 'vitest'
import { scambia, type SlotRef } from '@engine/deposito'
import type { PokemonIstanza } from '@/types'

function mk(istanzaId: string, specieId = 1, livello = 5): PokemonIstanza {
  return {
    istanzaId,
    specieId,
    nome: `Pkmn-${istanzaId}`,
    livello,
    hp: 12,
    xp: 0,
  }
}

const sqRef = (i: number): SlotRef => ({ tipo: 'squadra', indice: i })
const dpRef = (k: string): SlotRef => ({ tipo: 'deposito', chiave: k })

describe('scambia - casi base', () => {
  it('source vuoto → no-op (squadra)', () => {
    const sq = [mk('a')]
    const dp = {}
    const r = scambia(sq, dp, sqRef(2), dpRef('1:1'))
    expect(r.squadra).toBe(sq)
    expect(r.deposito).toBe(dp)
  })

  it('source vuoto → no-op (deposito)', () => {
    const sq = [mk('a')]
    const dp = {}
    const r = scambia(sq, dp, dpRef('1:1'), sqRef(0))
    expect(r.squadra).toBe(sq)
    expect(r.deposito).toBe(dp)
  })

  it('source === target → no-op', () => {
    const sq = [mk('a')]
    const r = scambia(sq, {}, sqRef(0), sqRef(0))
    expect(r.squadra).toEqual([mk('a')])
  })
})

describe('scambia - swap squadra ↔ deposito (entrambi pieni)', () => {
  it('squadra[0] ↔ deposito["1:1"]', () => {
    const sq = [mk('a'), mk('b')]
    const dp = { '1:1': mk('c') }
    const r = scambia(sq, dp, sqRef(0), dpRef('1:1'))
    expect(r.squadra).toEqual([mk('c'), mk('b')])
    expect(r.deposito).toEqual({ '1:1': mk('a') })
  })

  it('deposito["2:5"] ↔ squadra[1]', () => {
    const sq = [mk('a'), mk('b')]
    const dp = { '2:5': mk('c') }
    const r = scambia(sq, dp, dpRef('2:5'), sqRef(1))
    expect(r.squadra).toEqual([mk('a'), mk('c')])
    expect(r.deposito).toEqual({ '2:5': mk('b') })
  })
})

describe('scambia - move (target vuoto)', () => {
  it('squadra[0] → deposito["1:1" vuoto] (squadra si compatta)', () => {
    const sq = [mk('a'), mk('b'), mk('c')]
    const r = scambia(sq, {}, sqRef(0), dpRef('1:1'))
    expect(r.squadra).toEqual([mk('b'), mk('c')])
    expect(r.deposito).toEqual({ '1:1': mk('a') })
  })

  it('deposito["1:1"] → squadra slot vuoto (append)', () => {
    const sq = [mk('a')]
    const dp = { '1:1': mk('b') }
    const r = scambia(sq, dp, dpRef('1:1'), sqRef(5))
    expect(r.squadra).toEqual([mk('a'), mk('b')])
    expect(r.deposito).toEqual({})
  })

  it('squadra piena (6) + deposito → squadra slot append → no-op', () => {
    const sq = [0, 1, 2, 3, 4, 5].map((i) => mk(`p${i}`))
    const dp = { '1:1': mk('extra') }
    const r = scambia(sq, dp, dpRef('1:1'), sqRef(6))
    expect(r.squadra).toBe(sq)
    expect(r.deposito).toBe(dp)
  })

  it('deposito ["1:1"] → deposito ["2:1" vuoto] (move tra slot deposito)', () => {
    const dp = { '1:1': mk('a') }
    const r = scambia([], dp, dpRef('1:1'), dpRef('2:1'))
    expect(r.deposito).toEqual({ '2:1': mk('a') })
  })
})

describe('scambia - swap deposito ↔ deposito', () => {
  it('entrambi pieni: ["1:1"] ↔ ["2:5"]', () => {
    const dp = { '1:1': mk('a'), '2:5': mk('b') }
    const r = scambia([], dp, dpRef('1:1'), dpRef('2:5'))
    expect(r.deposito).toEqual({ '1:1': mk('b'), '2:5': mk('a') })
  })
})

describe('scambia - swap squadra ↔ squadra', () => {
  it('squadra[0] ↔ squadra[2]', () => {
    const sq = [mk('a'), mk('b'), mk('c'), mk('d')]
    const r = scambia(sq, {}, sqRef(0), sqRef(2))
    expect(r.squadra).toEqual([mk('c'), mk('b'), mk('a'), mk('d')])
  })
})

describe('scambia - immutabilità', () => {
  it('non muta gli input', () => {
    const sq = [mk('a'), mk('b')]
    const dp = { '1:1': mk('c') }
    const sqOriginal = [...sq]
    const dpOriginal = { ...dp }
    scambia(sq, dp, sqRef(0), dpRef('1:1'))
    expect(sq).toEqual(sqOriginal)
    expect(dp).toEqual(dpOriginal)
  })
})
