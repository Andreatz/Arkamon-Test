import { describe, expect, it, vi } from 'vitest'
import { warmBattleMediaBounded } from './warmBattleMediaBounded'

describe('bounded native/VFX warmup', () => {
  it('never starts more than two decoded media tasks at the same time', async () => {
    let concurrent = 0, peak = 0
    const resolveNext: Array<() => void> = []
    const visited: number[] = []
    const task = (id: number) => {
      visited.push(id)
      concurrent++
      peak = Math.max(peak, concurrent)
      return new Promise<void>(resolve => resolveNext.push(() => { concurrent--; resolve() }))
    }
    const done = warmBattleMediaBounded([1, 2, 3, 4, 5], task)
    expect(visited).toEqual([1, 2])
    expect(peak).toBe(2)
    resolveNext.shift()!()
    await Promise.resolve(); await Promise.resolve()
    expect(visited).toEqual([1, 2, 3])
    resolveNext.shift()!()
    await Promise.resolve(); await Promise.resolve()
    expect(visited).toEqual([1, 2, 3, 4])
    while (resolveNext.length) { resolveNext.shift()!(); await Promise.resolve(); await Promise.resolve() }
    await done
    expect(visited).toEqual([1, 2, 3, 4, 5])
    expect(peak).toBe(2)
  })

  it('does not begin new network requests after the owning battle unmounts', async () => {
    let active = true
    let finish!: () => void
    const prepare = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const work = warmBattleMediaBounded([1, 2, 3], prepare, () => active, 1)
    expect(prepare).toHaveBeenCalledTimes(1)
    active = false
    finish()
    await work
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('ignores one missing VFX without starving the next animation', async () => {
    const visited: number[] = []
    await warmBattleMediaBounded([1, 2, 3], async id => {
      visited.push(id)
      if (id === 2) throw new Error('media unavailable')
    })
    expect(visited).toHaveLength(3)
  })

  it('handles an empty roster without scheduling any decodes', async () => {
    const prepare = vi.fn()
    await warmBattleMediaBounded([], prepare)
    expect(prepare).not.toHaveBeenCalled()
  })
})
