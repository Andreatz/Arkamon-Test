import { describe, expect, it } from 'vitest'
import {
  MAX_BATTLE_SHOTS, MAX_SHOT_FRAMES, finalizeBattleShot,
  summarizeBattleShots, battleShotCsv, shotIdentityKey, type BattleShotIdentity,
} from './battleShotBenchmark'

const identity: BattleShotIdentity = {
  sequence: 12, speciesId: 1, moveId: 37, view: 'back', choreography: 'projectile',
}

function shot(sequence: number, attempt: number, frames: number[], outcome: 'complete' | 'interrupted' = 'complete') {
  return finalizeBattleShot({
    identity: { ...identity, sequence }, attempt, startedAtMs: sequence * 100,
    endedAtMs: sequence * 100 + 800, outcome, intervals: frames,
    nativePeakBytes: 64 * 1048576, vfxPeakBytes: 32 * 1048576,
    nativeLoads: 2, vfxPrepares: 1, maxCanvasDrawMs: 1.25,
    longTasks: 1, longTaskMs: 55,
  })
}

describe('per-attack benchmark model', () => {
  it('measures individual rAF intervals instead of 500ms aggregate samples', () => {
    const first = shot(12, 1, [16.67, 16.67, 33.34, 50, 16.67])
    expect(first.frames.count).toBe(5)
    expect(first.frames.p50Ms).toBe(16.67)
    expect(first.frames.p95Ms).toBe(50)
    expect(first.frames.estimatedMissed60HzFrames).toBe(3)
    expect(first.durationMs).toBe(800)
    expect(first.nativePeakBytes).toBe(67108864)
    expect(first.repetition).toBe('first')
    expect(first.outcome).toBe('complete')
  })

  it('compares identical public species/move/view IDs and ignores interrupted attempts', () => {
    const first = shot(1, 1, [16.67, 33.34, 50])
    const failed = shot(2, 2, [180, 100], 'interrupted')
    const repeated = shot(3, 3, [16.67, 16.67, 33.34])
    const other = { ...shot(4, 1, [60]), speciesId: 2 }
    const groups = summarizeBattleShots([first, failed, repeated, other])
    expect(groups).toHaveLength(2)
    const match = groups.find(group => group.speciesId === 1)!
    expect(match.attempts).toBe(2)
    expect(match.firstP95Ms).toBe(50)
    expect(match.latestP95Ms).toBe(33.34)
    expect(match.changeP95Ms).toBe(-16.66)
    expect(match.firstNativeLoads).toBe(2)
    expect(repeated.repetition).toBe('repeat')
    expect(shotIdentityKey(first)).not.toBe(shotIdentityKey(other))
  })

  it('does not invent an improvement for a single attempt or no valid frame samples', () => {
    expect(summarizeBattleShots([shot(2, 1, [])])[0].changeP95Ms).toBeNull()
    expect(summarizeBattleShots([shot(2, 1, [16.67])])[0].changeP95Ms).toBeNull()
  })

  it('exports only technical numeric IDs and measurements without names or URLs', () => {
    const csv = battleShotCsv([shot(1, 1, [16.67, 33.34])])
    expect(csv.split('\n')).toHaveLength(3)
    expect(csv).toContain('speciesId,moveId,view,choreography')
    expect(csv).toContain('67108864')
    expect(csv).not.toMatch(/arkamon-save|player|nickname|assetUrl/)
  })

  it('exposes explicit storage limits to avoid unbounded background profiling', () => {
    expect(MAX_BATTLE_SHOTS).toBe(120)
    expect(MAX_SHOT_FRAMES).toBe(1800)
  })

  it('clamps invalid telemetry to safe finite values', () => {
    const invalid = finalizeBattleShot({
      identity, attempt: 0, startedAtMs: NaN, endedAtMs: Infinity,
      outcome: 'interrupted', intervals: [NaN, 0, Infinity],
      nativePeakBytes: -5, vfxPeakBytes: NaN, nativeLoads: -1, vfxPrepares: Infinity,
      maxCanvasDrawMs: -1, longTasks: -1, longTaskMs: NaN,
    })
    expect(invalid.attempt).toBe(1)
    expect(invalid.durationMs).toBe(0)
    expect(invalid.nativePeakBytes).toBe(0)
    expect(invalid.vfxPrepares).toBe(0)
    expect(invalid.maxCanvasDrawMs).toBe(0)
  })
})
