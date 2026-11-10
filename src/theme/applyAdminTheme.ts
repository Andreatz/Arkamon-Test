import type { AdminTheme } from './adminThemeTypes'
import { assetUrl } from '@/utils/assetUrl'

export function applyAdminTheme(theme: AdminTheme): void {
  const root = document.documentElement

  root.style.setProperty('--arka-primary', theme.colors.primary)
  root.style.setProperty('--arka-primary-hover', theme.colors.primaryHover)
  root.style.setProperty('--arka-bg', theme.colors.bg)
  root.style.setProperty('--arka-surface', theme.colors.surface)
  root.style.setProperty('--arka-surface-hover', theme.colors.surfaceHover)
  root.style.setProperty('--arka-text', theme.colors.text)
  root.style.setProperty('--arka-text-muted', theme.colors.textMuted)
  root.style.setProperty('--arka-border', theme.colors.border)

  root.style.setProperty('--hp-high', theme.colors.hpHigh)
  root.style.setProperty('--hp-mid', theme.colors.hpMid)
  root.style.setProperty('--hp-low', theme.colors.hpLow)

  root.style.setProperty('--arka-panel-radius', `${theme.ui.panelRadius}px`)
  root.style.setProperty('--arka-button-radius', `${theme.ui.buttonRadius}px`)
  root.style.setProperty('--arka-panel-opacity', `${theme.ui.panelOpacity}`)
  root.style.setProperty('--arka-shadow-intensity', `${theme.ui.shadowIntensity}`)
  root.style.setProperty('--arka-button-scale', `${theme.ui.buttonScale}`)
  root.style.setProperty('--arka-stage-scale', `${theme.ui.stageScale}`)
  root.style.setProperty('--arka-font-scale', `${theme.ui.fontScale}`)
  root.style.setProperty(
    '--arka-panel-texture',
    theme.assets.panelTexture ? `url("${assetUrl(theme.assets.panelTexture)}")` : 'none'
  )
}
