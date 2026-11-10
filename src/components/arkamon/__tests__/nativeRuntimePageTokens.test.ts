import { describe, expect, it, vi } from 'vitest'

vi.mock('virtual:arkamon-runtime-pages', () => ({ default: {
  999: [[[10, 20, 9, 24, [
    ['', 2, 2], ['.png', 3, 2], ['0123456789abcdef', 1, 1], ['fedcba9876543210.png', 3, 2],
  ]]]],
  998: [[null, null, null, null, [10, 20, 7, 24, [4, 2, ',0123456789abcdef.png']]]],
  997: [[null, [10, 20, 7, 24, [4, 2, '!ASNFZ4mrze_-3LqYdlQyEA']]]],
  996: [null, [[10, 20, 7, 24, 4, 2], '!' + btoa(Array.from({length: 80}, (_, index) => String.fromCharCode(index)).join('')).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')]],
} }))

import { getNativeRuntimeClip } from '../nativeRuntimePages'

describe('native page tokens reconstruct exact URLs and frame geometry', () => {
  it('selects the exact hash range for every action in a shared back view on first lookup', () => {
    const actions = ['idle', 'attack', 'hit', 'victory', 'ko']
    for (const [actionIndex, action] of actions.entries()) {
      const clip = getNativeRuntimeClip(`/sprites/arkamon/996/back/${action}.webp`)!
      expect(clip.frameWidth).toBe(10)
      expect(clip.frameHeight).toBe(20)
      expect(clip.frameCount).toBe(7)
      expect(clip.fps).toBe(24)
      expect(clip.pages.map(page => page.src)).toEqual([0, 1].map(pageIndex => {
        const hash = Array.from({length: 8}, (_, byte) => (actionIndex * 16 + pageIndex * 8 + byte).toString(16).padStart(2, '0')).join('')
        return `/sprites/arkamon-paged/996/back/${action}/page-0${pageIndex}-${hash}.webp`
      }))
      expect(clip.pages.map(page => [page.firstFrame, page.frameCount, page.width, page.height])).toEqual([[0, 4, 20, 40], [4, 3, 20, 40]])
      expect(getNativeRuntimeClip(`/sprites/arkamon/996/back/${action}.webp`)).toBe(clip)
    }
    expect(getNativeRuntimeClip('/sprites/arkamon/996/front/idle.webp')).toBeUndefined()
  })
  it('supports original and fingerprinted WebP and PNG pages without changing frame positions', () => {
    const clip = getNativeRuntimeClip('/sprites/arkamon/999/front/idle.webp')!
    expect(clip).toEqual({ frameWidth: 10, frameHeight: 20, frameCount: 9, fps: 24, pages: [
      { src: '/sprites/arkamon-paged/999/front/idle/page-00.webp', firstFrame: 0, frameCount: 2, columns: 2, rows: 1, width: 20, height: 20, decodedBytes: 1600 },
      { src: '/sprites/arkamon-paged/999/front/idle/page-01.png', firstFrame: 2, frameCount: 3, columns: 2, rows: 2, width: 20, height: 40, decodedBytes: 3200 },
      { src: '/sprites/arkamon-paged/999/front/idle/page-02-0123456789abcdef.webp', firstFrame: 5, frameCount: 1, columns: 1, rows: 1, width: 10, height: 20, decodedBytes: 800 },
      { src: '/sprites/arkamon-paged/999/front/idle/page-03-fedcba9876543210.png', firstFrame: 6, frameCount: 3, columns: 2, rows: 2, width: 20, height: 40, decodedBytes: 3200 },
    ] })
    expect(getNativeRuntimeClip('/sprites/arkamon/999/front/idle.webp')).toBe(clip)
  })
  it('expands a shared grid with exact native last-page counts and filename extensions', () => {
    const clip = getNativeRuntimeClip('/sprites/arkamon/998/front/ko.webp')!
    expect(clip.pages).toEqual([
      { src: '/sprites/arkamon-paged/998/front/ko/page-00.webp', firstFrame: 0, frameCount: 4, columns: 2, rows: 2, width: 20, height: 40, decodedBytes: 3200 },
      { src: '/sprites/arkamon-paged/998/front/ko/page-01-0123456789abcdef.png', firstFrame: 4, frameCount: 3, columns: 2, rows: 2, width: 20, height: 40, decodedBytes: 3200 },
    ])
    expect(getNativeRuntimeClip('/sprites/arkamon/998/front/ko.webp')).toBe(clip)
  })
  it('decodes the compact hash block bit for bit, including leading zero and high bytes', () => {
    const clip = getNativeRuntimeClip('/sprites/arkamon/997/front/attack.webp')!
    expect(clip.pages.map(page => page.src)).toEqual([
      '/sprites/arkamon-paged/997/front/attack/page-00-0123456789abcdef.webp',
      '/sprites/arkamon-paged/997/front/attack/page-01-fedcba9876543210.webp',
    ])
    expect(clip.pages.map(page => [page.firstFrame, page.frameCount])).toEqual([[0, 4], [4, 3]])
  })
})
