import { createContext, useContext } from 'react'
import { useGameStore } from '@store/gameStore'
import type { NavigazioneScena } from '@/types'
import { useRegiaStore } from '@/regia/regiaStore'

export const SceneNavigationContext = createContext<NavigazioneScena | null>(null)
export const SceneInputContext = createContext(false)

export function useSceneInputBlocked(): boolean {
  const transition = useContext(SceneInputContext)
  const paused = useRegiaStore(state => state.paused)
  return transition || paused
}

/** Keep the outgoing location stable until the transition covers the screen. */
export function useSceneNavigation(): NavigazioneScena {
  const presented = useContext(SceneNavigationContext)
  const requested = useGameStore((state) => state.scenaCorrente)
  return presented ?? requested
}
