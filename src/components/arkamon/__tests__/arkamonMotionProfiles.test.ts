import { describe, expect, it } from 'vitest'
import {
  ARKAMON_MOTION_PROFILES,
  ARKAMON_MOTION_FAMILIES,
  getArkamonMotionFamily,
  getArkamonMotionProfile,
} from '../arkamonMotionProfiles'

describe('Arkamon procedural battle motion profiles', () => {
  it('assigns a stable family while preserving species-specific direction', () => {
    expect(getArkamonMotionFamily(71)).toBe('winged')
    expect(getArkamonMotionFamily(26)).toBe('serpentine')
    expect(getArkamonMotionProfile(71).idleLift).toBeGreaterThan(getArkamonMotionProfile(16).idleLift)
    for (const profile of Object.values(ARKAMON_MOTION_FAMILIES)) {
      expect(profile.idleSeconds).toBeGreaterThan(0)
      expect(profile.attackScale).toBeGreaterThanOrEqual(1)
    }
  })
  it('defines distinct vertical-slice profiles for Vyrath and Wormaren', () => {
    const vyrath = getArkamonMotionProfile(1)
    const wormaren = getArkamonMotionProfile(13)

    expect(ARKAMON_MOTION_PROFILES[1]).toBeTruthy()
    expect(ARKAMON_MOTION_PROFILES[13]).toBeTruthy()
    expect(vyrath.attackDistance).toBeGreaterThan(wormaren.attackDistance)
    expect(wormaren.attackScale).toBeGreaterThan(vyrath.attackScale)
  })

  it('provides a safe default profile to every other species', () => {
    const fallback = getArkamonMotionProfile(9999)

    expect(fallback.idleSeconds).toBeGreaterThan(0)
    expect(fallback.attackDistance).toBeGreaterThan(0)
  })
})
