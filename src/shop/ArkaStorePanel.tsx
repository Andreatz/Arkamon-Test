import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import { MAX_SHOP_QUANTITY, SHOP_ITEMS, type ShopCart } from './catalog'
import { shopAvailabilityMessage, shopCartTotal, type ShopPurchaseResult } from './purchase'
import './shop.css'

export interface ArkaStorePanelProps {
  location: string
  inputBlocked?: boolean
  onPurchase: (playerId: 1 | 2, cart: ShopCart, location: string) => Pick<ShopPurchaseResult, 'ok' | 'message'>
}

export function ArkaStorePanel({ location, inputBlocked = false, onPurchase }: ArkaStorePanelProps) {
  const playerId = useGameStore((state) => state.giocatoreAttivo)
  const player1 = useGameStore((state) => state.giocatore1)
  const player2 = useGameStore((state) => state.giocatore2)
  const position1 = useGameStore((state) => state.posizione1)
  const position2 = useGameStore((state) => state.posizione2)
  const turn = useGameStore((state) => state.turnoOverworld)
  const battle = useGameStore((state) => state.battaglia)
  const scene = useGameStore((state) => state.scenaCorrente)
  const interactionProgress = useGameStore((state) => state.interactionProgress)
  const campaignRevision = useGameStore((state) => state.campaignRevision)
  const [cart, setCart] = useState<ShopCart>({})
  const [message, setMessage] = useState('')
  useEffect(() => { setCart({}); setMessage('') }, [playerId, location, campaignRevision])
  const player = playerId === 1 ? player1 : player2
  const unavailable = shopAvailabilityMessage({ giocatore1: player1, giocatore2: player2, giocatoreAttivo: playerId,
    posizione1: position1, posizione2: position2, turnoOverworld: turn, battaglia: battle, scenaCorrente: scene, interactionProgress }, playerId, location)
  const total = shopCartTotal(cart)
  const quantity = Object.values(cart).reduce((sum, value) => sum + (value ?? 0), 0)
  const insufficient = total > player.monete
  return <section className="arka-store" aria-label={`Arkastore di ${location}`}>
    <header className="arka-store-heading">
      <div><h3>Arkastore · {location}</h3><p>Oggetti per {player.nome}</p></div>
      <strong aria-label={`Saldo: ${player.monete} monete`}>{player.monete} ₳</strong>
    </header>
    <p className="arka-store-note">Puoi consultare il negozio senza spendere azioni. Un acquisto del carrello completo conta come un’interazione e conclude il turno. Gli oggetti restano nella borsa di questo giocatore.</p>
    {unavailable && <p className="arka-store-warning" role="status">{unavailable}</p>}
    <div className="arka-store-catalog">
      {SHOP_ITEMS.map((item) => {
        const held = player.inventario[item.id as keyof typeof player.inventario] ?? 0
        const selected = cart[item.id] ?? 0
        return <article className="arka-store-item" key={item.id}>
          <div className="arka-store-item-title"><span aria-hidden="true">{item.icon}</span><h4>{item.name}</h4><strong>{item.price} ₳</strong></div>
          <p>{item.description}</p>
          <div className="arka-store-item-controls"><small>In borsa: {held}</small><label>Quantità di {item.name}
            <input type="number" min={0} max={MAX_SHOP_QUANTITY} step={1} inputMode="numeric" value={selected}
              disabled={inputBlocked || !!unavailable}
              onChange={(event) => {
                const value = Number(event.target.value)
                setCart((previous) => ({ ...previous, [item.id]: Number.isFinite(value) ? Math.min(MAX_SHOP_QUANTITY, Math.max(0, Math.floor(value))) : 0 }))
                setMessage('')
              }} />
          </label></div>
        </article>
      })}
    </div>
    <div className="arka-store-checkout">
      <p><strong>Carrello: {quantity} oggetti · {total} ₳</strong><span>Saldo dopo l’acquisto: {Math.max(0, player.monete - total)} ₳</span></p>
      {insufficient && <p className="arka-store-warning">Ti mancano {total - player.monete} monete.</p>}
      <div className="arka-store-actions">
        <button className="arka-button-secondary" type="button" disabled={!quantity} onClick={() => { setCart({}); setMessage('') }}>Svuota carrello</button>
        <button className="arka-button" type="button" disabled={inputBlocked || !!unavailable || !quantity || insufficient} onClick={() => {
          const result = onPurchase(playerId, cart, location)
          setMessage(result.message)
          if (result.ok) setCart({})
        }}>Acquista carrello</button>
      </div>
    </div>
    <p role="status" aria-live="polite" className="arka-store-result">{message}</p>
  </section>
}
