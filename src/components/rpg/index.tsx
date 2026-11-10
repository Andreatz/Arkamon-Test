import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes } from 'react'
import { assetUrl } from '@/utils/assetUrl'
import { MENU_ARTWORK_MODE, MENU_SVG_ARTWORK_ENABLED } from '@/player-ui/uiAppearancePolicy'
import './rpg.css'
import '../ui/menuArtworkFallback.css'

export const RPG_SKINS = {
  window: '/ui/studio/runtime/window.svg',
  command: '/ui/studio/runtime/command.svg',
  selected: '/ui/studio/runtime/selected.svg',
  portrait: '/ui/studio/Scuro/cornice-arkamon.svg',
} as const

export function RpgFrame({ kind = 'window', className = '' }: { kind?: 'window' | 'command' | 'selected'; className?: string }) {
  if (!MENU_SVG_ARTWORK_ENABLED) return null
  return <span className={`rpg-frame rpg-frame-${kind} ${className}`} data-kit={`rpg-${kind}`} data-ui-skin-slot="frame" aria-hidden="true" style={{ borderImageSource: `url("${assetUrl(RPG_SKINS[kind])}")` } as CSSProperties} />
}

export const RpgWindow = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function RpgWindow({ children, className = '', ...props }, ref) {
  return <div {...props} ref={ref} className={`rpg-window ${className}`} data-menu-artwork={MENU_ARTWORK_MODE}><RpgFrame />{children}</div>
})
export const RpgCommand = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger'; selected?: boolean }>(function RpgCommand({ children, className = '', tone = 'default', selected = false, type = 'button', ...props }, ref) {
  const emphasized = selected || tone === 'primary'
  return <button {...props} ref={ref} type={type} className={`rpg-command ${className}`} data-menu-artwork={MENU_ARTWORK_MODE} data-game-button={tone} data-tone={tone} data-selected={emphasized || undefined}><RpgFrame kind={emphasized ? 'selected' : 'command'} />{emphasized && <span className="rpg-command-cursor" aria-hidden="true">▸</span>}{children}</button>
})

export function RpgMeter({ value, max, label, className = '' }: { value: number; max: number; label: string; className?: string }) {
  const safeMax = Math.max(1, max), safeValue = Math.max(0, Math.min(value, safeMax))
  return <div className={`rpg-meter ${className}`} data-condition={safeValue === 0 ? 'ko' : safeValue / safeMax <= .25 ? 'low' : safeValue / safeMax <= .5 ? 'medium' : 'high'}><progress value={safeValue} max={safeMax} aria-label={label} /><span>{safeValue} / {max}</span></div>
}
