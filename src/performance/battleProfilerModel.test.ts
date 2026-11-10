import { describe, expect, it } from 'vitest'
import {
  PROFILE_SCHEMA_VERSION, MAX_PROFILE_EVENTS, MAX_PROFILE_SAMPLES,
  summarizeFrameIntervals, createBattleProfileReport, battleProfileCsv,
  type BattleProfileSample,
} from './battleProfilerModel'

const sample = (atMs: number): BattleProfileSample => ({
  atMs, frames: summarizeFrameIntervals([16.67, 16.67, 33.34]),
  activeBattle: true, nativeBytes: 64 * 1048576, nativeBudgetBytes: 64 * 1048576,
  vfxBytes: 32 * 1048576, vfxBudgetBytes: 64 * 1048576,
  nativeDecodes: 1, peakNativeDecodes: 2, nativeLoads: 1, nativeLoadLastMs: 125, vfxPrepares: 2, vfxPrepareLastMs: 55, pagedRenderers: 2,
  atlasRenderers: 0, lastCanvasDrawMs: 1.25, longTasks: 0, longTaskMs: 0,
})

describe('battle profiling math and privacy', () => {
  it('measures rAF cadence, p50/p95 and overdue 60 Hz gaps without assuming actual GPU drops', () => {
    const stats = summarizeFrameIntervals([16.67, 16.67, 33.34, 50, 16.67])
    expect(stats.count).toBe(5)
    expect(stats.p50Ms).toBe(16.67)
    expect(stats.p95Ms).toBe(50)
    expect(stats.lateFrames).toBe(2)
    expect(stats.estimatedMissed60HzFrames).toBe(3)
    expect(stats.fps).toBeGreaterThan(30)
    expect(stats.fps).toBeLessThan(40)
  })

  it('ignores invalid, hidden-tab-sized gaps and returns zero for no samples', () => {
    expect(summarizeFrameIntervals([0, -10, NaN, Infinity, 400, 10000])).toEqual({
      count: 0, fps: 0, p50Ms: 0, p95Ms: 0, lateFrames: 0, estimatedMissed60HzFrames: 0,
    })
    expect(summarizeFrameIntervals([10, 500, 20]).count).toBe(2)
  })

  it('keeps exports bounded and does not introduce campaign/user/asset identifiers', () => {
    const samples = Array.from({ length: MAX_PROFILE_SAMPLES + 9 }, (_, i) => sample(i * 500))
    const events = Array.from({ length: MAX_PROFILE_EVENTS + 12 }, (_, i) => ({
      atMs: i, phase: 'impact', cameraBeat: 'impact', choreography: 'area',
    }))
    const report = createBattleProfileReport('2026-11-11T00:00:00Z', null, 400, samples, events)
    expect(report.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
    expect(report.metricSource).toBe('requestAnimationFrame')
    expect(report.samples).toHaveLength(MAX_PROFILE_SAMPLES)
    expect(report.events).toHaveLength(MAX_PROFILE_EVENTS)
    expect(report.durationMs).toBe(400)
    expect(report.samples[0].atMs).toBe(9 * 500)
    expect(JSON.stringify(report)).not.toMatch(/playerName|campaignSave|assetUrl|pokemonName/)
    expect(report.notes.some(note => note.includes('not actual rendered GPU'))).toBe(true)
  })

  it('exports a portable numeric CSV with a deterministic header', () => {
    const csv = battleProfileCsv([sample(500)])
    expect(csv).toContain('atMs,fps,p50Ms,p95Ms')
    expect(csv.split('\n')).toHaveLength(3)
    expect(csv).toContain('67108864')
    expect(csv).not.toContain('undefined')
  })
})
