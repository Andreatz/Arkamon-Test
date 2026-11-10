export interface BattleVisualSequenceOptions {
  waitForAttacker: boolean
  waitForTarget: boolean
  onRelease: () => void
  onImpact: () => void
  onComplete: () => void
}

/** Align the defender's native reaction pose with the attack effect's impact. */
export function planBattleAnimationPlayback(attackReleaseMs: number, hitReactionMs: number, vfxImpactMs: number, reducedMotion = false) {
  if (reducedMotion) return { attackerAtMs: 0, hitAtMs: 0, vfxAtMs: 0, impactAtMs: 0 }
  const releaseMs = Math.max(0, Number.isFinite(attackReleaseMs) ? attackReleaseMs : 0)
  const reactionMs = Math.max(0, Number.isFinite(hitReactionMs) ? hitReactionMs : 0)
  const impactMs = Math.max(0, Number.isFinite(vfxImpactMs) ? vfxImpactMs : 0)
  const attackerAtMs = Math.max(0, reactionMs - releaseMs - impactMs)
  const vfxAtMs = attackerAtMs + releaseMs
  const impactAtMs = vfxAtMs + impactMs
  return {
    attackerAtMs,
    hitAtMs: impactAtMs - reactionMs,
    vfxAtMs,
    impactAtMs,
  }
}

export interface BattleAnimationPlaybackOptions {
  plan: ReturnType<typeof planBattleAnimationPlayback>
  dedicatedAttack: boolean
  dedicatedHit: boolean
  startAttack: () => void
  startHit: () => void
  onRelease: () => void
  schedule: (callback: () => void, delayMs: number) => void
}

/** Start the other native clip from the first clip's actual ready/playback clock. */
export function createBattleAnimationPlayback(options: BattleAnimationPlaybackOptions) {
  let active = true
  let attackerStarted = false
  let hitStarted = false
  let released = false
  const { plan } = options
  const schedule = (callback: () => void, delayMs: number) => {
    options.schedule(() => { if (active) callback() }, Math.max(0, delayMs))
  }
  const release = () => {
    if (!active || released) return
    released = true
    options.onRelease()
  }
  const startHit = () => {
    if (!active || hitStarted || !options.dedicatedHit) return
    hitStarted = true
    options.startHit()
  }
  const startAttack = () => {
    if (!active || attackerStarted) return
    attackerStarted = true
    options.startAttack()
    if (!options.dedicatedAttack) release()
  }
  return {
    start: () => {
      if (!active) return
      if (plan.attackerAtMs > 0 && options.dedicatedHit) startHit()
      else startAttack()
    },
    attackerStart: () => {
      if (!active || !options.dedicatedAttack || hitStarted || !options.dedicatedHit) return
      schedule(startHit, plan.hitAtMs - plan.attackerAtMs)
    },
    targetStart: () => {
      if (!active || attackerStarted) return
      schedule(startAttack, plan.attackerAtMs - plan.hitAtMs)
    },
    vfxStart: () => {
      if (!active || options.dedicatedAttack || hitStarted || !options.dedicatedHit) return
      schedule(startHit, plan.hitAtMs - plan.vfxAtMs)
    },
    release,
    cancel: () => { active = false },
  }
}

export type BattleAnimationPlayback = ReturnType<typeof createBattleAnimationPlayback>

/** Coordinate completed clips, rather than guessing when an unloaded clip ends. */
export function createBattleVisualSequence(options: BattleVisualSequenceOptions) {
  let active = true
  let released = false
  let impacted = false
  let attackerFinished = !options.waitForAttacker
  let targetFinished = !options.waitForTarget
  let vfxFinished = false
  let completed = false

  const advance = () => {
    if (!active || completed || !impacted || !attackerFinished || !targetFinished || !vfxFinished) return
    completed = true
    options.onComplete()
  }

  const release = () => {
    if (!active || released) return
    released = true
    options.onRelease()
  }

  const impact = () => {
    if (!active || !released || impacted) return
    impacted = true
    options.onImpact()
    advance()
  }

  return {
    release,
    impact,
    attackerComplete: () => {
      if (!active || completed) return
      attackerFinished = true
      // A failed or reduced-motion attacker must not suppress the move itself.
      release()
      advance()
    },
    targetComplete: () => {
      if (!active || completed) return
      targetFinished = true
      advance()
    },
    vfxComplete: () => {
      if (!active || completed || !released) return
      vfxFinished = true
      // Failed effects still resolve their single impact and release the turn.
      impact()
      advance()
    },
    cancel: () => { active = false },
  }
}

export type BattleVisualSequence = ReturnType<typeof createBattleVisualSequence>

export interface BattleDamageRevealOptions {
  waitForTargetKO: boolean
  onReveal: () => void
  onComplete: () => void
}

/** Keep damage and KO hidden until the dice result is painted, then finish both presentations. */
export function createBattleDamageReveal(options: BattleDamageRevealOptions) {
  let active = true
  let revealed = false
  let diceFinished = false
  let targetFinished = !options.waitForTargetKO
  let completed = false

  const advance = () => {
    if (!active || completed || !revealed || !diceFinished || !targetFinished) return
    completed = true
    options.onComplete()
  }

  return {
    diceVisible: () => {
      if (!active || revealed) return
      revealed = true
      options.onReveal()
      advance()
    },
    diceComplete: () => {
      if (!active || completed) return
      diceFinished = true
      advance()
    },
    targetKOComplete: () => {
      if (!active || completed) return
      targetFinished = true
      advance()
    },
    cancel: () => { active = false },
  }
}
