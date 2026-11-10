import { describe, expect, it } from 'vitest'
import {
  battleCameraIntensity,
  battleCameraAnticipationLeadMs,
  resolveBattleCameraChoreography,
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
  it('ensures a visible anticipation for first-frame releases without delaying authored long clips', () => {
    expect(battleCameraAnticipationLeadMs(0, 'light', false)).toBe(210)
    expect(battleCameraAnticipationLeadMs(150, 'medium', false)).toBe(60)
    expect(battleCameraAnticipationLeadMs(240, 'heavy', false)).toBe(0)
    expect(battleCameraAnticipationLeadMs(0, 'subtle', false)).toBe(0)
    expect(battleCameraAnticipationLeadMs(0, 'heavy', true)).toBe(0)
    expect(battleCameraAnticipationLeadMs(Number.NaN, 'light', false)).toBe(210)
  })

  it('classifies every existing VFX archetype into four deterministic choreographies', () => {
    const samples = {
      physical: ['blunt', 'slash', 'bite', 'charge'],
      projectile: ['beam', 'plant', 'fire', 'electric', 'water', 'dark'],
      area: ['wave', 'storm', 'eruption', 'psychic', 'supreme'],
      support: ['heal', 'status', 'aura'],
    } as const
    for (const [choreography, archetypes] of Object.entries(samples)) {
      for (const archetype of archetypes) {
        expect(resolveBattleCameraChoreography(archetype)).toBe(choreography)
      }
    }
  })

  it('makes physical attacks lunge, projectile attacks track and area attacks pull to center', () => {
    const physical = { ...aToB, choreography: 'physical' as const }
    const projectile = { ...aToB, choreography: 'projectile' as const }
    const area = { ...aToB, choreography: 'area' as const }
    const pWindup = planBattleCameraPose('windup', physical, false)
    const pRelease = planBattleCameraPose('released', physical, false)
    const ranged = planBattleCameraPose('released', projectile, false)
    const areaRelease = planBattleCameraPose('released', area, false)
    const areaImpact = planBattleCameraPose('impact', area, false)
    expect(Number.parseFloat(pWindup.x)).toBeGreaterThan(0.7)
    expect(Number.parseFloat(pRelease.x)).toBeLessThan(Number.parseFloat(ranged.x))
    expect(pRelease.durationMs).toBeLessThan(ranged.durationMs)
    expect(areaRelease.x).toBe('0%')
    expect(areaRelease.y).toBe('0%')
    expect(areaImpact.x).toBe('0%')
    expect(areaImpact.y).toBe('0%')
    expect(areaImpact.overlayOpacity).toBeGreaterThan(planBattleCameraPose('impact', projectile, false).overlayOpacity)
  })

  it('uses caster-focused motion for non-damaging support instead of rushing the opponent', () => {
    const a = { ...aToB, choreography: 'support' as const }
    const attack = planBattleCameraPose('released', a, false)
    expect(Number.parseFloat(attack.x)).toBeGreaterThan(0)
    expect(Number.parseFloat(attack.y)).toBeLessThan(0)
    expect(attack.scale).toBeLessThan(planBattleCameraPose('released', { ...aToB, choreography: 'projectile' }, false).scale)
  })

  it('mirrors all four choreographies correctly and retains strict mobile bounds', () => {
    for (const choreography of ['physical', 'projectile', 'area', 'support'] as const) {
      for (const intensity of ['light', 'medium', 'heavy'] as const) {
        const a: BattleCinematicShot = { attacker: 'A', target: 'B', intensity, choreography }
        const b: BattleCinematicShot = { attacker: 'B', target: 'A', intensity, choreography }
        for (const phase of ['windup', 'released', 'impact'] as const) {
          const left = planBattleCameraPose(phase, a, false)
          const right = planBattleCameraPose(phase, b, false)
          expect(Number.parseFloat(left.x)).toBeCloseTo(-Number.parseFloat(right.x), 3)
          expect(Number.parseFloat(left.y)).toBeCloseTo(-Number.parseFloat(right.y), 3)
          for (const pose of [left, right]) {
            expect(Math.abs(Number.parseFloat(pose.x))).toBeLessThanOrEqual(2)
            expect(Math.abs(Number.parseFloat(pose.y))).toBeLessThanOrEqual(2)
            expect(pose.scale).toBeGreaterThanOrEqual(1)
            expect(pose.scale).toBeLessThanOrEqual(1.07)
            expect(pose.overlayOpacity).toBeLessThanOrEqual(0.22)
          }
        }
      }
    }
  })

  it('keeps every choreography completely still when reduced motion is requested', () => {
    for (const choreography of ['physical', 'projectile', 'area', 'support'] as const) {
      for (const phase of ['windup', 'released', 'impact'] as const) {
        expect(planBattleCameraPose(phase, { ...aToB, choreography, intensity: 'heavy' }, true))
          .toEqual({ x: '0%', y: '0%', scale: 1, durationMs: 0, overlayOpacity: 0, beat: 'neutral' })
      }
    }
  })

})
