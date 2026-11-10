import { describe, expect, it } from 'vitest'
import type { SceneId } from '@/types'
import {
  getSceneTransitionProfile,
  TRANSITION_VIDEO_PATH,
  TRANSITION_VIDEO_SEGMENT_SECONDS,
  TRANSITION_VIDEO_START_SECONDS,
} from '../sceneTransitionProfiles'

describe('scene transition profiles', () => {
  it('keeps the existing battle animation source and its original three-second final segment', () => {
    const battle = getSceneTransitionProfile({ scena: 'battaglia' })
    expect(TRANSITION_VIDEO_PATH).toBe('/assets/Transizione Battaglia.mp4')
    expect(TRANSITION_VIDEO_START_SECONDS).toBe(5)
    expect(TRANSITION_VIDEO_START_SECONDS + TRANSITION_VIDEO_SEGMENT_SECONDS).toBe(8)
    expect(battle.mode).toBe('battle-video')
    expect(TRANSITION_VIDEO_SEGMENT_SECONDS / battle.playbackRate).toBe(3)
    expect(battle.durationMs).toBe(3000)
    expect(battle.blendMs).toBe(950)
    expect(battle.filter).toBe('none')
  })

  it('keeps routine consultation below 200 ms instead of replaying the D6', () => {
    const general = getSceneTransitionProfile({ scena: 'deposito' })
    expect(general.mode).toBe('fade')
    expect(general.durationMs + general.coverMs).toBeLessThanOrEqual(200)
    expect(general.filter).toBe('none')
    const travel = getSceneTransitionProfile({ scena: 'citta', payload: { luogo: 'Venezia' } })
    expect(travel.mode).toBe('fade')
    expect(travel.durationMs + travel.coverMs).toBeLessThanOrEqual(650)
  })

  it('lets the same crimson D6 linger slightly longer for evolution', () => {
    const general = getSceneTransitionProfile({ scena: 'deposito' })
    const evolution = getSceneTransitionProfile({ scena: 'evoluzione' })
    const battle = getSceneTransitionProfile({ scena: 'battaglia' })
    expect(evolution.mode).toBe('arkamon-dice')
    expect(evolution.durationMs).toBeGreaterThan(general.durationMs)
    expect(evolution.durationMs).toBeLessThan(battle.durationMs)
    expect(evolution.filter).not.toContain('hue-rotate(')
    expect((evolution.durationMs + evolution.coverMs) * 0.71)
      .toBeLessThan(evolution.coverMs + evolution.durationMs - evolution.blendMs)
  })

  const scenes: SceneId[] = [
    'titolo', 'laboratorio', 'mappa-principale', 'mappa-griglia', 'percorso',
    'citta', 'palestra', 'centro-pokemon', 'battaglia', 'deposito', 'squadra', 'evoluzione',
  ]

  it('reserves the VS video for battles across all supported destinations', () => {
    const videoDestinations = scenes.filter((scena) => getSceneTransitionProfile({ scena }).mode === 'battle-video')
    expect(videoDestinations).toEqual(['battaglia'])
  })

  it('guarantees bounded fallback and enough time to blend for every destination', () => {
    for (const scena of scenes) {
      const profile = getSceneTransitionProfile({ scena })
      expect(profile.durationMs).toBeGreaterThan(profile.blendMs)
      expect(profile.failSafeMs).toBeGreaterThan(profile.coverMs + profile.durationMs + profile.blendMs)
      expect(profile.failSafeMs).toBeLessThanOrEqual(8000)
      expect(profile.label.length).toBeGreaterThan(0)
    }
  })

  it('names the destination location in accessible Italian labels', () => {
    expect(getSceneTransitionProfile({ scena: 'citta', payload: { luogo: 'Roma' } }).label)
      .toBe('Ingresso a Roma')
    expect(getSceneTransitionProfile({ scena: 'percorso', payload: { luogo: 'Percorso_3' } }).label)
      .toBe('Ingresso in Percorso 3')
    expect(getSceneTransitionProfile({ scena: 'percorso' }).label).toBe('Ingresso in Percorso 1')
    expect(getSceneTransitionProfile({ scena: 'citta' }).label).toBe('Ingresso a Venezia')
  })

  it('returns an independent profile for each request without changing later requests', () => {
    const before = getSceneTransitionProfile({ scena: 'deposito' })
    getSceneTransitionProfile({ scena: 'battaglia' })
    getSceneTransitionProfile({ scena: 'evoluzione' })
    const after = getSceneTransitionProfile({ scena: 'deposito' })
    expect(after).not.toBe(before)
    expect(after).toEqual(before)
  })
})
