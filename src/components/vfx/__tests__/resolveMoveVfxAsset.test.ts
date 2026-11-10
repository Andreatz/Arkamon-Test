import { afterEach, describe, expect, it } from 'vitest'
import { MOSSE } from '@data/index'
import type { MossaDef, TipoPokemon } from '@/types'
import { useVfxAdminStore } from '@store/vfxAdminStore'
import { getGifRuntimeSrc } from '../GifVfx'
import { getMoveVfxDurationMs, getMoveVfxImpactDelayMs, resolveMoveVfxAsset } from '../resolveMoveVfxAsset'

function move(
  id: number,
  tipo: TipoPokemon,
  effetto: string | null = null,
  nome = 'Test'
): MossaDef {
  return {
    id,
    nome,
    tipo,
    effetto,
    valoreEffetto: null,
    dadiPerLivello: {},
    incrementoPerLivello: {},
  }
}

describe('resolveMoveVfxAsset', () => {
  afterEach(() => {
    useVfxAdminStore.getState().resetOverrides()
  })

  it('resolves special effects before type fallbacks', () => {
    const cure = resolveMoveVfxAsset(move(9001, 'Normale', 'CURA'))
    expect(cure.id).toBe('cure')
    expect(cure.anchor).toBe('self')
    expect(resolveMoveVfxAsset(move(9002, 'Normale', 'CONFUSIONE')).id).toBe('confuseGif')
    expect(resolveMoveVfxAsset(move(9003, 'Normale', 'SUPREMA')).id).toBe('burst')
  })

  it('resolves water and normal type fallbacks', () => {
    const waterAttack = resolveMoveVfxAsset(move(9004, 'Acqua'))
    expect(waterAttack.id).toBe('waterGif')
    expect(waterAttack.anchor).toBe('target')
    expect(resolveMoveVfxAsset(move(9005, 'Normale')).id).toBe(
      'generated:lynn-img_skill_hithard_hit-images_nested_sheet'
    )
  })

  it('applies move id overrides first', () => {
    expect(resolveMoveVfxAsset(move(146, 'Normale')).id).toBe('gutsPunchGif')
    expect(resolveMoveVfxAsset(move(157, 'Erba')).id).toBe('slash')
  })

  it('always resolves an asset for every configured move', () => {
    for (const configuredMove of MOSSE) {
      const asset = resolveMoveVfxAsset(configuredMove)
      expect(asset.id).toBeTruthy()
      expect(asset.src).not.toMatch(/^\//)
      expect(asset.durationMs).toBeGreaterThan(0)
    }
  })

  it('restarts gif URLs when the effect id changes', () => {
    expect(getGifRuntimeSrc('/vfx/water.gif', 11)).toBe('/vfx/water.gif?vfx=11')
    expect(getGifRuntimeSrc('/vfx/water.gif?quality=1', 12)).toBe(
      '/vfx/water.gif?quality=1&vfx=12'
    )
  })

  it('applies temporary admin overrides before the configured mapping', () => {
    useVfxAdminStore.getState().setOverride({
      moveId: 146,
      assetId: 'shield',
      scale: 1.35,
      offsetX: 12,
      offsetY: -8,
      durationMs: 777,
      anchor: 'self',
      layer: 'front-ui',
      mirrorForEnemy: false,
      blendMode: 'lighten',
    })

    const asset = resolveMoveVfxAsset(move(146, 'Normale'))
    expect(asset.id).toBe('shield')
    expect(asset.scale).toBe(1.35)
    expect(asset.offsetX).toBe(12)
    expect(asset.offsetY).toBe(-8)
    expect(asset.durationMs).toBe(777)
    expect(getMoveVfxDurationMs(move(146, 'Normale'))).toBe(777)
    expect(asset.anchor).toBe('self')
    expect(asset.layer).toBe('front-ui')
    expect(asset.mirrorForEnemy).toBe(false)
    expect(asset.blendMode).toBe('lighten')
  })

  it('aligns the hit with the shortened effect when an editor duration ends before its native impact', () => {
    const configuredMove = MOSSE.find((entry) => entry.id === 31)!
    expect(getMoveVfxImpactDelayMs(configuredMove)).toBe(563)
    useVfxAdminStore.getState().setOverride({
      moveId: 31,
      assetId: 'moveset:031',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      durationMs: 250,
      anchor: 'center',
      layer: 'over-pokemon',
      mirrorForEnemy: true,
      blendMode: 'normal',
    })
    expect(getMoveVfxDurationMs(configuredMove)).toBe(250)
    expect(getMoveVfxImpactDelayMs(configuredMove)).toBe(250)
  })

  it('keeps the original impact when an editor duration extends the effect', () => {
    const configuredMove = MOSSE.find((entry) => entry.id === 31)!
    useVfxAdminStore.getState().setOverride({
      moveId: 31,
      assetId: 'moveset:031',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      durationMs: 2000,
      anchor: 'center',
      layer: 'over-pokemon',
      mirrorForEnemy: true,
      blendMode: 'normal',
    })
    expect(getMoveVfxImpactDelayMs(configuredMove)).toBe(563)
  })

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY])('keeps the hit delay finite for an invalid editor duration (%s)', (durationMs) => {
    const configuredMove = MOSSE.find((entry) => entry.id === 31)!
    useVfxAdminStore.getState().setOverride({
      moveId: 31,
      assetId: 'moveset:031',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      durationMs,
      anchor: 'center',
      layer: 'over-pokemon',
      mirrorForEnemy: true,
      blendMode: 'normal',
    })
    expect(getMoveVfxImpactDelayMs(configuredMove)).toBe(0)
  })
})
