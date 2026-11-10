import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assetUrl } from '@/utils/assetUrl'
import { usePlayerUiSession } from '../playerUiSession'
import { REFERENCE_BACKGROUNDS, referenceScreenBackground } from '../reference/referenceBackgrounds'
import { ARKAMON_SPLASH_ARTWORK, getSplashArtwork, supportsSplashArtwork } from '../reference/splashArtwork'
import { SplashArtworkProvider, useSplashArtwork, type ReadySplashArtwork } from '../reference/SplashArtworkContext'
import { createSplashArtworkLoader, type SplashImageResource } from '../reference/splashArtworkLoader'
import type { PlayerUiScreen } from '../navigation'
import generatedCatalog from '../../../ui-source/splash-artwork.generated.json'

const darklaw = (playerId: 1 | 2 = 1): ReadySplashArtwork => ({ ...ARKAMON_SPLASH_ARTWORK[5], src: assetUrl(ARKAMON_SPLASH_ARTWORK[5].src), playerId })
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
function resource() {
  let resolve!: () => void, reject!: (reason: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  const image: SplashImageResource = { src: '', naturalWidth: 1920, naturalHeight: 1080, decode: () => promise }
  return { image, resolve, reject }
}

afterEach(() => { vi.unstubAllGlobals(); usePlayerUiSession.getState().clear() })

describe('clean species splash artwork', () => {
  it('maps every reviewed catalog entry and leaves unsupported species generic', () => {
    for (const artwork of generatedCatalog) expect(getSplashArtwork(artwork.speciesId)).toEqual(artwork)
    // Painting bounds change when the source is repainted; identity and catalog mapping stay stable.
    expect(getSplashArtwork(5)).toMatchObject({ speciesId: 5, src: '/backgrounds/arkamon-splash/005-darklaw.webp', label: 'Illustrazione di Darklaw', objectPosition: '50% 50%', aspectRatio: '16 / 9' })
    for (const id of [undefined, 0, 111, -1, NaN]) expect(getSplashArtwork(id)).toBeUndefined()
  })

  it('changes backgrounds only in Squadra and Arkadex after a ready artwork is supplied', () => {
    const ready = darklaw()
    for (const screen of ['squadra', 'arkadex'] as const) {
      expect(supportsSplashArtwork(screen)).toBe(true)
      expect(referenceScreenBackground(screen, 'Venezia', ready)).toBe(ready.src)
      expect(referenceScreenBackground(screen, 'Venezia', null)).toBe(assetUrl(REFERENCE_BACKGROUNDS[screen]!))
    }
    for (const screen of ['partita', 'deposito', 'analisi', 'borsa', 'negozio'] as const satisfies readonly PlayerUiScreen[]) {
      expect(supportsSplashArtwork(screen)).toBe(false)
      expect(referenceScreenBackground(screen, 'Venezia', ready)).toBe(referenceScreenBackground(screen, 'Venezia'))
    }
  })

  it('follows each player’s existing species selection without publishing a selection of its own', () => {
    const session = usePlayerUiSession.getState()
    session.select(1, { instanceId: 'darklaw-one', speciesId: 5 })
    session.select(2, { instanceId: 'unsupported-two', speciesId: 111 })
    const selected = (playerId: 1 | 2) => getSplashArtwork(usePlayerUiSession.getState().selection[playerId]?.speciesId)
    expect(selected(1)?.speciesId).toBe(5)
    expect(selected(2)).toBeUndefined()
    session.select(1, { instanceId: 'unsupported-one', speciesId: 111 })
    expect(selected(1)).toBeUndefined()
    session.select(2, { instanceId: 'darklaw-two', speciesId: 5 })
    expect(selected(2)?.speciesId).toBe(5)
    expect(usePlayerUiSession.getState().selection).toEqual({ 1: { instanceId: 'unsupported-one', speciesId: 111 }, 2: { instanceId: 'darklaw-two', speciesId: 5 } })
  })

  it('keeps the fallback while decoding and only publishes a complete image', async () => {
    const pending = resource(), changed = vi.fn()
    const loader = createSplashArtworkLoader(changed, () => pending.image)
    loader.load(darklaw())
    expect(pending.image.src).toBe(darklaw().src)
    expect(changed.mock.calls).toEqual([[null]])
    pending.resolve(); await flush()
    expect(changed).toHaveBeenLastCalledWith(darklaw())
    loader.dispose()
  })

  it('retains the fallback after an image failure instead of hiding the official portrait', async () => {
    const pending = resource(), changed = vi.fn()
    const loader = createSplashArtworkLoader(changed, () => pending.image)
    loader.load(darklaw())
    pending.reject(new Error('missing asset')); await flush()
    expect(changed.mock.calls.every(([value]) => value === null)).toBe(true)
    expect(referenceScreenBackground('squadra', 'Venezia', changed.mock.lastCall![0])).toBe(assetUrl(REFERENCE_BACKGROUNDS.squadra!))
    loader.dispose()
  })

  it('does not accept an empty image even if decoding resolves', async () => {
    const pending = resource(), changed = vi.fn()
    const image = { ...pending.image, naturalWidth: 0 }
    const loader = createSplashArtworkLoader(changed, () => image)
    loader.load(darklaw())
    pending.resolve(); await flush()
    expect(changed.mock.calls).toEqual([[null]])
    loader.dispose()
  })

  it('ignores a late G1 decode after selection moves to G2 with the same species', async () => {
    const first = resource(), second = resource(), changed = vi.fn()
    const factory = vi.fn().mockReturnValueOnce(first.image).mockReturnValueOnce(second.image)
    const loader = createSplashArtworkLoader(changed, factory)
    loader.load(darklaw(1)); loader.load(darklaw(2))
    first.resolve(); await flush()
    expect(changed.mock.calls).toEqual([[null], [null]])
    second.resolve(); await flush()
    expect(changed).toHaveBeenLastCalledWith(darklaw(2))
    loader.dispose()
  })

  it('clears a decoded splash and ignores pending work when the selected species has no art', async () => {
    const first = resource(), pending = resource(), changed = vi.fn()
    const loader = createSplashArtworkLoader(changed, vi.fn().mockReturnValueOnce(first.image).mockReturnValueOnce(pending.image))
    loader.load(darklaw()); first.resolve(); await flush()
    expect(changed).toHaveBeenLastCalledWith(darklaw())
    loader.load(darklaw(2)); loader.load(null)
    pending.resolve(); await flush()
    expect(changed).toHaveBeenLastCalledWith(null)
    expect(changed.mock.calls.filter(([value]) => value !== null)).toEqual([[darklaw()]])
    loader.dispose()
  })

  it('does not publish after the parent screen unmounts', async () => {
    const pending = resource(), changed = vi.fn()
    const loader = createSplashArtworkLoader(changed, () => pending.image)
    loader.load(darklaw()); loader.dispose()
    pending.resolve(); await flush()
    loader.load(darklaw(2))
    expect(changed.mock.calls).toEqual([[null]])
  })

  it('uses the generic fallback when Image is unavailable during server rendering', () => {
    vi.stubGlobal('Image', undefined)
    const changed = vi.fn()
    const loader = createSplashArtworkLoader(changed)
    expect(() => loader.load(darklaw())).not.toThrow()
    expect(changed.mock.calls).toEqual([[null]])
    loader.dispose()
    function Hero() {
      const splash = useSplashArtwork()
      return splash ? <div role="img" aria-label={splash.label} data-splash-species={splash.speciesId}/> : <div data-hero-source="official-front"/>
    }
    expect(renderToStaticMarkup(<Hero/>)).toContain('data-hero-source="official-front"')
    const readyMarkup = renderToStaticMarkup(<SplashArtworkProvider value={darklaw()}><Hero/></SplashArtworkProvider>)
    expect(readyMarkup).toContain('role="img" aria-label="Illustrazione di Darklaw"')
    expect(readyMarkup).toContain('data-splash-species="5"')
    expect(readyMarkup).not.toContain('official-front')
  })
})
