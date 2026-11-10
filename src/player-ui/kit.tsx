import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import type { PokemonIstanza, TipoPokemon } from '@/types'
import { getMossa, getPokemon } from '@/data'
import { calcolaHPMax, getMossaAlLivello, èMossaCura, èMossaSoloStato } from '@/engine/battleEngine'
import { assetUrl } from '@/utils/assetUrl'
import { getPortraitFraming } from './portraitFraming'
import { RpgFrame, RPG_SKINS } from '@/components/rpg'
import { MENU_ARTWORK_MODE, MENU_SVG_ARTWORK_ENABLED } from './uiAppearancePolicy'
import { isReferenceUi } from './reference/referenceTheme'
import { ReferenceIcon } from './reference/ReferenceEmblem'
import { ProvidedArtwork, providedIconAsset, providedPortraitSource } from './reference/ProvidedArtwork'
import './playerUiPrimitives'

export const TYPE_ICONS: Record<TipoPokemon, string> = {
  Normale: 'type-normal', Elettro: 'type-electric', Fuoco: 'type-fire', Terra: 'type-earth',
  Acqua: 'type-water', Erba: 'type-grass', Oscurità: 'type-dark', Psico: 'type-psychic',
}
export const ITEM_ICONS: Record<string, string> = {
  potion: 'item-potion', 'super-potion': 'item-superpotion', revive: 'item-revive',
  antidote: 'item-antidote', masterball: 'item-sphere', 'paralysis-heal': 'type-electric', awakening: 'type-psychic',
}
export function itemIconId(itemId: string): string {
  if (isReferenceUi() && itemId === 'awakening') return 'item-awakening'
  if (isReferenceUi() && itemId === 'paralysis-heal') return 'item-paralysis-heal'
  return ITEM_ICONS[itemId]
}
export function kitAsset(id: string): string { return assetUrl(`/ui/player-kit/${id}.svg`) }
const STUDIO_MENU_ICONS: Record<string, string> = {
  'icon-analysis': 'analisi', 'icon-arkadex': 'arkadex', 'icon-deposit': 'deposito',
  'icon-journal': 'diario', 'icon-options': 'impostazioni', 'icon-shop': 'negozio',
  'icon-chronicles': 'cronache', 'icon-challenges': 'sfide',
}
const ICON_GLYPHS: Record<string, string> = {
  'icon-home': '⌂', 'icon-team': '◉', 'icon-bag': '▣', 'icon-analysis': '⌕',
  'icon-arkadex': '▤', 'icon-book': '▤', 'icon-deposit': '▦', 'icon-box': '▦',
  'icon-map': '⌖', 'icon-journal': '≡', 'icon-options': '⚙︎', 'icon-shop': '$',
  'icon-chronicles': '≡', 'icon-challenges': '◇', 'icon-activity': '↗',
  'item-potion': 'P', 'item-superpotion': 'SP', 'item-revive': 'R',
  'item-antidote': 'A', 'item-sphere': 'M', 'item-coin': '₳', 'item-awakening': 'SV', 'item-paralysis-heal': 'AP',
  'type-normal': 'N', 'type-electric': 'EL', 'type-fire': 'FU', 'type-earth': 'TE',
  'type-water': 'AC', 'type-grass': 'ER', 'type-dark': 'OS', 'type-psychic': 'PS',
}
export function KitIcon({ id, className = '' }: { id: string; className?: string }) {
  const provided = isReferenceUi() ? providedIconAsset(id) : undefined
  if (provided) return <span className={`pu-kit-icon pu-kit-icon-provided ${className}`} data-icon={id} aria-hidden="true"><ProvidedArtwork id={provided} /></span>
  if (!MENU_SVG_ARTWORK_ENABLED && isReferenceUi() && (!id.startsWith('item-') || id === 'item-coin')) return <span className={`pu-kit-icon pu-kit-icon-reference ${className}`} data-icon={id} aria-hidden="true"><ReferenceIcon kind={id} /></span>
  if (!MENU_SVG_ARTWORK_ENABLED) return <span className={`pu-kit-icon pu-kit-icon-css ${className}`} data-icon={id} aria-hidden="true"><span className="pu-kit-icon-glyph">{ICON_GLYPHS[id] ?? '◇'}</span></span>
  const studioIcon = STUDIO_MENU_ICONS[id]
  const legacyId = id === 'item-awakening' ? 'type-psychic' : id === 'item-paralysis-heal' ? 'type-electric' : id
  const source = studioIcon ? assetUrl(`/ui/studio/individuali/Scuro/menu/${studioIcon}.svg`) : kitAsset(legacyId)
  return <span className={`pu-kit-icon ${className}`} aria-hidden="true"><img src={source} alt="" draggable={false} /></span>
}
const slices: Record<string, number> = { 'panel-wide': 163, 'panel-medium': 97, 'button-primary': 44,
  'button-default': 48, 'card-default': 61, 'card-selected-violet': 58, 'card-selected-cyan': 56,
  'slot-default': 62, 'slot-selected': 60, 'slot-cyan': 62, 'card-portrait': 99 }
export function KitFrame({ id = 'panel-medium' }: { id?: string }) {
  if (!MENU_SVG_ARTWORK_ENABLED) return null
  if (['panel-wide', 'panel-medium'].includes(id)) return <RpgFrame />
  if (['button-default', 'card-default', 'slot-default'].includes(id)) return <RpgFrame kind="command" />
  if (['button-primary', 'card-selected-violet', 'card-selected-cyan', 'slot-selected', 'slot-cyan'].includes(id)) return <RpgFrame kind="selected" />
  const style: CSSProperties = { borderImageSource: `url("${kitAsset(id)}")`, borderImageSlice: `${slices[id] ?? 61} fill` }
  return <span className="pu-frame" style={style} data-kit={id} data-ui-skin-slot="frame" aria-hidden="true" />
}
export function KitPanel({ children, className = '', asset = 'panel-medium', ...props }: HTMLAttributes<HTMLDivElement> & { asset?: string }) {
  return <div {...props} className={`pu-panel ${className}`} data-menu-artwork={MENU_ARTWORK_MODE}><KitFrame id={asset} />{children}</div>
}
export function KitButton({ active = false, asset, artwork, children, className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; asset?: string; artwork?: 'previous' | 'next' | 'decrement' | 'increment' }) {
  const providedControl = isReferenceUi() && artwork ? ({ previous: 'arrow-left', next: 'arrow-right', decrement: 'quantity-minus', increment: 'quantity-plus' } as const)[artwork] : undefined
  const artworkSource = artwork === 'decrement' || artwork === 'increment'
    ? `/ui/studio/individuali/Scuro/quantita/${artwork === 'decrement' ? 'meno' : 'piu'}.svg`
    : `/ui/studio/Scuro/pulsante-freccia-${artwork === 'previous' ? 'sinistra' : 'destra'}.svg`
  const symbol = artwork === 'previous' ? '←' : artwork === 'next' ? '→' : artwork === 'decrement' ? '−' : '+'
  const fallbackLabel = artwork === 'previous' ? 'Pagina precedente' : artwork === 'next' ? 'Pagina successiva' : artwork === 'decrement' ? 'Riduci quantità' : 'Aumenta quantità'
  return <button {...props} type={type} data-ui-artwork={artwork} data-menu-artwork={MENU_ARTWORK_MODE} aria-label={props['aria-label'] ?? (artwork && children == null ? fallbackLabel : undefined)} className={`pu-button ${active ? 'is-active' : ''} ${artwork ? 'pu-artwork-button' : ''} ${className}`}>
    {artwork ? <>{providedControl ? <ProvidedArtwork id={providedControl} className="pu-provided-control" /> : MENU_SVG_ARTWORK_ENABLED ? <img className="pu-button-artwork" src={assetUrl(artworkSource)} width={52} height={44} alt="" draggable={false} aria-hidden="true" /> : <span className="pu-artwork-symbol" aria-hidden="true">{symbol}</span>}<span className="pu-artwork-label">{children ?? fallbackLabel}</span></>
      : <><KitFrame id={asset ?? (active ? 'button-primary' : 'button-default')} />{children}</>}
  </button>
}
export function TypeBadge({ type }: { type: TipoPokemon }) {
  return <span className="pu-type"><KitIcon id={TYPE_ICONS[type]} />{type}</span>
}
function CreatureImage({ speciesId, large }: { speciesId: number; large: boolean }) {
  const compact = !large && isReferenceUi() ? providedPortraitSource(speciesId) : undefined
  const source = compact ?? `/sprites/front_sprites/${speciesId}.png`
  const [loadedSource, setLoadedSource] = useState<string | null>(null)
  const framing = getPortraitFraming(source)
  useEffect(() => {
    // Native SVG image load events are not consistently delivered by React.
    // Decode compact package PNGs and official full-body sprites independently.
    let current = true
    const resource = new Image()
    resource.src = assetUrl(source)
    resource.decode().then(() => {
      if (current) setLoadedSource(source)
    }).catch(() => {
      if (current) setLoadedSource(null)
    })
    return () => { current = false }
  }, [source])
  if (compact) return <img className="pu-creature-art pu-creature-compact" src={assetUrl(compact)} width={640} height={640} alt="" draggable={false}
    aria-hidden="true" data-species-id={speciesId} data-creature-source={compact} data-creature-loaded={loadedSource === source ? 'true' : undefined} />
  return <svg className="pu-creature-art" viewBox={framing.viewBox} preserveAspectRatio="xMidYMid meet"
    aria-hidden="true" focusable="false" data-species-id={speciesId} data-creature-source={source}
    data-creature-loaded={loadedSource === source ? 'true' : undefined}>
    <image key={source} href={assetUrl(source)} width={framing.width} height={framing.height} preserveAspectRatio="none" />
  </svg>
}
export function SpeciesPortrait({ speciesId, className = '', large = false, selected = false }: { speciesId: number; className?: string; large?: boolean; selected?: boolean }) {
  return <span className={`pu-creature-portrait ${large ? 'is-large' : ''} ${className}`} data-menu-artwork={MENU_ARTWORK_MODE} aria-hidden="true">
    {MENU_SVG_ARTWORK_ENABLED && <img className="pu-creature-circle" src={large ? assetUrl(RPG_SKINS.portrait) : kitAsset(selected ? 'circle-selected' : 'circle-default')} alt="" />}
    <CreatureImage key={`${speciesId}:${large}`} speciesId={speciesId} large={large} />
  </span>
}
export function CreaturePortrait({ pokemon, ...props }: { pokemon: PokemonIstanza; className?: string; large?: boolean; selected?: boolean }) {
  return <SpeciesPortrait speciesId={pokemon.specieId} {...props} />
}
export function HealthBar({ pokemon }: { pokemon: PokemonIstanza }) {
  const maximum = calcolaHPMax(pokemon), value = Math.min(maximum, Math.max(0, pokemon.hp))
  const condition = value <= 0 ? 'ko' : value / maximum <= .25 ? 'low' : value / maximum <= .5 ? 'medium' : 'high'
  return <div className="pu-health" data-health={condition}><progress aria-label={`HP di ${pokemon.nome}: ${value} su ${maximum}`} max={maximum} value={value} /><span>{value} / {maximum} HP</span></div>
}
export function PokemonMoves({ pokemon, detailed = false }: { pokemon: PokemonIstanza; detailed?: boolean }) {
  const definition = getPokemon(pokemon.specieId)
  return <div className="pu-moves">{definition?.mosse.filter(id => id > 0).map(id => {
    const move = getMossa(id); if (!move) return null
    const dice = getMossaAlLivello(move, pokemon.livello)
    const healing = èMossaCura(move)
    const effect = healing ? `Cura ${move.valoreEffetto ?? 0}${move.effetto === 'CURA_PCT' ? '%' : ' HP'}`
      : èMossaSoloStato(move) ? 'Stato' : `${dice.dadi}d6 ${dice.incremento >= 0 ? '+' : ''}${dice.incremento}`
    const statusName: Record<string, string> = { PARALISI: 'Paralisi', PARALIZZATO: 'Paralisi', VELENO: 'Veleno', SONNO: 'Sonno', CONFUSIONE: 'Confusione' }
    const description = healing ? `${effect}${move.effetto === 'CURA_PCT' ? ' degli HP massimi' : ''} e rimuove veleno e paralisi`
      : èMossaSoloStato(move) ? `${statusName[move.effetto ?? ''] ?? 'Stato alterato'} · Nessun danno e nessuna Suprema`
        : 'Dadi e bonus al livello attuale · Il tipo del bersaglio modifica il danno'
    return <div className="pu-move" key={id} data-move-kind={healing ? 'heal' : èMossaSoloStato(move) ? 'status' : 'attack'}><div><strong>{move.nome}</strong><TypeBadge type={move.tipo} />{detailed && <small className="pu-move-tactical">{description}</small>}</div>
      <span className="pu-dice" role={healing ? 'note' : undefined} aria-label={description} title={description}>{effect}</span></div>
  })}</div>
}
export function PokemonHero({ pokemon, className = '', children }: { pokemon: PokemonIstanza; className?: string; children?: ReactNode }) {
  const definition = getPokemon(pokemon.specieId)
  return <section className={`pu-hero ${className}`} aria-label={`Arkamon selezionato: ${pokemon.nome}`}>
    <span className="pu-species-number">ARKA / {String(pokemon.specieId).padStart(3, '0')}</span>
    <CreaturePortrait pokemon={pokemon} large />
    <div className="pu-hero-caption"><span className="pu-kicker">Compagno selezionato · Lv. {pokemon.livello}</span><h2>{pokemon.nome}</h2>
      {definition && <TypeBadge type={definition.tipo} />}{pokemon.hp <= 0 ? <span className="pu-status-pill">KO</span> : pokemon.stato ? <span className="pu-status-pill">{pokemon.stato.tipo}</span> : null}
    </div>{children}
  </section>
}
export function formatNumber(value: number) { return value.toLocaleString('it-IT') }
