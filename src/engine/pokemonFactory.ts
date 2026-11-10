import { getPokemon } from '@/data'
import type { PokemonSpecie, PokemonIstanza } from '@/types'
import { calcolaHPMax } from './battleEngine'

let sequence = 0
export interface PokemonFactoryServices {
  species: (id: number) => Pick<PokemonSpecie, 'nome'> | undefined
  nextId: () => string
  maxHp: (pokemon: PokemonIstanza) => number
}

/** Instance creation belongs to the rules; persistence is the caller's responsibility. */
export function creaIstanza(specieId: number, livello: number, services: Partial<PokemonFactoryServices> = {}): PokemonIstanza | null {
  const species = (services.species ?? getPokemon)(specieId)
  if (!species) return null
  const pokemon: PokemonIstanza = {
    istanzaId: (services.nextId ?? (() => `pkmn-${Date.now()}-${++sequence}`))(),
    specieId, nome: species.nome, livello, hp: 0, xp: 0,
  }
  pokemon.hp = (services.maxHp ?? calcolaHPMax)(pokemon)
  return pokemon
}
