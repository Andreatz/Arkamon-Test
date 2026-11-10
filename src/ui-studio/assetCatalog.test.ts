import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UI_BUILTIN_ASSETS } from './assetCatalog'

describe('Studio assets follow the shipped artwork', () => {
  it('offers every supplied PNG and all 110 current splash paintings with unique IDs', () => {
    const supplied = JSON.parse(readFileSync(resolve('ui-source/provided-png-runtime.generated.json'), 'utf8')) as { assets: { file: string }[] }
    const png = UI_BUILTIN_ASSETS.filter(asset => asset.category === 'UI PNG fornita')
    expect(png.map(asset => asset.source).sort()).toEqual(supplied.assets.map(asset => `/ui/reference-png/${asset.file}`).sort())
    expect(UI_BUILTIN_ASSETS.filter(asset => asset.category === 'Splash Arkamon')).toHaveLength(110)
    expect(new Set(UI_BUILTIN_ASSETS.map(asset => asset.id)).size).toBe(UI_BUILTIN_ASSETS.length)
    expect(UI_BUILTIN_ASSETS.every(asset => existsSync(resolve('public', asset.source.slice(1))))).toBe(true)
  })

  it('retains historical battle artwork for compatible layouts', () => {
    expect(UI_BUILTIN_ASSETS.some(asset => asset.source === '/ui/studio/Comuni/hp-bar-enemy.svg')).toBe(true)
    expect(UI_BUILTIN_ASSETS.some(asset => asset.source === '/ui/move_button.png')).toBe(true)
  })
})
