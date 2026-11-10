import type { NavigazioneScena } from '@/types'

export type SceneTransitionPhase = 'idle' | 'cover' | 'reveal'

export interface SceneTransitionState {
  shown: NavigazioneScena
  target: NavigazioneScena
  phase: SceneTransitionPhase
  revision: number
}

export type SceneTransitionAction =
  | { type: 'navigate'; navigation: NavigazioneScena; reducedMotion: boolean }
  | { type: 'covered'; revision: number }
  | { type: 'revealed'; revision: number }

/** Navigation identity excludes gameplay state and grid maps' internal transitions. */
export function getSceneKey(navigation: NavigazioneScena): string {
  if (navigation.scena === 'citta' || navigation.scena === 'percorso') {
    const defaultLocation = navigation.scena === 'citta' ? 'Venezia' : 'Percorso_1'
    const location = navigation.payload?.luogo
    return `${navigation.scena}:${typeof location === 'string' && location ? location : defaultLocation}`
  }

  return navigation.scena
}

export function createSceneTransitionState(navigation: NavigazioneScena): SceneTransitionState {
  return { shown: navigation, target: navigation, phase: 'idle', revision: 0 }
}

/** Swaps the displayed scene only while covered and rejects obsolete completions. */
export function sceneTransitionReducer(
  state: SceneTransitionState,
  action: SceneTransitionAction
): SceneTransitionState {
  if (action.type === 'navigate') {
    const navigation = action.navigation

    if (action.reducedMotion) {
      return {
        shown: navigation,
        target: navigation,
        phase: 'idle',
        revision: state.revision + 1,
      }
    }

    if (getSceneKey(navigation) === getSceneKey(state.shown)) {
      if (state.phase === 'cover') {
        return {
          shown: navigation,
          target: navigation,
          phase: 'reveal',
          revision: state.revision + 1,
        }
      }

      if (state.shown === navigation && state.target === navigation) return state
      return { ...state, shown: navigation, target: navigation }
    }

    if (state.phase === 'cover') {
      if (state.target === navigation) return state
      return { ...state, target: navigation }
    }

    return {
      ...state,
      target: navigation,
      phase: 'cover',
      revision: state.revision + 1,
    }
  }

  if (action.revision !== state.revision) return state

  if (action.type === 'covered' && state.phase === 'cover') {
    return { ...state, shown: state.target, phase: 'reveal' }
  }

  if (action.type === 'revealed' && state.phase === 'reveal') {
    return { ...state, phase: 'idle' }
  }

  return state
}
