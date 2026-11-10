import { useState } from 'react'
import { AdminLayoutItem } from '@/admin/AdminLayoutItem'
import { calcolaHPMax } from '@engine/battleEngine'
import { BOX_COUNT, SLOT_PER_BOX, SQUADRA_MAX, chiaveDeposito, getInSlot, type SlotRef } from '@engine/deposito'
import { DEPOSIT_BG } from '@data/backgrounds'
import { defaultDepositLayout } from '@/theme/defaultAdminTheme'
import type { AdminDepositLayout, AdminDepositLayoutKey, AdminLayoutRect } from '@/theme/adminThemeTypes'
import type { PokemonIstanza } from '@/types'
import { assetUrl } from '@/utils/assetUrl'
import { getDepositPortraitFraming } from './depositPortraitFraming'
import './deposit.css'

interface DepositViewProps {
  squadra: PokemonIstanza[]
  deposito: Record<string, PokemonIstanza>
  giocatoreNome?: string
  onSwap: (source: SlotRef, target: SlotRef) => void
  onBack: () => void
  layout?: AdminDepositLayout
  editing?: boolean
  onLayoutChange?: (key: AdminDepositLayoutKey, rect: AdminLayoutRect) => void
}

export function getAdjacentDepositBox(current: number, direction: -1 | 1): number {
  return ((current - 1 + direction + BOX_COUNT) % BOX_COUNT) + 1
}

function sameSlot(a: SlotRef, b: SlotRef): boolean {
  if (a.tipo === 'squadra' && b.tipo === 'squadra') return a.indice === b.indice
  if (a.tipo === 'deposito' && b.tipo === 'deposito') return a.chiave === b.chiave
  return false
}

/** Shared game view; the preview supplies local data and the game supplies its store. */
export function DepositView({
  squadra,
  deposito,
  giocatoreNome,
  onSwap,
  onBack,
  layout = defaultDepositLayout,
  editing = false,
  onLayoutChange,
}: DepositViewProps) {
  const [boxCorrente, setBoxCorrente] = useState(1)
  const [selezionato, setSelezionato] = useState<SlotRef | null>(null)
  const previousBox = getAdjacentDepositBox(boxCorrente, -1)
  const nextBox = getAdjacentDepositBox(boxCorrente, 1)
  const selectedPokemon = selezionato ? getInSlot(squadra, deposito, selezionato) : undefined
  const isSelected = (ref: SlotRef) => !!selezionato && sameSlot(selezionato, ref)

  const clickSlot = (ref: SlotRef, occupied: boolean) => {
    if (!selezionato) {
      if (occupied) setSelezionato(ref)
    } else if (sameSlot(selezionato, ref)) {
      setSelezionato(null)
    } else {
      onSwap(selezionato, ref)
      setSelezionato(null)
    }
  }

  const updateLayout = (key: AdminDepositLayoutKey, rect: AdminLayoutRect) => onLayoutChange?.(key, rect)

  return (
    <div
      data-admin-layout-root
      className="deposit-view"
      aria-label={giocatoreNome ? `Deposito di ${giocatoreNome}` : 'Deposito Arkamon'}
      style={{ backgroundImage: `url(${DEPOSIT_BG})` }}
    >
      <AdminLayoutItem rootSelector="[data-admin-layout-root]" label="HUD deposito" rect={layout.hud}
        editing={editing} onChange={(rect) => updateLayout('hud', rect)} zIndex={30}>
        <nav className="deposit-box-navigation" aria-label="Box del deposito"
          style={{ backgroundImage: `url(${assetUrl('/ui/box_deposit.png')})` }}>
          <button type="button" className="deposit-box-previous" aria-label={`Vai al box ${previousBox}`}
            onClick={() => setBoxCorrente(previousBox)}>
            <span className="arka-layout-content" data-admin-layout-text-key="previous-box">Box {previousBox}</span>
          </button>
          <h1 className="deposit-box-title arka-layout-content" data-admin-layout-text-key="box-title">Box deposito {boxCorrente}</h1>
          <button type="button" className="deposit-box-next" aria-label={`Vai al box ${nextBox}`}
            onClick={() => setBoxCorrente(nextBox)}>
            <span className="arka-layout-content" data-admin-layout-text-key="next-box">Box {nextBox}</span>
          </button>
        </nav>
      </AdminLayoutItem>

      <AdminLayoutItem rootSelector="[data-admin-layout-root]" label="Squadra" rect={layout.teamPanel}
        editing={editing} onChange={(rect) => updateLayout('teamPanel', rect)}>
        <div className="deposit-team" role="group" aria-label="Squadra">
          {Array.from({ length: SQUADRA_MAX }, (_, index) => {
            const pokemon = squadra[index]
            const ref: SlotRef = { tipo: 'squadra', indice: index }
            return (
              <button key={index} type="button" className="deposit-team-slot"
                aria-label={`Squadra, posto ${index + 1}: ${pokemon ? `${pokemon.nome}, livello ${pokemon.livello}` : 'vuoto'}`}
                aria-pressed={isSelected(ref)} title={pokemon ? pokemonDetails(pokemon) : 'Posto libero in squadra'}
                onClick={() => clickSlot(ref, !!pokemon)}>
                <span className="deposit-team-nameplate">
                  <span className="arka-layout-content" data-admin-layout-text-key={`team-slot-${index}-name`}>
                    {pokemon ? `${pokemon.nome} LV. ${pokemon.livello}` : 'Posto libero'}
                  </span>
                </span>
                <Portrait pokemon={pokemon} className="deposit-team-portrait" />
              </button>
            )
          })}
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem rootSelector="[data-admin-layout-root]" label="Box deposito" rect={layout.boxGrid}
        editing={editing} onChange={(rect) => updateLayout('boxGrid', rect)}>
        <div className="deposit-box-grid" role="group" aria-label={`Contenuto del box ${boxCorrente}`}>
          {Array.from({ length: SLOT_PER_BOX }, (_, index) => {
            const slot = index + 1
            const key = chiaveDeposito(boxCorrente, slot)
            const pokemon = deposito[key]
            const ref: SlotRef = { tipo: 'deposito', chiave: key }
            return (
              <button key={key} type="button" className="deposit-box-slot"
                aria-label={`Box ${boxCorrente}, posto ${slot}: ${pokemon ? `${pokemon.nome}, livello ${pokemon.livello}` : 'vuoto'}`}
                aria-pressed={isSelected(ref)} title={pokemon ? pokemonDetails(pokemon) : `Box ${boxCorrente}, posto ${slot} libero`}
                onClick={() => clickSlot(ref, !!pokemon)}>
                <Portrait pokemon={pokemon} className="deposit-box-portrait" />
              </button>
            )
          })}
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem rootSelector="[data-admin-layout-root]" label="Info" rect={layout.infoBar}
        editing={editing} onChange={(rect) => updateLayout('infoBar', rect)} zIndex={30}>
        <footer className="deposit-footer">
          <p className="deposit-hint arka-layout-content" role="status" data-admin-layout-text-key="deposit-hint">
            {selectedPokemon
              ? `${selectedPokemon.nome} selezionato: scegli dove spostarlo o scambiarlo.`
              : 'Scegli un Arkamon, poi il posto in cui spostarlo o scambiarlo. La squadra consente al massimo 5 livelli di differenza.'}
          </p>
          <button type="button" className="deposit-back" aria-label="Torna indietro" title="Torna indietro" onClick={onBack}>
            <img src={assetUrl('/ui/freccia.png')} alt="" />
          </button>
        </footer>
      </AdminLayoutItem>
    </div>
  )
}

function pokemonDetails(pokemon: PokemonIstanza): string {
  return `${pokemon.nome} · livello ${pokemon.livello} · ${pokemon.hp}/${calcolaHPMax(pokemon)} HP`
}

function Portrait({ pokemon, className }: { pokemon?: PokemonIstanza; className: string }) {
  // Remount the image state when a different creature enters the slot.
  return (
    <span className={`deposit-portrait ${className}`} aria-hidden="true">
      {pokemon ? (
        <PortraitImage key={pokemon.specieId} pokemon={pokemon} />
      ) : null}
    </span>
  )
}

function PortraitImage({ pokemon }: { pokemon: PokemonIstanza }) {
  const [imageFailed, setImageFailed] = useState(false)
  const { x, y, zoom } = getDepositPortraitFraming(pokemon.specieId)
  return imageFailed ? (
    <span className="deposit-portrait-fallback">{pokemon.nome.slice(0, 1)}</span>
  ) : (
    <img src={assetUrl(`/sprites/front_sprites/${pokemon.specieId}.png`)} alt=""
      decoding="async" draggable={false}
      style={{ width: `${zoom * 100}%`, transform: `translate(${-x * 100}%, ${-y * 100}%)` }}
      onError={() => setImageFailed(true)} />
  )
}
