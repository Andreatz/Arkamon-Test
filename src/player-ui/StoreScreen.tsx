import { usePlayerUiMemory, usePublishPlayerUiSelection } from './playerUiSession'
import { SpatialNavigation } from '@/components/rpg/SpatialNavigation'
import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import { MAX_ITEM_QUANTITY, MAX_SHOP_QUANTITY, SHOP_ITEMS, type ShopCart, type ShopItemId } from '@/shop/catalog'
import { shopAvailabilityMessage, shopCartTotal } from '@/shop/purchase'
import { itemIconId, KitButton, KitIcon, KitPanel } from './kit'
import { useInteractionStore } from '@/interactions/interactionStore'
import { assetUrl } from '@/utils/assetUrl'
import { StudioCommand } from '@/components/ui/StudioArtwork'
import { MENU_ARTWORK_MODE, MENU_SVG_ARTWORK_ENABLED } from './uiAppearancePolicy'
import { isReferenceUi } from './reference/referenceTheme'

export interface StoreScreenProps { playerId: 1 | 2; inputBlocked?: boolean; shopInteractionId?: string }
type StoreCategory = 'all' | 'heal' | 'status' | 'capture'
const storeCategories = [['all', 'Tutti'], ['heal', 'Cure'], ['status', 'Status'], ['capture', 'Cattura']] as const

/** Browsing is free; purchases use the existing atomic, persisted checkout action. */
export function StoreScreen({ playerId, inputBlocked = false, shopInteractionId }: StoreScreenProps) {
  const state = useGameStore()
  const interactions = useInteractionStore(s => s.interactions)
  const player = state[playerId === 1 ? 'giocatore1' : 'giocatore2']
  const position = state[playerId === 1 ? 'posizione1' : 'posizione2']
  const location = state.scenaCorrente.scena === 'citta'
    ? typeof state.scenaCorrente.payload?.luogo === 'string' ? state.scenaCorrente.payload.luogo : 'Venezia'
    : position.luogo ?? position.mappaId
  const [selectedId, setSelectedId] = usePlayerUiMemory<ShopItemId>(playerId, 'store.item', SHOP_ITEMS[0].id)
  const [category, setCategory] = usePlayerUiMemory<StoreCategory>(playerId, 'store.category', 'all')
  const reference = isReferenceUi()
  const catalogItems = reference ? SHOP_ITEMS.filter(item => category === 'all' || (category === 'heal' ? item.effect.kind === 'heal' || item.effect.kind === 'revive' : item.effect.kind === category)) : SHOP_ITEMS
  const [cart, setCart] = useState<ShopCart>({})
  const [message, setMessage] = useState('')
  useEffect(() => { setCart({}); setMessage('') }, [playerId, location, shopInteractionId, state.campaignRevision])
  const unavailable = shopAvailabilityMessage(state, playerId, location, { interactionId: shopInteractionId, interactions })
  const selected = catalogItems.find((item) => item.id === selectedId) ?? catalogItems[0]
  usePublishPlayerUiSelection(playerId, { itemId: selected.id })
  const total = shopCartTotal(cart)
  const quantity = Object.values(cart).reduce((sum, value) => sum + (value ?? 0), 0)
  const insufficient = total > player.monete
  const capacityItem = SHOP_ITEMS.find((item) => (cart[item.id] ?? 0) + (player.inventario[item.id] ?? 0) > MAX_ITEM_QUANTITY)
  const editBlocked = inputBlocked || !!unavailable
  function setQuantity(itemId: ShopItemId, raw: number) {
    setCart((previous) => ({ ...previous, [itemId]: Number.isFinite(raw) ? Math.min(MAX_SHOP_QUANTITY, Math.max(0, Math.floor(raw))) : 0 }))
    setMessage('')
  }

  return <section className="pu-store-screen pu-store-dedicated arka-store" aria-label={`Arkastore di ${location}`}>
    <header className="pu-screen-heading pu-store-heading"><div><p className="pu-kicker">Scorte di viaggio · {player.nome || `Giocatore ${playerId}`}</p><h1>Arkastore · {location}</h1><p>La consultazione è libera. Un acquisto conclude il turno e aggiunge gli oggetti a questa borsa.</p></div><strong className="pu-store-balance" aria-label={`Saldo: ${player.monete} monete`}>{player.monete.toLocaleString('it-IT')} ₳</strong></header>
    <div className="pu-store-layout">
      <KitPanel className="pu-store-catalog"><h2>Catalogo · {SHOP_ITEMS.length} articoli</h2>
        {reference && <nav className="pu-reference-store-categories" aria-label="Categorie del negozio">{storeCategories.map(([id, label]) => <button type="button" key={id} aria-pressed={category === id} onClick={() => setCategory(id)}><KitIcon id={`category-${id}`} />{label}</button>)}</nav>}
        <SpatialNavigation className="pu-shop-list">
        {catalogItems.map((item) => <article className={`pu-shop-row pu-shop-row-compact ${selected.id === item.id ? 'is-selected' : ''}`} key={item.id} data-item-id={item.id}>
          <KitButton data-rpg-item className="pu-shop-row-main" active={selected.id === item.id} aria-pressed={selected.id === item.id} aria-label={`Seleziona ${item.name}`} onClick={() => setSelectedId(item.id)}>
            <KitIcon id={itemIconId(item.id)} /><span className="pu-shop-row-copy"><strong>{item.name}</strong><small>{reference ? '' : `${item.price} ₳ · `}In borsa: {player.inventario[item.id] ?? 0}</small></span>
            {reference && <span className="pu-reference-shop-price"><i aria-hidden="true">₳</i>{item.price.toLocaleString('it-IT')}</span>}
          </KitButton>
          <span className="pu-shop-cart-count" aria-label={`${item.name} nel carrello: ${cart[item.id] ?? 0}`}>×{cart[item.id] ?? 0}</span>
        </article>)}
      </SpatialNavigation></KitPanel>

      <KitPanel className="pu-store-detail">
        <div className="pu-store-selected-summary" data-item-id={selected.id}><div className="pu-item-hero"><KitIcon id={itemIconId(selected.id)} /></div><div><span className="pu-kicker">Articolo selezionato</span><h2>{selected.name}</h2>
          <p className="pu-description">{selected.description}</p><p className="pu-item-held">{selected.price} ₳ ciascuno · In borsa: <strong>{player.inventario[selected.id] ?? 0}</strong></p></div></div>
        <div className="pu-quantity-control" aria-label={`Quantità nel carrello di ${selected.name}`}>
          <KitButton artwork="decrement" aria-label={`Diminuisci ${selected.name}`} disabled={editBlocked || !(cart[selected.id] ?? 0)} onClick={() => setQuantity(selected.id, (cart[selected.id] ?? 0) - 1)}>−</KitButton>
          <label className="pu-shop-quantity"><span>Quantità di {selected.name}</span><input aria-label={`Quantità di ${selected.name}`} type="number" min={0} max={MAX_SHOP_QUANTITY} step={1} inputMode="numeric" value={cart[selected.id] ?? 0} disabled={editBlocked} data-menu-artwork={MENU_ARTWORK_MODE} style={{ backgroundImage: MENU_SVG_ARTWORK_ENABLED ? `url("${assetUrl('/ui/studio/individuali/Scuro/quantita/display.svg')}")` : 'none' }} onChange={event => setQuantity(selected.id, Number(event.target.value))} /></label>
          <KitButton artwork="increment" aria-label={`Aumenta ${selected.name}`} disabled={editBlocked || (cart[selected.id] ?? 0) >= MAX_SHOP_QUANTITY} onClick={() => setQuantity(selected.id, (cart[selected.id] ?? 0) + 1)}>+</KitButton>
        </div>
        {(unavailable || insufficient || capacityItem) && <div className="pu-store-notices" aria-live="polite">
          {unavailable && <p className="pu-warning" role="status">{unavailable}</p>}
          {insufficient && <p className="pu-warning">Ti mancano {total - player.monete} monete.</p>}
          {capacityItem && <p className="pu-warning">Non puoi portare più di {MAX_ITEM_QUANTITY} {capacityItem.name}.</p>}
        </div>}
      </KitPanel>
      <KitPanel className="pu-store-checkout pu-store-cart">
        <h3>Il tuo carrello · {quantity} oggetti</h3>
        <div className="pu-cart-lines pu-cart-lines-compact">{SHOP_ITEMS.filter((item) => (cart[item.id] ?? 0) > 0).map((item) => <div className="pu-cart-line" key={item.id}>
          <KitIcon id={itemIconId(item.id)} /><span className="pu-cart-item-name"><strong>{item.name} ×{cart[item.id]}</strong></span><strong>{(cart[item.id] ?? 0) * item.price} ₳</strong>
          <button type="button" className="pu-cart-remove" aria-label={`Rimuovi ${item.name} dal carrello`} onClick={() => setQuantity(item.id, 0)}>×</button>
        </div>)}{!quantity && <p className="pu-empty">Il carrello è vuoto. Scegli le quantità nel catalogo.</p>}</div>
        <div className="pu-store-totals"><strong>Carrello: {quantity} oggetti · {total} ₳</strong><span>Saldo dopo l’acquisto: {Math.max(0, player.monete - total)} ₳</span></div>
        <div className="pu-store-actions"><StudioCommand disabled={!quantity} onClick={() => { setCart({}); setMessage('') }}>Svuota carrello</StudioCommand>
          <StudioCommand className={reference ? 'pu-reference-purchase' : undefined} selected disabled={editBlocked || !quantity || insufficient || !!capacityItem} onClick={() => {
            const result = state.acquistaOggetti(playerId, cart, location, shopInteractionId)
            setMessage(result.message)
            if (result.ok) setCart({})
          }}>Acquista carrello</StudioCommand></div>
        {message && <p role="status" aria-live="polite" className="pu-store-result">{message}</p>}
      </KitPanel>
    </div>
  </section>
}
