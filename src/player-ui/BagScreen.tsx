import { SpatialNavigation } from '@/components/rpg/SpatialNavigation'
import { usePlayerUiMemory, usePublishPlayerUiSelection, usePlayerUiSession } from './playerUiSession'
import { useEffect, useState, type CSSProperties } from 'react'
import { useGameStore } from '@/store/gameStore'
import { ItemUsePanel } from '@/shop/ItemUsePanel'
import { SHOP_ITEMS, type ShopItemId } from '@/shop/catalog'
import { StudioCommand, StudioSurface } from '@/components/ui/StudioArtwork'
import { assetUrl } from '@/utils/assetUrl'
import { itemIconId, CreaturePortrait, HealthBar, KitIcon } from './kit'
import { currentRoster } from './currentRoster'
import { MENU_SVG_ARTWORK_ENABLED } from './uiAppearancePolicy'
import { isReferenceUi } from './reference/referenceTheme'
import { ProvidedArtwork } from './reference/ProvidedArtwork'

type BagCategory = 'all' | 'heal' | 'status' | 'capture'
const inventoryCenters = [232, 430, 630, 828]
const studioAsset = (name: string) => `/ui/studio/Scuro/${name}.svg`
export interface BagScreenProps { playerId: 1 | 2; onPlayerChange?: (playerId: 1 | 2) => void; showPlayerPicker?: boolean }

/** The existing use panel remains the single target/effect flow for real inventory items. */
export function BagScreen({ playerId, onPlayerChange, showPlayerPicker = true }: BagScreenProps) {
  const state = useGameStore()
  const [viewPlayerId, setViewPlayerId] = useState<1 | 2>(playerId)
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches)
  const [category, setCategory] = usePlayerUiMemory<BagCategory>(viewPlayerId, 'bag.category', 'all')
  const [selectedId, setSelectedId] = usePlayerUiMemory<ShopItemId | null>(viewPlayerId, 'bag.item', null)
  useEffect(() => { setViewPlayerId(playerId) }, [playerId])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const player = state[viewPlayerId === 1 ? 'giocatore1' : 'giocatore2']
  const squad = currentRoster(player.squadra, state.battaglia)
  const owned = SHOP_ITEMS.filter((item) => (player.inventario[item.id] ?? 0) > 0)
  const filtered = owned.filter((item) => category === 'all' || (category === 'heal' ? item.effect.kind === 'heal' || item.effect.kind === 'revive' : item.effect.kind === category))
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0]
  const [targetId, setTargetId] = usePlayerUiMemory<string>(viewPlayerId, 'bag.target', () => usePlayerUiSession.getState().selection[viewPlayerId]?.instanceId ?? player.squadra[0]?.istanzaId ?? '')
  usePublishPlayerUiSelection(viewPlayerId, { instanceId: targetId, itemId: selected?.id })
  const leagueRunning = state.league?.players[viewPlayerId].status === 'running'
  const unavailable = state.battaglia || state.interactionProgress.pendingBattle
    ? 'Durante la battaglia usa la borsa della pulsantiera di combattimento.'
    : leagueRunning && !state.league?.config?.betweenBattleItems ? 'Gli oggetti fra gli incontri della Lega non sono consentiti dalla configurazione della partita.'
    : viewPlayerId !== state.giocatoreAttivo || state.turnoOverworld.giocatoreAttivo !== viewPlayerId || (!leagueRunning && state.turnoOverworld.azioniRimaste <= 0)
      ? 'Puoi usare gli oggetti soltanto durante il turno di questo giocatore.'
      : ['titolo', 'laboratorio', 'evoluzione'].includes(state.scenaCorrente.scena)
        ? 'Concludi questa schermata prima di usare un oggetto.' : null
  const total = owned.reduce((sum, item) => sum + (player.inventario[item.id] ?? 0), 0)

  return <section className="pu-bag-screen pu-bag-dedicated arka-item-bag" aria-label="Borsa degli oggetti">
    <div className="pu-screen-toolbar">
      {showPlayerPicker && <label className="pu-player-picker">Giocatore della borsa<select value={viewPlayerId} onChange={(event) => {
        const id = Number(event.target.value) as 1 | 2
        setViewPlayerId(id); onPlayerChange?.(id)
      }}><option value={1}>{state.giocatore1.nome || 'Giocatore 1'}</option><option value={2}>{state.giocatore2.nome || 'Giocatore 2'}</option></select></label>}
      <p className="pu-inventory-count"><strong>{total} oggetti</strong><span>Scorte di {player.nome || `Giocatore ${viewPlayerId}`}</span></p>
    </div>
    <div className="pu-live-bag-heading"><div><span>SCORTE DI VIAGGIO</span><h2>La borsa di {player.nome || `Giocatore ${viewPlayerId}`}</h2></div><strong>{total} oggetti<small>{owned.length} articoli</small></strong></div>
    <div className="pu-live-bag-categories" aria-label="Categorie degli oggetti">{([
      ['all', 'Tutti'], ['heal', 'Cure'], ['status', 'Status'], ['capture', 'Cattura'],
    ] as const).map(([id, label]) => <StudioCommand key={id} selected={category === id} className="pu-live-bag-category" aria-pressed={category === id} onClick={() => { setCategory(id); setSelectedId(null) }}>{isReferenceUi() && <KitIcon id={`category-${id}`} />}{label}</StudioCommand>)}</div>
    <div className="pu-bag-layout">
      <div className="pu-live-bag-inventory">
        <StudioSurface source={studioAsset('box-inventario')} width={1060} height={650} className="pu-live-bag-inventory-art">
          <span className="pu-live-bag-grid-title">LE TUE SCORTE</span>
          <SpatialNavigation columns={mobile ? 2 : 4} className="pu-live-bag-grid" aria-label="Scorte nella borsa">{Array.from({ length: 12 }, (_, index) => {
            const item = filtered[index]
            return <div className={`pu-live-bag-cell${item ? '' : ' is-empty'}`} key={index} data-item-id={item?.id} style={{ '--bag-x': `${inventoryCenters[index % 4] / 10.6}%`, '--bag-y': `${[195, 355, 515][Math.floor(index / 4)] / 6.5}%` } as CSSProperties}>
              {item ? <><button type="button" data-rpg-item className="pu-live-bag-slot" aria-pressed={selected?.id === item.id}
                aria-label={`${item.name}: ${player.inventario[item.id]} disponibili`} onClick={() => setSelectedId(item.id)}>
                {isReferenceUi() ? <ProvidedArtwork className="pu-provided-slot-frame" id={selected?.id === item.id ? 'card-selected' : 'card-normal'} /> : MENU_SVG_ARTWORK_ENABLED && <img className="pu-live-bag-slot-frame" src={assetUrl(studioAsset(selected?.id === item.id ? 'cornice-piccola-selezionata' : 'cornice-piccola'))} alt="" draggable={false} />}
                <KitIcon id={itemIconId(item.id)} /><span className="pu-live-bag-quantity">×{player.inventario[item.id]}</span>
              </button><strong className="pu-live-bag-item-name">{item.name}</strong></> : <span className="pu-live-bag-slot-empty" aria-hidden="true">·</span>}
            </div>
          })}</SpatialNavigation>
        </StudioSurface>
        {!filtered.length && <p className="pu-empty">{owned.length ? 'Nessun oggetto in questa categoria.' : 'La borsa è vuota. Trovi gli oggetti negli Arkastore delle città.'}</p>}
        <p className="pu-live-bag-footnote">Seleziona un oggetto per consultarne l’effetto.</p>
      </div>
      <div className="pu-live-bag-detail" aria-live="polite" data-item-id={selected?.id}>
        {selected ? <>
          <div className="pu-live-bag-illustration"><KitIcon id={itemIconId(selected.id)} /></div><span className="pu-kicker">Articolo selezionato</span>
          <h2>{selected.name}</h2><p className="pu-description">{selected.description}</p>
          <StudioSurface source={studioAsset('box-1')} width={1060} height={320} className="pu-live-bag-stock"><div><span>IN BORSA</span><strong>{player.inventario[selected.id] ?? 0} <small>disponibili</small></strong></div></StudioSurface>
        </> : <div className="pu-empty"><KitIcon id="icon-bag" /><h2>Pronto per il viaggio</h2><p>Le scorte acquistate e raccolte compariranno nella borsa di questo giocatore.</p></div>}
      </div>
      {selected && <div className="pu-live-bag-use pu-item-use pu-item-use-single" style={{ '--bag-command-art': MENU_SVG_ARTWORK_ENABLED ? `url("${assetUrl(studioAsset('bottone-selezionato'))}")` : 'none' } as CSSProperties}>
          <ItemUsePanel key={`${viewPlayerId}:${state.campaignRevision}`} squad={squad} inventory={player.inventario} selectedInstanceId={targetId} onTargetChange={setTargetId} unavailableMessage={unavailable}
            visibleItemIds={[selected.id]}
            renderItemIcon={itemId => <KitIcon id={itemIconId(itemId)} />}
            renderEffectPreview={(target, _itemId, result) => <div className="pu-cure-preview" aria-label={`Anteprima su ${target.nome}`}>
              <CreaturePortrait pokemon={target} /><div><span className="pu-kicker">Prima di usare l’oggetto</span><strong>{target.nome}</strong><HealthBar pokemon={target} /></div>
              {result.ok && result.pokemon ? <div className="pu-cure-after"><span className="pu-kicker">Dopo</span><HealthBar pokemon={result.pokemon} /><span>{result.recoveredHp ? `+${result.recoveredHp} HP` : 'Status rimosso'} · {result.pokemon.stato?.tipo ?? (result.pokemon.hp > 0 ? 'In salute' : 'KO')}</span></div> : <span className="pu-cure-no-effect">Nessun effetto sul compagno selezionato.</span>}
            </div>}
            onUse={(itemId, instanceId) => { setSelectedId(itemId); return state.applicaOggetto(viewPlayerId, itemId, instanceId) }}
            actionNote={leagueRunning ? 'Gli oggetti consentiti fra gli incontri non interrompono la serie della Lega. Gli oggetti inutili non vengono consumati.' : 'Usare un oggetto conclude il turno. Gli oggetti inutili non vengono consumati.'} />
      </div>}
    </div>
  </section>
}
