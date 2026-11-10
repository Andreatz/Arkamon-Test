import { describe, expect, it } from 'vitest'
import { getPokemon, POKEMON_BASE } from '@/data'
import type { PokemonIstanza, StatoBattaglia } from '@/types'
import {
  arkadexEvolutionLabel, deriveArkadexProgress, emptyArkadexProgress, getArkadexEntries,
  getArkadexSpecimens, normalizeArkadexProgress, recordArkadex, type ArkadexSnapshot,
} from '../arkadexModel'

const pokemon = (specieId: number, livello = 5, istanzaId = `p-${specieId}`): PokemonIstanza => ({ istanzaId, specieId, livello, hp: 3, xp: 1, nome: getPokemon(specieId)?.nome ?? 'Test' })
const snapshot = (): ArkadexSnapshot => ({
  giocatore1: { squadra: [pokemon(1)], deposito: { '2:3': pokemon(17, 20) } },
  giocatore2: { squadra: [pokemon(5)], deposito: {} }, giocatoreAttivo: 1, battaglia: null,
})
const battle = (): StatoBattaglia => ({ tipo: 'Selvatico', pokemonA: pokemon(1), pokemonB: pokemon(22, 27), hpMaxA: 12, hpMaxB: 50, turnoCorrente: 'A', luogoRitorno: 'Percorso_1', log: [], evoluzioneInAttesa: null })

describe('Arkadex progress and private discoveries', () => {
  it('sanitizes species IDs and always includes obtained species among seen species', () => {
    expect(normalizeArkadexProgress({ seen1: [1, 1, 999, -1, '5', 2.5], caught1: [5, 5], seen2: [9], caught2: [9, 12] }))
      .toEqual({ seen1: [1, 5], caught1: [5], seen2: [9, 12], caught2: [9, 12] })
    expect(normalizeArkadexProgress(null)).toEqual(emptyArkadexProgress())
  })

  it('keeps individual discoveries, is idempotent and does not consume randomness', () => {
    const empty = emptyArkadexProgress()
    const seen = recordArkadex(empty, 1, 17)
    expect(seen).toEqual({ ...empty, seen1: [17] })
    expect(recordArkadex(seen, 1, 17)).toBe(seen)
    expect(recordArkadex(seen, 2, 999)).toBe(seen)
    const caught = recordArkadex(seen, 1, 17, true)
    expect(caught).toEqual({ ...empty, seen1: [17], caught1: [17] })
    expect(empty).toEqual(emptyArkadexProgress())
  })

  it('migrates only the real current collection, plus the active player encounter', () => {
    const state = { ...snapshot(), battaglia: battle() }
    const derived = deriveArkadexProgress(emptyArkadexProgress(), state)
    expect(derived).toEqual({ seen1: [1, 17, 22], caught1: [1, 17], seen2: [5], caught2: [5] })
    expect(derived.caught1).not.toContain(22)
    expect(derived.seen2).not.toContain(22)
    expect(derived.seen1).not.toContain(16)
  })

  it('retains historical discoveries after evolution or removal from today’s collection', () => {
    const historical = recordArkadex(emptyArkadexProgress(), 1, 1, true)
    const state = snapshot(); state.giocatore1 = { squadra: [pokemon(2)], deposito: {} }
    expect(deriveArkadexProgress(historical, state).caught1).toEqual([1, 2])
  })

  it('locks unknown names and types in data as well as in UI filtering', () => {
    const empty = emptyArkadexProgress()
    const entries = getArkadexEntries(empty, 1)
    expect(entries).toHaveLength(110)
    expect(POKEMON_BASE).toHaveLength(110)
    expect(entries.every((entry) => entry.status === 'unknown' && entry.species === undefined)).toBe(true)
    expect(getArkadexEntries(empty, 1, { search: 'Darklaw' })).toHaveLength(0)
    expect(getArkadexEntries(empty, 1, { type: 'Oscurità' })).toHaveLength(0)
    expect(getArkadexEntries(empty, 1, { search: '#110' }).map((entry) => entry.id)).toEqual([110])
  })

  it('searches discovered names and filters obtained separately from seen-only', () => {
    const known = recordArkadex(recordArkadex(emptyArkadexProgress(), 1, 1, true), 1, 5)
    expect(getArkadexEntries(known, 1, { search: ' darkLAW ' }).map((entry) => entry.id)).toEqual([5])
    expect(getArkadexEntries(known, 1, { status: 'caught' }).map((entry) => entry.id)).toEqual([1])
    expect(getArkadexEntries(known, 1, { status: 'seen' }).map((entry) => entry.id)).toEqual([5])
    expect(getArkadexEntries(known, 2, { search: 'Vyrath' })).toHaveLength(0)
  })

  it('provides actual levels from team, deposit and current encounter without changing HP', () => {
    const state = { ...snapshot(), battaglia: battle() }
    expect(getArkadexSpecimens(state, 1, 17)).toEqual([{ pokemon: state.giocatore1.deposito['2:3'], source: 'deposito' }])
    expect(getArkadexSpecimens(state, 1, 22)[0].pokemon.livello).toBe(27)
    expect(getArkadexSpecimens(state, 1, 22)[0].pokemon.hp).toBe(3)
    expect(getArkadexSpecimens(state, 2, 22)).toEqual([])
  })

  it('does not expose the next evolution name until that species has been discovered', () => {
    const species = getPokemon(1)!
    const unknownEvolution = arkadexEvolutionLabel(species, recordArkadex(emptyArkadexProgress(), 1, 1, true), 1)
    expect(unknownEvolution).toContain('livello 15')
    expect(unknownEvolution).not.toContain(getPokemon(2)!.nome)
    expect(arkadexEvolutionLabel(species, recordArkadex(emptyArkadexProgress(), 1, 2), 1)).toContain(getPokemon(2)!.nome)
    expect(arkadexEvolutionLabel(species, recordArkadex(emptyArkadexProgress(), 1, 2), 2)).not.toContain(getPokemon(2)!.nome)
  })
})
