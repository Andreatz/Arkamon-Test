import { describe, expect, it } from 'vitest'
import type { PokemonIstanza } from '@/types'
import { EMPTY_DEPOSIT_FILTERS, matchesDepositFilters, previewDepositSwap } from '../depositTools'

const pokemon = (id: string, level: number, hp = 12): PokemonIstanza => ({ istanzaId: id, specieId: 1, nome: id, livello: level, hp, xp: 0 })
describe('deposit filters and swap preview', () => {
  it('finds nickname/species/number without accents and does not confuse KO with a living status', () => {
    const creature = { ...pokemon('Étoile', 25), stato: { tipo: 'Paralizzato' as const, turniRimanenti: -1 } }
    expect(matchesDepositFilters(creature, { ...EMPTY_DEPOSIT_FILTERS, search: 'etoile' })).toBe(true)
    expect(matchesDepositFilters(creature, { ...EMPTY_DEPOSIT_FILTERS, search: 'Vyrath', type: 'Normale', minimum: '25', maximum: '25', condition: 'status' })).toBe(true)
    expect(matchesDepositFilters(creature, { ...EMPTY_DEPOSIT_FILTERS, type: 'Acqua' })).toBe(false)
    expect(matchesDepositFilters(creature, { ...EMPTY_DEPOSIT_FILTERS, maximum: '24' })).toBe(false)
    expect(matchesDepositFilters({ ...creature, hp: 0 }, { ...EMPTY_DEPOSIT_FILTERS, condition: 'status' })).toBe(false)
    expect(matchesDepositFilters({ ...creature, hp: 0 }, { ...EMPTY_DEPOSIT_FILTERS, condition: 'ko' })).toBe(true)
    expect(matchesDepositFilters(creature, { ...EMPTY_DEPOSIT_FILTERS, condition: 'healthy' })).toBe(false)
  })
  it('previews the real occupied-slot swap, including KO members in the five-level cap', () => {
    const team = [pokemon('first', 20), pokemon('fainted', 20, 0)]
    const deposit = { '1:35': pokemon('reserve', 26) }
    const before = structuredClone({ team, deposit })
    expect(previewDepositSwap(team, deposit, { tipo: 'deposito', chiave: '1:35' }, { tipo: 'squadra', indice: 0 })).toEqual({ range: { min: 20, max: 26, gap: 6 }, balanced: false, allowed: false, count: 2 })
    expect({ team, deposit }).toEqual(before)
  })
  it('previews compact append, while allowing legacy out-of-cap teams to remove a member', () => {
    const team = [pokemon('one', 20), pokemon('two', 25)]
    expect(previewDepositSwap(team, { '2:1': pokemon('reserve', 24) }, { tipo: 'deposito', chiave: '2:1' }, { tipo: 'squadra', indice: 5 })).toEqual({ range: { min: 20, max: 25, gap: 5 }, balanced: true, allowed: true, count: 3 })
    const legacy = [pokemon('one', 5), pokemon('two', 20), pokemon('three', 30)]
    expect(previewDepositSwap(legacy, {}, { tipo: 'squadra', indice: 0 }, { tipo: 'deposito', chiave: '3:7' })).toEqual({ range: { min: 20, max: 30, gap: 10 }, balanced: false, allowed: true, count: 2 })
  })
})
