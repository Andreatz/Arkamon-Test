import { describe, expect, it } from 'vitest'
import { parseThemeJson } from './AdminImportExport'
import { cloneAdminTheme, defaultAdminTheme } from '@/theme/defaultAdminTheme'
import { adminThemePresets } from '@/theme/adminThemePresets'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDefaultDesign } from '@/ui-studio/designModel'

describe('importazione temi Admin', () => {
  it('preserva il progetto UI e respinge configurazioni eseguibili importate', () => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    theme.design = createDefaultDesign()
    theme.design.screens.menu = { elements: { title: { font: { family: 'norwester', size: 30 }, text: 'Partita' } }, layers: [] }
    expect(parseThemeJson(JSON.stringify(theme)).theme?.design).toEqual(theme.design)
    const unsafe = JSON.parse(JSON.stringify(theme))
    unsafe.design.screens.menu.elements.title.onClick = 'alert(1)'
    expect(parseThemeJson(JSON.stringify(unsafe)).error).toContain('onClick')
  })
  it('accetta tutti i preset correnti con identità distinte e asset esistenti', () => {
    expect(new Set(adminThemePresets.map((theme) => theme.id)).size).toBe(adminThemePresets.length)
    for (const theme of adminThemePresets) {
      expect(parseThemeJson(JSON.stringify(theme)).error).toBeNull()
      for (const asset of Object.values(theme.assets)) {
        if (asset) expect(existsSync(resolve('public', asset.replace(/^\//, ''))), asset).toBe(true)
      }
    }
  })

  it.each(['stageScale', 'fontScale'] as const)('rifiuta una scala %s che renderebbe invisibile il gioco', (key) => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    theme.ui[key] = 0
    expect(parseThemeJson(JSON.stringify(theme))).toMatchObject({ theme: null, error: expect.stringContaining(key) })
  })

  it.each([0, -1])('rifiuta rettangoli con dimensioni %s', (dimension) => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    theme.layouts.battle = { ...theme.layouts.battle, playerSprite: { x: 0, y: 0, w: dimension, h: 40 } }
    expect(parseThemeJson(JSON.stringify(theme))).toMatchObject({ theme: null, error: expect.stringContaining('playerSprite') })
  })

  it('mantiene compatibilità con temi precedenti senza impostazione opacità strade', () => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    const ui = theme.ui as Partial<typeof theme.ui>
    delete ui.mainMapRoadOpacity
    const result = parseThemeJson(JSON.stringify(theme))
    expect(result.error).toBeNull()
    expect(result.theme?.ui.mainMapRoadOpacity).toBe(defaultAdminTheme.ui.mainMapRoadOpacity)
  })

  it('rifiuta una lista dove il tema richiede un oggetto assets', () => {
    expect(parseThemeJson(JSON.stringify({ ...defaultAdminTheme, assets: [] })))
      .toMatchObject({ theme: null, error: expect.stringContaining('assets') })
  })

  it.each(['/\\example.invalid/image.png', '/%5cexample.invalid/image.png', '/%2fexample.invalid/image.png', '/ui/../private.png', '/ui/"image.png', 'data:image/png;base64,AAAA', 'blob:http://localhost/test', 'ui-media:imported'])('rifiuta asset non locali o non risolvibili dal tema legacy: %s', path => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    theme.assets.titleLogo = path
    expect(parseThemeJson(JSON.stringify(theme))).toMatchObject({ theme: null, error: expect.stringContaining('titleLogo') })
  })
})
