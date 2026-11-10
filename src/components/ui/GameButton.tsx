import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react'
import { assetUrl } from '@/utils/assetUrl'
import { RpgFrame } from '@/components/rpg'
import { MENU_ARTWORK_MODE, MENU_SVG_ARTWORK_ENABLED } from '@/player-ui/uiAppearancePolicy'
import './gameButton.css'
import './menuArtworkFallback.css'

export type GameButtonTone = 'default' | 'primary' | 'danger'
export type GameButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: GameButtonTone }

/** Shared commands retain their labels when decorative artwork is suspended. */
export const GameButton = forwardRef<HTMLButtonElement, GameButtonProps>(function GameButton(
  { tone = 'default', className = '', children, type = 'button', ...props }, ref,
) {
  const style: CSSProperties = {
    borderImageSource: `url("${assetUrl('/ui/player-kit/command-cancel.svg')}")`,
    borderImageSlice: '42 fill',
  }
  return <button {...props} ref={ref} type={type} className={`game-button ${className}`} data-menu-artwork={MENU_ARTWORK_MODE} data-game-button={tone}>
    {MENU_SVG_ARTWORK_ENABLED && (tone === 'danger' ? <span className="game-button-frame" style={style} data-kit="command-cancel" data-ui-skin-slot="frame" aria-hidden="true" />
      : <RpgFrame className="game-button-frame" kind={tone === 'primary' ? 'selected' : 'command'} />)}
    {children}
  </button>
})
