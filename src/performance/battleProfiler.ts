import { getPreparedImageStats } from '@/utils/prepareImageAsset'
import { nativeSpritePageCache } from '@/utils/spritePageCache'
import {
  MAX_BATTLE_SHOTS, MAX_SHOT_FRAMES, battleShotCsv, finalizeBattleShot,
  parseBattleShotIdentity, shotIdentityKey, type BattleShotBenchmark, type BattleShotIdentity,
} from './battleShotBenchmark'
import {
  MAX_PROFILE_EVENTS, MAX_PROFILE_SAMPLES, battleProfileCsv, createBattleProfileReport,
  summarizeFrameIntervals, type BattleProfileEvent, type BattleProfileReport,
  type BattleProfileSample,
} from './battleProfilerModel'

export interface BattleProfilerSnapshot {
  status: 'idle' | 'recording' | 'stopped'
  startedAt: string | null
  durationMs: number
  sampleCount: number
  eventCount: number
  shotCount: number
  battlePresent: boolean
  lastSample: BattleProfileSample | null
  error: string | null
}

const EMPTY: BattleProfilerSnapshot = {
  status: 'idle', startedAt: null, durationMs: 0, sampleCount: 0,
  eventCount: 0, shotCount: 0, battlePresent: false, lastSample: null, error: null,
}

interface ActiveShot {
  identity: BattleShotIdentity
  attempt: number
  startedAtMs: number
  intervals: number[]
  baselineNativeLoads: number
  baselineVfxPrepares: number
  nativePeakBytes: number
  vfxPeakBytes: number
  maxCanvasDrawMs: number | null
  longTasks: number
  longTaskMs: number
}

class BattleProfiler {
  private listeners = new Set<() => void>()
  private state: BattleProfilerSnapshot = EMPTY
  private raf = 0
  private startedAtMs = 0
  private startedAtUtc: string | null = null
  private stoppedAtUtc: string | null = null
  private previousFrameAt = 0
  private lastSampleAt = 0
  private frameIntervals: number[] = []
  private longTaskCount = 0
  private longTaskMs = 0
  private samples: BattleProfileSample[] = []
  private events: BattleProfileEvent[] = []
  private shots: BattleShotBenchmark[] = []
  private activeShot: ActiveShot | null = null
  private attemptCounts = new Map<string, number>()
  private seenSequences = new Set<number>()
  private observedStage: Element | null = null
  private mutationObserver: MutationObserver | null = null
  private taskObserver: PerformanceObserver | null = null
  private currentMarker = ''
  private observedNativeLoads = 0
  private observedVfxPrepares = 0

  /** Stable reference required by useSyncExternalStore. */
  getSnapshot = (): BattleProfilerSnapshot => this.state
  subscribe = (callback: () => void): (() => void) => {
    this.listeners.add(callback)
    return () => { this.listeners.delete(callback) }
  }

  private publish(patch: Partial<BattleProfilerSnapshot>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private updateShotResources(
    pages = nativeSpritePageCache.stats(),
    images = getPreparedImageStats(),
    drawMs: number | null = null,
  ) {
    const shot = this.activeShot
    if (!shot) return
    shot.nativePeakBytes = Math.max(shot.nativePeakBytes, pages.decodedBytes)
    shot.vfxPeakBytes = Math.max(shot.vfxPeakBytes, images.decodedBytes)
    if (drawMs !== null) shot.maxCanvasDrawMs = Math.max(shot.maxCanvasDrawMs ?? 0, drawMs)
  }

  private finishShot(outcome: BattleShotBenchmark['outcome']) {
    const shot = this.activeShot
    if (!shot) return
    this.updateShotResources()
    const pages = nativeSpritePageCache.stats()
    const images = getPreparedImageStats()
    this.shots.push(finalizeBattleShot({
      identity: shot.identity,
      attempt: shot.attempt,
      startedAtMs: shot.startedAtMs,
      endedAtMs: Math.max(shot.startedAtMs, performance.now() - this.startedAtMs),
      outcome,
      intervals: shot.intervals,
      nativePeakBytes: shot.nativePeakBytes,
      vfxPeakBytes: shot.vfxPeakBytes,
      nativeLoads: pages.completedPageLoads - shot.baselineNativeLoads,
      vfxPrepares: images.completedPrepares - shot.baselineVfxPrepares,
      maxCanvasDrawMs: shot.maxCanvasDrawMs,
      longTasks: shot.longTasks,
      longTaskMs: shot.longTaskMs,
    }))
    if (this.shots.length > MAX_BATTLE_SHOTS) this.shots.shift()
    this.activeShot = null
    this.publish({ shotCount: this.shots.length })
  }

  private trackShot(stage: Element, phase: string) {
    const identity = parseBattleShotIdentity(stage)
    if (!identity) return
    if (this.activeShot && this.activeShot.identity.sequence !== identity.sequence) this.finishShot('interrupted')
    if (!this.activeShot && !this.seenSequences.has(identity.sequence)
      && phase !== 'idle' && phase !== 'visual-complete' && phase !== 'cancelled') {
      const key = shotIdentityKey(identity)
      const attempt = (this.attemptCounts.get(key) ?? 0) + 1
      this.attemptCounts.set(key, attempt)
      this.seenSequences.add(identity.sequence)
      const pages = nativeSpritePageCache.stats()
      const images = getPreparedImageStats()
      this.activeShot = {
        identity, attempt, startedAtMs: Math.max(0, performance.now() - this.startedAtMs),
        intervals: [], baselineNativeLoads: pages.completedPageLoads,
        baselineVfxPrepares: images.completedPrepares,
        nativePeakBytes: pages.decodedBytes, vfxPeakBytes: images.decodedBytes,
        maxCanvasDrawMs: null, longTasks: 0, longTaskMs: 0,
      }
    }
    if (this.activeShot?.identity.sequence === identity.sequence
      && (phase === 'visual-complete' || phase === 'cancelled'))
      this.finishShot(phase === 'visual-complete' ? 'complete' : 'interrupted')
  }

  private recordCue() {
    if (!this.observedStage || this.state.status !== 'recording') return
    const phase = this.observedStage.getAttribute('data-battle-director-phase') ?? 'unknown'
    this.trackShot(this.observedStage, phase)
    const camera = this.observedStage.querySelector('[data-battle-camera]')
    const event: BattleProfileEvent = {
      atMs: Math.round(performance.now() - this.startedAtMs),
      phase,
      cameraBeat: camera?.getAttribute('data-battle-camera-beat') ?? 'unknown',
      choreography: camera?.getAttribute('data-battle-camera-choreography') ?? 'none',
    }
    const marker = [
      this.observedStage.getAttribute('data-battle-profile-sequence') ?? '0',
      event.phase, event.cameraBeat, event.choreography,
    ].join('|')
    if (marker === this.currentMarker) return
    this.currentMarker = marker
    this.events.push(event)
    if (this.events.length > MAX_PROFILE_EVENTS) this.events.shift()
  }

  private watchBattle(stage: Element | null) {
    if (stage === this.observedStage) return
    this.mutationObserver?.disconnect()
    this.mutationObserver = null
    this.finishShot('interrupted')
    this.seenSequences.clear()
    this.observedStage = stage
    this.currentMarker = ''
    if (!stage) return
    this.mutationObserver = new MutationObserver(() => this.recordCue())
    this.mutationObserver.observe(stage, {
      attributes: true, subtree: true,
      attributeFilter: [
        'data-battle-director-phase', 'data-battle-camera-beat',
        'data-battle-camera-choreography', 'data-battle-profile-sequence',
      ],
    })
    this.recordCue()
  }

  private capture(atMs: number) {
    const stage = document.querySelector('[data-battle-director-phase]')
    this.watchBattle(stage)
    const images = getPreparedImageStats()
    const pages = nativeSpritePageCache.stats()
    const nativeLoads = Math.max(0, pages.completedPageLoads - this.observedNativeLoads)
    const vfxPrepares = Math.max(0, images.completedPrepares - this.observedVfxPrepares)
    this.observedNativeLoads = pages.completedPageLoads
    this.observedVfxPrepares = images.completedPrepares
    const drawElements = stage ? [...stage.querySelectorAll('[data-sprite-draw-ms]')] : []
    const drawTimes = drawElements
      .map(element => Number(element.getAttribute('data-sprite-draw-ms')))
      .filter(value => Number.isFinite(value) && value >= 0)
    this.updateShotResources(pages, images,
      drawTimes.length ? Math.max(...drawTimes) : null)
    const sample: BattleProfileSample = {
      atMs: Math.round(atMs),
      frames: summarizeFrameIntervals(this.frameIntervals),
      activeBattle: Boolean(stage),
      nativeBytes: pages.decodedBytes,
      nativeBudgetBytes: pages.budgetBytes,
      vfxBytes: images.decodedBytes,
      vfxBudgetBytes: images.budgetBytes,
      nativeDecodes: pages.activeDecodes,
      peakNativeDecodes: pages.peakDecodes,
      nativeLoads,
      nativeLoadLastMs: nativeLoads ? pages.lastPageLoadMs : null,
      vfxPrepares,
      vfxPrepareLastMs: vfxPrepares ? images.lastPrepareMs : null,
      pagedRenderers: stage?.querySelectorAll('[data-sprite-renderer="paged-canvas"]').length ?? 0,
      atlasRenderers: stage?.querySelectorAll('[data-sprite-renderer="canvas"]').length ?? 0,
      lastCanvasDrawMs: drawTimes.length ? Math.max(...drawTimes) : null,
      longTasks: this.longTaskCount,
      longTaskMs: Math.round(this.longTaskMs),
    }
    this.frameIntervals = []
    this.longTaskCount = 0
    this.longTaskMs = 0
    this.samples.push(sample)
    if (this.samples.length > MAX_PROFILE_SAMPLES) this.samples.shift()
    this.publish({
      durationMs: atMs, sampleCount: this.samples.length,
      eventCount: this.events.length, battlePresent: !!stage, lastSample: sample,
    })
  }

  private nextFrame = (timestamp: number) => {
    if (this.state.status !== 'recording') return
    const stagePresent = Boolean(this.observedStage)
    // A hidden tab does not render at native cadence. Never turn suspension
    // into fictitious missed frames or a huge spike in the FPS graph.
    if (stagePresent && !document.hidden && this.previousFrameAt) {
      const delta = timestamp - this.previousFrameAt
      if (delta > 0 && delta <= 250) {
        this.frameIntervals.push(delta)
        if (this.activeShot) {
          this.activeShot.intervals.push(delta)
          if (this.activeShot.intervals.length > MAX_SHOT_FRAMES) this.activeShot.intervals.shift()
        }
      }
    }
    this.previousFrameAt = document.hidden || !stagePresent ? 0 : timestamp
    if (timestamp - this.lastSampleAt >= 500) {
      this.lastSampleAt = timestamp
      this.capture(performance.now() - this.startedAtMs)
    }
    this.raf = requestAnimationFrame(this.nextFrame)
  }

  start(): boolean {
    if (this.state.status === 'recording') return true
    const stage = typeof document !== 'undefined' ? document.querySelector('[data-battle-director-phase]') : null
    if (!stage) {
      this.publish({ error: 'Apri una battaglia prima di iniziare la registrazione.', battlePresent: false })
      return false
    }
    this.samples = []
    this.events = []
    this.shots = []
    this.activeShot = null
    this.attemptCounts.clear()
    this.seenSequences.clear()
    this.frameIntervals = []
    this.longTaskCount = 0
    this.longTaskMs = 0
    this.previousFrameAt = 0
    this.startedAtMs = performance.now()
    this.lastSampleAt = this.startedAtMs
    this.startedAtUtc = new Date().toISOString()
    this.stoppedAtUtc = null
    this.observedNativeLoads = nativeSpritePageCache.stats().completedPageLoads
    this.observedVfxPrepares = getPreparedImageStats().completedPrepares
    this.publish({ ...EMPTY, status: 'recording', startedAt: this.startedAtUtc, battlePresent: true })
    this.watchBattle(stage)
    if (typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      try {
        this.taskObserver = new PerformanceObserver(list => {
          if (this.state.status !== 'recording') return
          for (const entry of list.getEntries()) {
            this.longTaskCount++
            this.longTaskMs += entry.duration
            if (this.activeShot) {
              this.activeShot.longTasks++
              this.activeShot.longTaskMs += entry.duration
            }
          }
        })
        this.taskObserver.observe({ entryTypes: ['longtask'] })
      } catch { this.taskObserver = null }
    }
    this.raf = requestAnimationFrame(this.nextFrame)
    return true
  }

  stop() {
    if (this.state.status !== 'recording') return
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.taskObserver?.disconnect()
    this.taskObserver = null
    const elapsed = performance.now() - this.startedAtMs
    this.capture(elapsed)
    this.finishShot('interrupted')
    this.mutationObserver?.disconnect()
    this.mutationObserver = null
    this.observedStage = null
    this.stoppedAtUtc = new Date().toISOString()
    this.publish({ status: 'stopped', durationMs: Math.round(elapsed) })
  }

  reset() {
    if (this.state.status === 'recording') this.stop()
    this.samples = []
    this.events = []
    this.shots = []
    this.activeShot = null
    this.attemptCounts.clear()
    this.seenSequences.clear()
    this.startedAtUtc = null
    this.stoppedAtUtc = null
    this.publish(EMPTY)
  }

  report(): BattleProfileReport | null {
    if (!this.startedAtUtc) return null
    return createBattleProfileReport(this.startedAtUtc, this.stoppedAtUtc,
      this.state.durationMs, this.samples, this.events, this.shots)
  }

  download(format: 'json' | 'csv' | 'shots-csv'): boolean {
    const report = this.report()
    if (!report || (format === 'shots-csv' ? !report.shots.length : !report.samples.length)
      || typeof document === 'undefined') return false
    const payload = format === 'json' ? JSON.stringify(report, null, 2) + '\n'
      : format === 'shots-csv' ? battleShotCsv(report.shots)
      : battleProfileCsv(report.samples)
    const blob = new Blob([payload], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'arkamon-battle-' + (format === 'shots-csv' ? 'attacks' : 'profile')
      + '-' + report.startedAt.replace(/[:.]/g, '-')
      + '.' + (format === 'json' ? 'json' : 'csv')
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  }
}

export const battleProfiler = new BattleProfiler()
