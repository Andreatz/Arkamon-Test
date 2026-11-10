import type { AdminMainMapUiLayout } from '@/theme/adminThemeTypes'
import { defaultMainMapUiLayout } from '@/theme/defaultAdminTheme'
const HUD_KEYS = ['turnPanel', 'coinsPanel', 'positionPanel', 'actionsPanel'] as const
/** Refine the shipped composition only. An authored legacy HUD keeps its exact coordinates. */
export function resolveWorldMapHudLayout(layout: AdminMainMapUiLayout) {
  const combined = HUD_KEYS.every(key => {
    const rect = layout[key], original = defaultMainMapUiLayout[key]
    return ['x','y','w','h'].every(field => rect[field as 'x'] === original[field as 'x']) && !Object.keys(rect.contentOffsets ?? {}).length
  })
  if (!combined) return { layout, combined }
  return { combined, layout: { ...layout,
    turnPanel: { ...layout.turnPanel, x: 2.5, y: 2, w: 23, h: 7.5 },
    coinsPanel: { ...layout.coinsPanel, x: 25.5, y: 2, w: 14, h: 7.5 },
    positionPanel: { ...layout.positionPanel, x: 39.5, y: 2, w: 24, h: 7.5 },
    actionsPanel: { ...layout.actionsPanel, x: 63.5, y: 2, w: 33.5, h: 7.5 },
  } }
}
