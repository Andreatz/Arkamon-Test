import { useLayoutEffect, useState, type RefObject } from 'react'
import type { PlayerUiScreen } from '../navigation'
import type { ReadySplashArtwork } from './SplashArtworkContext'
import { fitSplashFrame, type SplashFrameBounds } from './splashFraming'

interface MeasuredFraming {
  key: string
  position: string
  region: string
  focusFits: boolean
}

/** Recheck the actual central opening after fonts, lazy screens and resizes settle. */
export function useSplashFraming(shell: RefObject<HTMLDivElement>, artwork: ReadySplashArtwork | null, screen: PlayerUiScreen) {
  const [framing, setFraming] = useState<MeasuredFraming | null>(null)
  const key = artwork ? `${screen}:${artwork.playerId}:${artwork.speciesId}:${artwork.src}` : ''
  useLayoutEffect(() => {
    const root = shell.current
    if (!root || !artwork || (screen !== 'squadra' && screen !== 'arkadex')) return
    const leftSelector = screen === 'squadra' ? '.pu-reference-roster' : '.pu-dex-index'
    const rightSelector = screen === 'squadra' ? '.pu-reference-team-dossier' : '.pu-dex-detail'
    const titleSelector = screen === 'squadra' ? '.pu-reference-hero-title' : '.pu-dex-hero .pu-hero-caption'
    const topSelectors = ['.pu-topbar', screen === 'squadra' ? '.pu-screen-heading' : '.pu-screen-toolbar', titleSelector]
    const bottomSelectors = ['.pu-nav', '.pu-footer', ...(screen === 'squadra' ? ['.pu-team-cap', '.pu-reference-hero-caption'] : ['.pu-animation-toggle'])]
    const observedSelectors = ['.pu-splash-backdrop', leftSelector, rightSelector, ...topSelectors, ...bottomSelectors]
    let pending = 0, disposed = false
    const visibleRect = (selector: string, includeHidden = false) => {
      const element = root.querySelector<HTMLElement>(selector)
      if (!element) return null
      const style = getComputedStyle(element), rect = element.getBoundingClientRect()
      return style.display !== 'none' && (includeHidden || style.visibility !== 'hidden') && rect.width > 0 && rect.height > 0 ? rect : null
    }
    const measure = () => {
      pending = 0
      if (disposed) return
      // The desktop canvas is intentionally hidden until this first measurement.
      const canvas = visibleRect('.pu-splash-backdrop', true)
      // Mobile uses a separate, contained illustration card without overlapping UI.
      if (!canvas) {
        const next = { key, position: '50% 50%', region: '', focusFits: true }
        setFraming(previous => previous?.key === key && previous.region === '' ? previous : next)
        return
      }
      const left = visibleRect(leftSelector), right = visibleRect(rightSelector), title = visibleRect(titleSelector)
      if (!left || !right || !title) return
      const margin = Math.min(22, Math.max(14, canvas.width * .012))
      const available: SplashFrameBounds = {
        left: Math.max(0, left.right - canvas.left + margin),
        right: Math.min(canvas.width, right.left - canvas.left - margin),
        top: Math.max(0, ...topSelectors.map(selector => (visibleRect(selector)?.bottom ?? canvas.top) - canvas.top)) + margin,
        bottom: Math.min(canvas.height, ...bottomSelectors.map(selector => (visibleRect(selector)?.top ?? canvas.bottom) - canvas.top)) - margin,
      }
      const result = fitSplashFrame({
        canvas, image: { width: 16, height: 9 },
        focus: artwork.focusBounds ?? artwork.subjectBounds, available,
      })
      if (!result) return
      const position = `${(result.position.x * 100).toFixed(6)}% ${(result.position.y * 100).toFixed(6)}%`
      const region = [available.left, available.top, available.right, available.bottom].map(value => value.toFixed(3)).join(',')
      setFraming(previous => previous?.key === key && previous.position === position && previous.region === region && previous.focusFits === result.focusFits
        ? previous : { key, position, region, focusFits: result.focusFits })
    }
    const schedule = () => { if (!disposed && !pending) pending = requestAnimationFrame(measure) }
    const resize = new ResizeObserver(schedule)
    const observe = () => {
      resize.disconnect()
      resize.observe(root)
      for (const selector of observedSelectors) {
        const element = root.querySelector(selector)
        if (element) resize.observe(element)
      }
      schedule()
    }
    // Child insertion catches the lazy screen and changing captions without observing our own style.
    const mutations = new MutationObserver(observe)
    mutations.observe(root, { childList: true, subtree: true, characterData: true })
    observe()
    measure()
    window.addEventListener('resize', schedule)
    void document.fonts.ready.then(schedule)
    return () => {
      disposed = true
      cancelAnimationFrame(pending)
      resize.disconnect()
      mutations.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [shell, artwork, screen, key])
  return framing?.key === key ? framing : null
}
