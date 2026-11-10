import { getPokemon } from '@/data'
import { scambia, type SlotRef } from '@/engine/deposito'
import { isTeamWithinLevelCap, teamLevelRange } from '@/engine/teamLevelCap'
import type { PokemonIstanza, TipoPokemon } from '@/types'

export interface DepositFilters {
  search: string
  type: TipoPokemon | 'all'
  condition: 'all' | 'healthy' | 'status' | 'ko'
  minimum: string
  maximum: string
}
export const EMPTY_DEPOSIT_FILTERS: DepositFilters = { search: '', type: 'all', condition: 'all', minimum: '', maximum: '' }
const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT').trim()

/** Filters retain the original box/slot coordinates. Empty destinations stay usable. */
export function matchesDepositFilters(pokemon: PokemonIstanza, filters: DepositFilters): boolean {
  const species = getPokemon(pokemon.specieId)
  const query = searchable(filters.search)
  if (query && !searchable(`${pokemon.nome} ${species?.nome ?? ''} ${pokemon.specieId}`).includes(query)) return false
  if (filters.type !== 'all' && species?.tipo !== filters.type) return false
  if (filters.condition === 'ko' && pokemon.hp > 0) return false
  if (filters.condition === 'healthy' && (pokemon.hp <= 0 || pokemon.stato)) return false
  if (filters.condition === 'status' && (pokemon.hp <= 0 || !pokemon.stato)) return false
  if (filters.minimum !== '' && pokemon.livello < Number(filters.minimum)) return false
  if (filters.maximum !== '' && pokemon.livello > Number(filters.maximum)) return false
  return true
}

/** Exactly mirrors the store's cap guard, including removal from legacy teams outside the cap. */
export function previewDepositSwap(team: PokemonIstanza[], deposit: Record<string, PokemonIstanza>, source: SlotRef, target: SlotRef) {
  const result = scambia(team, deposit, source, target)
  const range = teamLevelRange(result.squadra)
  const balanced = isTeamWithinLevelCap(result.squadra)
  return { range, balanced, allowed: balanced || result.squadra.length < team.length, count: result.squadra.length }
}
