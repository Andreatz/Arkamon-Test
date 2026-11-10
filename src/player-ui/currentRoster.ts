import type { PokemonIstanza, StatoBattaglia } from '@/types'

/** The active battle instance wins over its roster snapshot, which may precede the last hit. */
export function liveOwnedPokemon(pokemon: PokemonIstanza, battle: StatoBattaglia | null): PokemonIstanza {
  if (!battle) return pokemon
  return [battle.pokemonA, battle.pokemonB, ...(battle.squadraA ?? []), ...(battle.squadraB ?? [])]
    .find(entry => entry.istanzaId === pokemon.istanzaId) ?? pokemon
}

export function currentRoster(squad: readonly PokemonIstanza[], battle: StatoBattaglia | null): PokemonIstanza[] {
  return squad.map(pokemon => liveOwnedPokemon(pokemon, battle))
}
