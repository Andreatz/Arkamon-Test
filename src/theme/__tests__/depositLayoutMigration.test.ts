import { describe, expect, it } from 'vitest'
import type { AdminDepositLayout } from '../adminThemeTypes'
import { defaultDepositLayout } from '../defaultAdminTheme'
import { migrateDepositLayout } from '../depositLayoutMigration'

const legacy: AdminDepositLayout = {
  hud: { x: 3, y: 3, w: 94, h: 9 },
  boxGrid: { x: 4, y: 16, w: 66, h: 68 },
  teamPanel: { x: 73, y: 16, w: 23, h: 68 },
  infoBar: { x: 12, y: 88, w: 76, h: 8 },
}

describe('deposit layout migration', () => {
  it('replaces all previous default rectangles with the new team-left layout', () => {
    expect(migrateDepositLayout(legacy)).toEqual(defaultDepositLayout)
    expect(legacy.teamPanel).toEqual({ x: 73, y: 16, w: 23, h: 68 })
  })

  it('keeps the portrait team left of the box grid with circular 16:9 cells', () => {
    const { teamPanel, boxGrid, hud } = migrateDepositLayout(legacy)
    expect(teamPanel.x + teamPanel.w).toBeLessThan(boxGrid.x)
    expect(hud.x).toBe(boxGrid.x)
    expect(hud.y + hud.h).toBeLessThan(boxGrid.y)
    // A 7 by 5 grid must have square cells inside the 16:9 game stage.
    const cellAspectRatio = ((boxGrid.w / 7) * (16 / 9)) / (boxGrid.h / 5)
    expect(cellAspectRatio).toBeCloseTo(1, 1)
    expect(teamPanel.w).toBeGreaterThan(legacy.teamPanel.w)
  })

  it('preserves customized rectangles while migrating the remaining old defaults', () => {
    const customTeam = { x: 5, y: 10, w: 25, h: 80 }
    const result = migrateDepositLayout({ ...legacy, teamPanel: customTeam })

    expect(result.teamPanel).toEqual(customTeam)
    expect(result.boxGrid).toEqual(defaultDepositLayout.boxGrid)
    expect(result.hud).toEqual(defaultDepositLayout.hud)
    expect(result.infoBar).toEqual(defaultDepositLayout.infoBar)
  })

  it('fills missing rectangles from the current defaults without altering the saved one', () => {
    const customBox = { x: 30, y: 15, w: 65, h: 75 }
    const result = migrateDepositLayout({ boxGrid: customBox })

    expect(result).toEqual({ ...defaultDepositLayout, boxGrid: customBox })
    expect(migrateDepositLayout()).toEqual(defaultDepositLayout)
  })

  it('retains custom text offsets when moving an old default rectangle', () => {
    const contentOffsets = { 'team-slot-0-name': { x: 8, y: -4 } }
    const result = migrateDepositLayout({
      teamPanel: { ...legacy.teamPanel, contentX: 3, contentY: -2, contentOffsets },
    })

    expect(result.teamPanel).toEqual({
      ...defaultDepositLayout.teamPanel,
      contentX: 3,
      contentY: -2,
      contentOffsets,
    })
    expect(contentOffsets).toEqual({ 'team-slot-0-name': { x: 8, y: -4 } })
  })

  it('leaves an already migrated layout unchanged on subsequent hydration', () => {
    const once = migrateDepositLayout(legacy)
    expect(migrateDepositLayout(once)).toEqual(once)
  })
})
