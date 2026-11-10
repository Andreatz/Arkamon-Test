import { describe, expect, it } from 'vitest'
import { defaultMainMapUiLayout } from '@/theme/defaultAdminTheme'
import { resolveWorldMapHudLayout } from './worldMapHudLayout'
describe('world map default HUD composition', () => {
  it('aligns the four default windows into one bar without touching buttons, roads or map coordinates', () => {
    const result = resolveWorldMapHudLayout(defaultMainMapUiLayout)
    expect(result.combined).toBe(true)
    const keys = ['turnPanel','coinsPanel','positionPanel','actionsPanel'] as const
    for (const key of keys) { expect(result.layout[key].y).toBe(2); expect(result.layout[key].h).toBe(7.5) }
    for (let i = 1; i < keys.length; i++) expect(result.layout[keys[i]].x).toBe(result.layout[keys[i-1]].x + result.layout[keys[i-1]].w)
    expect(result.layout.enterButton).toBe(defaultMainMapUiLayout.enterButton)
    expect(result.layout.legend).toBe(defaultMainMapUiLayout.legend)
  })
  it('keeps any authored legacy position or text offset intact', () => {
    const custom = { ...defaultMainMapUiLayout, turnPanel: { ...defaultMainMapUiLayout.turnPanel, x: 17 } }
    expect(resolveWorldMapHudLayout(custom)).toEqual({ layout: custom, combined: false })
    const text = { ...defaultMainMapUiLayout, turnPanel: { ...defaultMainMapUiLayout.turnPanel, contentOffsets: { title: { x: 2, y: 0 } } } }
    expect(resolveWorldMapHudLayout(text).combined).toBe(false)
  })
})
