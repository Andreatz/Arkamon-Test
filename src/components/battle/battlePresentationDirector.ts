import {
  createBattleAnimationPlayback,
  createBattleVisualSequence,
  planBattleAnimationPlayback,
} from './battleVisualSequence'

/**
 * Presentation-only orchestration. No dice, HP, turn order, persistence, or
 * random values are handled here. All timestamps are presentation cues.
 */
export type BattleDirectorPhase =
  | 'preparing'
  | 'windup'
  | 'released'
  | 'impact'
  | 'visual-complete'
  | 'cancelled'

type AttackCues = {
  onStarted: () => void
  onRelease: () => void
  onFinished: () => void
}

type HitCues = {
  onStarted: () => void
  onFinished: () => void
}

type VfxCues = {
  onStarted: () => void
  onImpact: () => void
  onFinished: () => void
}

export interface BattlePresentationDirectorOptions {
  attackReleaseMs: number
  hitReactionMs: number
  vfxImpactMs: number
  reducedMotion: boolean
  dedicatedAttack: boolean
  dedicatedHit: boolean
  /**
   * Scheduling returns a disposer when possible. A cancelled battle invalidates
   * its callbacks even if the underlying timer has already been queued.
   */
  schedule: (callback: () => void, delayMs: number) => (() => void) | void
  startAttack: (cues: AttackCues) => void
  startHit: (cues: HitCues) => void
  startVfx: (cues: VfxCues) => void
  onImpact: () => void
  onComplete: () => void
  onPhase?: (phase: BattleDirectorPhase) => void
}

/**
 * Owns the entire native clip → move VFX → target reaction visual handshake.
 * The caller owns React DOM/animations, and decides what to do after the visuals
 * complete (for example, displaying dice and revealing HP).
 */
export function createBattlePresentationDirector(options: BattlePresentationDirectorOptions) {
  const plan = planBattleAnimationPlayback(
    options.attackReleaseMs,
    options.hitReactionMs,
    options.vfxImpactMs,
    options.reducedMotion,
  )
  let active = true
  let started = false
  let phase: BattleDirectorPhase = 'preparing'
  const pending = new Set<() => void>()
  const notify = (next: BattleDirectorPhase) => {
    if (phase === next) return
    phase = next
    options.onPhase?.(next)
  }
  const whileActive = (callback: () => void) => () => {
    if (active) callback()
  }
  const clearPending = () => {
    for (const dispose of pending) dispose()
    pending.clear()
  }

  const sequence = createBattleVisualSequence({
    waitForAttacker: options.dedicatedAttack,
    waitForTarget: options.dedicatedHit,
    onRelease: () => {
      if (!active) return
      notify('released')
      options.startVfx({
        onStarted: whileActive(() => playback.vfxStart()),
        onImpact: whileActive(() => sequence.impact()),
        onFinished: whileActive(() => sequence.vfxComplete()),
      })
    },
    onImpact: () => {
      if (!active) return
      notify('impact')
      options.onImpact()
    },
    onComplete: () => {
      if (!active) return
      notify('visual-complete')
      active = false
      playback.cancel()
      clearPending()
      options.onComplete()
    },
  })

  const playback = createBattleAnimationPlayback({
    plan,
    dedicatedAttack: options.dedicatedAttack,
    dedicatedHit: options.dedicatedHit,
    schedule: (callback, delayMs) => {
      let dispose: (() => void) | undefined
      const scheduled = options.schedule(() => {
        if (dispose) pending.delete(dispose)
        if (active) callback()
      }, delayMs)
      if (typeof scheduled === 'function') {
        dispose = scheduled
        if (active) pending.add(dispose)
        else dispose()
      }
    },
    startAttack: () => {
      if (!active) return
      notify('windup')
      options.startAttack({
        onStarted: whileActive(() => playback.attackerStart()),
        onRelease: whileActive(() => playback.release()),
        onFinished: whileActive(() => {
          // The native clip may fail: completion still releases its move once.
          playback.release()
          sequence.attackerComplete()
        }),
      })
    },
    startHit: () => {
      if (!active) return
      options.startHit({
        onStarted: whileActive(() => playback.targetStart()),
        onFinished: whileActive(() => {
          playback.targetStart()
          sequence.targetComplete()
        }),
      })
    },
    onRelease: () => sequence.release(),
  })

  return {
    plan,
    getPhase: () => phase,
    start: () => {
      if (!active || started) return
      started = true
      playback.start()
    },
    cancel: () => {
      if (!active) return
      active = false
      playback.cancel()
      sequence.cancel()
      clearPending()
      notify('cancelled')
    },
  }
}

export type BattlePresentationDirector = ReturnType<typeof createBattlePresentationDirector>
