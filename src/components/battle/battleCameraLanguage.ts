import type { MoveVfxFeedback, VfxArchetype } from '@/components/vfx/types'
import type { BattleDirectorPhase } from './battlePresentationDirector'

export type BattleCameraSide = 'A' | 'B'
export type BattleCinematicPhase = BattleDirectorPhase | 'idle'
export type BattleCameraIntensity = 'subtle' | 'light' | 'medium' | 'heavy'
export type BattleCameraChoreography = 'physical' | 'projectile' | 'area' | 'support'

export interface BattleCinematicShot {
  attacker: BattleCameraSide
  target: BattleCameraSide | null
  intensity: BattleCameraIntensity
  /** Optional for compatibility with the original camera tests/fixtures. */
  choreography?: BattleCameraChoreography
  /** Existing type color, for a small impact light tint only. */
  accent?: string
}

export interface BattleCameraPose {
  /** Offsets are relative to the world layer, not screen pixels. */
  x: string
  y: string
  scale: number
  durationMs: number
  overlayOpacity: number
  /** Static description for diagnostics and automated visual regression tests. */
  beat: 'neutral' | 'anticipation' | 'travel' | 'impact'
}

/** Read existing VFX tiers instead of inventing new move categories or changing move data. */
export function battleCameraIntensity(feedback: Pick<MoveVfxFeedback, 'cameraShakePx'>): BattleCameraIntensity {
  const amount = Number.isFinite(feedback.cameraShakePx) ? feedback.cameraShakePx : 0
  if (amount <= 0) return 'subtle'
  if (amount < 2) return 'light'
  if (amount < 5) return 'medium'
  return 'heavy'
}

/** Map the existing move visual vocabulary to a camera language; never infer from damage. */
export function resolveBattleCameraChoreography(archetype: VfxArchetype): BattleCameraChoreography {
  switch (archetype) {
    case 'slash':
    case 'bite':
    case 'charge':
    case 'blunt':
      return 'physical'
    case 'wave':
    case 'storm':
    case 'eruption':
    case 'supreme':
    case 'psychic':
      return 'area'
    case 'heal':
    case 'status':
    case 'aura':
      return 'support'
    default:
      return 'projectile'
  }
}

const STRENGTH: Record<BattleCameraIntensity, number> = {
  subtle: 0, light: 0.7, medium: 1, heavy: 1.35,
}

const NEUTRAL: Omit<BattleCameraPose, 'durationMs'> = {
  x: '0%', y: '0%', scale: 1, overlayOpacity: 0, beat: 'neutral',
}
const limitedPercent = (value: number): string => {
  const clamped = Math.max(-2, Math.min(2, value))
  return clamped === 0 ? '0%' : String(Number(clamped.toFixed(3))) + '%'
}

/**
 * Camera blocking for battle only: the UI, HP windows and dice are never moved.
 * Positions are intentionally bounded so that a compact arena and the mobile
 * layout retain their subject framing. No animation is added in reduced motion.
 */
export function planBattleCameraPose(
  phase: BattleCinematicPhase,
  shot: BattleCinematicShot | null,
  reducedMotion: boolean,
  speed = 1,
): BattleCameraPose {
  const divisor = Number.isFinite(speed) && speed > 0 ? speed : 1
  const duration = (ms: number) => reducedMotion ? 0 : Math.round(ms / divisor)
  if (!shot || reducedMotion || STRENGTH[shot.intensity] === 0) {
    return { ...NEUTRAL, durationMs: 0 }
  }

  const strength = STRENGTH[shot.intensity]
  const kind = shot.choreography ?? 'projectile'
  const focus = (side: BattleCameraSide, amountX: number, amountY: number) => ({
    x: limitedPercent((side === 'A' ? 1 : -1) * amountX * strength),
    y: limitedPercent((side === 'A' ? -1 : 1) * amountY * strength),
  })
  const destination = shot.target ?? shot.attacker
  const pose = (
    beat: BattleCameraPose['beat'],
    side: BattleCameraSide | null,
    offsetX: number,
    offsetY: number,
    zoom: number,
    ms: number,
    glow: number,
  ): BattleCameraPose => ({
    ...(side ? focus(side, offsetX, offsetY) : { x: '0%', y: '0%' }),
    scale: Number((1 + zoom * strength).toFixed(4)),
    durationMs: duration(ms),
    overlayOpacity: Number(Math.min(0.22, glow * strength).toFixed(4)),
    beat,
  })

  // Tracking follows the authored VFX archetype, but never alters its own
  // timeline. Framing offsets stay below 2% and zoom below 1.07.
  switch (phase) {
    case 'windup':
      if (kind === 'physical') return pose('anticipation', shot.attacker, 1.02, 0.47, 0.029, 260, 0.073)
      if (kind === 'area') return pose('anticipation', shot.attacker, 0.35, 0.18, 0.013, 400, 0.085)
      if (kind === 'support') return pose('anticipation', shot.attacker, 0.34, 0.18, 0.011, 350, 0.05)
      return pose('anticipation', shot.attacker, 0.72, 0.35, 0.021, 330, 0.075)
    case 'released':
      if (kind === 'physical') return pose('travel', destination, 1.38, 0.65, 0.023, 170, 0.08)
      if (kind === 'area') return pose('travel', null, 0, 0, 0.015, 370, 0.105)
      if (kind === 'support') return pose('travel', shot.attacker, 0.3, 0.16, 0.012, 300, 0.075)
      return pose('travel', destination, 0.98, 0.43, 0.032, 250, 0.045)
    case 'impact':
      if (kind === 'physical') return pose('impact', destination, 1.45, 0.66, 0.05, 85, 0.125)
      if (kind === 'area') return pose('impact', null, 0, 0, 0.031, 125, 0.14)
      if (kind === 'support') return pose('impact', shot.attacker, 0.3, 0.16, 0.018, 160, 0.09)
      return pose('impact', destination, 1.36, 0.56, 0.051, 95, 0.095)
    case 'visual-complete':
    case 'cancelled':
      return { ...NEUTRAL, durationMs: duration(360) }
    default:
      return { ...NEUTRAL, durationMs: 0 }
  }
}

/**
 * Keep the camera's anticipation visible even when a static or one-frame native
 * attack releases immediately. This is presentation-only lead time; all native
 * release and VFX cue offsets continue to use their authored source frames.
 */
export function battleCameraAnticipationLeadMs(
  attackReleaseMs: number,
  intensity: BattleCameraIntensity,
  reducedMotion: boolean,
): number {
  if (reducedMotion || intensity === 'subtle') return 0
  const release = Number.isFinite(attackReleaseMs) ? Math.max(0, attackReleaseMs) : 0
  return Math.max(0, 210 - release)
}
