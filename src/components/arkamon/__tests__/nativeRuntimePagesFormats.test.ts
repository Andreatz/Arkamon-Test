import { describe, expect, it, vi } from 'vitest'

const examples = vi.hoisted(() => ({
  90001: [[[512, 512, 16, 24, [16, 4, '']]]],
  90004: [[[384, 384, 48, 24, [16, 4, ',,']]]],
}))
vi.mock('virtual:arkamon-runtime-pages', () => ({ default: examples }))

import { getNativeRuntimeClip } from '../nativeRuntimePages'

describe('native runtime page format compatibility', () => {
  it('expands a single legacy page even when its filename token is empty', () => {
    const clip = getNativeRuntimeClip('/sprites/arkamon/90001/front/idle.webp')!
    expect(clip).toEqual({ frameWidth: 512, frameHeight: 512, frameCount: 16, fps: 24, pages: [{
      src: '/sprites/arkamon-paged/90001/front/idle/page-00.webp', firstFrame: 0, frameCount: 16,
      columns: 4, rows: 4, width: 2048, height: 2048, decodedBytes: 16_777_216,
    }] })
  })

  it('retains every legacy page when all shared-grid filename tokens are empty', () => {
    const clip = getNativeRuntimeClip('/sprites/arkamon/90004/front/idle.webp')!
    expect(clip.pages.map(page => [page.src, page.firstFrame, page.frameCount])).toEqual([
      ['/sprites/arkamon-paged/90004/front/idle/page-00.webp', 0, 16],
      ['/sprites/arkamon-paged/90004/front/idle/page-01.webp', 16, 16],
      ['/sprites/arkamon-paged/90004/front/idle/page-02.webp', 32, 16],
    ])
    expect(getNativeRuntimeClip('/sprites/arkamon/90005/front/idle.webp')).toBeUndefined()
  })
})
