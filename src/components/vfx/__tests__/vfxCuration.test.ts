import { describe, expect, it } from 'vitest'
import { MOVE_VFX_ASSETS } from '../vfxManifest'
import {
  filterVfxAssetIds,
  getVfxReviewLabel,
  getVfxCuration,
  getVfxCurationPreviewAsset,
  getCuratedBattleAssetId,
  VFX_CURATION,
  VFX_CURATION_CATEGORIES,
} from '../vfxCuration'

describe('VFX curation', () => {
  it('preserves the confirmed heavy electric calibration', () => {
    const id = 'generated:highmountain-img_effect_tynus_lightning_2-images_nested_sheet'
    expect(getVfxCuration(id)).toMatchObject({ reviewed: true, intensity: 'heavy', categories: ['electric', 'impact'] })
    expect(getVfxCurationPreviewAsset(MOVE_VFX_ASSETS[id])).toMatchObject({ anchor: 'target', scale: 1.5 })
  })

  it('reduces the review to confirmed choices and proposals while keeping reserves accessible', () => {
    const reserve = 'generated:hekatoneff_1011-img_hit-images_nested_sheet'
    const result = filterVfxAssetIds(MOVE_VFX_ASSETS, { recommendedOnly: true })
      .filter((id) => !id.startsWith('moveset:'))
    expect(result).toHaveLength(18)
    expect(result.filter((id) => getVfxCuration(id)?.reviewed)).toHaveLength(10)
    const proposals = result.filter((id) => getVfxCuration(id)?.recommendation === 'proposed')
    expect(proposals).toHaveLength(8)
    for (const id of proposals) {
      expect(getVfxCuration(id)?.reviewed).not.toBe(true)
      expect(getVfxCuration(id)?.battleArchetype).toBeUndefined()
    }
    for (const [category, count] of [['fire', 3], ['water', 3], ['heal', 2]] as const) {
      expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { recommendedOnly: true, category })
        .filter((id) => !id.startsWith('moveset:'))).toHaveLength(count)
      for (const intensity of ['subtle', 'light', 'medium', 'heavy'] as const) {
        expect(getCuratedBattleAssetId(category, intensity)).toBeUndefined()
      }
    }
    expect(result).not.toContain(reserve)
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS)).toContain(reserve)
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { recommendedOnly: true, category: 'electric' })
      .filter((id) => !id.startsWith('moveset:'))).toHaveLength(3)
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { recommendedOnly: true, search: 'no-matching-effect' })).toEqual([])
  })

  it('keeps the reviewed psychic effect out of electric results', () => {
    const id = 'generated:anglercompany-img_ladderpuzzle_shock-images_nested_sheet'
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { category: 'electric' })).not.toContain(id)
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { category: 'psychic' })).toContain(id)
    expect(getVfxCurationPreviewAsset(MOVE_VFX_ASSETS[id])).toMatchObject({ anchor: 'center', scale: 1.5 })
  })

  it('exposes all 276 new effects as proposals without claiming user confirmation', () => {
    const movesetIds = Object.keys(MOVE_VFX_ASSETS).filter((id) => id.startsWith('moveset:'))
    expect(movesetIds).toHaveLength(276)
    const recommended = filterVfxAssetIds(MOVE_VFX_ASSETS, { recommendedOnly: true })
    const candidates = filterVfxAssetIds(MOVE_VFX_ASSETS, { curatedOnly: true })
    for (const id of movesetIds) {
      const entry = getVfxCuration(id)!
      expect(entry).toMatchObject({ priority: 'candidate', recommendation: 'proposed' })
      expect(entry.reviewed).not.toBe(true)
      expect(entry.battleArchetype).toBeUndefined()
      expect(getVfxReviewLabel(entry)).toBe('Proposta')
      expect(recommended).toContain(id)
      expect(candidates).toContain(id)
      expect(getVfxCurationPreviewAsset(MOVE_VFX_ASSETS[id])).toEqual(MOVE_VFX_ASSETS[id])
    }
  })

  it('provides plant and earth filters and keeps paralysis distinct from healing', () => {
    expect(VFX_CURATION_CATEGORIES).toEqual(expect.arrayContaining(['plant', 'earth']))
    for (const category of ['plant', 'earth'] as const) {
      const ids = filterVfxAssetIds(MOVE_VFX_ASSETS, { recommendedOnly: true, category })
      expect(ids.length).toBeGreaterThan(0)
      expect(ids.every((id) => getVfxCuration(id)?.categories.includes(category))).toBe(true)
    }
    expect(getVfxCuration('moveset:256')?.categories).toContain('status')
    expect(getVfxCuration('moveset:256')?.categories).not.toContain('heal')
    expect(getVfxCuration('moveset:256')?.intensity).toBe('subtle')
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { search: 'Stasi Elettrica' })).toContain('moveset:256')
  })

  it('saves medium electric Spark calibration without modifying generated assets', () => {
    const id = 'generated:direction-img_effect_skill_spark_0-images_nested_sheet'
    const asset = MOVE_VFX_ASSETS[id]
    const original = { ...asset }
    expect(getVfxCuration(id)).toMatchObject({ reviewed: true, intensity: 'medium' })
    expect(getVfxCurationPreviewAsset(asset)).toMatchObject({ anchor: asset.anchor, scale: 1.5 })
    expect(asset).toEqual(original)
  })

  it('replaces saved calibration with manual controls instead of multiplying it twice', () => {
    const asset = MOVE_VFX_ASSETS['generated:anglercompany-img_ladderpuzzle_shock-images_nested_sheet']
    expect(getVfxCurationPreviewAsset(asset, { anchor: 'target', scale: 1.5 }))
      .toMatchObject({ anchor: 'target', scale: 1.5 })
    expect(getVfxCurationPreviewAsset(asset, { scale: 1 }).scale).toBe(1)
    expect(getVfxCurationPreviewAsset(MOVE_VFX_ASSETS.punch)).toEqual(MOVE_VFX_ASSETS.punch)
  })

  it('keeps the editorial catalogue linked to real assets after regeneration', () => {
    for (const [assetId, entry] of Object.entries(VFX_CURATION)) {
      expect(MOVE_VFX_ASSETS[assetId], assetId).toBeDefined()
      expect(entry?.categories.length, assetId).toBeGreaterThan(0)
      for (const category of entry?.categories ?? []) {
        expect(VFX_CURATION_CATEGORIES).toContain(category)
      }
    }
  })

  it('leaves uncatalogued assets available without filters', () => {
    expect(getVfxCuration('punch')).toBeUndefined()
    expect(getVfxCuration('unknown-vfx')).toBeUndefined()
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS)).toEqual(Object.keys(MOVE_VFX_ASSETS))
  })

  it('includes candidate, preferred and special entries in the shortlist', () => {
    const result = filterVfxAssetIds(MOVE_VFX_ASSETS, { curatedOnly: true })
    expect(result).toHaveLength(Object.keys(VFX_CURATION).length)
    expect(result).not.toContain('punch')
    expect(new Set(result.map((id) => getVfxCuration(id)?.priority)))
      .toEqual(new Set(['candidate', 'preferred', 'special']))
  })

  it('combines category, shortlist and normalized search', () => {
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, {
      category: 'electric',
      curatedOnly: true,
      search: '  LIGHTNING  ',
    }).filter((id) => !id.startsWith('moveset:'))).toEqual(['generated:highmountain-img_effect_tynus_lightning_2-images_nested_sheet'])
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, {
      category: 'heal',
      curatedOnly: true,
      search: 'lightning',
    })).toEqual([])
  })

  it('finds semantic tags even when they are absent from the asset name', () => {
    const assetId = 'generated:fieldgimmickeff-img_thunder-images_nested_sheet'
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { search: ' ELECTRIC ' })).toContain(assetId)
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { category: 'electric' })).toContain(assetId)
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { category: 'heal' })).not.toContain(assetId)
  })

  it('preserves searching by asset ID, label and playback kind', () => {
    const assetId = 'generated:fieldgimmickeff-img_thunder-images_nested_sheet'
    for (const search of [assetId, MOVE_VFX_ASSETS[assetId].label, 'sprite-sheet']) {
      expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { search })).toContain(assetId)
    }
    expect(filterVfxAssetIds(MOVE_VFX_ASSETS, { search: 'no-matching-effect' })).toEqual([])
  })
})
