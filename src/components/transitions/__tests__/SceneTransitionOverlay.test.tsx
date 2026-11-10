import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SceneId } from '@/types'
import { assetUrl } from '@/utils/assetUrl'
import { SceneTransitionOverlay } from '../SceneTransitionOverlay'
import { getSceneTransitionProfile, TRANSITION_VIDEO_PATH } from '../sceneTransitionProfiles'

function overlayMarkup(scena: SceneId, phase: 'cover' | 'reveal', startCovered = false) {
  return renderToStaticMarkup(
    <SceneTransitionOverlay
      phase={phase}
      startCovered={startCovered}
      profile={getSceneTransitionProfile({ scena })}
      onCovered={vi.fn()}
      onRevealed={vi.fn()}
    />,
  )
}

describe('scene transition artwork selection', () => {
  it('does not hide ordinary navigation behind the special D6 sequence', () => {
    const markup = overlayMarkup('mappa-principale', 'cover')
    expect(markup).toContain('data-transition-mode="fade"')
    expect(markup).not.toContain('data-transition-artwork')
    expect(markup).not.toContain('<video')
  })
  it.each(['cover', 'reveal'] as const)('never mounts a die at battle entry during %s', (phase) => {
    for (const startCovered of [false, true]) {
      const markup = overlayMarkup('battaglia', phase, startCovered)
      expect(markup).toContain('data-transition-mode="battle-video"')
      expect(markup).toContain('<video')
      expect(markup).toContain(`src="${assetUrl(TRANSITION_VIDEO_PATH)}"`)
      expect(markup).toContain('data-ready="false"')
      expect(markup).not.toContain('data-transition-artwork')
      expect(markup).not.toContain('arkamon-d6-closed.webp')
      expect(markup).not.toContain('arkamon-d6-open.webp')
      expect(markup).not.toContain('arka-d6-board')
      expect(markup).not.toContain('arka-d6-fallback')
      expect(markup).not.toContain('data-transition-light="dice-interior"')
    }
  })

  it.each(['evoluzione'] as const)('retains both D6 poses for %s', (scena) => {
    const markup = overlayMarkup(scena, 'cover')
    expect(markup).toContain('data-transition-mode="arkamon-dice"')
    expect(markup).toContain('data-transition-artwork="arkamon-d6"')
    expect(markup).toContain('arkamon-d6-closed.webp')
    expect(markup).toContain('arkamon-d6-open.webp')
    expect(markup).not.toContain('<video')
  })
})
