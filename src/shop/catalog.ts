import { MAPPE } from '@/data'
import type { StatoAlterato } from '@/types'

export const SHOP_ITEM_IDS = ['potion', 'super-potion', 'revive', 'antidote', 'paralysis-heal', 'awakening', 'masterball'] as const
export type ShopItemId = typeof SHOP_ITEM_IDS[number]
export type ShopInventory = Partial<Record<ShopItemId, number>>
export type ShopCart = Partial<Record<ShopItemId, number>>

export type ShopItemEffect =
  | { kind: 'heal'; fraction: number }
  | { kind: 'revive'; fraction: number }
  | { kind: 'status'; status: StatoAlterato }
  | { kind: 'capture' }

export interface ShopItem {
  id: ShopItemId
  name: string
  description: string
  price: number
  icon: string
  effect: ShopItemEffect
}

/** Prezzi iniziali condivisi da tutti i negozi, senza scorte casuali o ricarichi nascosti. */
export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'potion', name: 'Pozione', description: 'Recupera il 25% degli HP massimi di un Arkamon vivo. Non cura gli status.', price: 100, icon: '🧪', effect: { kind: 'heal', fraction: .25 } },
  { id: 'super-potion', name: 'Superpozione', description: 'Recupera il 50% degli HP massimi di un Arkamon vivo. Non cura gli status.', price: 200, icon: '⚗️', effect: { kind: 'heal', fraction: .5 } },
  { id: 'revive', name: 'Rianimatore', description: 'Rianima un Arkamon KO con il 50% degli HP massimi. Gli status restano.', price: 300, icon: '💎', effect: { kind: 'revive', fraction: .5 } },
  { id: 'antidote', name: 'Antidoto', description: 'Rimuove lo status Avvelenato da un Arkamon vivo.', price: 80, icon: '🌿', effect: { kind: 'status', status: 'Avvelenato' } },
  { id: 'paralysis-heal', name: 'Antiparalisi', description: 'Rimuove lo status Paralizzato da un Arkamon vivo.', price: 80, icon: '⚡', effect: { kind: 'status', status: 'Paralizzato' } },
  { id: 'awakening', name: 'Sveglia', description: 'Rimuove lo status Addormentato da un Arkamon vivo.', price: 80, icon: '☀️', effect: { kind: 'status', status: 'Addormentato' } },
  { id: 'masterball', name: 'Masterball', description: 'Cattura garantita di un Arkamon selvatico. Si usa soltanto durante una battaglia selvatica.', price: 1500, icon: '🔮', effect: { kind: 'capture' } },
]

export const MAX_SHOP_QUANTITY = 99
/** Mantiene il limite già usato dai vecchi salvataggi e dalle ricompense della regia. */
export const MAX_ITEM_QUANTITY = 999_999
export const SHOP_LOCATIONS = MAPPE.filter((place) => !place.nome.startsWith('Percorso_')).map((place) => place.nome)
const shopLocations = new Set(SHOP_LOCATIONS)

export function hasArkaStore(location: string): boolean { return shopLocations.has(location) }
export function isShopItemId(value: unknown): value is ShopItemId {
  return typeof value === 'string' && SHOP_ITEM_IDS.includes(value as ShopItemId)
}
export function getShopItem(id: unknown): ShopItem | undefined { return SHOP_ITEMS.find((item) => item.id === id) }

/** Salvataggi vecchi e inventari parziali restano validi; nessun oggetto nuovo viene regalato. */
export function normalizeShopInventory(value: unknown, warn?: (message: string) => void): ShopInventory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (value !== undefined) warn?.('Inventario non valido: oggetti non recuperabili rimossi.')
    return {}
  }
  const inventory: ShopInventory = {}
  for (const [key, quantity] of Object.entries(value)) {
    if (!isShopItemId(key)) { warn?.(`Oggetto sconosciuto rimosso dall’inventario: ${key}.`); continue }
    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
      warn?.(`Quantità non valida per ${getShopItem(key)!.name}: rimossa.`); continue
    }
    const clean = Math.max(0, Math.min(MAX_ITEM_QUANTITY, Math.floor(quantity)))
    if (clean !== quantity) warn?.(`Quantità di ${getShopItem(key)!.name} corretta entro i limiti.`)
    inventory[key] = clean
  }
  return inventory
}
