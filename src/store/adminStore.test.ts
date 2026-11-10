import { beforeEach, describe, expect, it } from 'vitest'
import { useAdminStore } from '@store/adminStore'
import type { AdminTheme } from '@/theme/adminThemeTypes'
import { cloneAdminTheme, defaultAdminTheme } from '@/theme/defaultAdminTheme'
import { createDefaultDesign } from '@/ui-studio/designModel'

function resetAdminStore(): void {
  useAdminStore.setState({
    enabled: false,
    panelOpen: false,
    layoutEditing: false,
    layoutUndoStack: [],
    theme: cloneAdminTheme(defaultAdminTheme),
  })
}

describe('adminStore', () => {
  beforeEach(() => {
    resetAdminStore()
  })

  it('recupera temi precedenti e ignora solo un progetto UI corrotto', () => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    theme.colors.primary = '#123456'
    theme.design = { version: 999 } as never
    const restored = useAdminStore.persist.getOptions().merge!({ defaultThemeRevision: 'notte-viola-2026-10-05', theme }, useAdminStore.getState()).theme
    expect(restored.design).toBeUndefined()
    expect(restored.colors.primary).toBe('#123456')
    theme.design = createDefaultDesign()
    expect(useAdminStore.persist.getOptions().merge!({ defaultThemeRevision: 'notte-viola-2026-10-05', theme }, useAdminStore.getState()).theme.design).toEqual(createDefaultDesign())
  })

  it('clona profondamente rettangoli, offset testo e progetto UI', () => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    theme.design = createDefaultDesign()
    theme.layouts.battle.playerMoves.contentOffsets = { name: { x: 3, y: 4 } }
    const copy = cloneAdminTheme(theme)
    copy.layouts.battle.playerMoves.contentOffsets!.name.x = 44
    copy.design!.typography.heading.family = 'chela'
    expect(theme.layouts.battle.playerMoves.contentOffsets.name.x).toBe(3)
    expect(theme.design.typography.heading.family).toBe('norwester')
  })

  it('usa il tema default', () => {
    expect(useAdminStore.getState().theme).toEqual(defaultAdminTheme)
  })

  it('updateColor aggiorna solo il colore richiesto', () => {
    useAdminStore.getState().updateColor('primary', '#ffffff')

    const theme = useAdminStore.getState().theme
    expect(theme.colors.primary).toBe('#ffffff')
    expect(theme.colors.bg).toBe(defaultAdminTheme.colors.bg)
  })

  it('updateUi aggiorna solo il valore UI richiesto', () => {
    useAdminStore.getState().updateUi('panelRadius', 24)

    const theme = useAdminStore.getState().theme
    expect(theme.ui.panelRadius).toBe(24)
    expect(theme.ui.buttonRadius).toBe(defaultAdminTheme.ui.buttonRadius)
  })

  it('non applica scale UI fuori intervallo che renderebbero il gioco invisibile', () => {
    useAdminStore.getState().updateUi('stageScale', 0)
    useAdminStore.getState().updateUi('fontScale', Number.NaN)
    expect(useAdminStore.getState().theme.ui).toEqual(defaultAdminTheme.ui)
  })

  it('recupera impostazioni UI corrotte salvate senza perdere i valori e layout validi', () => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    theme.ui.stageScale = 0
    theme.ui.fontScale = Number.NaN
    theme.ui.panelRadius = 24
    theme.layouts.battle.playerSprite = { x: 10, y: 20, w: 30, h: 40 }
    const restored = useAdminStore.persist.getOptions().merge!({
      defaultThemeRevision: 'notte-viola-2026-10-05', theme,
    }, useAdminStore.getState()).theme
    expect(restored.ui.stageScale).toBe(defaultAdminTheme.ui.stageScale)
    expect(restored.ui.fontScale).toBe(defaultAdminTheme.ui.fontScale)
    expect(restored.ui.panelRadius).toBe(24)
    expect(restored.layouts.battle.playerSprite).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })

  it('updateAsset aggiorna il path richiesto', () => {
    useAdminStore.getState().updateAsset('titleLogo', '/ui/logo_arkamon.png')

    expect(useAdminStore.getState().theme.assets.titleLogo).toBe('/ui/logo_arkamon.png')
  })

  it('respinge percorsi esterni o codificati e conserva i file pubblici legacy e il reset', () => {
    const path = '/ui/logo_arkamon.png'
    useAdminStore.getState().updateAsset('titleLogo', path)
    for (const unsafe of ['/\\example.invalid/image.png', '/%5cexample.invalid/image.png', '/%2fexample.invalid/image.png', '/ui/../private.png', 'data:image/png;base64,AAAA', 'blob:http://localhost/test', 'ui-media:imported']) {
      useAdminStore.getState().updateAsset('titleLogo', unsafe)
      expect(useAdminStore.getState().theme.assets.titleLogo).toBe(path)
    }
    useAdminStore.getState().updateAsset('titleLogo', '')
    expect(useAdminStore.getState().theme.assets.titleLogo).toBeUndefined()
  })

  it('ripulisce asset salvati e importati senza perdere gli altri asset validi', () => {
    const theme = cloneAdminTheme(defaultAdminTheme)
    theme.assets = { titleLogo: '/\\example.invalid/image.png', titleBackground: '/backgrounds/venezia.png', panelTexture: '/%5cexample.invalid/image.png' }
    const restored = useAdminStore.persist.getOptions().merge!({ defaultThemeRevision: 'notte-viola-2026-10-05', theme }, useAdminStore.getState()).theme
    expect(restored.assets.titleLogo).toBe(defaultAdminTheme.assets.titleLogo)
    expect(restored.assets.titleBackground).toBe('/backgrounds/venezia.png')
    expect(restored.assets.panelTexture).toBe(defaultAdminTheme.assets.panelTexture)
    useAdminStore.getState().importTheme(theme)
    expect(useAdminStore.getState().theme.assets).toEqual(restored.assets)
  })

  it('updateSpriteScale salva e ripristina la scala della singola specie', () => {
    useAdminStore.getState().updateSpriteScale(12, 1.45)
    expect(useAdminStore.getState().theme.spriteScales['12']).toBe(1.45)

    useAdminStore.getState().updateSpriteScale(12, 1)
    expect(useAdminStore.getState().theme.spriteScales['12']).toBeUndefined()
  })

  it('updateBattleLayout aggiorna la posizione richiesta', () => {
    useAdminStore.getState().updateBattleLayout('playerSprite', {
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    })

    expect(useAdminStore.getState().theme.layouts.battle.playerSprite).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    })
  })

  it('updateBattleLayout conserva gli offset dei singoli testi', () => {
    useAdminStore.getState().updateBattleLayout('playerMoves', {
      x: 46,
      y: 70,
      w: 50,
      h: 24,
      contentOffsets: {
        'move-0-name': { x: 12, y: -8 },
        'move-1-dice': { x: -5, y: 15 },
      },
    })

    expect(useAdminStore.getState().theme.layouts.battle.playerMoves.contentOffsets).toEqual({
      'move-0-name': { x: 12, y: -8 },
      'move-1-dice': { x: -5, y: 15 },
    })
  })

  it('updateMainMapNodePosition aggiorna un nodo della mappa principale', () => {
    useAdminStore.getState().updateMainMapNodePosition('Roma', { x: 51, y: 57 })

    expect(useAdminStore.getState().theme.layouts.mainMapNodes.Roma).toEqual({
      x: 51,
      y: 57,
    })
  })

  it('updateMainMapRoad aggiorna i punti di una strada della mappa principale', () => {
    useAdminStore.getState().updateMainMapRoad('Roma__Percorso_14', [
      { x: 48, y: 56 },
      { x: 51, y: 56 },
      { x: 51, y: 54 },
      { x: 54, y: 54 },
    ])

    expect(useAdminStore.getState().theme.layouts.mainMapRoads.Roma__Percorso_14).toEqual([
      { x: 48, y: 56 },
      { x: 51, y: 56 },
      { x: 51, y: 54 },
      { x: 54, y: 54 },
    ])
  })

  it('updateMainMapRoad salva solo gli hook senza generare nodi automatici', () => {
    useAdminStore.getState().updateMainMapRoad('Venezia__Pordenone', [
      { x: 56, y: 24 },
      { x: 64, y: 20 },
    ])

    expect(useAdminStore.getState().theme.layouts.mainMapRoads.Venezia__Pordenone).toEqual([
      { x: 56, y: 24 },
      { x: 64, y: 20 },
    ])
  })

  it('undoLayoutChange ripristina l ultima modifica di layout', () => {
    useAdminStore.getState().beginLayoutChange()
    useAdminStore.getState().updateMainMapNodePosition('Roma', { x: 51, y: 57 })

    useAdminStore.getState().undoLayoutChange()

    expect(useAdminStore.getState().theme.layouts.mainMapNodes.Roma).toEqual(
      defaultAdminTheme.layouts.mainMapNodes.Roma
    )
    expect(useAdminStore.getState().layoutUndoStack).toHaveLength(0)
  })

  it('undoLayoutChange ripristina anche un reset layout', () => {
    useAdminStore.getState().updateMainMapRoad('Roma__Percorso_14', [
      { x: 48, y: 56 },
      { x: 51, y: 56 },
      { x: 54, y: 54 },
    ])

    useAdminStore.getState().resetMainMapRoads()
    expect(useAdminStore.getState().theme.layouts.mainMapRoads).toEqual(defaultAdminTheme.layouts.mainMapRoads)

    useAdminStore.getState().undoLayoutChange()

    expect(useAdminStore.getState().theme.layouts.mainMapRoads.Roma__Percorso_14).toEqual([
      { x: 48, y: 56 },
      { x: 51, y: 56 },
      { x: 54, y: 54 },
    ])
  })

  it('resetSceneLayout ripristina il layout UI della mappa principale', () => {
    useAdminStore.getState().updateSceneLayout({
      scene: 'mainMapUi',
      key: 'turnPanel',
      rect: { x: 5, y: 6, w: 20, h: 7 },
    })

    useAdminStore.getState().resetSceneLayout('mainMapUi')

    expect(useAdminStore.getState().theme.layouts.mainMapUi.turnPanel).toEqual(
      defaultAdminTheme.layouts.mainMapUi.turnPanel
    )
  })

  it('updateSceneLayout aggiorna il layout condiviso da tutti i percorsi', () => {
    useAdminStore.getState().updateSceneLayout({
      scene: 'luogo',
      key: 'contentGrid',
      rect: { x: 8, y: 24, w: 84, h: 66 },
    })

    expect(useAdminStore.getState().theme.layouts.luogo.contentGrid).toEqual({
      x: 8,
      y: 24,
      w: 84,
      h: 66,
    })
  })

  it('resetSceneLayout ripristina il layout condiviso da percorsi e citta', () => {
    useAdminStore.getState().updateSceneLayout({
      scene: 'luogo',
      key: 'contentGrid',
      rect: { x: 10, y: 20, w: 80, h: 72 },
    })

    useAdminStore.getState().resetSceneLayout('luogo')

    expect(useAdminStore.getState().theme.layouts.luogo.contentGrid).toEqual(
      defaultAdminTheme.layouts.luogo.contentGrid
    )
  })

  it('resetTheme ripristina Arkamon Classico', () => {
    useAdminStore.getState().updateColor('bg', '#ffffff')
    useAdminStore.getState().updateUi('stageScale', 0.8)

    useAdminStore.getState().resetTheme()

    expect(useAdminStore.getState().theme).toEqual(defaultAdminTheme)
  })

  it('applyVisualTheme cambia lo stile senza sovrascrivere i layout', () => {
    useAdminStore.getState().updateMainMapNodePosition('Roma', { x: 51, y: 57 })
    useAdminStore.getState().updateBattleLayout('playerSprite', {
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    })

    const preset: AdminTheme = {
      ...defaultAdminTheme,
      id: 'preset-test',
      name: 'Preset Test',
      colors: {
        ...defaultAdminTheme.colors,
        primary: '#123456',
      },
      ui: {
        ...defaultAdminTheme.ui,
        buttonRadius: 6,
      },
    }

    useAdminStore.getState().applyVisualTheme(preset)

    const theme = useAdminStore.getState().theme
    expect(theme.colors.primary).toBe('#123456')
    expect(theme.ui.buttonRadius).toBe(6)
    expect(theme.layouts.mainMapNodes.Roma).toEqual({ x: 51, y: 57 })
    expect(theme.layouts.battle.playerSprite).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    })
  })

  it('importTheme sostituisce il tema corrente', () => {
    const imported: AdminTheme = {
      ...defaultAdminTheme,
      id: 'tema-test',
      name: 'Tema Test',
      colors: {
        ...defaultAdminTheme.colors,
        primary: '#123456',
      },
      ui: {
        ...defaultAdminTheme.ui,
        buttonRadius: 6,
      },
    }

    useAdminStore.getState().importTheme(imported)

    expect(useAdminStore.getState().theme).toEqual(imported)
  })

  it.each(['import', 'saved'] as const)('aggiunge le aree Suprema al tema legacy %s senza perdere posizioni e stile', (source) => {
    // Old JSON has no Supreme rectangles; the current interface intentionally requires them.
    const legacy = JSON.parse(JSON.stringify(defaultAdminTheme)) as AdminTheme
    const battle = legacy.layouts.battle as Partial<AdminTheme['layouts']['battle']>
    delete battle.playerSupreme
    delete battle.enemySupreme
    legacy.colors.primary = '#123456'
    legacy.layouts.battle.playerMoves = {
      x: 40, y: 68, w: 42, h: 24,
      contentOffsets: { 'move-0-name': { x: 6, y: -4 } },
    }
    legacy.layouts.battle.enemyMoves = { x: 2, y: 14, w: 48, h: 21 }

    const current = useAdminStore.getState()
    let theme: AdminTheme
    if (source === 'import') {
      current.importTheme(legacy)
      theme = useAdminStore.getState().theme
    } else {
      theme = useAdminStore.persist.getOptions().merge!({
        defaultThemeRevision: 'notte-viola-2026-10-05', theme: legacy,
      }, current).theme
    }

    expect(theme.colors.primary).toBe('#123456')
    expect(theme.layouts.battle.playerMoves).toEqual(legacy.layouts.battle.playerMoves)
    expect(theme.layouts.battle.enemyMoves).toEqual(legacy.layouts.battle.enemyMoves)
    expect(theme.layouts.battle.playerSupreme).toEqual({ x: 86, y: 72, w: 13, h: 20 })
    expect(theme.layouts.battle.enemySupreme).toEqual({ x: 54, y: 19, w: 14, h: 24 })
    expect(legacy.layouts.battle).not.toHaveProperty('playerSupreme')
    expect(legacy.layouts.battle).not.toHaveProperty('enemySupreme')
  })

  it('importTheme migrates legacy deposit geometry while preserving the supplied visual theme', () => {
    const imported: AdminTheme = {
      ...cloneAdminTheme(defaultAdminTheme),
      layouts: {
        ...defaultAdminTheme.layouts,
        deposit: {
          hud: { x: 3, y: 3, w: 94, h: 9 },
          boxGrid: { x: 4, y: 16, w: 66, h: 68 },
          teamPanel: { x: 73, y: 16, w: 23, h: 68 },
          infoBar: { x: 12, y: 88, w: 76, h: 8 },
        },
      },
    }
    useAdminStore.getState().importTheme(imported)
    const theme = useAdminStore.getState().theme
    expect(theme.layouts.deposit).toEqual(defaultAdminTheme.layouts.deposit)
    expect(theme.colors).toEqual(imported.colors)
    expect(theme.ui).toEqual(imported.ui)
    expect(imported.layouts.deposit.teamPanel.x).toBe(73)
  })
})
