import { getPreparedImageStats } from '@/utils/prepareImageAsset'
import { nativeSpritePageCache } from '@/utils/spritePageCache'
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
  battlePresent: boolean
  lastSample: BattleProfileSample | null
  error: string | null
}

const EMPTY: BattleProfilerSnapshot = {
  status: 'idle', startedAt: null, durationMs: 0, sampleCount: 0,
  eventCount: 0, battlePresent: false, lastSample: null, error: null,
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
  private observedStage: Element | null = null
  private mutationObserver: MutationObserver | null = null
  private taskObserver: PerformanceObserver | null = null
  private currentMarker = ''

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

  private recordCue() {
    if (!this.observedStage || this.state.status !== 'recording') return
    const camera = this.observedStage.querySelector('[data-battle-camera]')
    const event: BattleProfileEvent = {
      atMs: Math.round(performance.now() - this.startedAtMs),
      phase: this.observedStage.getAttribute('data-battle-director-phase') ?? 'unknown',
      cameraBeat: camera?.getAttribute('data-battle-camera-beat') ?? 'unknown',
      choreography: camera?.getAttribute('data-battle-camera-choreography') ?? 'none',
    }
    const marker = [event.phase, event.cameraBeat, event.choreography].join('|')
    if (marker === this.currentMarker) return
    this.currentMarker = marker
    this.events.push(event)
    if (this.events.length > MAX_PROFILE_EVENTS) this.events.shift()
  }

  private watchBattle(stage: Element | null) {
    if (stage === this.observedStage) return
    this.mutationObserver?.disconnect()
    this.mutationObserver = null
    this.observedStage = stage
    this.currentMarker = ''
    if (!stage) return
    this.mutationObserver = new MutationObserver(() => this.recordCue())
    this.mutationObserver.observe(stage, {
      attributes: true, subtree: true,
      attributeFilter: ['data-battle-director-phase', 'data-battle-camera-beat', 'data-battle-camera-choreography'],
    })
    this.recordCue()
  }

  private capture(atMs: number) {
    const stage = document.querySelector('[data-battle-director-phase]')
    this.watchBattle(stage)
    const images = getPreparedImageStats()
    const pages = nativeSpritePageCache.stats()
    const drawElements = stage ? [...stage.querySelectorAll('[data-sprite-draw-ms]')] : []
    const drawTimes = drawElements
      .map(element => Number(element.getAttribute('data-sprite-draw-ms')))
      .filter(value => Number.isFinite(value) && value >= 0)
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
      if (delta > 0 && delta <= 250) this.frameIntervals.push(delta)
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
    this.frameIntervals = []
    this.longTaskCount = 0
    this.longTaskMs = 0
    this.previousFrameAt = 0
    this.startedAtMs = performance.now()
    this.lastSampleAt = this.startedAtMs
    this.startedAtUtc = new Date().toISOString()
    this.stoppedAtUtc = null
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
    this.startedAtUtc = null
    this.stoppedAtUtc = null
    this.publish(EMPTY)
  }

  report(): BattleProfileReport | null {
    if (!this.startedAtUtc) return null
    return createBattleProfileReport(this.startedAtUtc, this.stoppedAtUtc,
      this.state.durationMs, this.samples, this.events)
  }

  download(format: 'json' | 'csv'): boolean {
    const report = this.report()
    if (!report || !report.samples.length || typeof document === 'undefined') return false
    const payload = format === 'json' ? JSON.stringify(report, null, 2) + '\n' : battleProfileCsv(report.samples)
    const blob = new Blob([payload], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'arkamon-battle-profile-' + report.startedAt.replace(/[:.]/g, '-') + '.' + format
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  }
}

export const battleProfiler = new BattleProfiler()
