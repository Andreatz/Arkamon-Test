import { describe, expect, it } from 'vitest'
import { currentRoster } from '../currentRoster'
import type { PokemonIstanza, StatoBattaglia } from '@/types'

describe('current consultation roster', () => {
  it('shows settled battle HP and status without changing campaign instances', () => {
    const stored: PokemonIstanza = { istanzaId: 'mine', specieId: 5, nome: 'Darklaw', livello: 5, hp: 12, xp: 0 }
    const hit = { ...stored, hp: 9, stato: { tipo: 'Avvelenato' as const, turniRimanenti: -1, turniTrascorsi: 1 } }
    const other = { ...stored, istanzaId: 'other', hp: 7 }
    const battle = { pokemonA: hit, pokemonB: other, squadraA: [stored], squadraB: [] } as unknown as StatoBattaglia
    expect(currentRoster([stored], battle)).toEqual([hit])
    expect(stored.hp).toBe(12)
    expect(currentRoster([other], null)[0]).toBe(other)
    const reserve = { ...stored, istanzaId: 'reserve' }
    expect(currentRoster([reserve], battle)[0]).toBe(reserve)
  })
})
