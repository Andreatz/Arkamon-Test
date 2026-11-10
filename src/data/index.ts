/**
 * Punto di accesso unificato ai dati statici di gioco.
 * Tutti i moduli importano da qui (NON dai file JSON direttamente)
 * così se un domani cambia il formato dei dati, basta toccare questo file.
 */
import type {
  PokemonSpecie,
  MossaDef,
  TabellaTipi,
  CategoriaHP,
  Mappa,
  IncontroSelvatico,
  AllenatoreDef,
} from '@/types'

import pokemonData from './pokemon.json'
import { BASE_RUNTIME_MOVES } from './runtimeGameData'
import tipiData from './tipi.json'
import crescitaData from './crescita_hp.json'
import mappeData from './mappe.json'
import incontriData from './incontri.json'
import allenatoriData from './allenatori.json'
import { addStatusMovesToPokemon, STATUS_MOVES } from './statusMoves'
import {
  CESPUGLI_STANDARD,
  POKEMON_INCONTRI_COMUNI,
  POKEMON_INCONTRI_SPECIALI,
  PROBABILITA_INCONTRI_STANDARD,
  RANGE_INCONTRI_PERCORSO,
  ROUTE_GENERATE,
} from './bilanciamento'

// Cast tipizzati (i JSON non hanno tipi inferiti perfetti dal compilatore)
export const POKEMON_BASE: PokemonSpecie[] = addStatusMovesToPokemon(pokemonData as PokemonSpecie[])
export const MOSSE: MossaDef[] = [...BASE_RUNTIME_MOVES, ...STATUS_MOVES]
export const TABELLA_TIPI: TabellaTipi = tipiData as TabellaTipi
export const CRESCITA_HP: Record<CategoriaHP, number> =
  crescitaData as Record<CategoriaHP, number>
export const MAPPE: Mappa[] = mappeData as Mappa[]
const INCONTRI_ROUTE_RESTANTI: IncontroSelvatico[] = ROUTE_GENERATE.flatMap(
  (luogo, routeIndex) =>
    CESPUGLI_STANDARD.flatMap((cespuglio, bushIndex) => {
      const range = RANGE_INCONTRI_PERCORSO[luogo]
      const livello = Math.min(range.max - 1, range.min + Math.floor(bushIndex / 2))
      const pokemonComune = POKEMON_INCONTRI_COMUNI[bushIndex]
      const pokemonMedio =
        POKEMON_INCONTRI_SPECIALI[(routeIndex + bushIndex) % POKEMON_INCONTRI_SPECIALI.length]

      return [
        {
          luogo,
          cespuglio,
          pokemonId: pokemonComune,
          probabilita: PROBABILITA_INCONTRI_STANDARD[0],
          livelloMin: livello,
          livelloMax: livello + 1,
        },
        {
          luogo,
          cespuglio,
          pokemonId: pokemonMedio,
          probabilita: bushIndex % 3 === 2 ? 'Difficile' : PROBABILITA_INCONTRI_STANDARD[1],
          livelloMin: livello + 1,
          livelloMax: livello + 2,
        },
      ] satisfies IncontroSelvatico[]
    })
)

export const INCONTRI: IncontroSelvatico[] = [
  ...(incontriData as IncontroSelvatico[]),
  ...INCONTRI_ROUTE_RESTANTI,
]
export const ALLENATORI: AllenatoreDef[] = allenatoriData as AllenatoreDef[]

// Mappe-griglia (Fase E.6+)
export { MAPPE_GRIGLIA, getMappaGriglia } from './mappe-griglia'

// =============================================================
// FUNZIONI DI LOOKUP (sostituiscono i Find di VBA su Excel)
// =============================================================

const pokemonById = new Map<number, PokemonSpecie>(
  POKEMON_BASE.map((p) => [p.id, p])
)
const mosseById = new Map<number, MossaDef>(MOSSE.map((m) => [m.id, m]))
const allenatoriById = new Map<number, AllenatoreDef>(
  ALLENATORI.map((a) => [a.id, a])
)

export function getPokemon(id: number): PokemonSpecie | undefined {
  return pokemonById.get(id)
}

export function getMossa(id: number): MossaDef | undefined {
  return mosseById.get(id)
}

export function getAllenatore(id: number): AllenatoreDef | undefined {
  return allenatoriById.get(id)
}

/** Ritorna gli incontri possibili in un cespuglio specifico */
export function getIncontri(luogo: string, cespuglio: string): IncontroSelvatico[] {
  return INCONTRI.filter(
    (i) => i.luogo === luogo && i.cespuglio === cespuglio
  )
}

/** Ritorna tutti gli allenatori di un luogo */
export function getAllenatoriInLuogo(luogo: string): AllenatoreDef[] {
  return ALLENATORI.filter((a) => a.luogo === luogo)
}

/** Moltiplicatore di efficacia di un tipo attaccante contro un tipo difensore */
export function efficaciaTipo(
  attaccante: PokemonSpecie['tipo'],
  difensore: PokemonSpecie['tipo']
): number {
  return TABELLA_TIPI.efficacia[attaccante]?.[difensore] ?? 1
}
