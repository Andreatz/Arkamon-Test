import { nuovoTurno } from '@/engine/movimento'
import type { NavigazioneScena, PosizioneAvatar, StatoBattaglia, StatoGiocatore, StatoTurnoOverworld } from '@/types'
import { getShopItem, hasArkaStore, isShopItemId, MAX_ITEM_QUANTITY, MAX_SHOP_QUANTITY, type ShopCart, type ShopInventory, type ShopItemId } from './catalog'
import { getLocalMap } from '@/data/localMaps'
import { validateInteraction } from '@/interactions/schema'
import { interactionRequirementMessage } from '@/interactions/runtime'
import { emptyInteractionProgress, type InteractionDefinition, type InteractionProgress } from '@/interactions/types'

export type ShopPlayer = Omit<StatoGiocatore, 'inventario'> & { inventario: ShopInventory }
export interface ShopRuntimeState {
  giocatore1: ShopPlayer
  giocatore2: ShopPlayer
  giocatoreAttivo: 1 | 2
  posizione1: PosizioneAvatar
  posizione2: PosizioneAvatar
  turnoOverworld: StatoTurnoOverworld
  battaglia: StatoBattaglia | null
  scenaCorrente: NavigazioneScena
  interactionProgress?: Pick<InteractionProgress, 'pendingBattle'> & Partial<Omit<InteractionProgress, 'pendingBattle'>>
  posizioniLocali1?: Record<string, string>
  posizioniLocali2?: Record<string, string>
}
export interface ShopPointContext { interactionId?: string; interactions: readonly InteractionDefinition[] }
export type ShopPurchasePatch = Partial<Pick<ShopRuntimeState, 'giocatore1' | 'giocatore2' | 'turnoOverworld'>>
export interface ShopReceipt {
  location: string
  playerId: 1 | 2
  items: { id: ShopItemId; quantity: number; unitPrice: number }[]
  total: number
  balance: number
}
export interface ShopPurchaseResult { ok: boolean; message: string; patch?: ShopPurchasePatch; receipt?: ShopReceipt }

/** Controllo condiviso fra pannello e acquisto: navigare alla scena di un'altra città non basta. */
export function shopAvailabilityMessage(state: ShopRuntimeState, playerId: 1 | 2, location: string, point?: ShopPointContext): string | null {
  if (playerId !== 1 && playerId !== 2) return 'Giocatore non valido.'
  if (!hasArkaStore(location)) return 'In questo luogo non è presente un Arkastore.'
  if (state.battaglia || state.interactionProgress?.pendingBattle) return 'Concludi prima la battaglia in corso.'
  if (state.giocatoreAttivo !== playerId || state.turnoOverworld.giocatoreAttivo !== playerId
    || !Number.isInteger(state.turnoOverworld.azioniRimaste) || state.turnoOverworld.azioniRimaste < 1 || state.turnoOverworld.azioniRimaste > 2) return 'Il turno di questo giocatore è concluso.'
  const position = state[playerId === 1 ? 'posizione1' : 'posizione2']
  if (state.scenaCorrente.scena !== 'citta' || (state.scenaCorrente.payload?.luogo ?? 'Venezia') !== location
    || position.mappaId !== 'mappa-principale' || position.luogo !== location) return 'Raggiungi questa città per acquistare nel suo Arkastore.'
  const player = state[playerId === 1 ? 'giocatore1' : 'giocatore2']
  if (!player.squadra.length) return 'Scegli prima il tuo starter.'
  if (!Number.isSafeInteger(player.monete) || player.monete < 0) return 'Il saldo della partita non è valido: ripristina un backup valido.'
  const entry = point?.interactions.find(item => item.id === point.interactionId)
  const map = getLocalMap(location)
  const positions = state[playerId === 1 ? 'posizioniLocali1' : 'posizioniLocali2']
  if (!entry || validateInteraction(entry) || !entry.enabled || entry.action.kind !== 'shop'
    || entry.mapId !== location || !map || (positions?.[location] ?? map.startNode) !== entry.nodeId) {
    return 'Raggiungi il pallino configurato dell’Arkastore e apri il negozio da quell’interazione.'
  }
  const requirement = interactionRequirementMessage({ giocatore1: state.giocatore1, giocatore2: state.giocatore2,
    interactionProgress: { ...emptyInteractionProgress(), ...state.interactionProgress } }, entry, playerId)
  if (requirement) return requirement
  return null
}

/** Il prezzo viene sempre ricalcolato dal catalogo; tutti gli articoli e il turno cambiano insieme. */
export function resolveShopPurchase(state: ShopRuntimeState, playerId: 1 | 2, cart: unknown, location: string, point?: ShopPointContext): ShopPurchaseResult {
  const fail = (message: string): ShopPurchaseResult => ({ ok: false, message })
  const unavailable = shopAvailabilityMessage(state, playerId, location, point)
  if (unavailable) return fail(unavailable)
  if (!cart || typeof cart !== 'object' || Array.isArray(cart)) return fail('Il carrello non è valido.')
  const playerKey = playerId === 1 ? 'giocatore1' : 'giocatore2'
  const player = state[playerKey]
  const items: ShopReceipt['items'] = []
  let total = 0
  for (const [id, quantity] of Object.entries(cart)) {
    if (!isShopItemId(id)) return fail('Il carrello contiene un oggetto non disponibile.')
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_SHOP_QUANTITY) return fail(`Scegli una quantità intera fra 0 e ${MAX_SHOP_QUANTITY} per ogni oggetto.`)
    if (quantity === 0) continue
    const held = player.inventario[id] ?? 0
    if (!Number.isSafeInteger(held) || held < 0 || held + quantity > MAX_ITEM_QUANTITY) return fail(`Non puoi portare più di ${MAX_ITEM_QUANTITY} ${getShopItem(id)!.name}.`)
    const item = getShopItem(id)!
    items.push({ id, quantity, unitPrice: item.price })
    total += quantity * item.price
  }
  if (!items.length) return fail('Aggiungi almeno un oggetto al carrello.')
  if (player.monete < total) return fail(`Servono ${total} monete; ne hai ${player.monete}.`)
  const inventory: ShopInventory = { ...player.inventario }
  for (const item of items) inventory[item.id] = (inventory[item.id] ?? 0) + item.quantity
  const receipt: ShopReceipt = { location, playerId, items, total, balance: player.monete - total }
  return {
    ok: true, message: `Acquisto completato: ${items.reduce((sum, item) => sum + item.quantity, 0)} oggetti per ${total} monete. Il turno è concluso.`,
    receipt, patch: { [playerKey]: { ...player, monete: receipt.balance, inventario: inventory }, turnoOverworld: nuovoTurno(playerId) },
  }
}

export function shopCartTotal(cart: ShopCart): number {
  return Object.entries(cart).reduce((total, [id, quantity]) => total + (getShopItem(id)?.price ?? 0) * (quantity ?? 0), 0)
}
