import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBattleAnimationPlayback,
  createBattleDamageReveal,
  createBattleVisualSequence,
  planBattleAnimationPlayback,
} from './battleVisualSequence'
import { createBattleDiceReveal } from './battleDiceReveal'
import {
  calcolaAzioneSuprema,
  calcolaHPMax,
  esitoSquadre,
  risolviAttaccanteDopoMossa,
} from '@engine/battleEngine'
import type { PokemonIstanza } from '@/types'

function sequence(waitForAttacker = true, waitForTarget = true) {
  const callbacks = { onRelease: vi.fn(), onImpact: vi.fn(), onComplete: vi.fn() }
  return { ...callbacks, ...createBattleVisualSequence({ waitForAttacker, waitForTarget, ...callbacks }) }
}

describe('battle visuals before the dice', () => {
  it('releases the move at the actual attack cue, with no duplicate impact or dice', () => {
    const run = sequence()
    run.release()
    run.release()
    expect(run.onRelease).toHaveBeenCalledTimes(1)
    run.impact()
    run.impact()
    expect(run.onImpact).toHaveBeenCalledTimes(1)
    run.attackerComplete()
    run.vfxComplete()
    expect(run.onComplete).not.toHaveBeenCalled()
    run.targetComplete()
    run.targetComplete()
    run.vfxComplete()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('waits for the complete defender film when the attacker and VFX finish first', () => {
    const run = sequence()
    run.release()
    run.impact()
    run.attackerComplete()
    run.vfxComplete()
    expect(run.onComplete).not.toHaveBeenCalled()
    run.targetComplete()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('waits for a late loaded attack after the defender and effect complete', () => {
    const run = sequence()
    run.release()
    run.impact()
    run.targetComplete()
    run.vfxComplete()
    expect(run.onComplete).not.toHaveBeenCalled()
    run.attackerComplete()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('continues through a failed attack and VFX without applying damage twice', () => {
    const run = sequence()
    run.attackerComplete()
    expect(run.onRelease).toHaveBeenCalledTimes(1)
    run.vfxComplete()
    expect(run.onImpact).toHaveBeenCalledTimes(1)
    expect(run.onComplete).not.toHaveBeenCalled()
    run.targetComplete()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('uses the same impact ordering for static sprites, without waiting for absent films', () => {
    const run = sequence(false, false)
    run.vfxComplete()
    run.impact()
    expect(run.onImpact).not.toHaveBeenCalled()
    run.release()
    run.impact()
    expect(run.onComplete).not.toHaveBeenCalled()
    run.vfxComplete()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('ignores late media callbacks after unmount or interruption', () => {
    const run = sequence()
    run.release()
    run.cancel()
    run.impact()
    run.attackerComplete()
    run.targetComplete()
    run.vfxComplete()
    expect(run.onRelease).toHaveBeenCalledTimes(1)
    expect(run.onImpact).not.toHaveBeenCalled()
    expect(run.onComplete).not.toHaveBeenCalled()
  })
})

describe('native attack and hit pose alignment', () => {
  it('starts the defender early enough to reach its reaction pose at VFX impact', () => {
    const plan = planBattleAnimationPlayback(2000, 1250, 400)
    expect(plan).toEqual({ attackerAtMs: 0, hitAtMs: 1150, vfxAtMs: 2000, impactAtMs: 2400 })
    expect(plan.hitAtMs + 1250).toBe(plan.impactAtMs)
  })

  it('prerolls the defender when the attacker has no dedicated attack clip', () => {
    const plan = planBattleAnimationPlayback(0, 1250, 400)
    expect(plan).toEqual({ attackerAtMs: 850, hitAtMs: 0, vfxAtMs: 850, impactAtMs: 1250 })
    expect(plan.hitAtMs + 1250).toBe(plan.impactAtMs)
  })

  it('delays both attack and VFX if the reaction lead exceeds the attack preparation', () => {
    const plan = planBattleAnimationPlayback(250, 1250, 400)
    expect(plan).toEqual({ attackerAtMs: 600, hitAtMs: 0, vfxAtMs: 850, impactAtMs: 1250 })
  })

  it('places feedback without a native reaction lead at impact', () => {
    expect(planBattleAnimationPlayback(2000, 0, 400)).toEqual({
      attackerAtMs: 0, hitAtMs: 2400, vfxAtMs: 2000, impactAtMs: 2400,
    })
  })

  it('keeps direct static feedback at the actual effect impact', () => {
    expect(planBattleAnimationPlayback(0, 0, 400)).toEqual({
      attackerAtMs: 0, hitAtMs: 400, vfxAtMs: 0, impactAtMs: 400,
    })
  })
})

describe('ready native clocks', () => {
  function playback(attackReleaseMs: number, hitReactionMs: number, vfxImpactMs: number, dedicatedAttack = true) {
    const jobs: { callback: () => void; delayMs: number }[] = []
    const callbacks = { startAttack: vi.fn(), startHit: vi.fn(), onRelease: vi.fn() }
    const run = createBattleAnimationPlayback({
      plan: planBattleAnimationPlayback(attackReleaseMs, hitReactionMs, vfxImpactMs),
      dedicatedAttack, dedicatedHit: hitReactionMs > 0, ...callbacks,
      schedule: (callback, delayMs) => { jobs.push({ callback, delayMs }) },
    })
    return { ...callbacks, ...run, jobs }
  }

  it('counts the hit lead from the actual loaded attack start, not from the user click', () => {
    const run = playback(2000, 1250, 400)
    run.start()
    expect(run.startAttack).toHaveBeenCalledTimes(1)
    expect(run.startHit).not.toHaveBeenCalled()
    expect(run.jobs).toHaveLength(0)
    run.attackerStart()
    expect(run.jobs[0].delayMs).toBe(1150)
    run.jobs[0].callback()
    expect(run.startHit).toHaveBeenCalledTimes(1)
    expect(run.onRelease).not.toHaveBeenCalled()
    run.release()
    run.release()
    expect(run.onRelease).toHaveBeenCalledTimes(1)
  })

  it('prerolls a hit from its own ready start before a static attacker releases the move', () => {
    const run = playback(0, 1250, 400, false)
    run.start()
    expect(run.startHit).toHaveBeenCalledTimes(1)
    expect(run.startAttack).not.toHaveBeenCalled()
    run.targetStart()
    expect(run.jobs[0].delayMs).toBe(850)
    run.jobs[0].callback()
    expect(run.startAttack).toHaveBeenCalledTimes(1)
    expect(run.onRelease).toHaveBeenCalledTimes(1)
  })

  it('counts a delayed hit from the VFX ready start for a static attacker', () => {
    const run = playback(0, 250, 1000, false)
    run.start()
    expect(run.startAttack).toHaveBeenCalledTimes(1)
    expect(run.onRelease).toHaveBeenCalledTimes(1)
    expect(run.jobs).toHaveLength(0)
    run.vfxStart()
    expect(run.jobs[0].delayMs).toBe(750)
    run.jobs[0].callback()
    expect(run.startHit).toHaveBeenCalledTimes(1)
  })

  it('cancels delayed playback without letting old jobs start another attack', () => {
    const run = playback(250, 1250, 400)
    run.start()
    run.targetStart()
    run.cancel()
    run.jobs[0].callback()
    run.release()
    expect(run.startAttack).not.toHaveBeenCalled()
    expect(run.onRelease).not.toHaveBeenCalled()
  })
})

describe('damage and KO after the visible dice result', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function damageReveal(waitForTargetKO = true) {
    const callbacks = { onReveal: vi.fn(), onComplete: vi.fn() }
    return { ...callbacks, ...createBattleDamageReveal({ waitForTargetKO, ...callbacks }) }
  }

  it('keeps resolved lethal damage hidden until the last die and panel have painted, even after a slow load', () => {
    const target = { hp: 1, animation: 'hit' }
    const onComplete = vi.fn()
    const damage = createBattleDamageReveal({
      waitForTargetKO: true,
      onReveal: () => { target.hp = 0; target.animation = 'ko' },
      onComplete,
    })
    const dice = createBattleDiceReveal({
      diceCount: 2,
      scheduleAfterPaint: (callback) => {
        const timer = setTimeout(callback, 16)
        return () => clearTimeout(timer)
      },
      onReveal: damage.diceVisible,
    })

    dice.panelVisible()
    dice.dieVisible(0)
    vi.advanceTimersByTime(2500)
    expect(target).toEqual({ hp: 1, animation: 'hit' })
    expect(onComplete).not.toHaveBeenCalled()

    dice.dieVisible(1)
    vi.advanceTimersByTime(15)
    expect(target).toEqual({ hp: 1, animation: 'hit' })
    vi.advanceTimersByTime(1)
    expect(target).toEqual({ hp: 0, animation: 'ko' })
    expect(onComplete).not.toHaveBeenCalled()
    damage.diceComplete()
    expect(onComplete).not.toHaveBeenCalled()
    damage.targetKOComplete()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it.each(['dice first', 'KO first'] as const)('waits for both the full KO clip and dice presentation with %s', (order) => {
    const run = damageReveal()
    run.diceVisible()
    expect(run.onReveal).toHaveBeenCalledTimes(1)
    expect(run.onComplete).not.toHaveBeenCalled()
    if (order === 'dice first') run.diceComplete()
    else run.targetKOComplete()
    expect(run.onComplete).not.toHaveBeenCalled()
    if (order === 'dice first') run.targetKOComplete()
    else run.diceComplete()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('releases a surviving target or static KO after the dice without waiting for an absent clip', () => {
    const run = damageReveal(false)
    run.diceVisible()
    expect(run.onReveal).toHaveBeenCalledTimes(1)
    expect(run.onComplete).not.toHaveBeenCalled()
    run.diceComplete()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
    run.targetKOComplete()
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('reveals damage once and ignores duplicate completion signals after the turn settles', () => {
    const run = damageReveal()
    run.diceVisible()
    run.diceVisible()
    run.targetKOComplete()
    run.targetKOComplete()
    expect(run.onComplete).not.toHaveBeenCalled()
    run.diceComplete()
    run.diceComplete()
    run.targetKOComplete()
    run.diceVisible()
    expect(run.onReveal).toHaveBeenCalledTimes(1)
    expect(run.onComplete).toHaveBeenCalledTimes(1)
  })

  it('cannot reveal damage or settle the turn from completion callbacks received before the dice result', () => {
    const run = damageReveal()
    run.diceComplete()
    run.targetKOComplete()
    expect(run.onReveal).not.toHaveBeenCalled()
    expect(run.onComplete).not.toHaveBeenCalled()
    run.diceVisible()
    expect(run.onReveal).toHaveBeenCalledTimes(1)
  })

  it('cancels an unrevealed attack without letting late dice or KO events leak the result', () => {
    const run = damageReveal()
    run.cancel()
    run.cancel()
    run.diceVisible()
    run.targetKOComplete()
    run.diceComplete()
    expect(run.onReveal).not.toHaveBeenCalled()
    expect(run.onComplete).not.toHaveBeenCalled()
  })

  it('ignores stale KO and dice completions after an interrupted revealed attack', () => {
    const old = damageReveal()
    old.diceVisible()
    old.cancel()
    const next = damageReveal()
    old.diceComplete()
    old.targetKOComplete()
    expect(old.onReveal).toHaveBeenCalledTimes(1)
    expect(old.onComplete).not.toHaveBeenCalled()
    expect(next.onReveal).not.toHaveBeenCalled()
    expect(next.onComplete).not.toHaveBeenCalled()
    next.diceVisible()
    next.diceComplete()
    next.targetKOComplete()
    expect(next.onComplete).toHaveBeenCalledTimes(1)
  })

  it.each(['A', 'B'] as const)('preserves target KO, XP and Suprema recoil ordering for attacker %s after its dice', (side) => {
    const attacker: PokemonIstanza = {
      istanzaId: `attacker-${side}`, specieId: 1, nome: 'Vyrath', livello: 14, hp: 13, xp: 0,
    }
    const defender: PokemonIstanza = {
      istanzaId: `defender-${side}`, specieId: 13, nome: 'Bersaglio', livello: 5, hp: 1, xp: 0,
    }
    const attack = calcolaAzioneSuprema(attacker, defender, 0, () => 0)!
    expect(attack.difensoreSvenuto).toBe(true)
    const events: string[] = []
    let visibleAttacker = attacker
    let visibleDefender = defender
    let outcome: 'vittoria' | 'sconfitta' | null = null
    const damage = createBattleDamageReveal({
      waitForTargetKO: true,
      onReveal: () => {
        visibleDefender = { ...defender, hp: Math.max(0, defender.hp - attack.dannoFinale) }
        events.push('target KO')
      },
      onComplete: () => {
        const resolved = risolviAttaccanteDopoMossa(attack)
        expect(resolved.istanzaPrimaDelContraccolpo).toMatchObject({ livello: 15, hp: 13 })
        expect(calcolaHPMax(resolved.istanzaPrimaDelContraccolpo)).toBe(27)
        expect(resolved.autodanno).toBe(13)
        visibleAttacker = resolved.istanza
        events.push('XP then recoil')
        outcome = esitoSquadre(
          [side === 'A' ? visibleAttacker : visibleDefender],
          [side === 'B' ? visibleAttacker : visibleDefender],
          side,
        )
      },
    })

    expect(visibleDefender.hp).toBe(1)
    expect(visibleAttacker).toMatchObject({ livello: 14, hp: 13 })
    expect(outcome).toBeNull()
    expect(events).toEqual([])
    damage.diceVisible()
    expect(visibleDefender.hp).toBe(0)
    expect(visibleAttacker).toMatchObject({ livello: 14, hp: 13 })
    expect(outcome).toBeNull()
    damage.diceComplete()
    expect(visibleAttacker.hp).toBe(13)
    expect(outcome).toBeNull()
    damage.targetKOComplete()
    expect(visibleAttacker).toMatchObject({ livello: 15, hp: 0 })
    expect(outcome).toBe(side === 'A' ? 'vittoria' : 'sconfitta')
    expect(events).toEqual(['target KO', 'XP then recoil'])
  })
})

describe('reduced presentation cue planning', () => {
  it('does not keep native wind-up delays for a static reduced-motion cue', () => {
    expect(planBattleAnimationPlayback(2000, 1500, 600, true)).toEqual({ attackerAtMs: 0, hitAtMs: 0, vfxAtMs: 0, impactAtMs: 0 })
  })
})
