import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpritePageCache, getNativeSpriteBudget, type SpritePagePixels } from './spritePageCache'
import type { SpritePage } from '@/components/vfx/spritePages'

const mib = 1024 * 1024
const page = (id: string, bytes = 12 * mib): SpritePage => ({ src: `/page-${id}.webp`, firstFrame: 0, frameCount: 6, columns: 3, rows: 2, width: 1536, height: 1024, decodedBytes: bytes })
const pixels = (): SpritePagePixels => ({ image: {} as CanvasImageSource, kind: 'bitmap', dispose: vi.fn() })
afterEach(() => vi.useRealTimers())

describe('shared native page ownership and memory', () => {
  it('shares the same decoded page across preloading and multiple renderers without bitmap duplication', async () => {
    const resource = pixels(), decode = vi.fn().mockResolvedValue(resource)
    const cache = createSpritePageCache(decode, 32 * mib)
    const a = cache.acquire(page('shared')), b = cache.acquire(page('shared'))
    expect(await a.ready).toBe(resource); expect(await b.ready).toBe(resource)
    expect(decode).toHaveBeenCalledOnce()
    a.release(); expect(resource.dispose).not.toHaveBeenCalled()
    b.release(); cache.clear()
    expect(resource.dispose).toHaveBeenCalledOnce()
    expect(cache.stats().decodedBytes).toBe(0)
  })

  it('evicts only unused pages, closes their bitmap once and stays within the low-memory budget', async () => {
    const resources: SpritePagePixels[] = []
    const cache = createSpritePageCache(async () => { const resource = pixels(); resources.push(resource); return resource }, 32 * mib)
    const active = cache.acquire(page('active')); await active.ready
    const next = cache.acquire(page('next')); await next.ready; next.release()
    const third = cache.acquire(page('third')); await third.ready
    expect(resources[0].dispose).not.toHaveBeenCalled()
    expect(resources[1].dispose).toHaveBeenCalledOnce()
    expect(cache.stats().peakDecodedBytes).toBeLessThanOrEqual(32 * mib)
    expect(cache.stats().decodedBytes).toBe(24 * mib)
    active.release(); third.release(); cache.clear()
  })

  it('limits parallel decoding and queues the next demand until an earlier load releases space', async () => {
    const finish: (() => void)[] = []
    const cache = createSpritePageCache(() => new Promise(resolve => finish.push(() => resolve(pixels()))), 64 * mib)
    const leases = [cache.acquire(page('a')), cache.acquire(page('b')), cache.acquire(page('c'))]
    expect(finish).toHaveLength(2)
    expect(cache.stats().activeDecodes).toBe(2)
    finish[0](); await leases[0].ready; await Promise.resolve(); await Promise.resolve()
    expect(finish).toHaveLength(3)
    finish[1](); finish[2](); await Promise.all(leases.map(lease => lease.ready))
    expect(cache.stats().peakDecodes).toBe(2)
    for (const lease of leases) lease.release()
    cache.clear()
  })

  it('rejects an impossible demand so the visible renderer can choose its PNG fallback', async () => {
    const cache = createSpritePageCache(async () => pixels(), 16 * mib)
    const active = cache.acquire(page('pinned')); await active.ready
    const unavailable = cache.acquire(page('no-room'))
    await expect(unavailable.ready).rejects.toThrow('memory budget')
    unavailable.release(); active.release(); cache.clear()
  })

  it('does not retain a bitmap produced after cache disposal', async () => {
    let finish!: (pixels: SpritePagePixels) => void
    const cache = createSpritePageCache(() => new Promise(resolve => { finish = resolve }), 32 * mib)
    const lease = cache.acquire(page('late'))
    const failure = expect(lease.ready).rejects.toThrow('cleared')
    cache.clear(); await failure
    const resource = pixels(); finish(resource); await Promise.resolve(); await Promise.resolve()
    expect(resource.dispose).toHaveBeenCalledOnce()
    expect(cache.stats().decodedBytes).toBe(0)
  })

  it('expires an unused prepared page and clears its decoded memory', async () => {
    vi.useFakeTimers()
    const resource = pixels(), cache = createSpritePageCache(async () => resource, 32 * mib)
    await cache.prepare(page('warm'))
    expect(cache.stats().decodedBytes).toBe(12 * mib)
    await vi.advanceTimersByTimeAsync(3000)
    expect(cache.stats().decodedBytes).toBe(0)
    expect(resource.dispose).toHaveBeenCalledOnce()
  })

  it('uses automatic memory limits without changing source frame geometry or speed', () => {
    expect(getNativeSpriteBudget('auto', 2, false)).toBe(32 * mib)
    expect(getNativeSpriteBudget('auto', undefined, true)).toBe(32 * mib)
    expect(getNativeSpriteBudget('auto', 8, false)).toBe(64 * mib)
    expect(getNativeSpriteBudget('full', 2, true)).toBe(64 * mib)
    expect(getNativeSpriteBudget('low', 8, false)).toBe(32 * mib)
  })
})
