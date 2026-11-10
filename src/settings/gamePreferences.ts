import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useReducedMotion } from 'framer-motion'
import { useContext } from 'react'
import { MotionPlaybackContext } from './motionPlayback'
import { isUiStudioPreview, uiPreviewCampaignStorage } from '@/ui-studio/previewMode'

export type MotionPreference = 'system' | 'on' | 'off'
export interface GamePreferences {
  musicVolume: number
  effectsVolume: number
  animationSpeed: 'normal' | 'fast'
  reducedMotion: MotionPreference
  graphicsMemory: 'auto' | 'full' | 'low'
}
export const DEFAULT_GAME_PREFERENCES: GamePreferences = {
  musicVolume: 1, effectsVolume: 1, animationSpeed: 'normal', reducedMotion: 'system', graphicsMemory: 'auto',
}
const volume = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(1, value)) : fallback
export function normalizeGamePreferences(value: unknown): GamePreferences {
  const data = value && typeof value === 'object' ? value as Partial<GamePreferences> : {}
  return {
    musicVolume: volume(data.musicVolume, 1), effectsVolume: volume(data.effectsVolume, 1),
    animationSpeed: data.animationSpeed === 'fast' ? 'fast' : 'normal',
    reducedMotion: data.reducedMotion === 'on' || data.reducedMotion === 'off' ? data.reducedMotion : 'system',
    graphicsMemory: data.graphicsMemory === 'full' || data.graphicsMemory === 'low' ? data.graphicsMemory : 'auto',
  }
}
interface PreferencesStore extends GamePreferences {
  setPreferences: (patch: Partial<GamePreferences>) => void
  resetPreferences: () => void
}
export const useGamePreferences = create<PreferencesStore>()(persist((set, get) => ({
  ...DEFAULT_GAME_PREFERENCES,
  setPreferences: (patch) => set(normalizeGamePreferences({ ...get(), ...patch })),
  resetPreferences: () => set({ ...DEFAULT_GAME_PREFERENCES }),
}), {
  name: 'arkamon-preferences-v1', version: 1,
  storage: createJSONStorage(() => isUiStudioPreview() ? uiPreviewCampaignStorage : localStorage),
  partialize: ({ musicVolume, effectsVolume, animationSpeed, reducedMotion, graphicsMemory }) => ({ musicVolume, effectsVolume, animationSpeed, reducedMotion, graphicsMemory }),
  merge: (saved, current) => ({ ...current, ...normalizeGamePreferences(saved) }),
}))

/** Presentation duration only: neither dice nor game rules depend on this value. */
export function getAnimationDuration(milliseconds: number): number {
  return Math.max(0, milliseconds) / (useGamePreferences.getState().animationSpeed === 'fast' ? 2 : 1)
}
export function useGameMotionPreferences(): { reducedMotion: boolean; speed: number } {
  const playback = useContext(MotionPlaybackContext)
  const system = useReducedMotion()
  const preference = useGamePreferences((state) => state.reducedMotion)
  const speed = useGamePreferences((state) => state.animationSpeed === 'fast' ? 2 : 1)
  return playback ?? { reducedMotion: preference === 'system' ? Boolean(system) : preference === 'on', speed }
}
