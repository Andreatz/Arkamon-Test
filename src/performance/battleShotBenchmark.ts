import { summarizeFrameIntervals, type FrameStatistics } from './frameStatistics'

/** Public catalog IDs only. No player identifiers, instances, asset URLs or names. */
export interface BattleShotIdentity {
  sequence: number
  speciesId: number
  moveId: number
  view: 'front' | 'back'
  choreography: string
}

export interface BattleShotBenchmark extends BattleShotIdentity {
  attempt: number
  /** Order within the same browser recording, NOT proof of a warm decoded cache. */
  repetition: 'first' | 'repeat'
  outcome: 'complete' | 'interrupted'
  startedAtMs: number
  endedAtMs: number
  durationMs: number
  frames: FrameStatistics
  nativePeakBytes: number
  vfxPeakBytes: number
  nativeLoads: number
  vfxPrepares: number
  maxCanvasDrawMs: number | null
  longTasks: number
  longTaskMs: number
}

export interface BattleShotSummary {
  speciesId: number
  moveId: number
  view: BattleShotIdentity['view']
  choreography: string
  attempts: number
  firstP95Ms: number | null
  latestP95Ms: number | null
  changeP95Ms: number | null
  firstNativeLoads: number
  latestNativeLoads: number
  firstVfxPrepares: number
  latestVfxPrepares: number
}

export const MAX_BATTLE_SHOTS = 120
export const MAX_SHOT_FRAMES = 1800

export const shotIdentityKey = (shot: Pick<BattleShotIdentity, 'speciesId' | 'moveId' | 'view' | 'choreography'>) =>
  [shot.speciesId, shot.moveId, shot.view, shot.choreography].join(':')

export function parseBattleShotIdentity(stage: Element): BattleShotIdentity | null {
  const sequence = Number(stage.getAttribute('data-battle-profile-sequence'))
  const speciesId = Number(stage.getAttribute('data-battle-profile-species'))
  const moveId = Number(stage.getAttribute('data-battle-profile-move'))
  const view = stage.getAttribute('data-battle-profile-view')
  const choreography = stage.querySelector('[data-battle-camera]')?.getAttribute('data-battle-camera-choreography') ?? 'none'
  if (![sequence, speciesId, moveId].every(id => Number.isSafeInteger(id) && id > 0)
    || (view !== 'front' && view !== 'back')) return null
  return { sequence, speciesId, moveId, view, choreography }
}

export function finalizeBattleShot(input: {
  identity: BattleShotIdentity
  attempt: number
  startedAtMs: number
  endedAtMs: number
  outcome: BattleShotBenchmark['outcome']
  intervals: readonly number[]
  nativePeakBytes: number
  vfxPeakBytes: number
  nativeLoads: number
  vfxPrepares: number
  maxCanvasDrawMs: number | null
  longTasks: number
  longTaskMs: number
}): BattleShotBenchmark {
  const nonnegative = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0
  return {
    ...input.identity,
    attempt: Math.max(1, Math.floor(nonnegative(input.attempt))),
    repetition: input.attempt > 1 ? 'repeat' : 'first',
    outcome: input.outcome,
    startedAtMs: Math.round(nonnegative(input.startedAtMs)),
    endedAtMs: Math.round(nonnegative(input.endedAtMs)),
    durationMs: Math.round(Math.max(0, nonnegative(input.endedAtMs) - nonnegative(input.startedAtMs))),
    frames: summarizeFrameIntervals(input.intervals),
    nativePeakBytes: nonnegative(input.nativePeakBytes),
    vfxPeakBytes: nonnegative(input.vfxPeakBytes),
    nativeLoads: Math.floor(nonnegative(input.nativeLoads)),
    vfxPrepares: Math.floor(nonnegative(input.vfxPrepares)),
    maxCanvasDrawMs: input.maxCanvasDrawMs === null ? null : nonnegative(input.maxCanvasDrawMs),
    longTasks: Math.floor(nonnegative(input.longTasks)),
    longTaskMs: nonnegative(input.longTaskMs),
  }
}

/** Compare only complete same-species, same-move presentations. */
export function summarizeBattleShots(shots: readonly BattleShotBenchmark[]): BattleShotSummary[] {
  const groups = new Map<string, BattleShotBenchmark[]>()
  for (const shot of shots) {
    if (shot.outcome !== 'complete') continue
    const key = shotIdentityKey(shot)
    const group = groups.get(key) ?? []
    group.push(shot)
    groups.set(key, group)
  }
  return [...groups.values()].map(group => {
    const first = group[0], last = group[group.length - 1]
    const valid = first.frames.count > 0 && last.frames.count > 0
    return {
      speciesId: first.speciesId, moveId: first.moveId, view: first.view,
      choreography: first.choreography, attempts: group.length,
      firstP95Ms: first.frames.count ? first.frames.p95Ms : null,
      latestP95Ms: last.frames.count ? last.frames.p95Ms : null,
      changeP95Ms: group.length > 1 && valid
        ? Number((last.frames.p95Ms - first.frames.p95Ms).toFixed(2)) : null,
      firstNativeLoads: first.nativeLoads,
      latestNativeLoads: last.nativeLoads,
      firstVfxPrepares: first.vfxPrepares,
      latestVfxPrepares: last.vfxPrepares,
    }
  }).sort((a, b) => b.attempts - a.attempts || a.speciesId - b.speciesId || a.moveId - b.moveId)
}

export function battleShotCsv(shots: readonly BattleShotBenchmark[]): string {
  const headers = [
    'sequence', 'speciesId', 'moveId', 'view', 'choreography', 'attempt', 'repetition',
    'outcome', 'startedAtMs', 'endedAtMs', 'durationMs', 'fps', 'p50Ms', 'p95Ms',
    'estimatedMissed60HzFrames', 'nativePeakBytes', 'vfxPeakBytes', 'nativeLoads',
    'vfxPrepares', 'maxCanvasDrawMs', 'longTasks', 'longTaskMs',
  ]
  const cells = (shot: BattleShotBenchmark) => [
    shot.sequence, shot.speciesId, shot.moveId, shot.view, shot.choreography, shot.attempt,
    shot.repetition, shot.outcome, shot.startedAtMs, shot.endedAtMs, shot.durationMs,
    shot.frames.fps, shot.frames.p50Ms, shot.frames.p95Ms, shot.frames.estimatedMissed60HzFrames,
    shot.nativePeakBytes, shot.vfxPeakBytes, shot.nativeLoads, shot.vfxPrepares,
    shot.maxCanvasDrawMs ?? '', shot.longTasks, shot.longTaskMs,
  ]
  return [headers.join(','), ...shots.map(shot => cells(shot).join(','))].join('\n') + '\n'
}
