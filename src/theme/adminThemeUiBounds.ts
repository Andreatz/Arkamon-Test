import type { AdminThemeUi } from './adminThemeTypes'

/** The editor and imported themes share the same supported visual limits. */
export const ADMIN_THEME_UI_BOUNDS: Record<keyof AdminThemeUi, { min: number; max: number }> = {
  panelRadius: { min: 0, max: 40 },
  buttonRadius: { min: 0, max: 40 },
  panelOpacity: { min: 0.4, max: 1 },
  shadowIntensity: { min: 0, max: 2 },
  buttonScale: { min: 0.85, max: 1 },
  stageScale: { min: 0.8, max: 1.05 },
  fontScale: { min: 0.75, max: 1.35 },
  mainMapRoadOpacity: { min: 0, max: 1 },
}

export function isValidThemeUiValue(key: keyof AdminThemeUi, value: unknown): value is number {
  const { min, max } = ADMIN_THEME_UI_BOUNDS[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
