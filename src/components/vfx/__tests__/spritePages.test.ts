import { describe, expect, it } from 'vitest'
import { locateSpritePage, validateSpritePages, type SpritePage } from '../spritePages'
const pages: SpritePage[] = Array.from({ length: 8 }, (_, index) => ({ src: `/page-${index}.webp`, firstFrame: index * 12, frameCount: 12,
  columns: 4, rows: 3, width: 2304, height: 1728, decodedBytes: 2304 * 1728 * 4 }))
describe('native global frame to page mapping', () => {
  it('maps first, last and every page boundary to the original source frame without skipping', () => {
    expect(validateSpritePages(pages, 96, 576, 576)).toBe(true)
    for (let frame = 0; frame < 96; frame++) {
      const located = locateSpritePage(pages, frame)
      expect(located.pageIndex).toBe(Math.floor(frame / 12))
      expect(located.page.firstFrame + located.row * located.page.columns + located.col).toBe(frame)
    }
    expect(locateSpritePage(pages, 0)).toMatchObject({ pageIndex: 0, col: 0, row: 0 })
    expect(locateSpritePage(pages, 48)).toMatchObject({ pageIndex: 4, col: 0, row: 0 })
    expect(locateSpritePage(pages, 95)).toMatchObject({ pageIndex: 7, col: 3, row: 2 })
  })
  it('rejects holes, excessive page memory and wrong geometry', () => {
    expect(validateSpritePages([{ ...pages[0], firstFrame: 1 }], 12, 576, 576)).toBe(false)
    expect(validateSpritePages([{ ...pages[0], decodedBytes: 225 * 1024 * 1024 }], 12, 576, 576)).toBe(false)
    expect(validateSpritePages([{ ...pages[0], width: 10 }], 12, 576, 576)).toBe(false)
    expect(() => locateSpritePage(pages, 96)).toThrow('Missing')
  })
})
