import { describe, expect, it } from 'vitest'
import type { NavigazioneScena } from '@/types'
import {
  createSceneTransitionState,
  getSceneKey,
  sceneTransitionReducer,
  type SceneTransitionState,
} from '../sceneTransitionState'

const title: NavigazioneScena = { scena: 'titolo' }
const map: NavigazioneScena = { scena: 'mappa-principale' }
const deposit: NavigazioneScena = { scena: 'deposito' }
const battle: NavigazioneScena = { scena: 'battaglia' }

function navigate(state: SceneTransitionState, navigation: NavigazioneScena, reducedMotion = false) {
  return sceneTransitionReducer(state, { type: 'navigate', navigation, reducedMotion })
}

describe('sceneTransitionReducer', () => {
  it('shows the initial scene immediately without an intro transition', () => {
    expect(createSceneTransitionState(title)).toEqual({
      shown: title,
      target: title,
      phase: 'idle',
      revision: 0,
    })
  })

  it('does not restart or remount an unchanged navigation', () => {
    const initial = createSceneTransitionState(title)
    expect(navigate(initial, title)).toBe(initial)

    const updated = { ...title, payload: { dialog: 'welcome' } }
    const next = navigate(initial, updated)
    expect(next).toEqual({ ...initial, shown: updated, target: updated })
    expect(getSceneKey(next.shown)).toBe(getSceneKey(initial.shown))
  })

  it('keeps the outgoing scene and its location until the cover completes', () => {
    const outgoing: NavigazioneScena = { scena: 'citta', payload: { luogo: 'Venezia' } }
    const destination: NavigazioneScena = { scena: 'citta', payload: { luogo: 'Padova' } }
    const covering = navigate(createSceneTransitionState(outgoing), destination)

    expect(covering).toEqual({ shown: outgoing, target: destination, phase: 'cover', revision: 1 })
    const revealing = sceneTransitionReducer(covering, { type: 'covered', revision: 1 })
    expect(revealing).toEqual({ shown: destination, target: destination, phase: 'reveal', revision: 1 })
    expect(sceneTransitionReducer(revealing, { type: 'revealed', revision: 1 }))
      .toEqual({ ...revealing, phase: 'idle' })
  })

  it('commits the latest destination requested while covered without mounting intermediate scenes', () => {
    const covering = navigate(createSceneTransitionState(title), map)
    const retargeted = navigate(covering, deposit)
    const latest = navigate(retargeted, battle)

    expect(latest.shown).toBe(title)
    expect(latest.target).toBe(battle)
    expect(latest.revision).toBe(covering.revision)
    expect(sceneTransitionReducer(latest, { type: 'covered', revision: covering.revision }).shown)
      .toBe(battle)
  })

  it('cancels navigation back to the shown scene by revealing it and invalidating the cover event', () => {
    const covering = navigate(createSceneTransitionState(title), map)
    const cancelled = navigate(covering, title)

    expect(cancelled).toEqual({ shown: title, target: title, phase: 'reveal', revision: 2 })
    expect(sceneTransitionReducer(cancelled, { type: 'covered', revision: 1 })).toBe(cancelled)
    expect(sceneTransitionReducer(cancelled, { type: 'revealed', revision: 2 }).phase).toBe('idle')
  })

  it('starts a new cover if navigation interrupts the reveal', () => {
    const covering = navigate(createSceneTransitionState(title), map)
    const revealing = sceneTransitionReducer(covering, { type: 'covered', revision: 1 })
    const interrupted = navigate(revealing, deposit)

    expect(interrupted).toEqual({ shown: map, target: deposit, phase: 'cover', revision: 2 })
    expect(sceneTransitionReducer(interrupted, { type: 'revealed', revision: 1 })).toBe(interrupted)
    expect(sceneTransitionReducer(interrupted, { type: 'covered', revision: 2 }).shown).toBe(deposit)
  })

  it('updates payload for the shown scene during reveal without restarting the animation', () => {
    const covering = navigate(createSceneTransitionState(title), map)
    const revealing = sceneTransitionReducer(covering, { type: 'covered', revision: 1 })
    const updated: NavigazioneScena = { scena: 'mappa-principale', payload: { focus: 'Venezia' } }

    expect(navigate(revealing, updated)).toEqual({ ...revealing, shown: updated, target: updated })
  })

  it.each(['idle', 'cover', 'reveal'] as const)('commits immediately with reduced motion during %s', (phase) => {
    const state = { ...createSceneTransitionState(title), phase, target: map, revision: 4 }
    const next = navigate(state, deposit, true)

    expect(next).toEqual({ shown: deposit, target: deposit, phase: 'idle', revision: 5 })
    expect(sceneTransitionReducer(next, { type: 'covered', revision: 4 })).toBe(next)
    expect(sceneTransitionReducer(next, { type: 'revealed', revision: 4 })).toBe(next)
  })

  it('ignores completions with the wrong phase even when the revision matches', () => {
    const initial = createSceneTransitionState(title)
    expect(sceneTransitionReducer(initial, { type: 'covered', revision: 0 })).toBe(initial)
    expect(sceneTransitionReducer(initial, { type: 'revealed', revision: 0 })).toBe(initial)

    const covering = navigate(initial, map)
    expect(sceneTransitionReducer(covering, { type: 'revealed', revision: 1 })).toBe(covering)
    const revealing = sceneTransitionReducer(covering, { type: 'covered', revision: 1 })
    expect(sceneTransitionReducer(revealing, { type: 'covered', revision: 1 })).toBe(revealing)
  })

  it('does not replay a duplicate cover or reveal completion', () => {
    const covering = navigate(createSceneTransitionState(title), map)
    const revealing = sceneTransitionReducer(covering, { type: 'covered', revision: 1 })
    const idle = sceneTransitionReducer(revealing, { type: 'revealed', revision: 1 })

    expect(sceneTransitionReducer(revealing, { type: 'covered', revision: 1 })).toBe(revealing)
    expect(sceneTransitionReducer(idle, { type: 'revealed', revision: 1 })).toBe(idle)
  })
})

describe('getSceneKey', () => {
  it.each(['citta', 'percorso'] as const)('distinguishes different locations in the same %s scene', (scena) => {
    expect(getSceneKey({ scena, payload: { luogo: 'first' } }))
      .not.toBe(getSceneKey({ scena, payload: { luogo: 'second' } }))
    expect(getSceneKey({ scena, payload: { luogo: 'first', incidental: 1 } }))
      .toBe(getSceneKey({ scena, payload: { luogo: 'first', incidental: 2 } }))
  })

  it('treats omitted city and route locations like the scenes\' default locations', () => {
    expect(getSceneKey({ scena: 'citta' })).toBe(getSceneKey({ scena: 'citta', payload: { luogo: 'Venezia' } }))
    expect(getSceneKey({ scena: 'percorso' })).toBe(getSceneKey({ scena: 'percorso', payload: { luogo: 'Percorso_1' } }))
  })

  it('keeps the grid scene identity stable when its map or active player changes', () => {
    expect(getSceneKey({ scena: 'mappa-griglia', payload: { mappaId: 'first', giocatoreId: 1 } }))
      .toBe(getSceneKey({ scena: 'mappa-griglia', payload: { mappaId: 'second', giocatoreId: 2 } }))
  })
})
