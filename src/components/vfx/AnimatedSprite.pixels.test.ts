import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpriteCanvasImage } from './AnimatedSprite'

afterEach(() => vi.unstubAllGlobals())

describe('predecoded atlas pixel ownership', () => {
  it('reuses a prepared HTML image without allocating a duplicate ImageBitmap', async () => {
    const bitmap = { close: vi.fn() }
    const create = vi.fn().mockResolvedValue(bitmap)
    vi.stubGlobal('createImageBitmap', create)
    const prepared = {} as HTMLImageElement
    const source = createSpriteCanvasImage(prepared, true)
    expect(await source.ready).toBe(prepared)
    source.dispose()
    expect(create).not.toHaveBeenCalled()
    expect(bitmap.close).not.toHaveBeenCalled()
  })

  it('still owns and closes a separately decoded bitmap for uncached media', async () => {
    const bitmap = { close: vi.fn() }
    const create = vi.fn().mockResolvedValue(bitmap)
    vi.stubGlobal('createImageBitmap', create)
    const fresh = {} as HTMLImageElement
    const source = createSpriteCanvasImage(fresh)
    expect(await source.ready).toBe(bitmap)
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith(fresh)
    source.dispose(); source.dispose()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('does not retain a bitmap if decoding completes after the component unmounts', async () => {
    let finish!: (bitmap: { close: () => void }) => void
    vi.stubGlobal('createImageBitmap', () => new Promise(resolve => { finish = resolve }))
    const source = createSpriteCanvasImage({} as HTMLImageElement)
    await Promise.resolve(); await Promise.resolve()
    source.dispose()
    const close = vi.fn()
    finish({ close })
    expect(await source.ready).toBeUndefined()
    expect(close).toHaveBeenCalledOnce()
  })
})
