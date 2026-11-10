import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { assetUrl } from '@/utils/assetUrl'
import { MENU_ARTWORK_MODE, MENU_SVG_ARTWORK_ENABLED } from '@/player-ui/uiAppearancePolicy'
import './studioArtwork.css'
import './menuArtworkFallback.css'

/** Render the authored composition intact at the aspect ratio of its viewBox. */
export function StudioSurface({ source, width, height, className = '', style, children, ...props }: HTMLAttributes<HTMLDivElement> & {
  source: string; width: number; height: number
}) {
  return <div {...props} className={`studio-surface ${className}`} data-menu-artwork={MENU_ARTWORK_MODE} data-ui-asset={source} style={{ aspectRatio: `${width} / ${height}`, ...style }}>
    {MENU_SVG_ARTWORK_ENABLED && <img className="studio-surface-art" data-ui-skin-slot="frame" src={assetUrl(source)} alt="" draggable={false} />}
    {children}
  </div>
}

export function StudioCommand({ selected = false, children, className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  const source = `/ui/studio/Scuro/${selected ? 'bottone-selezionato' : 'bottone'}.svg`
  return <button {...props} type={type} className={`studio-command ${className}`} data-menu-artwork={MENU_ARTWORK_MODE} data-selected={selected || undefined} data-ui-asset={source}>
    {MENU_SVG_ARTWORK_ENABLED && <img data-ui-skin-slot="frame" src={assetUrl(source)} alt="" draggable={false} />}
    <span>{children}</span>
  </button>
}
