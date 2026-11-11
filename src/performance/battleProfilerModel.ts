import type { FrameStatistics } from './frameStatistics'
export { TARGET_FRAME_MS, summarizeFrameIntervals } from './frameStatistics'
import { battleShotCsv, type BattleShotBenchmark } from './battleShotBenchmark'

export const PROFILE_SCHEMA_VERSION = 2
export interface BattleProfileEvent {
  atMs: number
  phase: string
  cameraBeat: string
  choreography: string
}

export interface BattleProfileSample {
  atMs: number
  frames: FrameStatistics
  activeBattle: boolean
  nativeBytes: number
  nativeBudgetBytes: number
  vfxBytes: number
  vfxBudgetBytes: number
  nativeDecodes: number
  peakNativeDecodes: number
  nativeLoads: number
  nativeLoadLastMs: number | null
  vfxPrepares: number
  vfxPrepareLastMs: number | null
  pagedRenderers: number
  atlasRenderers: number
  lastCanvasDrawMs: number | null
  longTasks: number
  longTaskMs: number
}

export interface BattleProfileReport {
  schemaVersion: number
  metricSource: 'requestAnimationFrame'
  referenceHz: 60
  startedAt: string
  stoppedAt: string | null
  durationMs: number
  sampledBattleOnly: true
  samples: BattleProfileSample[]
  events: BattleProfileEvent[]
  shots: BattleShotBenchmark[]
  notes: string[]
}

/** Reports exclude campaign saves, player identifiers, attack names and asset URLs. */
export function createBattleProfileReport(
  startedAt: string,
  stoppedAt: string | null,
  durationMs: number,
  samples: readonly BattleProfileSample[],
  events: readonly BattleProfileEvent[],
  shots: readonly BattleShotBenchmark[] = [],
): BattleProfileReport {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    metricSource: 'requestAnimationFrame',
    referenceHz: 60,
    startedAt, stoppedAt, durationMs: Math.max(0, Math.round(durationMs)),
    sampledBattleOnly: true,
    samples: samples.slice(-MAX_PROFILE_SAMPLES),
    events: events.slice(-MAX_PROFILE_EVENTS),
    shots: shots.slice(-120),
    notes: [
      'FPS indicates rAF callback cadence, not actual rendered GPU FPS.',
      'Estimated missed frames use a 60 Hz reference and can differ on high-refresh displays.',
      'Hidden-tab and >250 ms suspension gaps are excluded from FPS statistics.',
      'Cache bytes are retained decoded-image estimates, not total browser or GPU memory.',
      'Per-attack intervals are captured at individual animation frames, unlike 500ms general samples.',
      'First and repeat mean presentation order in this recording, not verified cold or warm browser cache state.',
      'Attack identifiers are public catalog species/move IDs; no player names or campaign contents are recorded.',
      'Asset preparation times include fetch and decode, and are emitted only when a new load completes within a sampling window.',
      'Canvas draw times are the latest sampled renderer measurements, not a complete GPU trace.',
      'The profiler itself adds a small measurement overhead; compare identical browser/hardware conditions.',
    ],
  }
}

export function battleProfileCsv(samples: readonly BattleProfileSample[]): string {
  const columns: (keyof BattleProfileSample | 'fps' | 'p50Ms' | 'p95Ms' | 'estimatedMissed60HzFrames')[] = [
    'atMs', 'fps', 'p50Ms', 'p95Ms', 'estimatedMissed60HzFrames', 'nativeBytes',
    'nativeBudgetBytes', 'vfxBytes', 'vfxBudgetBytes', 'nativeDecodes',
    'nativeLoads', 'nativeLoadLastMs', 'vfxPrepares', 'vfxPrepareLastMs',
    'pagedRenderers', 'atlasRenderers', 'lastCanvasDrawMs', 'longTasks', 'longTaskMs',
  ]
  const valueFor = (sample: BattleProfileSample, column: typeof columns[number]): number | null => {
    if (column === 'fps' || column === 'p50Ms' || column === 'p95Ms' || column === 'estimatedMissed60HzFrames') return sample.frames[column]
    const value = sample[column]
    return typeof value === 'number' ? value : null
  }
  return [columns.join(','), ...samples.map(sample => columns.map(column => valueFor(sample, column) ?? '').join(','))].join('\n') + '\n'
}

/** Portable per-attack data for spreadsheet comparisons without full general telemetry. */
export { battleShotCsv }
