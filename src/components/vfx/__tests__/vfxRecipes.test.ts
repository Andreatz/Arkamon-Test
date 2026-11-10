import { describe, expect, it } from 'vitest'
import { MOSSE } from '@data/index'
import { useVfxAdminStore } from '@store/vfxAdminStore'
import {
  getMoveVfxDurationMs,
  getMoveVfxImpactDelayMs,
  resolveMoveVfxAsset,
  resolveMoveVfxRecipe,
} from '../resolveMoveVfxAsset'
import { MOVE_VFX_ASSETS } from '../vfxManifest'
import {
  MOVE_VFX_RECIPE_BY_PRIMARY_ASSET,
  MOVE_VFX_RECIPES,
} from '../vfxRecipes'

describe('MOVE_VFX_RECIPES', () => {
  it('references only known assets and keeps every step inside the recipe duration', () => {
    for (const recipe of Object.values(MOVE_VFX_RECIPES)) {
      expect(recipe.durationMs).toBeGreaterThan(0)
      expect(recipe.impactAtMs).toBeGreaterThanOrEqual(0)
      expect(recipe.impactAtMs).toBeLessThanOrEqual(recipe.durationMs)
      expect(recipe.steps.length).toBeGreaterThan(1)

      for (const step of recipe.steps) {
        expect(MOVE_VFX_ASSETS[step.assetId as keyof typeof MOVE_VFX_ASSETS]).toBeTruthy()
        expect(step.startAtMs).toBeGreaterThanOrEqual(0)
        expect(step.startAtMs).toBeLessThan(recipe.durationMs)
        if (step.durationMs !== undefined) {
          expect(step.durationMs).toBeGreaterThan(0)
        }
      }
    }
  })

  it('maps recipe-enabled primary assets to valid recipes', () => {
    for (const [assetId, recipeId] of Object.entries(MOVE_VFX_RECIPE_BY_PRIMARY_ASSET)) {
      expect(MOVE_VFX_ASSETS[assetId as keyof typeof MOVE_VFX_ASSETS]).toBeTruthy()
      expect(MOVE_VFX_RECIPES[recipeId as keyof typeof MOVE_VFX_RECIPES]).toBeTruthy()
    }
  })

  it('uses recipe timing for matching moves', () => {
    const electricMove = { ...MOSSE[0], id: 9000, nome: 'Dardo elettrico', tipo: 'Elettro' as const }

    const recipe = resolveMoveVfxRecipe(electricMove)
    expect(recipe?.id).toBe('electric-bolt')
    expect(getMoveVfxDurationMs(electricMove)).toBe(recipe?.durationMs)
    expect(getMoveVfxImpactDelayMs(electricMove)).toBe(recipe?.impactAtMs)
  })

  it('uses single specific effects for configured moves and retains recipes for unassigned moves', () => {
    for (const move of MOSSE) {
      expect(resolveMoveVfxAsset(move).id).toMatch(/^moveset:/)
      expect(resolveMoveVfxRecipe(move)).toBeUndefined()
    }
    const unassigned = { ...MOSSE[0], id: 9000, nome: 'Dardo elettrico', tipo: 'Elettro' as const }
    expect(resolveMoveVfxRecipe(unassigned)?.id).toBe('electric-bolt')
  })

  it('bypasses automatic recipes when an admin override is active', () => {
    const electricMove = { ...MOSSE[0], id: 9000, nome: 'Dardo elettrico', tipo: 'Elettro' as const }
    expect(resolveMoveVfxRecipe(electricMove)?.id).toBe('electric-bolt')

    useVfxAdminStore.getState().setOverride({
      moveId: electricMove.id,
      assetId: 'shield',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      durationMs: 777,
      anchor: 'self',
      layer: 'front-ui',
      mirrorForEnemy: false,
      blendMode: 'normal',
    })

    expect(resolveMoveVfxRecipe(electricMove)).toBeUndefined()
    expect(getMoveVfxDurationMs(electricMove)).toBe(777)
    useVfxAdminStore.getState().resetOverrides()
  })
})
