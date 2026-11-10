import type { ReadySplashArtwork } from './SplashArtworkContext'

export interface SplashImageResource {
  src: string
  readonly naturalWidth: number
  readonly naturalHeight: number
  decode: () => Promise<void>
}
type ResourceFactory = () => SplashImageResource | null
const browserResource: ResourceFactory = () => typeof Image === 'undefined' ? null : new Image()

/** Cancels stale results when selection, player or the mounted screen changes. */
export function createSplashArtworkLoader(onChange: (artwork: ReadySplashArtwork | null) => void, createResource: ResourceFactory = browserResource) {
  let revision = 0, disposed = false
  return {
    load(artwork: ReadySplashArtwork | null) {
      if (disposed) return
      const request = ++revision
      onChange(null)
      if (!artwork) return
      let image: SplashImageResource | null
      try {
        image = createResource()
        if (!image) return
        image.src = artwork.src
        Promise.resolve(image.decode()).then(() => {
          if (!disposed && revision === request && image!.naturalWidth > 0 && image!.naturalHeight > 0) onChange(artwork)
        }).catch(() => {
          if (!disposed && revision === request) onChange(null)
        })
      } catch {
        if (!disposed && revision === request) onChange(null)
      }
    },
    dispose() { disposed = true; revision++ },
  }
}
