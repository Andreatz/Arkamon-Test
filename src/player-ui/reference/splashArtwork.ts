import type { PlayerUiScreen } from '../navigation'
import generatedCatalog from '../../../ui-source/splash-artwork.generated.json'

export interface SplashSubjectBounds {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface SplashArtwork {
  readonly speciesId: number
  readonly src: string
  readonly sha256?: string
  readonly label: string
  readonly objectPosition: string
  readonly aspectRatio: '16 / 9'
  readonly subjectBounds: SplashSubjectBounds
  readonly compositionPolicy?: 'hero-focus' | 'full-canvas-focus'
  readonly focusBounds?: SplashSubjectBounds
  readonly displayScale?: number
  readonly displayOffset?: { readonly x: number; readonly y: number }
}

/** Clean illustrations only: creature and environment, with no baked interface. */
export const ARKAMON_SPLASH_ARTWORK: Readonly<Record<number, SplashArtwork>> = Object.fromEntries(
  generatedCatalog.map(artwork => [artwork.speciesId, { ...artwork, compositionPolicy: artwork.compositionPolicy as SplashArtwork['compositionPolicy'], aspectRatio: '16 / 9' as const }]),
)

export function getSplashArtwork(speciesId: number | undefined): SplashArtwork | undefined {
  return speciesId === undefined ? undefined : ARKAMON_SPLASH_ARTWORK[speciesId]
}

export function supportsSplashArtwork(screen: PlayerUiScreen): boolean {
  return screen === 'squadra' || screen === 'arkadex'
}
