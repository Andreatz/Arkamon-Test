import { getPokemon } from '@/data'
import { calcolaHPMax } from '@/engine/battleEngine'
import type { PokemonIstanza } from '@/types'
import { getShopItem } from './catalog'

export interface ItemEffectResult { ok: boolean; message: string; pokemon?: PokemonIstanza; recoveredHp?: number }

/** Effetto puro: lo store deve verificare il possesso e consumare l'oggetto soltanto se ok. */
export function resolveItemEffect(pokemon: PokemonIstanza, itemId: unknown): ItemEffectResult {
  const item = getShopItem(itemId)
  if (!item) return { ok: false, message: 'Questo oggetto non è disponibile.' }
  if (!getPokemon(pokemon.specieId) || !Number.isInteger(pokemon.livello) || pokemon.livello < 5 || pokemon.livello > 100
    || !Number.isFinite(pokemon.hp) || pokemon.hp < 0) return { ok: false, message: 'Questo Arkamon non ha dati validi.' }
  if (item.effect.kind === 'capture') return { ok: false, message: 'La Masterball si usa durante una battaglia selvatica.' }
  const hpMax = calcolaHPMax(pokemon)
  if (pokemon.hp > hpMax) return { ok: false, message: 'Gli HP di questo Arkamon superano il massimo.' }
  if (item.effect.kind === 'revive') {
    if (pokemon.hp > 0) return { ok: false, message: 'Il Rianimatore si usa soltanto su un Arkamon KO.' }
    const hp = Math.max(1, Math.ceil(hpMax * item.effect.fraction))
    return { ok: true, message: `${pokemon.nome} torna in squadra con ${hp} HP.`, pokemon: { ...pokemon, hp }, recoveredHp: hp }
  }
  if (pokemon.hp === 0) return { ok: false, message: 'Questo Arkamon è KO: serve un Rianimatore.' }
  if (item.effect.kind === 'heal') {
    if (pokemon.hp >= hpMax) return { ok: false, message: `${pokemon.nome} ha già tutti gli HP.` }
    const hp = Math.min(hpMax, pokemon.hp + Math.max(1, Math.ceil(hpMax * item.effect.fraction)))
    return { ok: true, message: `${pokemon.nome} recupera ${hp - pokemon.hp} HP.`, pokemon: { ...pokemon, hp }, recoveredHp: hp - pokemon.hp }
  }
  if (pokemon.stato?.tipo !== item.effect.status) return { ok: false, message: `${pokemon.nome} non ha lo status ${item.effect.status}.` }
  const { stato: _status, ...cured } = pokemon
  return { ok: true, message: `${pokemon.nome} è stato curato dallo status ${item.effect.status}.`, pokemon: cured }
}
