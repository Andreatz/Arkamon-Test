import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOVE_VFX_VISIBLE_MS } from '@/components/MoveVfx'
import { MOVE_VFX_ASSETS } from '../vfxManifest'

describe('MOVE_VFX_ASSETS', () => {
  it('references runtime assets that exist under public', () => {
    for (const asset of Object.values(MOVE_VFX_ASSETS)) {
      expect(existsSync(resolve('public', asset.src)), asset.src).toBe(true)
    }
  })

  it('describes sprite sheets within their real grid bounds', () => {
    for (const asset of Object.values(MOVE_VFX_ASSETS)) {
      if (!asset.sprite) continue
      expect(asset.sprite.frameCount).toBeLessThanOrEqual(
        asset.sprite.columns * asset.sprite.rows
      )
      expect(asset.sprite.frameWidth).toBeGreaterThan(0)
      expect(asset.sprite.frameHeight).toBeGreaterThan(0)
      expect(asset.sprite.columns).toBeGreaterThan(0)
      expect(asset.sprite.rows).toBeGreaterThan(0)
      expect(asset.sprite.fps).toBeGreaterThan(0)
    }
  })

  it('keeps every asset mounted for its full playback duration', () => {
    for (const asset of Object.values(MOVE_VFX_ASSETS)) {
      expect(asset.durationMs, asset.id).toBeLessThanOrEqual(MOVE_VFX_VISIBLE_MS)
    }
  })
})
