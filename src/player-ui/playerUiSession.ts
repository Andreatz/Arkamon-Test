import { useCallback, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useGameStore } from '@/store/gameStore'

export interface PlayerUiSelection { instanceId?: string; speciesId?: number; itemId?: string }
interface PlayerUiSession {
  values: Record<string, unknown>
  selection: Partial<Record<1 | 2, PlayerUiSelection>>
  remember: (key: string, value: unknown) => void
  select: (playerId: 1 | 2, value: PlayerUiSelection) => void
  clear: () => void
}
/** Volatile presentation context. Never serialized into campaign saves or broadcasts. */
export const usePlayerUiSession = create<PlayerUiSession>((set) => ({
  values: {}, selection: {},
  remember: (key, value) => set(state => Object.is(state.values[key], value) ? state : { values: { ...state.values, [key]: value } }),
  select: (playerId, value) => set(state => {
    const previous = state.selection[playerId]
    if (previous?.instanceId === value.instanceId && previous?.speciesId === value.speciesId && previous?.itemId === value.itemId) return state
    return { selection: { ...state.selection, [playerId]: value } }
  }),
  clear: () => set({ values: {}, selection: {} }),
}))

export function usePlayerUiMemory<T>(playerId: 1 | 2, key: string, initial: T | (() => T)) {
  const revision = useGameStore(state => state.campaignRevision)
  const memoryKey = `${revision}:${playerId}:${key}`
  const fallback = useRef<{ key: string; value: T }>()
  if (!fallback.current || fallback.current.key !== memoryKey) fallback.current = { key: memoryKey, value: typeof initial === 'function' ? (initial as () => T)() : initial }
  const stored = usePlayerUiSession(state => state.values[memoryKey])
  const value = (stored === undefined ? fallback.current.value : stored) as T
  const setValue = useCallback((next: T | ((previous: T) => T)) => {
    const state = usePlayerUiSession.getState()
    const current = (state.values[memoryKey] === undefined ? fallback.current!.value : state.values[memoryKey]) as T
    state.remember(memoryKey, typeof next === 'function' ? (next as (previous: T) => T)(current) : next)
  }, [memoryKey])
  return [value, setValue] as const
}

export function usePublishPlayerUiSelection(playerId: 1 | 2, value: PlayerUiSelection) {
  useEffect(() => { usePlayerUiSession.getState().select(playerId, value) }, [playerId, value.instanceId, value.speciesId, value.itemId])
}
