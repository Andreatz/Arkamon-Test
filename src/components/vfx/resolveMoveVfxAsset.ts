import type { MossaDef } from '@/types'
import { MOVE_VFX_BY_MOVE_ID } from './moveVfxOverrides'
import { MOVE_VFX_ASSETS, type MoveVfxAssetId } from './vfxManifest'
import {
  MOVE_VFX_RECIPE_BY_PRIMARY_ASSET,
  MOVE_VFX_RECIPES,
} from './vfxRecipes'
import {
  resolveMoveVfxProfile,
  resolveProfileAssetId,
} from './moveVfxProfiles'
import type {
  MoveVfxAsset,
  MoveVfxFeedback,
  MoveVfxRecipe,
} from './types'
import { getAdminMoveVfxOverride } from '@store/vfxAdminStore'
import { getCuratedBattleAssetId, getVfxCurationPreviewAsset } from './vfxCuration'
import { getMoveVfxAssignment } from './moveVfxAssignments'

function resolveBaseMoveVfxAssetId(move: MossaDef): MoveVfxAssetId {
  return getMoveVfxAssignment(move)?.assetId ?? MOVE_VFX_BY_MOVE_ID[move.id] ?? resolveProfileAssetId(move)
}

export function resolveMoveVfxAsset(move: MossaDef): MoveVfxAsset {
  const assetId = resolveBaseMoveVfxAssetId(move)
  const baseAsset = MOVE_VFX_ASSETS[assetId] ?? MOVE_VFX_ASSETS.punch
  const adminOverride = getAdminMoveVfxOverride(move.id)

  if (!adminOverride) {
    const assignment = getMoveVfxAssignment(move)
    if (assignment?.assetId) {
      return {
        ...baseAsset,
        anchor: assignment.anchor ?? baseAsset.anchor,
        scale: assignment.scale ?? baseAsset.scale,
      }
    }
    // Preserve explicit per-move settings. Automatic selections share the exact
    // saved calibration used in the Lab, applied once to the original asset.
    const profile = resolveMoveVfxProfile(move)
    const curatedAssetId = getCuratedBattleAssetId(profile.archetype, profile.intensity)
    return MOVE_VFX_BY_MOVE_ID[move.id] === undefined && assetId === curatedAssetId
      ? getVfxCurationPreviewAsset(baseAsset)
      : baseAsset
  }

  return {
    ...MOVE_VFX_ASSETS[adminOverride.assetId],
    scale: adminOverride.scale,
    offsetX: adminOverride.offsetX,
    offsetY: adminOverride.offsetY,
    durationMs: adminOverride.durationMs,
    anchor: adminOverride.anchor,
    layer: adminOverride.layer,
    mirrorForEnemy: adminOverride.mirrorForEnemy,
    blendMode: adminOverride.blendMode,
  }
}

export function resolveMoveVfxRecipe(move: MossaDef): MoveVfxRecipe | undefined {
  // An admin override is an explicit request for a single asset. Keep the editor
  // predictable by bypassing automatic recipes while an override is active.
  if (getAdminMoveVfxOverride(move.id) || getMoveVfxAssignment(move)?.assetId) return undefined

  const assetId = resolveBaseMoveVfxAssetId(move)
  const recipeId = MOVE_VFX_RECIPE_BY_PRIMARY_ASSET[assetId]
  return recipeId ? MOVE_VFX_RECIPES[recipeId] : undefined
}

export function getMoveVfxFeedback(move: MossaDef): MoveVfxFeedback {
  return resolveMoveVfxProfile(move).feedback
}

export function getMoveVfxImpactDelayMs(move: MossaDef): number {
  const impactMs = resolveMoveVfxRecipe(move)?.impactAtMs ?? resolveMoveVfxAsset(move).impactAtMs ?? 0
  const durationMs = getMoveVfxDurationMs(move)
  const finiteDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  // An editor override may shorten the effect past its original impact marker.
  // The native hit planner and the rendered effect must use this same clock.
  return Math.max(0, Math.min(Number.isFinite(impactMs) ? impactMs : 0, finiteDurationMs))
}

export function getMoveVfxDurationMs(move: MossaDef): number {
  return resolveMoveVfxRecipe(move)?.durationMs ?? resolveMoveVfxAsset(move).durationMs
}
