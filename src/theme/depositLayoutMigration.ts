import type { AdminDepositLayout, AdminDepositLayoutKey, AdminLayoutRect } from './adminThemeTypes'
import { defaultDepositLayout } from './defaultAdminTheme'

const legacyDepositLayout: AdminDepositLayout = {
  hud: { x: 3, y: 3, w: 94, h: 9 },
  boxGrid: { x: 4, y: 16, w: 66, h: 68 },
  teamPanel: { x: 73, y: 16, w: 23, h: 68 },
  infoBar: { x: 12, y: 88, w: 76, h: 8 },
}

function usesLegacyPosition(rect: AdminLayoutRect, legacy: AdminLayoutRect): boolean {
  return rect.x === legacy.x && rect.y === legacy.y && rect.w === legacy.w && rect.h === legacy.h
}

/** Updates the previous default positions without discarding custom rectangles or text settings. */
export function migrateDepositLayout(saved?: Partial<AdminDepositLayout>): AdminDepositLayout {
  return Object.fromEntries(
    (Object.keys(defaultDepositLayout) as AdminDepositLayoutKey[]).map((key) => {
      const rect = saved?.[key]
      const defaultRect = defaultDepositLayout[key]

      if (!rect) return [key, { ...defaultRect }]
      if (usesLegacyPosition(rect, legacyDepositLayout[key])) return [key, { ...rect, ...defaultRect }]
      return [key, { ...rect }]
    })
  ) as AdminDepositLayout
}
