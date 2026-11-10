import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBattlePresentationDirector,
  type BattleDirectorPhase,
  type BattlePresentationDirectorOptions,
} from './battlePresentationDirector'

type AttackCues = Parameters<BattlePresentationDirectorOptions['startAttack']>[0]
type HitCues = Parameters<BattlePresentationDirectorOptions['startHit']>[0]
type VfxCues = Parameters<BattlePresentationDirectorOptions['startVfx']>[0]

function createHarness(overrides: Partial<BattlePresentationDirectorOptions> = {}) {
  const events: string[] = []
  const phases: BattleDirectorPhase[] = []
  const attack: AttackCues[] = []
  const target: HitCues[] = []
  const vfx: VfxCues[] = []
  const onImpact = vi.fn()
  const onComplete = vi.fn()
  const schedule = vi.fn((callback: () => void, delayMs: number) => {
    const timeout = setTimeout(callback, delayMs)
    return () => clearTimeout(timeout)
  })
  const options: BattlePresentationDirectorOptions = {
    attackReleaseMs: 2000,
    hitReactionMs: 1250,
    vfxImpactMs: 400,
    reducedMotion: false,
    dedicatedAttack: true,
    dedicatedHit: true,
    schedule,
    startAttack: (cues) => { attack.push(cues); events.push('attack') },
    startHit: (cues) => { target.push(cues); events.push('hit') },
    startVfx: (cues) => { vfx.push(cues); events.push('vfx') },
    onImpact: () => { events.push('damage-impact'); onImpact() },
    onComplete: () => { events.push('visual-done'); onComplete() },
    onPhase: phase => { phases.push(phase) },
    ...overrides,
  }
  const director = createBattlePresentationDirector(options)
  return { director, options, events, phases, attack, target, vfx, onImpact, onComplete, schedule }
}

describe('Battle Presentation Director', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('owns release → VFX → impact → visual completion exactly once, without touching game state', () => {
    const run = createHarness()
    expect(run.director.getPhase()).toBe('preparing')
    expect(run.attack).toHaveLength(0)
    run.director.start()
    run.director.start()
    expect(run.attack).toHaveLength(1)
    expect(run.events).toEqual(['attack'])
    run.attack[0].onStarted()
    vi.advanceTimersByTime(1150)
    expect(run.target).toHaveLength(1)
    run.target[0].onStarted()
    run.attack[0].onRelease()
    run.attack[0].onRelease()
    expect(run.vfx).toHaveLength(1)
    expect(run.director.getPhase()).toBe('released')
    run.vfx[0].onStarted()
    run.vfx[0].onImpact()
    run.vfx[0].onImpact()
    expect(run.onImpact).toHaveBeenCalledTimes(1)
    expect(run.onComplete).not.toHaveBeenCalled()
    run.attack[0].onFinished()
    run.vfx[0].onFinished()
    expect(run.onComplete).not.toHaveBeenCalled()
    run.target[0].onFinished()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
    expect(run.director.getPhase()).toBe('visual-complete')
    run.vfx[0].onImpact()
    run.target[0].onFinished()
    expect(run.onImpact).toHaveBeenCalledTimes(1)
    expect(run.onComplete).toHaveBeenCalledTimes(1)
    expect(run.phases).toEqual(['windup', 'released', 'impact', 'visual-complete'])
  })

  it('prerolls the target when its hit pose needs more lead than the attack cue', () => {
    const run = createHarness({ attackReleaseMs: 0, hitReactionMs: 1250, vfxImpactMs: 400, dedicatedAttack: false })
    expect(run.director.plan).toEqual({ attackerAtMs: 850, hitAtMs: 0, vfxAtMs: 850, impactAtMs: 1250 })
    run.director.start()
    expect(run.target).toHaveLength(1)
    expect(run.attack).toHaveLength(0)
    run.target[0].onStarted()
    vi.advanceTimersByTime(849)
    expect(run.attack).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(run.attack).toHaveLength(1)
    // The static attack releases immediately, preserving the old visual cue.
    expect(run.vfx).toHaveLength(1)
    run.vfx[0].onImpact()
    run.vfx[0].onFinished()
    expect(run.onComplete).not.toHaveBeenCalled()
    run.target[0].onFinished()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not release or settle before the native attack is ready', () => {
    const run = createHarness()
    run.director.start()
    vi.advanceTimersByTime(7000)
    expect(run.vfx).toHaveLength(0)
    expect(run.target).toHaveLength(0)
    expect(run.onComplete).not.toHaveBeenCalled()
    run.attack[0].onStarted()
    vi.advanceTimersByTime(1150)
    expect(run.target).toHaveLength(1)
  })

  it('fails open from a missing native attack and a failed effect but only once', () => {
    const run = createHarness({ dedicatedHit: false })
    run.director.start()
    run.attack[0].onFinished()
    run.attack[0].onFinished()
    expect(run.vfx).toHaveLength(1)
    run.vfx[0].onFinished()
    run.vfx[0].onFinished()
    expect(run.onImpact).toHaveBeenCalledTimes(1)
    expect(run.onComplete).toHaveBeenCalledTimes(1)
    run.attack[0].onRelease()
    expect(run.vfx).toHaveLength(1)
  })

  it('cancels pending timers and makes all obsolete media callbacks inert', () => {
    const run = createHarness({ attackReleaseMs: 300, hitReactionMs: 1400, vfxImpactMs: 500 })
    run.director.start()
    expect(run.target).toHaveLength(1)
    run.target[0].onStarted()
    expect(run.schedule).toHaveBeenCalledTimes(1)
    run.director.cancel()
    run.director.cancel()
    vi.advanceTimersByTime(3000)
    expect(run.attack).toHaveLength(0)
    run.target[0].onFinished()
    expect(run.vfx).toHaveLength(0)
    expect(run.onImpact).not.toHaveBeenCalled()
    expect(run.onComplete).not.toHaveBeenCalled()
    expect(run.director.getPhase()).toBe('cancelled')
    expect(run.phases).toEqual(['cancelled'])
  })

  it('cancels after release without letting an old VFX affect the next turn', () => {
    const run = createHarness({ dedicatedHit: false })
    run.director.start()
    run.attack[0].onRelease()
    run.director.cancel()
    run.vfx[0].onImpact()
    run.vfx[0].onFinished()
    run.attack[0].onFinished()
    expect(run.onImpact).not.toHaveBeenCalled()
    expect(run.onComplete).not.toHaveBeenCalled()
  })

  it('honors reduced-motion zero-delay cues and still requires the actual effect completion', () => {
    const run = createHarness({
      reducedMotion: true,
      dedicatedAttack: false,
      dedicatedHit: false,
    })
    expect(run.director.plan).toEqual({ attackerAtMs: 0, hitAtMs: 0, vfxAtMs: 0, impactAtMs: 0 })
    run.director.start()
    expect(run.attack).toHaveLength(1)
    expect(run.vfx).toHaveLength(1)
    expect(run.onComplete).not.toHaveBeenCalled()
    run.vfx[0].onFinished()
    expect(run.onImpact).toHaveBeenCalledTimes(1)
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not allow starting a cancelled or completed instance', () => {
    const run = createHarness({ dedicatedAttack: false, dedicatedHit: false })
    run.director.cancel()
    run.director.start()
    expect(run.attack).toHaveLength(0)
    const next = createHarness({ dedicatedAttack: false, dedicatedHit: false })
    next.director.start()
    next.vfx[0].onFinished()
    next.director.start()
    expect(next.attack).toHaveLength(1)
    expect(next.onComplete).toHaveBeenCalledTimes(1)
  })
})
