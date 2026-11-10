import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpriteCanvasImage } from '../AnimatedSprite'

const image = { naturalWidth: 7040, naturalHeight: 7040 } as HTMLImageElement
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap

afterEach(() => vi.unstubAllGlobals())

describe('native sprite canvas bitmap ownership', () => {
  it('keeps the decoded bitmap alive until its clip is released, then closes it once', async () => {
    const pixels = bitmap()
    const create = vi.fn().mockResolvedValue(pixels)
    vi.stubGlobal('createImageBitmap', create)
    const clip = createSpriteCanvasImage(image)

    expect(await clip.ready).toBe(pixels)
    expect(create).toHaveBeenCalledWith(image)
    expect(pixels.close).not.toHaveBeenCalled()
    clip.dispose()
    clip.dispose()
    expect(pixels.close).toHaveBeenCalledTimes(1)
  })

  it('closes a late async bitmap after the clip changes or unmounts', async () => {
    const pixels = bitmap()
    let finish!: (value: ImageBitmap) => void
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve })))
    const clip = createSpriteCanvasImage(image)
    await Promise.resolve()
    clip.dispose()
    finish(pixels)

    expect(await clip.ready).toBeUndefined()
    expect(pixels.close).toHaveBeenCalledTimes(1)
  })

  it('does not allocate a bitmap for a clip cancelled before preparation starts', async () => {
    const create = vi.fn()
    vi.stubGlobal('createImageBitmap', create)
    const clip = createSpriteCanvasImage(image)
    clip.dispose()

    expect(await clip.ready).toBeUndefined()
    expect(create).not.toHaveBeenCalled()
  })

  it('falls back to the decoded image when ImageBitmap is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const clip = createSpriteCanvasImage(image)
    expect(await clip.ready).toBe(image)
    clip.dispose()
  })

  it('falls back to the decoded image when bitmap creation rejects', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Unsupported bitmap')))
    const clip = createSpriteCanvasImage(image)
    expect(await clip.ready).toBe(image)
    clip.dispose()
  })

  it('falls back to the decoded image when bitmap creation throws synchronously', async () => {
    vi.stubGlobal('createImageBitmap', () => { throw new Error('Unsupported bitmap') })
    const clip = createSpriteCanvasImage(image)
    expect(await clip.ready).toBe(image)
    clip.dispose()
  })

  it('does not return a stale image when bitmap creation fails after cancellation', async () => {
    let reject!: (reason: Error) => void
    vi.stubGlobal('createImageBitmap', () => new Promise<ImageBitmap>((_, fail) => { reject = fail }))
    const clip = createSpriteCanvasImage(image)
    await Promise.resolve()
    clip.dispose()
    reject(new Error('Cancelled bitmap'))
    expect(await clip.ready).toBeUndefined()
  })

  it('releases each mounted clip independently without a global bitmap cache', async () => {
    const firstPixels = bitmap()
    const secondPixels = bitmap()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce(firstPixels).mockResolvedValueOnce(secondPixels))
    const first = createSpriteCanvasImage(image)
    const second = createSpriteCanvasImage(image)
    expect(await first.ready).toBe(firstPixels)
    expect(await second.ready).toBe(secondPixels)
    first.dispose()
    expect(firstPixels.close).toHaveBeenCalledTimes(1)
    expect(secondPixels.close).not.toHaveBeenCalled()
    second.dispose()
    expect(secondPixels.close).toHaveBeenCalledTimes(1)
  })
})
