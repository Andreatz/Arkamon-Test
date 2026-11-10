export interface ArkamonMotionProfile {
  idleLift: number
  idleTilt: number
  idleScale: number
  idleSeconds: number
  attackDistance: number
  attackLift: number
  attackTilt: number
  attackScale: number
  hitScale: number
  koTilt: number
  victoryLift: number
  victoryTilt: number
}

const DEFAULT_MOTION_PROFILE: ArkamonMotionProfile = {
  idleLift: 3,
  idleTilt: 0.35,
  idleScale: 1.012,
  idleSeconds: 2.6,
  attackDistance: 16,
  attackLift: 4,
  attackTilt: 2,
  attackScale: 1.04,
  hitScale: 0.95,
  koTilt: 7,
  victoryLift: 8,
  victoryTilt: 2,
}

/**
 * Procedural motion is deliberately species-aware for the first vertical slice.
 * These values only affect static PNG fallbacks. A real sprite-sheet animation
 * from arkamonAnimationManifest always takes precedence.
 */
export const ARKAMON_MOTION_PROFILES: Partial<Record<number, ArkamonMotionProfile>> = {
  // Vyrath: upright baby dragon — light, springy and expressive.
  1: {
    idleLift: 4,
    idleTilt: 0.55,
    idleScale: 1.018,
    idleSeconds: 2.35,
    attackDistance: 22,
    attackLift: 8,
    attackTilt: 3.2,
    attackScale: 1.055,
    hitScale: 0.93,
    koTilt: 10,
    victoryLift: 12,
    victoryTilt: 4,
  },

  // Wormaren: coiled earth serpent — heavier squash, roll and grounded impact.
  13: {
    idleLift: 2,
    idleTilt: 0.9,
    idleScale: 1.022,
    idleSeconds: 3.1,
    attackDistance: 14,
    attackLift: 3,
    attackTilt: 5,
    attackScale: 1.085,
    hitScale: 0.9,
    koTilt: 13,
    victoryLift: 6,
    victoryTilt: 6,
  },
}

export type ArkamonMotionFamily = 'grounded' | 'winged' | 'serpentine' | 'heavy' | 'floating' | 'springy'
/** Art-direction families for existing static backs. Native front clips always take precedence. */
export const ARKAMON_MOTION_FAMILIES: Record<ArkamonMotionFamily, ArkamonMotionProfile> = {
  grounded: DEFAULT_MOTION_PROFILE,
  winged: { ...DEFAULT_MOTION_PROFILE, idleLift: 7, idleTilt: 1, idleSeconds: 3.2, attackLift: 10, attackDistance: 21, victoryLift: 13 },
  serpentine: { ...DEFAULT_MOTION_PROFILE, idleLift: 1, idleTilt: 1.2, idleSeconds: 3.5, attackDistance: 13, attackScale: 1.06, koTilt: 12 },
  heavy: { ...DEFAULT_MOTION_PROFILE, idleLift: .8, idleTilt: .2, idleScale: 1.006, idleSeconds: 3.8, attackDistance: 10, attackLift: 1, attackScale: 1.025, victoryLift: 3 },
  floating: { ...DEFAULT_MOTION_PROFILE, idleLift: 8, idleTilt: .6, idleSeconds: 3.8, attackLift: 2, attackDistance: 12, koTilt: 3, victoryLift: 10 },
  springy: { ...DEFAULT_MOTION_PROFILE, idleLift: 4, idleSeconds: 2.3, attackLift: 7, attackDistance: 22, victoryLift: 12 },
}
const FAMILY_SPECIES: Partial<Record<ArkamonMotionFamily, readonly number[]>> = {
  winged: [28,29,34,35,65,66,71,72,73,86,87,88,95,96,97],
  serpentine: [14,15,26,27,49,50,56,57,92,93,94],
  heavy: [16,17,18,19,39,40,41,51,54,103,104],
  floating: [9,10,11,12,23,45,46,55,58,59,60,61,78,89,90,91,109],
  springy: [20,21,36,37,38,42,43,44,62,63,64,69,70,84,85],
}
export function getArkamonMotionFamily(speciesId: number): ArkamonMotionFamily {
  return (Object.keys(FAMILY_SPECIES) as ArkamonMotionFamily[]).find(family => FAMILY_SPECIES[family]?.includes(speciesId)) ?? 'grounded'
}
export function getArkamonMotionProfile(speciesId: number): ArkamonMotionProfile {
  return ARKAMON_MOTION_PROFILES[speciesId] ?? ARKAMON_MOTION_FAMILIES[getArkamonMotionFamily(speciesId)]
}
