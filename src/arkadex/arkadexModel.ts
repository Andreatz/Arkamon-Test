import { getPokemon, POKEMON_BASE } from '@/data'
import type { PokemonIstanza, PokemonSpecie, StatoBattaglia, StatoGiocatore, TipoPokemon } from '@/types'

/** Each player's discoveries survive depositing or evolving a creature. */
export interface ArkadexProgress {
  seen1: number[]
  seen2: number[]
  caught1: number[]
  caught2: number[]
}

export interface ArkadexSnapshot {
  giocatore1: Pick<StatoGiocatore, 'squadra' | 'deposito'>
  giocatore2: Pick<StatoGiocatore, 'squadra' | 'deposito'>
  giocatoreAttivo: 1 | 2
  battaglia: StatoBattaglia | null
}

export type ArkadexStatus = 'unknown' | 'seen' | 'caught'
export interface ArkadexEntry {
  id: number
  status: ArkadexStatus
  /** Deliberately absent for undiscovered entries: search must not reveal names or types. */
  species?: PokemonSpecie
}
export type ArkadexFilter = 'all' | ArkadexStatus
export interface ArkadexSpecimen {
  pokemon: PokemonIstanza
  source: 'squadra' | 'deposito' | 'incontro'
}

export function emptyArkadexProgress(): ArkadexProgress {
  return { seen1: [], seen2: [], caught1: [], caught2: [] }
}

function speciesIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && !!getPokemon(id)))].sort((a, b) => a - b)
}

export function normalizeArkadexProgress(value: unknown): ArkadexProgress {
  const raw = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
  const caught1 = speciesIds(raw.caught1), caught2 = speciesIds(raw.caught2)
  return {
    seen1: speciesIds([...speciesIds(raw.seen1), ...caught1]),
    seen2: speciesIds([...speciesIds(raw.seen2), ...caught2]), caught1, caught2,
  }
}

/** Pure and idempotent; a discovery in G1 never unlocks G2's Arkadex. */
export function recordArkadex(progress: ArkadexProgress, playerId: 1 | 2, speciesId: number, caught = false): ArkadexProgress {
  if (!getPokemon(speciesId)) return progress
  const seenKey = playerId === 1 ? 'seen1' : 'seen2'
  const caughtKey = playerId === 1 ? 'caught1' : 'caught2'
  if (progress[seenKey].includes(speciesId) && (!caught || progress[caughtKey].includes(speciesId))) return progress
  return {
    ...progress,
    [seenKey]: speciesIds([...progress[seenKey], speciesId]),
    ...(caught ? { [caughtKey]: speciesIds([...progress[caughtKey], speciesId]) } : {}),
  }
}

/** Migration infers only today's collection and the current encounter, never imaginary history. */
export function deriveArkadexProgress(progress: ArkadexProgress, snapshot: ArkadexSnapshot): ArkadexProgress {
  let result = progress
  for (const playerId of [1, 2] as const) {
    const player = playerId === 1 ? snapshot.giocatore1 : snapshot.giocatore2
    for (const pokemon of [...player.squadra, ...Object.values(player.deposito)]) {
      result = recordArkadex(result, playerId, pokemon.specieId, true)
    }
  }
  if (snapshot.battaglia?.pokemonB) result = recordArkadex(result, snapshot.giocatoreAttivo, snapshot.battaglia.pokemonB.specieId)
  return result
}

export function getArkadexEntries(progress: ArkadexProgress, playerId: 1 | 2, options: {
  search?: string; status?: ArkadexFilter; type?: TipoPokemon | 'all'
} = {}): ArkadexEntry[] {
  const seen = new Set(progress[playerId === 1 ? 'seen1' : 'seen2'])
  const caught = new Set(progress[playerId === 1 ? 'caught1' : 'caught2'])
  const search = options.search?.trim().toLocaleLowerCase('it-IT') ?? ''
  return POKEMON_BASE.map((species): ArkadexEntry => {
    const status = caught.has(species.id) ? 'caught' : seen.has(species.id) ? 'seen' : 'unknown'
    return { id: species.id, status, ...(status !== 'unknown' ? { species } : {}) }
  }).filter((entry) => (!options.status || options.status === 'all' || entry.status === options.status)
    && (!options.type || options.type === 'all' || entry.species?.tipo === options.type)
    && (!search || String(entry.id).includes(search.replace(/^#/, '')) || entry.species?.nome.toLocaleLowerCase('it-IT').includes(search)))
}

export function getArkadexSpecimens(snapshot: ArkadexSnapshot, playerId: 1 | 2, speciesId: number): ArkadexSpecimen[] {
  const player = playerId === 1 ? snapshot.giocatore1 : snapshot.giocatore2
  const specimens: ArkadexSpecimen[] = [
    ...player.squadra.filter((pokemon) => pokemon.specieId === speciesId).map((pokemon) => ({ pokemon, source: 'squadra' as const })),
    ...Object.values(player.deposito).filter((pokemon) => pokemon.specieId === speciesId).map((pokemon) => ({ pokemon, source: 'deposito' as const })),
  ]
  if (snapshot.giocatoreAttivo === playerId && snapshot.battaglia?.pokemonB?.specieId === speciesId) {
    specimens.push({ pokemon: snapshot.battaglia.pokemonB, source: 'incontro' })
  }
  return specimens
}

export function arkadexEvolutionLabel(species: PokemonSpecie, progress: ArkadexProgress, playerId: 1 | 2): string {
  if (!species.evoluzioneId || species.livelloEvoluzione === null) return 'Stadio finale: nessuna ulteriore evoluzione.'
  const next = progress[playerId === 1 ? 'seen1' : 'seen2'].includes(species.evoluzioneId) ? getPokemon(species.evoluzioneId)?.nome : undefined
  return `Evoluzione al livello ${species.livelloEvoluzione}: ${next ?? 'specie ancora da scoprire'}.`
}
