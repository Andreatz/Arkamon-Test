import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('isolated UI preview preferences', () => {
  for (const search of ['?uiStudioPreview=1', '?uiConcepts=1']) {
    it(`keeps real device preferences untouched for ${search}`, async () => {
      vi.resetModules()
      const original = JSON.stringify({ version: 1, state: { musicVolume: .35, animationSpeed: 'normal' } })
      const values = new Map([['arkamon-preferences-v1', original]])
      const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value) }), removeItem: vi.fn((key: string) => { values.delete(key) }) }
      vi.stubGlobal('window', { location: { search } })
      vi.stubGlobal('localStorage', storage)
      const { useGamePreferences } = await import('./gamePreferences')
      expect(useGamePreferences.getState().musicVolume).toBe(1)
      useGamePreferences.getState().setPreferences({ musicVolume: .8, animationSpeed: 'fast' })
      expect(useGamePreferences.getState().musicVolume).toBe(.8)
      expect(useGamePreferences.getState().animationSpeed).toBe('fast')
      expect(values.get('arkamon-preferences-v1')).toBe(original)
      expect(storage.getItem).not.toHaveBeenCalled()
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(storage.removeItem).not.toHaveBeenCalled()
    })
  }
  it('continues to persist preferences in the normal game', async () => {
    vi.resetModules()
    const values = new Map<string, string>()
    vi.stubGlobal('window', { location: { search: '' } })
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } })
    const { useGamePreferences } = await import('./gamePreferences')
    useGamePreferences.getState().setPreferences({ musicVolume: .45 })
    expect(JSON.parse(values.get('arkamon-preferences-v1')!).state.musicVolume).toBe(.45)
  })
})
