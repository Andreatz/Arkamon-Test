import { describe, expect, it } from 'vitest'
import { initialGameSave } from '@/save/gamePersistence'
import { resolveShopPurchase as resolvePurchaseAtPoint, shopAvailabilityMessage, shopCartTotal, type ShopRuntimeState } from '../purchase'
import { newInteractionDefinition } from '@/interactions/types'
import { hasArkaStore, MAX_ITEM_QUANTITY, normalizeShopInventory, SHOP_ITEMS } from '../catalog'

const shop = { ...newInteractionDefinition('Venezia', 'n56', 'test-shop'), title: 'Arkastore', repeatable: true, action: { kind: 'shop' as const } }
const point = { interactionId: shop.id, interactions: [shop] }
const resolveShopPurchase = (state: ShopRuntimeState, id: 1 | 2, cart: unknown, location: string) => resolvePurchaseAtPoint(state, id, cart, location, point)

function campaign(playerId: 1 | 2 = 1): ShopRuntimeState {
  const save = initialGameSave()
  save.giocatoreAttivo = playerId
  save.turnoOverworld = { giocatoreAttivo: playerId, azioniRimaste: 2 }
  save.posizioniLocali1 = save.posizioniLocali2 = { Venezia: 'n56' }
  save.scenaCorrente = { scena: 'citta', payload: { luogo: 'Venezia' } }
  save.posizione1.luogo = save.posizione2.luogo = 'Venezia'
  for (const player of [save.giocatore1, save.giocatore2]) {
    player.monete = 4000
    player.squadra = [{ istanzaId: `p-${player.id}`, specieId: 1, nome: 'Vyrath', livello: 5, hp: 3, xp: 0, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }]
  }
  return save
}

describe('checkout Arkastore', () => {
  it('requires the authored shop point and rechecks it at checkout', () => {
    const state = campaign()
    expect(resolvePurchaseAtPoint(state, 1, { potion: 1 }, 'Venezia').ok).toBe(false)
    expect(resolvePurchaseAtPoint(state, 1, { potion: 1 }, 'Venezia', { ...point, interactionId: 'other' }).ok).toBe(false)
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(true)
    state.posizioniLocali1 = { Venezia: 'n1' }
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia')).toMatchObject({ ok: false, message: expect.stringContaining('pallino configurato') })
    state.posizioniLocali1 = { Venezia: 'n56' }
    expect(resolvePurchaseAtPoint(state, 1, { potion: 1 }, 'Venezia', { ...point, interactions: [{ ...shop, enabled: false }] }).ok).toBe(false)
    expect(resolvePurchaseAtPoint(state, 1, { potion: 1 }, 'Venezia', { ...point, interactions: [] }).ok).toBe(false)
  })

  it('enforces shop requirements again when a shop was already open', () => {
    const state = campaign()
    const locked = { ...shop, requirements: { ...shop.requirements, minLevel: 20 } }
    expect(resolvePurchaseAtPoint(state, 1, { potion: 1 }, 'Venezia', { ...point, interactions: [locked] }))
      .toMatchObject({ ok: false, message: expect.stringContaining('livello 20') })
    expect(state.giocatore1.monete).toBe(4000)
    expect(state.turnoOverworld.azioniRimaste).toBe(2)
  })
  it('commits a complete cart, charges catalog prices and closes the interaction turn once', () => {
    const state = campaign()
    const before = structuredClone(state)
    const result = resolveShopPurchase(state, 1, { potion: 2, antidote: 1, masterball: 1 }, 'Venezia')
    expect(result.ok).toBe(true)
    expect(result.receipt).toMatchObject({ total: 1780, balance: 2220, location: 'Venezia', playerId: 1 })
    expect(result.patch?.giocatore1?.inventario).toEqual({ potion: 2, antidote: 1, masterball: 2 })
    expect(result.patch?.giocatore1?.squadra).toEqual(state.giocatore1.squadra)
    expect(result.patch?.giocatore2).toBeUndefined()
    expect(result.patch?.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    expect(state).toEqual(before)
    const replay = resolveShopPurchase({ ...state, ...result.patch }, 1, { potion: 2 }, 'Venezia')
    expect(replay).toEqual({ ok: false, message: 'Il turno di questo giocatore è concluso.' })
  })

  it('keeps inventories and wallets independent for player two', () => {
    const state = campaign(2)
    const result = resolveShopPurchase(state, 2, { 'super-potion': 1, 'paralysis-heal': 2 }, 'Venezia')
    expect(result.patch?.giocatore1).toBeUndefined()
    expect(result.patch?.giocatore2?.monete).toBe(3640)
    expect(result.patch?.giocatore2?.inventario).toEqual({ masterball: 1, 'super-potion': 1, 'paralysis-heal': 2 })
    expect(state.giocatore1.inventario).toEqual({ masterball: 1 })
    expect(result.patch?.turnoOverworld?.giocatoreAttivo).toBe(1)
  })

  it('permits checkout after one movement with one action left', () => {
    const state = campaign()
    state.turnoOverworld.azioniRimaste = 1
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(true)
  })

  it.each([null, [], {}, { potion: 0 }, { potion: -1 }, { potion: .5 }, { potion: 100 }, { potion: '1' }, { potion: true }, { potion: Number.NaN }, { potion: Infinity }, { masterball: 1, price: 0 }, { unknown: 1 }])('rejects malformed or empty carts %j without partial purchase', (cart) => {
    const state = campaign()
    const before = structuredClone(state)
    const result = resolveShopPurchase(state, 1, cart, 'Venezia')
    expect(result.ok).toBe(false)
    expect(result.patch).toBeUndefined()
    expect(result.receipt).toBeUndefined()
    expect(state).toEqual(before)
  })

  it('does not partially buy affordable articles when the total exceeds the wallet', () => {
    const state = campaign()
    state.giocatore1.monete = 200
    const result = resolveShopPurchase(state, 1, { potion: 1, masterball: 1 }, 'Venezia')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('1600')
    expect(result.patch).toBeUndefined()
    expect(state.giocatore1.monete).toBe(200)
  })

  it.each([Number.NaN, Infinity, -1, 2.5, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid wallet %s', (balance) => {
    const state = campaign()
    state.giocatore1.monete = balance
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(false)
  })

  it('rejects stock overflow and accepts the exact inventory boundary', () => {
    const state = campaign()
    state.giocatore1.inventario.masterball = MAX_ITEM_QUANTITY
    expect(resolveShopPurchase(state, 1, { potion: 1, masterball: 1 }, 'Venezia').patch).toBeUndefined()
    state.giocatore1.inventario.masterball--
    expect(resolveShopPurchase(state, 1, { masterball: 1 }, 'Venezia').patch?.giocatore1?.inventario.masterball).toBe(MAX_ITEM_QUANTITY)
  })

  it('checks actor, real position, city scene and interaction budget', () => {
    const state = campaign()
    expect(resolveShopPurchase(state, 2, { potion: 1 }, 'Venezia').ok).toBe(false)
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Milano').ok).toBe(false)
    state.posizione1.luogo = 'Milano'
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(false)
    state.posizione1.luogo = 'Venezia'
    state.posizione1.mappaId = 'Venezia'
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(false)
    state.posizione1.mappaId = 'mappa-principale'
    state.scenaCorrente.scena = 'mappa-principale'
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(false)
    state.scenaCorrente.scena = 'citta'
    for (const actions of [0, -1, 3, .5, Number.NaN]) {
      state.turnoOverworld.azioniRimaste = actions
      expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(false)
    }
  })

  it('does not allow purchasing during a battle or pending configured encounter', () => {
    const state = campaign()
    state.battaglia = { tipo: 'Selvatico', pokemonA: state.giocatore1.squadra[0], pokemonB: state.giocatore2.squadra[0], hpMaxA: 12, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null }
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(false)
    state.battaglia = null
    state.interactionProgress = { pendingBattle: {} as NonNullable<NonNullable<ShopRuntimeState['interactionProgress']>['pendingBattle']> }
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Venezia').ok).toBe(false)
  })

  it('offers shops only in known cities and requires a starter', () => {
    expect(hasArkaStore('Venezia')).toBe(true)
    expect(hasArkaStore('Roma')).toBe(true)
    expect(hasArkaStore('Percorso_1')).toBe(false)
    expect(hasArkaStore('Percorso_15')).toBe(false)
    expect(hasArkaStore('Città inventata')).toBe(false)
    const state = campaign()
    expect(resolveShopPurchase(state, 1, { potion: 1 }, 'Percorso_15').ok).toBe(false)
    state.giocatore1.squadra = []
    expect(shopAvailabilityMessage(state, 1, 'Venezia')).toContain('starter')
  })
})

describe('catalogo e inventario Arkastore', () => {
  it('has one positive integer price and unique identifier per article', () => {
    expect(new Set(SHOP_ITEMS.map((item) => item.id)).size).toBe(SHOP_ITEMS.length)
    expect(SHOP_ITEMS.every((item) => Number.isInteger(item.price) && item.price > 0)).toBe(true)
    expect(shopCartTotal({ potion: 2, awakening: 3 })).toBe(440)
  })

  it('preserves known items and existing Masterballs when normalizing portable saves', () => {
    expect(normalizeShopInventory({ masterball: 7, potion: 2, 'super-potion': 1, revive: 3, antidote: 4, 'paralysis-heal': 2, awakening: 8 })).toEqual({ masterball: 7, potion: 2, 'super-potion': 1, revive: 3, antidote: 4, 'paralysis-heal': 2, awakening: 8 })
    expect(normalizeShopInventory({ masterball: 0 })).toEqual({ masterball: 0 })
    expect(normalizeShopInventory(undefined)).toEqual({})
  })

  it('recovers quantities within bounds and reports corrupt entries without granting items', () => {
    const warnings: string[] = []
    expect(normalizeShopInventory({ masterball: MAX_ITEM_QUANTITY + 10, potion: 1.9, revive: -1, antidote: Number.NaN, awakening: '3', mystery: 1 }, (message) => warnings.push(message))).toEqual({ masterball: MAX_ITEM_QUANTITY, potion: 1, revive: 0 })
    expect(warnings).toHaveLength(6)
    expect(normalizeShopInventory([])).toEqual({})
    expect(normalizeShopInventory({ masterball: -4 })).toEqual({ masterball: 0 })
  })
})
