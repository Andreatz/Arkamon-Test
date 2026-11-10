import { useState } from 'react'
import { assetUrl } from '@/utils/assetUrl'

export const ARKAMON_D6_CLOSED_PATH = '/ui/transitions/arkamon-d6-closed.webp'
export const ARKAMON_D6_OPEN_PATH = '/ui/transitions/arkamon-d6-open.webp'
const ARKAMON_LOGO_PATH = '/ui/logo_arkamon.png'
let artworkPreloaded = false

/** Decode the small reusable transition art before the first navigation. */
export function preloadSceneTransitionArtwork() {
  if (artworkPreloaded) return
  artworkPreloaded = true
  for (const source of [ARKAMON_D6_CLOSED_PATH, ARKAMON_D6_OPEN_PATH]) {
    const image = new Image()
    image.src = assetUrl(source)
    void image.decode().catch(() => undefined)
  }
}

/** Decorative D6; it never rolls a gameplay result or changes game state. */
export function ArkamonDiceArtwork() {
  const [closedFailed, setClosedFailed] = useState(false)
  const [openFailed, setOpenFailed] = useState(false)

  return (
    <div className="arka-d6-artwork" data-transition-artwork="arkamon-d6" aria-hidden="true">
      <div className="arka-d6-board" />
      <svg className="arka-d6-route" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <path className="arka-d6-route__track" d="M-80 715 300 715 300 580 650 580 650 335 1040 335 1040 175 1700 175" />
        {[{ x: 180, y: 715 }, { x: 300, y: 580 }, { x: 650, y: 580 }, { x: 650, y: 335 }, { x: 1040, y: 335 }, { x: 1220, y: 175 }].map((node, index) => (
          <circle key={index} className="arka-d6-route__node" cx={node.x} cy={node.y} r="16" style={{ animationDelay: `${index * 60}ms` }} />
        ))}
      </svg>
      <div className="arka-d6-landing-shadow" />
      <div className="arka-d6-hero">
        {!openFailed ? (
          <div className="arka-d6-interior-light" data-transition-light="dice-interior">
            <div className="arka-d6-interior-light__halo" />
            <div className="arka-d6-interior-light__rays" />
            <div className="arka-d6-interior-light__wave" />
          </div>
        ) : null}
        {closedFailed ? (
          <div className="arka-d6-fallback">
            {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
          </div>
        ) : (
          <img
            className={openFailed ? 'arka-d6-closed arka-d6-closed--hold' : 'arka-d6-closed'}
            src={assetUrl(ARKAMON_D6_CLOSED_PATH)}
            alt=""
            draggable={false}
            onError={() => setClosedFailed(true)}
          />
        )}
        {!openFailed ? (
          <>
            <img className="arka-d6-open" src={assetUrl(ARKAMON_D6_OPEN_PATH)} alt="" draggable={false} onError={() => setOpenFailed(true)} />
            <div className="arka-d6-interior-light arka-d6-interior-light--source">
              <div className="arka-d6-interior-light__source" />
              <div className="arka-d6-interior-light__flash" />
            </div>
          </>
        ) : null}
      </div>
      <img className="arka-d6-wordmark" src={assetUrl(ARKAMON_LOGO_PATH)} alt="" draggable={false} />
    </div>
  )
}
