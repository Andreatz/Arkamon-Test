import type { PokemonIstanza, StatoGiocatore } from '@/types'

type PokemonOwner = Pick<StatoGiocatore, 'squadra' | 'deposito'>

/** Depositing a creature changes its slot, never whether the player has started. */
export function hasOwnedPokemon(player: PokemonOwner): boolean {
  return player.squadra.length > 0 || Object.keys(player.deposito).length > 0
}

export function getOwnedPokemon(player: PokemonOwner): PokemonIstanza[] {
  return [...player.squadra, ...Object.values(player.deposito)]
}
