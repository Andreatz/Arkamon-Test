import { describe, expect, it } from 'vitest'
import { copyNativeFramesToPage, getNativePageGrid, hasSameVisibleRgba, MAX_PAGE_DECODED_BYTES } from '../arkamon-page-packing.mjs'

describe('lossless native source packing', () => {
  it.each([448, 512, 576, 640, 704, 768])('bounds each %i cell page while preserving its dimensions', size => {
    const grid = getNativePageGrid(size, size)
    expect(grid.decodedBytes).toBeLessThanOrEqual(MAX_PAGE_DECODED_BYTES)
    expect(grid.framesPerPage).toBe(grid.columns * grid.rows)
    expect(grid.decodedBytes).toBe(grid.columns * grid.rows * size * size * 4)
  })

  it('copies first, last and page boundary frames without compositing, resizing or alpha conversion', () => {
    const source = Buffer.alloc(10 * 10 * 2 * 2 * 4)
    for (let frame = 0; frame < 96; frame++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const i = ((Math.floor(frame / 10) * 2 + y) * 20 + frame % 10 * 2 + x) * 4
      source.set([frame, x * 128, y * 127, frame % 3 === 0 ? 0 : frame % 3 === 1 ? 17 : 255], i)
    }
    for (let first = 0; first < 96; first += 12) {
      const page = copyNativeFramesToPage(source, { frameWidth: 2, frameHeight: 2, columns: 10, width: 20 }, first, 12, { columns: 4, rows: 3 })
      for (let local = 0; local < 12; local++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const i = ((Math.floor(local / 4) * 2 + y) * 8 + local % 4 * 2 + x) * 4
        const frame = first + local
        expect([...page.pixels.subarray(i, i + 4)]).toEqual([frame, x * 128, y * 127, frame % 3 === 0 ? 0 : frame % 3 === 1 ? 17 : 255])
      }
    }
  })

  it('accepts normalization only below fully transparent pixels, rejecting any visible or alpha change', () => {
    const source = Buffer.from([19, 44, 98, 0, 200, 122, 50, 1])
    const transparentOnly = Buffer.from([0, 0, 0, 0, 200, 122, 50, 1])
    expect(hasSameVisibleRgba(source, transparentOnly)).toBe(true)
    const visibleChanged = Buffer.from(transparentOnly); visibleChanged[4]--
    expect(hasSameVisibleRgba(source, visibleChanged)).toBe(false)
    const alphaChanged = Buffer.from(transparentOnly); alphaChanged[3] = 1
    expect(hasSameVisibleRgba(source, alphaChanged)).toBe(false)
  })

  it('leaves the unused cells in a final partial page fully transparent', () => {
    const page = copyNativeFramesToPage(Buffer.from([11, 12, 13, 255]), { frameWidth: 1, frameHeight: 1, columns: 1, width: 1 }, 0, 1, { columns: 3, rows: 2 })
    expect([...page.pixels.subarray(0, 4)]).toEqual([11, 12, 13, 255])
    expect(page.pixels.subarray(4).every(byte => byte === 0)).toBe(true)
  })
})
