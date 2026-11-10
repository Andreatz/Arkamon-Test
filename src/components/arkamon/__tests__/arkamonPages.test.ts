import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import paged from '@/data/arkamon-paged.json'
import { ARKAMON_ANIMATION_MANIFEST, getArkamonRuntimeAsset } from '../arkamonAnimationManifest'
import { locateSpritePage, validateSpritePages } from '@/components/vfx/spritePages'

describe('generated native pages match original authoritative animation contracts', () => {
  it('has complete pages for every native front clip with identical frame counts, FPS, viewport and cues', () => {
    expect(Object.keys(paged.clips)).toHaveLength(780)
    expect(Object.values(paged.clips).reduce((total, clip) => total + clip.frameCount, 0)).toBe(74_405)
    const playableClips = Object.values(paged.clips).filter(clip => clip.speciesId <= 110)
    expect(playableClips).toHaveLength(550)
    expect(playableClips.reduce((total, clip) => total + clip.frameCount, 0)).toBe(52_775)
    for (const set of Object.values(ARKAMON_ANIMATION_MANIFEST)) for (const native of Object.values(set!.front!)) {
      const runtime = getArkamonRuntimeAsset(native!)
      expect(runtime.pages).toBeDefined()
      expect(validateSpritePages(runtime.pages!, native!.frameCount, native!.frameWidth, native!.frameHeight)).toBe(true)
      const { pages, ...contract } = runtime
      expect(contract).toEqual(native)
      expect(locateSpritePage(pages!, 0).page.firstFrame).toBe(0)
      expect(locateSpritePage(pages!, native!.frameCount - 1).pageIndex).toBe(pages!.length - 1)
    }
  })

  it('copies pixels at the first, last, reaction/release cues and page boundaries from species 13 attack unchanged', async () => {
    const original = ARKAMON_ANIMATION_MANIFEST[13]!.front!.attack!
    const runtime = getArkamonRuntimeAsset(original)
    const originalPixels = await sharp(resolve('public', original.src.slice(1))).ensureAlpha().raw().toBuffer()
    const sourceWidth = original.frameWidth * original.columns
    const decode = new Map<string, Buffer>()
    for (const frame of [0, 11, 12, 31, 32, 47, 48, 83, 84, 95]) {
      const located = locateSpritePage(runtime.pages!, frame)
      const file = resolve('public', located.page.src.slice(1))
      if (!decode.has(file)) decode.set(file, await sharp(file).ensureAlpha().raw().toBuffer())
      const pixels = decode.get(file)!
      const originalCol = frame % original.columns, originalRow = Math.floor(frame / original.columns)
      for (let y = 0; y < original.frameHeight; y++) for (let x = 0; x < original.frameWidth; x++) {
        const a = ((originalRow * original.frameHeight + y) * sourceWidth + originalCol * original.frameWidth + x) * 4
        const b = ((located.row * original.frameHeight + y) * located.page.width + located.col * original.frameWidth + x) * 4
        if (originalPixels[a + 3] !== pixels[b + 3] || originalPixels[a + 3] > 0 && (originalPixels[a] !== pixels[b] || originalPixels[a + 1] !== pixels[b + 1] || originalPixels[a + 2] !== pixels[b + 2])) {
          throw new Error(`Native pixels differ at frame ${frame}, ${x}, ${y}`)
        }
      }
    }
    // Fingerprints include encoded bytes and exact per-page source geometry.
    const clip = paged.clips[original.src as keyof typeof paged.clips]
    expect(createHash('sha256').update(readFileSync(resolve('public', original.src.slice(1)))).digest('hex')).toBe(clip.sourceSha256)
    for (const page of clip.pages) {
      expect(createHash('sha256').update(readFileSync(resolve('public', page.src.slice(1)))).digest('hex')).toBe(page.sha256)
    }
  }, 30_000)
})
