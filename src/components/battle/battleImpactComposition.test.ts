import { describe, expect, it } from 'vitest'
import { getBattleImpactDurationMs, impactLayerAppearance, planBattleImpactComposition } from './battleImpactComposition'

describe('battle impact composition', () => {
  it('uses distinct lightweight silhouettes for physical, projectile, area and support cues', () => {
    const kinds = ['physical', 'projectile', 'area', 'support'] as const
    const profiles = kinds.map(kind => planBattleImpactComposition(kind, 1.1))
    expect(profiles.map(layers => layers.map(layer => layer.kind))).toEqual([
      ['slash', 'ring'], ['ring', 'halo'], ['shockwave', 'ring'], ['halo', 'ring'],
    ])
    for (const layers of profiles) {
      expect(layers.length).toBeLessThanOrEqual(2)
      expect(getBattleImpactDurationMs(layers)).toBeLessThanOrEqual(560)
      for (const layer of layers) {
        expect(layer.width).toBeLessThanOrEqual(200)
        expect(layer.peakOpacity).toBeGreaterThan(0)
        expect(layer.peakOpacity).toBeLessThanOrEqual(0.95)
        expect(layer.startScale).toBeLessThan(layer.endScale)
      }
    }
  })

  it('keeps every particle disabled under reduced-motion without extending gameplay', () => {
    for (const kind of ['physical', 'projectile', 'area', 'support'] as const) {
      const layers = planBattleImpactComposition(kind, 2, true)
      expect(layers).toEqual([])
      expect(getBattleImpactDurationMs(layers)).toBe(0)
    }
  })

  it('clamps corrupt intensities and bounds peak light for the stage', () => {
    for (const strength of [Number.NaN, -100, 0, 1000]) {
      for (const layer of planBattleImpactComposition('area', strength)) {
        expect(Number.isFinite(layer.peakOpacity)).toBe(true)
        expect(layer.peakOpacity).toBeLessThanOrEqual(0.95)
        expect(layer.endScale).toBeLessThanOrEqual(2.7)
      }
    }
  })

  it('applies the original move type tint without introducing media URLs', () => {
    for (const kind of ['slash', 'ring', 'halo', 'shockwave'] as const) {
      const style = impactLayerAppearance(kind, '#38bdf8')
      expect(style.background).toContain('#38bdf8')
      expect(style.border).toContain('#38bdf8')
      expect(JSON.stringify(style)).not.toContain('url(')
    }
  })
})
