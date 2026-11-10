import { describe, expect, it } from 'vitest'
import { DEFAULT_GAME_PREFERENCES, normalizeGamePreferences, useGamePreferences, getAnimationDuration } from './gamePreferences'
describe('game preferences', () => {
  it('recovers malformed saved settings and bounds the volumes', () => {
    expect(normalizeGamePreferences(null)).toEqual(DEFAULT_GAME_PREFERENCES)
    expect(normalizeGamePreferences({ musicVolume: -10, effectsVolume: 9, reducedMotion: 'invalid', animationSpeed: 'turbo' })).toEqual({ ...DEFAULT_GAME_PREFERENCES, musicVolume: 0, effectsVolume: 1 })
  })
  it('changes presentation duration without changing normal defaults', () => {
    useGamePreferences.getState().setPreferences({ animationSpeed: 'fast' })
    expect(getAnimationDuration(1200)).toBe(600)
    useGamePreferences.getState().resetPreferences()
    expect(getAnimationDuration(1200)).toBe(1200)
    expect(getAnimationDuration(-5)).toBe(0)
  })
  it('recovers automatic graphics memory for old saves and accepts explicit device budgets', () => {
    expect(normalizeGamePreferences({ graphicsMemory: 'invalid' }).graphicsMemory).toBe('auto')
    expect(normalizeGamePreferences({ graphicsMemory: 'low' }).graphicsMemory).toBe('low')
    useGamePreferences.getState().setPreferences({ graphicsMemory: 'full' })
    expect(useGamePreferences.getState().graphicsMemory).toBe('full')
    useGamePreferences.getState().resetPreferences()
    expect(useGamePreferences.getState().graphicsMemory).toBe('auto')
  })
})
