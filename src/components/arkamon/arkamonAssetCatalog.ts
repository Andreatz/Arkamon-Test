import catalog from '@/data/arkamon-assets.json'

export interface ArkamonSpriteAsset {
  source: string
  width: number
  height: number
  /** Exclusive right/bottom bounds of every visible source pixel. */
  alphaBounds: readonly number[]
  bytes: number
  sha256: string
}

export interface ArkamonAssetEntry {
  id: number
  status: 'game-data-present' | 'pending-game-data'
  sprites: Partial<Record<'front' | 'back' | 'small', ArkamonSpriteAsset>>
}

// This module belongs to the lazy laboratory, never to the gameplay catalog.
export const ARKAMON_ASSET_CATALOG = catalog.entries as ArkamonAssetEntry[]
const byId = new Map(ARKAMON_ASSET_CATALOG.map(entry => [entry.id, entry]))

export function getArkamonAssetEntry(id: number): ArkamonAssetEntry | undefined {
  return byId.get(id)
}

export type ArkamonAssetFilter = 'all' | 'animated' | 'pending-game-data'

export function filterArkamonAssetCatalog(filter: ArkamonAssetFilter, animatedIds: ReadonlySet<number>): ArkamonAssetEntry[] {
  return ARKAMON_ASSET_CATALOG.filter(entry => filter === 'animated' ? animatedIds.has(entry.id)
    : filter === 'pending-game-data' ? entry.status === 'pending-game-data' : true)
}

/** Fit all visible pixels with an equal margin; no new raster or source edits. */
export function getAssetPortraitViewBox(sprite: ArkamonSpriteAsset): string {
  const [left, top, right, bottom] = sprite.alphaBounds
  const width = right - left, height = bottom - top
  const margin = Math.max(width, height) * 0.04
  return `${left - margin} ${top - margin} ${width + margin * 2} ${height + margin * 2}`
}
