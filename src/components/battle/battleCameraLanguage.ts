import type { MoveVfxFeedback } from '@/components/vfx/types'
import type { BattleDirectorPhase } from './battlePresentationDirector'

export type BattleCameraSide = 'A' | 'B'
export type BattleCinematicPhase = BattleDirectorPhase | 'idle'
export type BattleCameraIntensity = 'subtle' | 'light' | 'medium' | 'heavy'

export interface BattleCinematicShot {
  attacker: BattleCameraSide
  target: BattleCameraSide | null
  intensity: BattleCameraIntensity
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
  const focus = (side: BattleCameraSide, amountX: number, amountY: number) => ({
    x: limitedPercent((side === 'A' ? 1 : -1) * amountX * strength),
    y: limitedPercent((side === 'A' ? -1 : 1) * amountY * strength),
  })
  const destination = shot.target ?? shot.attacker
  switch (phase) {
    case 'windup':
      return {
        ...focus(shot.attacker, 0.72, 0.35),
        scale: Number((1 + 0.021 * strength).toFixed(4)),
        durationMs: duration(330),
        overlayOpacity: Math.min(0.2, 0.075 * strength),
        beat: 'anticipation',
      }
    case 'released':
      return {
        ...focus(destination, 0.98, 0.43),
        scale: Number((1 + 0.032 * strength).toFixed(4)),
        durationMs: duration(250),
        overlayOpacity: Math.min(0.15, 0.045 * strength),
        beat: 'travel',
      }
    case 'impact':
      return {
        ...focus(destination, 1.36, 0.56),
        scale: Number((1 + 0.051 * strength).toFixed(4)),
        durationMs: duration(95),
        overlayOpacity: Math.min(0.22, 0.095 * strength),
        beat: 'impact',
      }
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
