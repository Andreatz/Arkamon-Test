import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialGameSave } from '@/save/gamePersistence'
import type { GameState } from '@/store/gameStore'
import type { PokemonIstanza } from '@/types'
import { ItemUsePanel } from '@/shop/ItemUsePanel'
import { SHOP_ITEM_IDS, SHOP_ITEMS, type ShopInventory } from '@/shop/catalog'
import { BagScreen } from '../BagScreen'

const runtime = vi.hoisted(() => ({ state: undefined as unknown as GameState }))
vi.mock('@/store/gameStore', () => ({
  useGameStore: (selector?: (state: GameState) => unknown) => selector ? selector(runtime.state) : runtime.state,
}))

const pokemon: PokemonIstanza = {
  istanzaId: 'selected-bag-target', specieId: 1, nome: 'Vyrath selezionato', livello: 5, hp: 3, xp: 2,
  stato: { tipo: 'Paralizzato', turniRimanenti: -1 },
}
const inventory: ShopInventory = Object.fromEntries(SHOP_ITEM_IDS.map(id => [id, 1]))
const useButtons = (markup: string) => [...markup.matchAll(/>Usa ([^<]+)<\/button>/g)].map(([, name]) => name)

beforeEach(() => {
  const state = initialGameSave()
  state.giocatore1.nome = 'Arianna'
  state.giocatore1.squadra = [pokemon]
  state.giocatore1.inventario = { potion: 2, 'paralysis-heal': 0, masterball: 1 }
  state.scenaCorrente = { scena: 'mappa-principale' }
  runtime.state = { ...state, campaignRevision: 0, applicaOggetto: vi.fn() } as unknown as GameState
})

describe('selected inventory item action view', () => {
  it('offers one action for the selected item without rendering the seven-item use catalog again', () => {
    const onUse = vi.fn()
    const markup = renderToStaticMarkup(<ItemUsePanel squad={[pokemon]} inventory={inventory} onUse={onUse}
      visibleItemIds={['paralysis-heal']} actionNote="Usare un oggetto conclude il turno." />)
    expect(useButtons(markup)).toEqual(['Antiparalisi'])
    expect(markup).toContain('is-single-item')
    expect(markup).toContain('value="selected-bag-target"')
    expect(markup).not.toContain('Oggetti disponibili')
    expect(markup).not.toContain(SHOP_ITEMS.find(item => item.id === 'paralysis-heal')!.description)
    expect(onUse).not.toHaveBeenCalled()
    expect(pokemon.hp).toBe(3)
    expect(pokemon.stato?.tipo).toBe('Paralizzato')
  })

  it('preserves the complete catalog and descriptions when the optional filter is omitted in battle', () => {
    const onUse = vi.fn()
    const markup = renderToStaticMarkup(<ItemUsePanel squad={[pokemon]} inventory={inventory} onUse={onUse}
      actionNote="Usare un oggetto consuma la mossa." />)
    expect(useButtons(markup)).toEqual(SHOP_ITEMS.map(item => item.name))
    expect(markup).not.toContain('is-single-item')
    expect(markup).toContain('Oggetti disponibili')
    for (const item of SHOP_ITEMS) expect(markup).toContain(item.description)
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>(?:<span\b[^>]*><\/span>)*Usa Masterball<\/button>/)
    expect(onUse).not.toHaveBeenCalled()
  })

  it('does not offer a depleted selected item or another item through the filtered action', () => {
    const onUse = vi.fn()
    const markup = renderToStaticMarkup(<ItemUsePanel squad={[pokemon]} inventory={{ potion: 2, 'paralysis-heal': 0 }}
      onUse={onUse} visibleItemIds={['paralysis-heal']} actionNote="Usare un oggetto conclude il turno." />)
    expect(useButtons(markup)).toEqual([])
    expect(markup).toContain('value="selected-bag-target"')
    expect(onUse).not.toHaveBeenCalled()
  })

  it('selects an item still in stock for the real bag and does not expose a depleted use action', () => {
    const playerBefore = structuredClone(runtime.state.giocatore1)
    const markup = renderToStaticMarkup(<BagScreen playerId={1} />)
    expect(useButtons(markup)).toEqual(['Pozione'])
    expect(markup).toContain('Pozione: 2 disponibili')
    expect(markup).toContain('Masterball: 1 disponibili')
    expect(markup).not.toContain('Antiparalisi: 0 disponibili')
    expect(markup).toContain('value="selected-bag-target"')
    expect(runtime.state.giocatore1).toEqual(playerBefore)
    expect(runtime.state.applicaOggetto).not.toHaveBeenCalled()
    expect(markup).toContain('Anteprima su Vyrath selezionato')
    expect(markup).toContain('HP di Vyrath selezionato: 3 su 12')
    expect(markup).toContain('HP di Vyrath selezionato: 6 su 12')
    expect(markup).toContain('+3 HP')
    expect(markup).toContain('Paralizzato')
    expect(markup).toContain('data-ui-asset="/ui/studio/Scuro/box-inventario.svg"')
    expect(markup).toContain('data-ui-asset="/ui/studio/Scuro/box-1.svg"')
    expect(markup).toContain('aspect-ratio:1060 / 650')
    expect(markup).not.toMatch(/<img[^>]+src="[^"]*\/ui\/(?:studio|player-kit|reference-assets)\//)
    expect(markup).not.toContain('data-provided-svg=')
    expect(markup).not.toContain('data-provided-asset="item-potion"')
    expect(markup).toMatch(/<span(?=[^>]*class="[^"]*pu-kit-icon-css)(?=[^>]*data-icon="item-potion")[^>]*>/)
    expect(markup).toContain('pu-kit-icon-glyph')
    expect(markup).toContain('data-provided-asset="card-selected"')
    expect(markup).toMatch(/<img(?=[^>]*class="[^"]*pu-provided-slot-frame)(?=[^>]*data-package-asset="[^"]+")(?=[^>]*src="[^"]*\/ui\/reference-png\/[a-z0-9_-]+\.webp")[^>]*>/)
    expect(markup).toContain('--bag-command-art:none')
    expect(markup).toContain('La borsa di Arianna')
    expect(markup).not.toContain('Confronta Superpozione')
    expect(markup).not.toContain('Dati dimostrativi')
  })

  it('retains the real turn, pending-battle and current-scene restrictions with the dedicated artwork', () => {
    runtime.state.turnoOverworld.azioniRimaste = 0
    expect(renderToStaticMarkup(<BagScreen playerId={1} />)).toContain('Puoi usare gli oggetti soltanto durante il turno di questo giocatore.')
    runtime.state.turnoOverworld.azioniRimaste = 1
    runtime.state.interactionProgress.pendingBattle = {} as GameState['interactionProgress']['pendingBattle']
    expect(renderToStaticMarkup(<BagScreen playerId={1} />)).toContain('Durante la battaglia usa la borsa della pulsantiera di combattimento.')
    runtime.state.interactionProgress.pendingBattle = null
    runtime.state.scenaCorrente = { scena: 'laboratorio' }
    expect(renderToStaticMarkup(<BagScreen playerId={1} />)).toContain('Concludi questa schermata prima di usare un oggetto.')
    expect(runtime.state.applicaOggetto).not.toHaveBeenCalled()
  })

  it('allows configured between-battle items with the reserved zero-action League turn and shows its real consequence', () => {
    runtime.state.league.players[1].status = 'running'
    runtime.state.league.config = { version: 1, opponents: [{ name: 'A', team: [] }, { name: 'B', team: [] }, { name: 'C', team: [] }, { name: 'D', team: [] }], champion: null, championEnabled: false, betweenBattleItems: true, defeat: 'restart' }
    runtime.state.turnoOverworld.azioniRimaste = 0
    runtime.state.scenaCorrente = { scena: 'lega' }
    const markup = renderToStaticMarkup(<BagScreen playerId={1} />)
    expect(markup).toContain('Gli oggetti consentiti fra gli incontri non interrompono la serie della Lega')
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:<span\b[^>]*><\/span>)*Usa Pozione<\/button>/)
    expect(markup).not.toContain('Usare un oggetto conclude il turno')
    runtime.state.league.config.betweenBattleItems = false
    const blocked = renderToStaticMarkup(<BagScreen playerId={1} />)
    expect(blocked).toContain('Gli oggetti fra gli incontri della Lega non sono consentiti')
    expect(blocked).toMatch(/<button[^>]*disabled=""[^>]*>(?:<span\b[^>]*><\/span>)*Usa Pozione<\/button>/)
  })
})
