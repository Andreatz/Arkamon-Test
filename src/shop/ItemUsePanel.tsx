import { useEffect, useState, type ReactNode } from 'react'
import { calcolaHPMax } from '@/engine/battleEngine'
import type { PokemonIstanza } from '@/types'
import { SHOP_ITEMS, type ShopInventory, type ShopItemId } from './catalog'
import { resolveItemEffect, type ItemEffectResult } from './itemEffects'
import { GameButton } from '@/components/ui/GameButton'
import './shop.css'

export interface ItemUsePanelProps {
  squad: PokemonIstanza[]
  inventory: ShopInventory
  onUse: (itemId: ShopItemId, instanceId: string) => { ok: boolean; message: string }
  disabled?: boolean
  unavailableMessage?: string | null
  actionNote: string
  renderItemIcon?: (itemId: ShopItemId) => ReactNode
  /** Omitted in the legacy and battle bags; a single selected item uses the compact action view. */
  visibleItemIds?: readonly ShopItemId[]
  /** Player tools can show a visual preview; the battle bag keeps its current presentation. */
  renderEffectPreview?: (target: PokemonIstanza, itemId: ShopItemId, result: ItemEffectResult) => ReactNode
  /** Optional presentation selection shared with Team/Analysis. Domain state stays local to onUse. */
  selectedInstanceId?: string
  onTargetChange?: (instanceId: string) => void
}

/** La stessa selezione di oggetto e bersaglio serve per la borsa e per il turno di battaglia. */
export function ItemUsePanel({ squad, inventory, onUse, disabled = false, unavailableMessage, actionNote, renderItemIcon, visibleItemIds, renderEffectPreview, selectedInstanceId, onTargetChange }: ItemUsePanelProps) {
  const [selectedId, setSelectedId] = useState(squad[0]?.istanzaId ?? '')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!squad.some((pokemon) => pokemon.istanzaId === selectedId)) setSelectedId(squad[0]?.istanzaId ?? '')
  }, [squad, selectedId])
  const target = squad.find((pokemon) => pokemon.istanzaId === (selectedInstanceId ?? selectedId)) ?? squad[0]
  const owned = SHOP_ITEMS.filter((item) => (inventory[item.id] ?? 0) > 0 && (!visibleItemIds || visibleItemIds.includes(item.id)))
  const singleItem = visibleItemIds?.length === 1
  return <div className={`arka-item-bag${singleItem ? ' is-single-item' : ''}`}>
    <p className="arka-store-note">{actionNote}</p>
    {unavailableMessage && <p role="status" className="arka-store-warning">{unavailableMessage}</p>}
    {target ? <label className="arka-item-target">Arkamon da curare
      <select value={target.istanzaId} onChange={(event) => { setSelectedId(event.target.value); onTargetChange?.(event.target.value); setMessage('') }}>
        {squad.map((pokemon) => <option key={pokemon.istanzaId} value={pokemon.istanzaId}>{pokemon.nome} · Lv {pokemon.livello} · HP {pokemon.hp}/{calcolaHPMax(pokemon)}{pokemon.hp === 0 ? ' · KO' : ''}{pokemon.stato ? ` · ${pokemon.stato.tipo}` : ''}</option>)}
      </select>
    </label> : <p>Scegli prima il tuo starter per usare gli oggetti.</p>}
    {!singleItem && <h3 className="arka-item-bag-heading">Oggetti disponibili</h3>}
    {!owned.length && <p>La borsa è vuota. Trovi gli oggetti negli Arkastore delle città.</p>}
    <div className="arka-store-catalog">
      {owned.map((item) => {
        const preview = target ? resolveItemEffect(target, item.id) : null
        const disabledReason = item.effect.kind === 'capture' ? 'Usa il pulsante Masterball durante una battaglia selvatica.' : preview && !preview.ok ? preview.message : null
        return <article key={item.id} className="arka-store-item">
          {!singleItem && <><div className="arka-store-item-title">{renderItemIcon ? renderItemIcon(item.id) : <span aria-hidden="true">{item.icon}</span>}<h4>{item.name}</h4><strong>×{inventory[item.id]}</strong></div>
            <p>{item.description}</p></>}
          {disabledReason && <small>{disabledReason}</small>}
          {target && preview && renderEffectPreview?.(target, item.id, preview)}
          <GameButton type="button" tone="primary" className="arka-button" style={{ border: 0, borderImage: 'none', background: 'none' }} disabled={disabled || !!unavailableMessage || !target || !!disabledReason} onClick={() => {
            if (target) setMessage(onUse(item.id, target.istanzaId).message)
          }}>Usa {item.name}</GameButton>
        </article>
      })}
    </div>
    <p role="status" aria-live="polite" className="arka-store-result">{message}</p>
  </div>
}
