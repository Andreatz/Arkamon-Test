import { describe, expect, it } from 'vitest'
import { playbackSource } from './preloadVfxAssets'
import type { MoveVfxAsset } from './types'

const asset = (kind: MoveVfxAsset['kind'], src: string) => ({ kind, src }) as MoveVfxAsset

describe('VFX playback URL policy', () => {
  it('reuses the decoded image for static art regardless of replay ID', () => {
    const image = asset('static-image', '/ui/impact.png')
    const first = playbackSource(image, 101, true)
    const second = playbackSource(image, 102, true)
    expect(first).toBe(second)
    expect(first).not.toContain('vfx=')
    expect(first).toContain('impact.png')
  })

  it('reuses sprite sheets while the native sprite clock restarts separately', () => {
    const sprite = asset('sprite-sheet', '/vfx/moves/punch/punch_60fps.png')
    expect(playbackSource(sprite, 1, true)).toBe(playbackSource(sprite, 2, true))
  })

  it('preserves a distinct GIF first-frame URL for each visible replay', () => {
    const gif = asset('gif', '/vfx/moves/burst/flash.gif')
    const cold = playbackSource(gif, 0, false)
    const first = playbackSource(gif, 101, true)
    const second = playbackSource(gif, 102, true)
    expect(first).not.toBe(second)
    expect(first).toContain('vfx=101')
    expect(second).toContain('vfx=102')
    expect(cold).not.toContain('vfx=')
  })
})
