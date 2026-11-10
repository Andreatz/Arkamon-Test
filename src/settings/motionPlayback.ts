import { createContext } from 'react'

/** A public renderer follows the console without changing the viewer's saved preferences. */
export interface MotionPlayback { speed: 1 | 2; reducedMotion: boolean }
export const MotionPlaybackContext = createContext<MotionPlayback | null>(null)
export function normalizeMotionPlayback(value: unknown): MotionPlayback {
  const input = value && typeof value === 'object' ? value as Partial<MotionPlayback> : {}
  return { speed: input.speed === 2 ? 2 : 1, reducedMotion: input.reducedMotion === true }
}
