import { describe, expect, it } from 'vitest'
import { shouldSampleSpriteMemory, shouldWarmNextSpritePage } from './spriteRenderPerformance'

describe('native sprite performance policy', () => {
  it('samples memory on first draw, page handover and at most twice a second during continuous playback', () => {
    expect(shouldSampleSpriteMemory(-Infinity, 10, -1, 0)).toBe(true)
    expect(shouldSampleSpriteMemory(10, 250, 0, 0)).toBe(false)
    expect(shouldSampleSpriteMemory(10, 509, 0, 0)).toBe(false)
    expect(shouldSampleSpriteMemory(10, 510, 0, 0)).toBe(true)
    expect(shouldSampleSpriteMemory(510, 535, 0, 1)).toBe(true)
    expect(shouldSampleSpriteMemory(535, 538, 1, 1)).toBe(false)
  })

  it('defers the next atlas warmup until the page handover approaches', () => {
    const page = { firstFrame: 100, frameCount: 120 }
    expect(shouldWarmNextSpritePage(page, 100, 1000 / 30)).toBe(false)
    expect(shouldWarmNextSpritePage(page, 175, 1000 / 30)).toBe(false)
    expect(shouldWarmNextSpritePage(page, 185, 1000 / 30)).toBe(true)
    expect(shouldWarmNextSpritePage(page, 219, 1000 / 30)).toBe(true)
    expect(shouldWarmNextSpritePage(page, 220, 1000 / 30)).toBe(false)
  })

  it('warms even short pages immediately so clips never require a fabricated frame skip', () => {
    const short = { firstFrame: 0, frameCount: 15 }
    expect(shouldWarmNextSpritePage(short, 0, 1000 / 60)).toBe(true)
    expect(shouldWarmNextSpritePage(short, 9, 1000 / 60)).toBe(true)
    expect(shouldWarmNextSpritePage(short, 10, 0)).toBe(true)
  })
})
