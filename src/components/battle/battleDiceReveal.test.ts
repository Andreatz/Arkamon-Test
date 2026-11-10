import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBattleDiceReveal } from './battleDiceReveal'

function harness(diceCount: number) {
  const onReveal = vi.fn()
  const queuedCallbacks: (() => void)[] = []
  const scheduleAfterPaint = vi.fn((callback: () => void) => {
    queuedCallbacks.push(callback)
    const timer = setTimeout(callback, 16)
    return () => clearTimeout(timer)
  })
  return {
    controller: createBattleDiceReveal({ diceCount, scheduleAfterPaint, onReveal }),
    onReveal,
    scheduleAfterPaint,
    queuedCallbacks,
  }
}

describe('damage reveal after visible battle dice', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits for the panel entrance and a paint even if all dice appear first', () => {
    const run = harness(2)
    run.controller.dieVisible(0)
    run.controller.dieVisible(1)
    vi.advanceTimersByTime(1000)
    expect(run.scheduleAfterPaint).not.toHaveBeenCalled()
    expect(run.onReveal).not.toHaveBeenCalled()

    run.controller.panelVisible()
    expect(run.scheduleAfterPaint).toHaveBeenCalledTimes(1)
    expect(run.onReveal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(15)
    expect(run.onReveal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run.onReveal).toHaveBeenCalledTimes(1)
  })

  it('does not reveal health or damage when the last sheet loads after the old two-second timeout', () => {
    const run = harness(2)
    run.controller.panelVisible()
    run.controller.dieVisible(0)
    vi.advanceTimersByTime(2500)
    expect(run.scheduleAfterPaint).not.toHaveBeenCalled()
    expect(run.onReveal).not.toHaveBeenCalled()

    run.controller.dieVisible(1)
    expect(run.onReveal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(run.onReveal).toHaveBeenCalledTimes(1)
  })

  it('counts twenty distinct positions even when dice share a face and send duplicate visibility signals', () => {
    const run = harness(20)
    run.controller.panelVisible()
    for (let index = 0; index < 19; index++) {
      run.controller.dieVisible(index)
      run.controller.dieVisible(index)
    }
    vi.advanceTimersByTime(2000)
    expect(run.onReveal).not.toHaveBeenCalled()
    run.controller.dieVisible(19)
    run.controller.dieVisible(19)
    run.controller.panelVisible()
    expect(run.scheduleAfterPaint).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(16)
    expect(run.onReveal).toHaveBeenCalledTimes(1)
    run.controller.dieVisible(19)
    run.controller.panelVisible()
    vi.advanceTimersByTime(2000)
    expect(run.onReveal).toHaveBeenCalledTimes(1)
  })

  it('ignores fractional, non-finite, negative and out-of-range die indices', () => {
    const run = harness(2)
    run.controller.panelVisible()
    run.controller.dieVisible(0)
    for (const invalid of [-1, 2, 100, 0.5, Number.NaN, Infinity, -Infinity]) {
      run.controller.dieVisible(invalid)
    }
    vi.advanceTimersByTime(16)
    expect(run.onReveal).not.toHaveBeenCalled()
    run.controller.dieVisible(1)
    vi.advanceTimersByTime(16)
    expect(run.onReveal).toHaveBeenCalledTimes(1)
  })

  it('cancels an old roll even if its queued callback or late asset events are delivered', () => {
    const old = harness(1)
    old.controller.panelVisible()
    old.controller.dieVisible(0)
    old.controller.cancel()
    old.controller.cancel()

    const next = harness(1)
    next.controller.panelVisible()
    old.queuedCallbacks[0]()
    old.controller.dieVisible(0)
    old.controller.panelVisible()
    vi.advanceTimersByTime(16)
    expect(old.onReveal).not.toHaveBeenCalled()
    expect(next.onReveal).not.toHaveBeenCalled()

    next.controller.dieVisible(0)
    vi.advanceTimersByTime(16)
    expect(next.onReveal).toHaveBeenCalledTimes(1)
  })

  it('never queues a reveal after unmount cancels a partially loaded roll', () => {
    const run = harness(2)
    run.controller.panelVisible()
    run.controller.dieVisible(0)
    run.controller.cancel()
    run.controller.dieVisible(1)
    run.controller.panelVisible()
    vi.advanceTimersByTime(3000)
    expect(run.scheduleAfterPaint).not.toHaveBeenCalled()
    expect(run.onReveal).not.toHaveBeenCalled()
  })

  it('releases a fixed-damage or status roll without dice after the panel has painted', () => {
    const run = harness(0)
    run.controller.dieVisible(0)
    vi.advanceTimersByTime(2000)
    expect(run.onReveal).not.toHaveBeenCalled()
    run.controller.panelVisible()
    expect(run.onReveal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(run.onReveal).toHaveBeenCalledTimes(1)
  })

  it.each(['a reduced-motion result', 'a numerical image fallback'])(
    'accepts the visible signal from %s without depending on animation completion',
    () => {
      const run = harness(1)
      run.controller.panelVisible()
      expect(run.onReveal).not.toHaveBeenCalled()
      run.controller.dieVisible(0)
      vi.advanceTimersByTime(16)
      expect(run.onReveal).toHaveBeenCalledTimes(1)
    },
  )
})
