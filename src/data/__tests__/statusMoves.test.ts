import { describe, expect, it } from 'vitest'
import catalog from '../move-vfx-assignments.json'
import originalPokemon from '../pokemon.json'
import originalMoves from '../mosse.json'
import { getMossa, getPokemon, MOSSE, POKEMON_BASE } from '../index'
import { addStatusMovesToPokemon, PARALYSIS_MOVE_ASSIGNMENTS, STATUS_MOVES } from '../statusMoves'
import type { PokemonSpecie } from '@/types'

const owners: [number, number[]][] = [
  [221, [3, 4]], [225, [27]], [227, [25]], [230, [21]], [242, [70]],
  [253, [48]], [256, [44]], [270, [78]], [271, [55]],
]

describe('mosse runtime di sola paralisi dal catalogo', () => {
  it('aggiunge soltanto le nove definizioni autorizzate senza modificare le 220 mosse originali', () => {
    expect(STATUS_MOVES.map((move) => move.id)).toEqual(owners.map(([id]) => id))
    expect(MOSSE).toHaveLength(229)
    expect(MOSSE.slice(0, 220)).toEqual(originalMoves)
    expect(new Set(MOSSE.map((move) => move.id)).size).toBe(229)
    for (const move of STATUS_MOVES) {
      const source = catalog.moves.find((entry) => entry.sourceMoveId === move.id)!
      expect(source.gameMoveId).toBeNull()
      expect(move).toMatchObject({
        nome: source.name, tipo: source.element, effetto: 'PARALISI', soloStato: true,
        valoreEffetto: null, dadiPerLivello: { '5': 0 }, incrementoPerLivello: { '5': 0 },
      })
      expect(getMossa(move.id)).toBe(move)
    }
  })

  it('deriva i proprietari dal catalogo e usa soltanto il terzo slot prima vuoto', () => {
    for (const [moveId, speciesIds] of owners) {
      const source = PARALYSIS_MOVE_ASSIGNMENTS.find((entry) => entry.sourceMoveId === moveId)!
      expect(source.arkamon.map((owner) => owner.id)).toEqual(speciesIds)
      for (const speciesId of speciesIds) {
        const original = originalPokemon.find((pokemon) => pokemon.id === speciesId)!
        expect(original.mosse[2]).toBe(0)
        expect(getPokemon(speciesId)!.mosse).toEqual([...original.mosse.slice(0, 2), moveId])
        expect(getPokemon(speciesId)!.mosse).not.toBe(original.mosse)
      }
    }
  })

  it('preserva ogni attacco esistente e le specie senza una nuova paralisi', () => {
    const authorizedOwners = new Set(owners.flatMap(([, ids]) => ids))
    expect(POKEMON_BASE).toHaveLength(originalPokemon.length)
    for (const original of originalPokemon) {
      const runtime = getPokemon(original.id)!
      for (let slot = 0; slot < 3; slot++) {
        if (original.mosse[slot] !== 0) expect(runtime.mosse[slot]).toBe(original.mosse[slot])
      }
      if (!authorizedOwners.has(original.id)) expect(runtime).toEqual(original)
    }
    const remainingPreviews = catalog.moves.filter((entry) => entry.sourceMoveId >= 221
      && !STATUS_MOVES.some((move) => move.id === entry.sourceMoveId))
    expect(remainingPreviews).toHaveLength(47)
    expect(remainingPreviews.every((entry) => getMossa(entry.sourceMoveId) === undefined)).toBe(true)
  })

  it('non sovrascrive una squadra mosse completa o inserisce doppioni', () => {
    const original = originalPokemon.find((pokemon) => pokemon.id === 3)! as PokemonSpecie
    const full = { ...original, mosse: [3, 113, 55] as PokemonSpecie['mosse'] }
    expect(addStatusMovesToPokemon([full])[0].mosse).toEqual([3, 113, 55])
    const once = addStatusMovesToPokemon([original])
    expect(addStatusMovesToPokemon(once)[0].mosse).toEqual(once[0].mosse)
    expect(original.mosse).toEqual([3, 113, 0])
  })
})
