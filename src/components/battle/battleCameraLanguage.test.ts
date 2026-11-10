import { describe, expect, it } from 'vitest'
import {
  battleCameraIntensity,
  planBattleCameraPose,
  type BattleCinematicShot,
} from './battleCameraLanguage'

const aToB: BattleCinematicShot = { attacker: 'A', target: 'B', intensity: 'medium' }

describe('bounded battle cinematography', () => {
  it('inherits the existing four VFX feedback tiers instead of changing attacks', () => {
    expect(battleCameraIntensity({ cameraShakePx: 0 })).toBe('subtle')
    expect(battleCameraIntensity({ cameraShakePx: 1 })).toBe('light')
    expect(battleCameraIntensity({ cameraShakePx: 3 })).toBe('medium')
    expect(battleCameraIntensity({ cameraShakePx: 6 })).toBe('heavy')
    expect(battleCameraIntensity({ cameraShakePx: NaN })).toBe('subtle')
  })

  it('starts with a neutral world and finishes at its original framing', () => {
    for (const phase of ['idle', 'preparing', 'visual-complete', 'cancelled'] as const) {
      const pose = planBattleCameraPose(phase, aToB, false)
      expect(pose.x).toBe('0%')
      expect(pose.y).toBe('0%')
      expect(pose.scale).toBe(1)
      expect(pose.overlayOpacity).toBe(0)
    }
  })

  it('anticipates toward the attacking creature then crosses the field to the target', () => {
    const windup = planBattleCameraPose('windup', aToB, false)
    const release = planBattleCameraPose('released', aToB, false)
    const impact = planBattleCameraPose('impact', aToB, false)
    expect(windup.beat).toBe('anticipation')
    expect(Number.parseFloat(windup.x)).toBeGreaterThan(0)
    expect(Number.parseFloat(windup.y)).toBeLessThan(0)
    expect(release.beat).toBe('travel')
    expect(Number.parseFloat(release.x)).toBeLessThan(0)
    expect(Number.parseFloat(release.y)).toBeGreaterThan(0)
    expect(impact.beat).toBe('impact')
    expect(impact.scale).toBeGreaterThan(windup.scale)
    expect(impact.overlayOpacity).toBeGreaterThan(0)
  })

  it('mirrors the director for enemy attacks and retains self-target healing framing', () => {
    const enemy = planBattleCameraPose('windup', { attacker: 'B', target: 'A', intensity: 'medium' }, false)
    const friendly = planBattleCameraPose('windup', aToB, false)
    expect(Number.parseFloat(enemy.x)).toBe(-Number.parseFloat(friendly.x))
    expect(Number.parseFloat(enemy.y)).toBe(-Number.parseFloat(friendly.y))

    const self = planBattleCameraPose('released', { attacker: 'A', target: null, intensity: 'light' }, false)
    expect(Number.parseFloat(self.x)).toBeGreaterThan(0)
  })

  it('scales camera and light by VFX intensity and stays bounded on small viewports', () => {
    const light = planBattleCameraPose('impact', { ...aToB, intensity: 'light' }, false)
    const heavy = planBattleCameraPose('impact', { ...aToB, intensity: 'heavy' }, false)
    expect(heavy.scale).toBeGreaterThan(light.scale)
    expect(heavy.overlayOpacity).toBeGreaterThan(light.overlayOpacity)
    expect(heavy.scale).toBeLessThanOrEqual(1.07)
    for (const direction of [aToB, { attacker: 'B', target: 'A', intensity: 'heavy' } as BattleCinematicShot]) {
      for (const phase of ['windup', 'released', 'impact'] as const) {
        const pose = planBattleCameraPose(phase, direction, false)
        expect(Math.abs(Number.parseFloat(pose.x))).toBeLessThanOrEqual(2)
        expect(Math.abs(Number.parseFloat(pose.y))).toBeLessThanOrEqual(2)
      }
    }
  })

  it('leaves support/status moves visually still instead of inventing physical impacts', () => {
    for (const phase of ['windup', 'released', 'impact'] as const) {
      const pose = planBattleCameraPose(phase, { ...aToB, intensity: 'subtle' }, false)
      expect(pose).toEqual({ x: '0%', y: '0%', scale: 1, durationMs: 0, overlayOpacity: 0, beat: 'neutral' })
    }
  })

  it('disables all camera moves, flashes, and motion durations for reduced motion', () => {
    for (const intensity of ['light', 'medium', 'heavy'] as const) {
      for (const phase of ['windup', 'released', 'impact'] as const) {
        const pose = planBattleCameraPose(phase, { ...aToB, intensity }, true)
        expect(pose).toEqual({ x: '0%', y: '0%', scale: 1, durationMs: 0, overlayOpacity: 0, beat: 'neutral' })
      }
    }
  })

  it('halves cinematic durations on fast playback without changing impact framing', () => {
    const normal = planBattleCameraPose('windup', aToB, false, 1)
    const fast = planBattleCameraPose('windup', aToB, false, 2)
    expect(fast.durationMs * 2).toBe(normal.durationMs)
    expect(fast.x).toBe(normal.x)
    expect(fast.y).toBe(normal.y)
    expect(fast.scale).toBe(normal.scale)
  })
})
