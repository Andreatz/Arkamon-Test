import { useRef } from 'react'
import { useGameMotionPreferences } from '@/settings/gamePreferences'

/** Keep the current event's clocks aligned; a speed change applies to the next event. */
export function useVfxPlaybackPreferences(identity: string | number, continuous = false) {
  const preferences = useGameMotionPreferences()
  const playback = useRef({ identity, speed: preferences.speed })
  if (playback.current.identity !== identity || continuous) {
    playback.current = { identity, speed: preferences.speed }
  }
  return { reducedMotion: preferences.reducedMotion, speed: playback.current.speed }
}
