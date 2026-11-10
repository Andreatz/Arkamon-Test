import { describe, expect, it } from 'vitest'
import { ALLENATORI, getPokemon } from '@data/index'

const idsBattleRefresh = new Set([201, 203, 302, 303, 305, 306, 307, 309, 311])

describe('allenatori — Battle Refresh', () => {
  it('Rivale e Capipalestra hanno una squadra completa da 6 Pokemon', () => {
    const principali = ALLENATORI.filter((a) => idsBattleRefresh.has(a.id))

    expect(principali).toHaveLength(idsBattleRefresh.size)
    for (const allenatore of principali) {
      expect(allenatore.squadra).toHaveLength(6)
    }
  })

  it('tutti gli slot squadra puntano a specie Pokemon esistenti', () => {
    for (const allenatore of ALLENATORI) {
      for (const slot of allenatore.squadra) {
        expect(getPokemon(slot.pokemonId), `${allenatore.nome}: ${slot.pokemonId}`).toBeTruthy()
      }
    }
  })
})
