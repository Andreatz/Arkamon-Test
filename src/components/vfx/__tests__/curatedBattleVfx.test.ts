import { afterEach, describe, expect, it } from 'vitest'
import { MOSSE } from '@data/index'
import { useVfxAdminStore } from '@store/vfxAdminStore'
import { MOVE_VFX_ASSETS } from '../vfxManifest'
import { getMoveVfxAssignment } from '../moveVfxAssignments'
import { resolveMoveVfxProfile, resolveProfileAssetId } from '../moveVfxProfiles'
import { VFX_CURATION, getCuratedBattleAssetId, getVfxCurationPreviewAsset } from '../vfxCuration'
import {
  getMoveVfxDurationMs,
  getMoveVfxImpactDelayMs,
  resolveMoveVfxAsset,
  resolveMoveVfxRecipe,
} from '../resolveMoveVfxAsset'

const byId = (id: number) => MOSSE.find((move) => move.id === id)!

const cases = [
  [118, 'psychic', 'light', 'generated:anglercompany-img_finalboss_minitail_hit-images_flat_sheet', 'target', 1.25],
  [119, 'psychic', 'medium', 'generated:hekatoneff_1001-img_explosion-images_nested_sheet', 'target', 1.25],
  [58, 'psychic', 'heavy', 'generated:anglercompany-img_ladderpuzzle_shock-images_nested_sheet', 'center', 1.5],
  [38, 'electric', 'light', 'generated:anglercompany-img_subboss_chargedcannon_blue_hit-images_nested_sheet', 'target', 1.25],
  [39, 'electric', 'medium', 'generated:direction-img_effect_skill_spark_0-images_nested_sheet', 'target', 1.5],
  [185, 'electric', 'heavy', 'generated:highmountain-img_effect_tynus_lightning_2-images_nested_sheet', 'target', 1.5],
  [180, 'slash', 'light', 'generated:direction1-img_effect_skill_overswingdouble_0-images_nested_sheet', 'target', 1],
  [30, 'slash', 'medium', 'gif:27c650209255d638948a6215ffea9c78', 'target', 1.25],
  [182, 'blunt', 'light', 'generated:basiceff-img_tjrjump-images_nested_sheet', 'target', 1],
  [129, 'blunt', 'medium', 'generated:lynn-img_skill_hithard_hit-images_nested_sheet', 'target', 1],
] as const

describe('individual battle VFX and preserved legacy calibration', () => {
  afterEach(() => useVfxAdminStore.getState().resetOverrides())

  it.each(cases)('keeps move %i at %s/%s while retaining its legacy calibration',
    (id, archetype, intensity, assetId, anchor, scale) => {
      const move = byId(id)
      expect(resolveMoveVfxProfile(move)).toMatchObject({ archetype, intensity })
      const original = { ...MOVE_VFX_ASSETS[assetId] }
      expect(getVfxCurationPreviewAsset(MOVE_VFX_ASSETS[assetId])).toMatchObject({ id: assetId, anchor, scale })
      const assignment = getMoveVfxAssignment(move)!
      const asset = resolveMoveVfxAsset(move)
      expect(asset).toMatchObject({ id: assignment.assetId, anchor: assignment.anchor, scale: 1, blendMode: 'normal' })
      expect(asset.id).toMatch(/^moveset:/)
      expect(asset).toEqual(MOVE_VFX_ASSETS[assignment.assetId!])
      expect(resolveMoveVfxRecipe(move)).toBeUndefined()
      expect(getMoveVfxDurationMs(move)).toBe(asset.durationMs)
      expect(getMoveVfxImpactDelayMs(move)).toBe(asset.impactAtMs)
      expect(getMoveVfxImpactDelayMs(move)).toBeLessThanOrEqual(getMoveVfxDurationMs(move))
      expect(resolveMoveVfxAsset(move)).toEqual(asset)
      expect(MOVE_VFX_ASSETS[assetId]).toEqual(original)
    })

  it('assigns each confirmed battle role only once and never promotes a reserve', () => {
    const roles = new Set<string>()
    for (const [id, entry] of Object.entries(VFX_CURATION)) {
      if (!entry?.battleArchetype) continue
      expect(entry.reviewed).toBe(true)
      expect(entry.recommendation).toBeUndefined()
      expect(entry.intensity).toBeDefined()
      expect(MOVE_VFX_ASSETS[id]).toBeDefined()
      const role = `${entry.battleArchetype}/${entry.intensity}`
      expect(roles.has(role)).toBe(false)
      roles.add(role)
      expect(getCuratedBattleAssetId(entry.battleArchetype, entry.intensity!)).toBe(id)
    }
    expect(roles.size).toBe(10)
  })

  it('keeps semantic fallbacks available for moves without an individual assignment', () => {
    const heavySlash = { ...resolveMoveVfxProfile(byId(70)), intensity: 'heavy' as const }
    expect(getCuratedBattleAssetId('slash', 'heavy')).toBeUndefined()
    expect(resolveProfileAssetId(byId(70), heavySlash)).toBe('slash')
    expect(getCuratedBattleAssetId('blunt', 'heavy')).toBeUndefined()
    expect(resolveProfileAssetId(byId(44))).toBe('generated:hekatoneff_1001-img_explosion-images_nested_sheet')
    expect(resolveMoveVfxAsset(byId(44)).id).toBe('moveset:044')
  })

  it('lets an Admin override replace saved calibration without multiplying zoom twice', () => {
    const move = byId(6)
    const asset = resolveMoveVfxAsset(move)
    useVfxAdminStore.getState().setOverride({
      moveId: move.id, assetId: asset.id,
      scale: 0.75, anchor: 'self', offsetX: 12, offsetY: -8,
      durationMs: 1200, layer: 'front-ui', mirrorForEnemy: false, blendMode: 'lighten',
    })
    expect(resolveMoveVfxAsset(move)).toMatchObject({
      scale: 0.75, anchor: 'self', offsetX: 12, offsetY: -8, durationMs: 1200,
    })
    expect(resolveMoveVfxRecipe(move)).toBeUndefined()
    expect(getMoveVfxDurationMs(move)).toBe(1200)
    useVfxAdminStore.getState().resetOverrides()
    expect(resolveMoveVfxAsset(move)).toEqual(asset)
  })
})
