import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isImageAssetPrepared, prepareImageAsset } from './prepareImageAsset'

class PendingImage {
  static instances: PendingImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  src = ''
  constructor() { PendingImage.instances.push(this) }
}

describe('prepareImageAsset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    PendingImage.instances = []
    vi.stubGlobal('Image', PendingImage)
    vi.stubGlobal('window', { setTimeout, clearTimeout })
  })
  afterEach(async () => { await vi.runOnlyPendingTimersAsync(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('shares an in-flight load, waits for readiness and releases the request after loading', async () => {
    const first = prepareImageAsset('/test/deduplicated.webp')
    const second = prepareImageAsset('/test/deduplicated.webp')
    expect(second).toBe(first)
    expect(PendingImage.instances).toHaveLength(1)
    let finished = false
    void first.then(() => { finished = true })
    await Promise.resolve()
    expect(finished).toBe(false)
    PendingImage.instances[0].onload?.()
    await first
    expect(finished).toBe(true)
    expect(PendingImage.instances[0].onerror).toBeNull()
    await prepareImageAsset('/test/deduplicated.webp')
    expect(PendingImage.instances).toHaveLength(1)
    expect(isImageAssetPrepared('/test/deduplicated.webp')).toBe(true)
    await vi.advanceTimersByTimeAsync(10000)
    expect(isImageAssetPrepared('/test/deduplicated.webp')).toBe(false)
    const replay = prepareImageAsset('/test/deduplicated.webp')
    expect(PendingImage.instances).toHaveLength(2)
    PendingImage.instances[1].onload?.()
    await replay
  })

  it('waits for decoded pixels before a native frame clock may start', async () => {
    const request = prepareImageAsset('/test/decoded.webp')
    let completeDecode: (() => void) | undefined
    const image = PendingImage.instances[0] as PendingImage & { decode: () => Promise<void> }
    image.decode = () => new Promise<void>((resolve) => { completeDecode = resolve })
    image.onload?.()
    await Promise.resolve()
    expect(isImageAssetPrepared('/test/decoded.webp')).toBe(false)
    expect(completeDecode).toBeTypeOf('function')
    completeDecode!()
    await request
    expect(isImageAssetPrepared('/test/decoded.webp')).toBe(true)
    await vi.advanceTimersByTimeAsync(10000)
  })

  it('allows fallback when decoding fails instead of marking an image ready', async () => {
    const request = prepareImageAsset('/test/invalid-pixels.webp')
    const image = PendingImage.instances[0] as PendingImage & { decode: () => Promise<void> }
    image.decode = () => Promise.reject(new Error('invalid pixels'))
    image.onload?.()
    await request
    expect(isImageAssetPrepared('/test/invalid-pixels.webp')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases older decoded atlases when keeping another large image would exceed the memory budget', async () => {
    for (let index = 0; index < 3; index++) {
      const request = prepareImageAsset(`/test/large-${index}.webp`)
      const image = PendingImage.instances[index]
      image.naturalWidth = 4096
      image.naturalHeight = 4096
      image.onload?.()
      await request
    }
    expect(isImageAssetPrepared('/test/large-0.webp')).toBe(false)
    expect(isImageAssetPrepared('/test/large-1.webp')).toBe(true)
    expect(isImageAssetPrepared('/test/large-2.webp')).toBe(true)
    expect(vi.getTimerCount()).toBe(2)
  })

  it('does not retain an atlas larger than the decoded image budget', async () => {
    const request = prepareImageAsset('/test/oversized.webp')
    const image = PendingImage.instances[0]
    image.naturalWidth = 8000
    image.naturalHeight = 8000
    image.onload?.()
    await request
    expect(isImageAssetPrepared('/test/oversized.webp')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('lets a failed image use the visual fallback instead of trapping an action', async () => {
    const request = prepareImageAsset('/test/unavailable.webp')
    PendingImage.instances[0].onerror?.()
    await expect(request).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases a stalled network request at the deadline', async () => {
    const request = prepareImageAsset('/test/stalled.webp')
    await vi.advanceTimersByTimeAsync(15000)
    await expect(request).resolves.toBeUndefined()
    expect(PendingImage.instances[0].onload).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
