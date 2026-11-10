import { useLayoutEffect, useReducer, useRef, type ReactNode } from 'react'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import type { NavigazioneScena } from '@/types'
import { SceneInputContext, SceneNavigationContext } from './SceneNavigationContext'
import { SceneTransitionOverlay } from './SceneTransitionOverlay'
import { createSceneTransitionState, getSceneKey, sceneTransitionReducer } from './sceneTransitionState'
import { getSceneTransitionProfile } from './sceneTransitionProfiles'
import { playSelectedAudio } from '@/utils/soundManager'
import './sceneTransitions.css'
import { useRegiaStore } from '@/regia/regiaStore'

interface SceneTransitionProps {
  navigation: NavigazioneScena
  renderScene: (navigation: NavigazioneScena) => ReactNode
  children?: ReactNode
}

export function SceneTransition({ navigation, renderScene, children }: SceneTransitionProps) {
  const { reducedMotion, speed } = useGameMotionPreferences()
  const [state, dispatch] = useReducer(sceneTransitionReducer, navigation, (initial) => {
    const initialState = createSceneTransitionState(initial)
    // A restored battle still gets its existing introduction, once per mount.
    return initial.scena === 'battaglia' && !reducedMotion
      ? { ...initialState, phase: 'cover' as const, revision: 1 }
      : initialState
  })
  useLayoutEffect(() => {
    if (state.phase === 'cover' && state.target.scena !== 'battaglia') return playSelectedAudio('event:transition')
  }, [state.phase, state.revision, state.target.scena])
  const lastRequest = useRef({ navigation, reducedMotion })
  const sceneRef = useRef<HTMLDivElement>(null)
  const wasTransitioning = useRef(false)
  const previousTransition = useRef({ revision: state.revision, phase: state.phase })
  const transitioning = state.phase !== 'idle'
  useLayoutEffect(() => {
    useRegiaStore.getState().setBusy(transitioning, 'Cambio scena', 'transition')
    return () => useRegiaStore.getState().setBusy(false, '', 'transition')
  }, [transitioning])
  const baseProfile = getSceneTransitionProfile(state.target)
  const profile = { ...baseProfile, coverMs: baseProfile.coverMs / speed, blendMs: baseProfile.blendMs / speed,
    durationMs: baseProfile.durationMs / speed, playbackRate: baseProfile.playbackRate * speed }
  const startCovered = state.revision !== previousTransition.current.revision
    && previousTransition.current.phase !== 'idle'

  useLayoutEffect(() => {
    previousTransition.current = { revision: state.revision, phase: state.phase }
  }, [state.revision, state.phase])

  useLayoutEffect(() => {
    if (lastRequest.current.navigation === navigation && lastRequest.current.reducedMotion === reducedMotion) return
    lastRequest.current = { navigation, reducedMotion }
    dispatch({ type: 'navigate', navigation, reducedMotion })
  }, [navigation, reducedMotion])

  useLayoutEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.inert = transitioning
    if (wasTransitioning.current && !transitioning && document.activeElement === document.body) {
      // An input mounted under inert cannot receive React's initial autofocus.
      scene.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled])')?.focus()
    }
    wasTransitioning.current = transitioning
    if (!transitioning) return

    // Grid movement listens on window; inert alone cannot suppress those keys.
    const blockKeyboard = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.target instanceof Element && event.target.closest('.arka-admin-panel, [data-game-dialog], [data-battle-log-dialog]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', blockKeyboard, true)
    window.addEventListener('keyup', blockKeyboard, true)
    return () => {
      scene.inert = false
      window.removeEventListener('keydown', blockKeyboard, true)
      window.removeEventListener('keyup', blockKeyboard, true)
    }
  }, [transitioning])

  return (
    <SceneNavigationContext.Provider value={state.shown}>
      <SceneInputContext.Provider value={transitioning}>
      {children}
      <div
        ref={sceneRef}
        className="absolute inset-0"
        data-presented-scene={getSceneKey(state.shown)}
        aria-busy={transitioning}
      >
        <div key={getSceneKey(state.shown)} className="absolute inset-0">
          {renderScene(state.shown)}
        </div>
      </div>
      {transitioning ? (
        <>
          <p className="sr-only" role="status">{profile.label}</p>
          <SceneTransitionOverlay
            key={state.revision}
            startCovered={startCovered}
            phase={state.phase === 'cover' ? 'cover' : 'reveal'}
            profile={profile}
            onCovered={() => dispatch({ type: 'covered', revision: state.revision })}
            onRevealed={() => dispatch({ type: 'revealed', revision: state.revision })}
          />
        </>
      ) : null}
      </SceneInputContext.Provider>
    </SceneNavigationContext.Provider>
  )
}
