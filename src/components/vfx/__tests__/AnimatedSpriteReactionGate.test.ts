import { describe, expect, it } from 'vitest'
import { getSpritePlaybackSample, releaseSpriteReactionGate, type SpritePlaybackClock } from '../AnimatedSprite'

const frameMs = 1000 / 24
const gate = 27

describe('native hit reaction impact gate', () => {
  it('plays every native frame before the reaction marker normally', () => {
    const clock: SpritePlaybackClock = { startedAt: 100 }
    for (let frame = 0; frame < gate; frame += 1) {
      const sample = getSpritePlaybackSample(clock, 100 + frame * frameMs + 0.01, frameMs, gate)
      expect(sample.rawFrame).toBe(frame)
      expect(sample.held).toBe(false)
    }
  })

  it('holds at reactionFrame−1 while a delayed VFX is still preparing', () => {
    const clock: SpritePlaybackClock = { startedAt: 100 }
    const markerAt = 100 + gate * frameMs
    for (const delay of [0, 100, 400, 6000]) {
      const sample = getSpritePlaybackSample(clock, markerAt + delay, frameMs, gate)
      expect(sample.rawFrame).toBe(gate - 1)
      expect(sample.held).toBe(true)
    }
  })

  it('resumes at the reaction frame after a 400 ms delay and retains the remaining native duration', () => {
    const clock: SpritePlaybackClock = { startedAt: 100 }
    const markerAt = 100 + gate * frameMs
    expect(getSpritePlaybackSample(clock, markerAt, frameMs, gate).held).toBe(true)
    const actualImpactAt = markerAt + 400
    clock.resumedAt = actualImpactAt

    const reaction = getSpritePlaybackSample(clock, actualImpactAt, frameMs)
    expect(reaction.rawFrame).toBe(gate)
    expect(reaction.held).toBe(false)
    expect(reaction.elapsed).toBeCloseTo(gate * frameMs)
    for (let frame = gate + 1; frame < 96; frame += 1) {
      const sample = getSpritePlaybackSample(clock, actualImpactAt + (frame - gate) * frameMs + 0.01, frameMs)
      expect(sample.rawFrame).toBe(frame)
    }
    const last = getSpritePlaybackSample(clock, actualImpactAt + (95 - gate) * frameMs + 0.01, frameMs)
    expect(last.elapsed).toBeLessThan(4000)
    const complete = getSpritePlaybackSample(clock, actualImpactAt + (96 - gate) * frameMs, frameMs)
    expect(complete.rawFrame).toBe(96)
    expect(complete.elapsed).toBeCloseTo(4000)
  })

  it('uses the actual impact time even when the next RAF arrives later', () => {
    const clock: SpritePlaybackClock = { startedAt: 0 }
    getSpritePlaybackSample(clock, gate * frameMs, frameMs, gate)
    clock.resumedAt = gate * frameMs + 400
    const nextRAF = getSpritePlaybackSample(clock, clock.resumedAt + 2 * frameMs + 0.01, frameMs)
    expect(nextRAF.rawFrame).toBe(gate + 2)
  })

  it('does not step back a frame at fractional impact timestamps', () => {
    const clock: SpritePlaybackClock = { startedAt: 1033.329999 }
    getSpritePlaybackSample(clock, 1033.329999 + gate * frameMs + 0.01, frameMs, gate)
    clock.resumedAt = 2916.666671
    expect(getSpritePlaybackSample(clock, clock.resumedAt, frameMs).rawFrame).toBe(gate)
  })

  it('leaves the native clock unchanged when impact already released the gate', () => {
    const clock: SpritePlaybackClock = { startedAt: 100 }
    getSpritePlaybackSample(clock, 100 + 12 * frameMs + 0.01, frameMs, gate)
    for (let frame = 13; frame < 96; frame += 1) {
      const sample = getSpritePlaybackSample(clock, 100 + frame * frameMs + 0.01, frameMs)
      expect(sample.rawFrame).toBe(frame)
      expect(sample.held).toBe(false)
    }
    expect(clock.startedAt).toBe(100)
    expect(clock.frameOffset).toBeUndefined()
  })

  it('keeps attacks, KO and other ungated 96-frame clips on their original timeline', () => {
    const clock: SpritePlaybackClock = { startedAt: 700 }
    for (let frame = 0; frame <= 96; frame += 1) {
      const sample = getSpritePlaybackSample(clock, 700 + frame * frameMs + 0.01, frameMs)
      expect(sample.rawFrame).toBe(frame)
      expect(sample.held).toBe(false)
      expect(sample.elapsed).toBeCloseTo(frame * frameMs + 0.01)
    }
  })

  it('marks the clip as held even past its original completion deadline', () => {
    const clock: SpritePlaybackClock = { startedAt: 0 }
    const sample = getSpritePlaybackSample(clock, 9000, frameMs, gate)
    // The playback loop handles this branch before its duration/completion check.
    expect(sample.held).toBe(true)
    expect(sample.rawFrame).toBe(26)
    expect(sample.elapsed).toBeGreaterThan(4000)
  })

  it('makes the reaction cue eligible only after the actual impact releases the gate', () => {
    const clock: SpritePlaybackClock = { startedAt: 0 }
    const delayedImpactAt = gate * frameMs + 400
    const waiting = getSpritePlaybackSample(clock, delayedImpactAt, frameMs, gate)
    expect(waiting.rawFrame >= gate).toBe(false)
    clock.resumedAt = delayedImpactAt
    const released = getSpritePlaybackSample(clock, delayedImpactAt, frameMs)
    expect(released.rawFrame >= gate).toBe(true)
  })

  it('releases at H when a stalled RAF last sampled frame 24 before a late impact', () => {
    const clock: SpritePlaybackClock = { startedAt: 4423, hasStarted: true }
    const lastRAF = getSpritePlaybackSample(clock, 5439, frameMs, gate)
    expect(lastRAF.rawFrame).toBe(24)
    expect(lastRAF.held).toBe(false)
    expect(clock.heldBeforeFrame).toBeUndefined()

    const reactionFrame = releaseSpriteReactionGate(clock, 5824, frameMs, gate)
    expect(reactionFrame).toBe(gate)
    expect(reactionFrame! >= gate).toBe(true)
    const released = getSpritePlaybackSample(clock, 5824, frameMs)
    expect(released.rawFrame).toBe(gate)
    expect(released.held).toBe(false)
    expect(released.elapsed).toBeCloseTo(gate * frameMs)
  })

  it('does not skip earlier native frames when actual impact precedes the marker', () => {
    const clock: SpritePlaybackClock = { startedAt: 100, hasStarted: true }
    expect(releaseSpriteReactionGate(clock, 100 + 20 * frameMs + 0.01, frameMs, gate)).toBeUndefined()
    expect(clock.resumedAt).toBeUndefined()
    expect(getSpritePlaybackSample(clock, 100 + 21 * frameMs + 0.01, frameMs).rawFrame).toBe(21)
  })

  it('does not jump a prepared clip before its first actual animation start', () => {
    const clock: SpritePlaybackClock = { startedAt: 0, hasStarted: false }
    expect(releaseSpriteReactionGate(clock, 9000, frameMs, gate)).toBeUndefined()
    expect(clock.heldBeforeFrame).toBeUndefined()
  })

  it('does not release the same reaction twice before the next RAF', () => {
    const clock: SpritePlaybackClock = { startedAt: 100, hasStarted: true }
    expect(releaseSpriteReactionGate(clock, 1700, frameMs, gate)).toBe(gate)
    expect(releaseSpriteReactionGate(clock, 1701, frameMs, gate)).toBeUndefined()
  })
})
