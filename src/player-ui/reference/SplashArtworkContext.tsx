import { createContext, useContext } from 'react'
import type { SplashArtwork } from './splashArtwork'

/** A decoded illustration belongs to one selected player and species. */
export interface ReadySplashArtwork extends SplashArtwork {
  readonly playerId: 1 | 2
}

const SplashArtworkContext = createContext<ReadySplashArtwork | null>(null)
export const SplashArtworkProvider = SplashArtworkContext.Provider

/** Null keeps the generic background and the existing official full-body portrait. */
export function useSplashArtwork(): ReadySplashArtwork | null {
  return useContext(SplashArtworkContext)
}
