import { describe, expect, it } from 'vitest'
import { getPokemon, POKEMON_BASE } from '@/data'
import { ARKAMON_ASSET_CATALOG, filterArkamonAssetCatalog, getArkamonAssetEntry, getAssetPortraitViewBox } from '../arkamonAssetCatalog'

describe('graphic assets remain separate from playable forms', () => {
  it('exposes all supplied sparse IDs and pending metadata without expanding gameplay', () => {
    expect(ARKAMON_ASSET_CATALOG).toHaveLength(200)
    expect(ARKAMON_ASSET_CATALOG.filter(entry => entry.status === 'game-data-present')).toHaveLength(110)
    expect(ARKAMON_ASSET_CATALOG.filter(entry => entry.status === 'pending-game-data')).toHaveLength(90)
    expect(POKEMON_BASE).toHaveLength(110)
    for (const entry of ARKAMON_ASSET_CATALOG) {
      expect(Object.keys(entry).sort()).toEqual(['id', 'sprites', 'status'])
      expect(entry.status === 'game-data-present').toBe(Boolean(getPokemon(entry.id)))
      expect(entry.sprites.front).toBeDefined()
      for (const sprite of Object.values(entry.sprites)) {
        expect(sprite!.source).toMatch(/^\/sprites\/(front_sprites|back_sprites|small_sprites)\/.+\.png$/)
        expect(sprite!.sha256).toMatch(/^[a-f0-9]{64}$/)
        expect(sprite!.bytes).toBeGreaterThan(0)
      }
    }
    for (const id of [133, 135, 136, 137, 138]) {
      expect(getArkamonAssetEntry(id)?.status).toBe('pending-game-data')
      expect(getPokemon(id)).toBeUndefined()
    }
    expect(getArkamonAssetEntry(179)).toBeUndefined()
    expect(getArkamonAssetEntry(207)).toBeUndefined()
    for (const id of [111, 116, 117, 131, 134, 139, 150, 184, 206]) expect(getPokemon(id)).toBeUndefined()
  })

  it('filters pending and animated assets independently, retaining animated forms without game data', () => {
    const animated = new Set([1, 111, 116, 117, 134, 139])
    expect(filterArkamonAssetCatalog('animated', animated).map(entry => entry.id)).toEqual([1, 111, 116, 117, 134, 139])
    expect(filterArkamonAssetCatalog('pending-game-data', animated).some(entry => entry.id === 111)).toBe(true)
    expect(filterArkamonAssetCatalog('pending-game-data', animated).some(entry => entry.id === 1)).toBe(false)
    expect(filterArkamonAssetCatalog('all', animated)).toHaveLength(200)
  })

  it('fits all visible pixels, including rectangular artwork, without changing source rasters', () => {
    const sprite = getArkamonAssetEntry(150)!.sprites.front!
    const [left, top, width, height] = getAssetPortraitViewBox(sprite).split(' ').map(Number)
    expect(left).toBeLessThan(sprite.alphaBounds[0])
    expect(top).toBeLessThan(sprite.alphaBounds[1])
    expect(left + width).toBeGreaterThan(sprite.alphaBounds[2])
    expect(top + height).toBeGreaterThan(sprite.alphaBounds[3])
    expect(getArkamonAssetEntry(150)!.sprites.back).toBeUndefined()
    expect(getAssetPortraitViewBox({ ...sprite, alphaBounds: [2, 1, 7, 5] })).toBe('1.8 0.8 5.4 4.4')
  })
})
