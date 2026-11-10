import { describe, expect, it } from 'vitest'
import { defaultBattleLayout } from '@/theme/defaultAdminTheme'
import { getBattleDamagePosition, getBattleVfxAnchorPosition } from '@/components/vfx/battleVfxPosition'
import { createDefaultDesign } from './designModel'
import { resolveBattleLayout } from './battleLayout'

describe('shared battle layout contract', () => {
  it('resolves sprite placement, target VFX and damage from the same Studio rectangle', () => {
    const design = createDefaultDesign()
    design.screens.battaglia = { elements: { 'layout.sprite-nemico': { rect: { x: 40, y: 30, w: 24, h: 36 } } }, layers: [] }
    const before = JSON.stringify(defaultBattleLayout)
    const layout = resolveBattleLayout(defaultBattleLayout, design)
    expect(layout.enemySprite).toMatchObject({ x: 40, y: 30, w: 24, h: 36 })
    expect(getBattleVfxAnchorPosition(layout, 'A', 'target')).toEqual({ x: 52, y: 48 })
    expect(getBattleDamagePosition(layout, 'B')).toEqual({ x: 52, y: 39 })
    expect(layout.playerSprite).toBe(defaultBattleLayout.playerSprite)
    expect(JSON.stringify(defaultBattleLayout)).toBe(before)
  })

  it('inherits a base rectangle in dice view, with only an explicit view rectangle taking precedence', () => {
    const design = createDefaultDesign()
    const base = { x: 10, y: 15, w: 20, h: 30 }, view = { x: 55, y: 20, w: 25, h: 35 }
    design.screens.battaglia = { elements: { 'layout.sprite-nemico': { rect: base } }, layers: [] }
    design.screens['battaglia:dice'] = { elements: { 'layout.hp-nemico': { opacity: .8 } }, layers: [] }
    expect(resolveBattleLayout(defaultBattleLayout, design, 'battaglia:dice').enemySprite).toMatchObject(base)
    design.screens['battaglia:dice'].elements['layout.sprite-nemico'] = { rect: view }
    expect(resolveBattleLayout(defaultBattleLayout, design, 'battaglia:dice').enemySprite).toMatchObject(view)
    expect(resolveBattleLayout(defaultBattleLayout, design).enemySprite).toMatchObject(base)
    delete design.screens.battaglia.elements['layout.sprite-nemico']
    expect(resolveBattleLayout(defaultBattleLayout, design).enemySprite).toBe(defaultBattleLayout.enemySprite)
  })

  it('keeps the legacy local text offsets when replacing the outer rectangle', () => {
    const legacy = { ...defaultBattleLayout, enemyHp: { ...defaultBattleLayout.enemyHp, contentX: 7, contentOffsets: { name: { x: 2, y: 3 } } } }
    const design = createDefaultDesign()
    design.screens.battaglia = { elements: { 'layout.hp-nemico': { rect: { x: 1, y: 2, w: 30, h: 9 } } }, layers: [] }
    expect(resolveBattleLayout(legacy, design).enemyHp).toEqual({ ...legacy.enemyHp, x: 1, y: 2, w: 30, h: 9 })
  })
})
