import type { CSSProperties, ImgHTMLAttributes } from 'react'
import { assetUrl } from '@/utils/assetUrl'
import catalog from '../../../ui-source/provided-png-runtime.generated.json'
import { PNG_ARTWORK_ALIASES } from './pngArtworkAliases'
import './providedArtwork.css'

const assets = new Map(catalog.assets.map(asset => [asset.id, asset]))
const resolveAsset = (id: string) => assets.get(PNG_ARTWORK_ALIASES[id] ?? id)

export function providedAssetUrl(id: string): string {
  const asset = resolveAsset(id)
  if (!asset) throw new Error(`Unknown supplied PNG artwork: ${id}`)
  return assetUrl(`/ui/reference-png/${asset.file}`)
}
export function providedAssetAspect(id: string): number {
  const asset = resolveAsset(id)
  if (!asset) throw new Error(`Unknown supplied PNG artwork: ${id}`)
  return asset.width / asset.height
}

/** Request individual artwork; provenance stays in the separate build manifest. */
export function ProvidedArtwork({ id, className = '', style, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'id' | 'src' | 'alt'> & { id: string }) {
  const asset = resolveAsset(id)
  if (!asset) throw new Error(`Unknown supplied artwork: ${id}`)
  return <img {...props} className={`provided-artwork ${className}`} src={providedAssetUrl(id)}
    width={asset.width} height={asset.height} alt="" aria-hidden="true" draggable={false}
    decoding="async" data-provided-asset={id} data-package-asset={asset.id} style={{ ...style, objectFit: 'contain' }} />
}

/** Base-path aware URLs for decorative CSS. Merely defining these does not fetch the artwork. */
export const providedArtworkVariables = {
  ...Object.fromEntries([...catalog.assets.filter(asset => !asset.id.startsWith('portrait-')).map(asset => asset.id), ...Object.keys(PNG_ARTWORK_ALIASES)].map(id =>
    [`--provided-${id}`, `url("${providedAssetUrl(id)}")`])),
  '--provided-menu-card-ratio': providedAssetAspect('menu-card-normal'),
  '--provided-menu-card-inverse-ratio': 1 / providedAssetAspect('menu-card-normal'),
} as CSSProperties

const iconAssets: Record<string, string> = {
  'icon-analysis': 'search-icon', 'icon-challenges': 'warning',
}
export function providedIconAsset(id: string): string | undefined {
  return iconAssets[id] ?? (id.startsWith('type-') && assets.has(id) ? id : undefined)
}

export function providedPortraitSource(speciesId: number): string | undefined {
  const id = `portrait-${String(speciesId).padStart(3, '0')}`
  const asset = assets.get(id)
  return asset ? `/ui/reference-png/${asset.file}` : undefined
}
