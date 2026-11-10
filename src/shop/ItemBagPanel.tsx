import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import type { ShopItemId } from './catalog'
import { ItemUsePanel } from './ItemUsePanel'

export interface ItemBagPanelProps {
  onUse: (playerId: 1 | 2, itemId: ShopItemId, instanceId: string) => { ok: boolean; message: string }
}

export function ItemBagPanel({ onUse }: ItemBagPanelProps) {
  const activePlayer = useGameStore((state) => state.giocatoreAttivo)
  const player1 = useGameStore((state) => state.giocatore1)
  const player2 = useGameStore((state) => state.giocatore2)
  const battle = useGameStore((state) => state.battaglia)
  const turn = useGameStore((state) => state.turnoOverworld)
  const scene = useGameStore((state) => state.scenaCorrente)
  const pendingBattle = useGameStore((state) => state.interactionProgress.pendingBattle)
  const campaignRevision = useGameStore((state) => state.campaignRevision)
  const [playerId, setPlayerId] = useState<1 | 2>(activePlayer)
  useEffect(() => setPlayerId(activePlayer), [activePlayer, campaignRevision])
  const player = playerId === 1 ? player1 : player2
  const unavailable = battle || pendingBattle ? 'Durante la battaglia usa la borsa della pulsantiera di combattimento.'
    : playerId !== activePlayer || turn.giocatoreAttivo !== playerId || turn.azioniRimaste <= 0 ? 'Puoi usare gli oggetti soltanto durante il turno di questo giocatore.'
    : ['titolo', 'laboratorio', 'evoluzione'].includes(scene.scena) ? 'Concludi questa schermata prima di usare un oggetto.' : null
  return <section className="arka-item-bag" aria-label="Borsa degli oggetti">
    <label className="arka-item-target">Giocatore della borsa<select value={playerId} onChange={(event) => setPlayerId(Number(event.target.value) as 1 | 2)}>
      <option value={1}>{player1.nome}</option><option value={2}>{player2.nome}</option>
    </select></label>
    <ItemUsePanel key={`${playerId}:${campaignRevision}`} squad={player.squadra} inventory={player.inventario} unavailableMessage={unavailable}
      onUse={(itemId, instanceId) => onUse(playerId, itemId, instanceId)}
      actionNote="Scegli un Arkamon e un oggetto della sua borsa. Usare un oggetto è un’interazione e conclude il turno sulla mappa. Gli oggetti inutili non vengono consumati." />
  </section>
}
