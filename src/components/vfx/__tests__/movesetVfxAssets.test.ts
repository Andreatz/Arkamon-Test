import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import catalog from '../../../../public/vfx/moves/ai-generated/catalog.json'
import { MOVE_VFX_ASSETS } from '../vfxManifest'
import { MOVE_VFX_ASSIGNMENTS } from '../moveVfxAssignments'

function frameHasAlpha(alpha: Buffer, width: number, index: number): boolean {
  const column = index % 4
  const row = Math.floor(index / 4)
  for (let y = row * 512; y < (row + 1) * 512; y++) {
    const start = y * width + column * 512
    if (alpha.subarray(start, start + 512).some((value) => value > 0)) return true
  }
  return false
}

describe('generated moveset sprite sheets', () => {
  it('maps all 276 catalog entries to distinct reserved assets with matching playback metadata', () => {
    expect(catalog.schemaVersion).toBe(1)
    expect(catalog.assets.map((entry) => entry.sourceMoveId)).toEqual(Array.from({ length: 276 }, (_, i) => i + 1))
    expect(new Set(catalog.assets.map((entry) => entry.id)).size).toBe(276)
    expect(new Set(catalog.assets.map((entry) => entry.src)).size).toBe(276)
    expect(new Set(catalog.assets.map((entry) => entry.sha256)).size).toBe(276)
    for (const entry of catalog.assets) {
      const assignment = MOVE_VFX_ASSIGNMENTS.find((move) => move.sourceMoveId === entry.sourceMoveId)!
      const asset = MOVE_VFX_ASSETS[entry.id]
      expect(entry.id).toBe(`moveset:${String(entry.sourceMoveId).padStart(3, '0')}`)
      expect(entry.label).toContain(assignment.name)
      expect(entry.review).toBe('proposed')
      expect(assignment.assetId).toBe(entry.id)
      expect(asset, entry.id).toMatchObject({
        id: entry.id, src: entry.src, kind: 'sprite-sheet',
        sprite: { frameWidth: 512, frameHeight: 512, columns: 4, rows: 4, frameCount: 16, fps: entry.sprite.fps },
        anchor: entry.anchor, motion: entry.motion, scale: 1, blendMode: 'normal', width: 420, height: 420,
      })
      expect(asset.durationMs).toBe(Math.round(16 * 1000 / entry.sprite.fps))
      expect(asset.impactAtMs).toBe(Math.round(9 * 1000 / entry.sprite.fps))
      expect(asset.impactAtMs).toBeLessThan(asset.durationMs)
    }
    // Retaining these assets keeps existing overrides, recipes and calibrations usable.
    for (const id of ['slash', 'waterGif', 'generated:anglercompany-img_ladderpuzzle_shock-images_nested_sheet']) {
      expect(MOVE_VFX_ASSETS[id], id).toBeDefined()
    }
  })

  it('decodes every actual PNG and verifies dimensions, alpha, fingerprints and all 16 frame endpoints', async () => {
    const fingerprints = new Set<string>()
    for (const entry of catalog.assets) {
      expect(entry.src).toMatch(/^vfx\/moves\/ai-generated\/[^/\\]+\.png$/)
      const buffer = await readFile(resolve('public', entry.src))
      const sha256 = createHash('sha256').update(buffer).digest('hex')
      expect(sha256, entry.id).toBe(entry.sha256)
      expect(fingerprints.has(sha256), entry.id).toBe(false)
      fingerprints.add(sha256)
      const metadata = await sharp(buffer).metadata()
      expect(metadata, entry.id).toMatchObject({ format: 'png', width: 2048, height: 2048, channels: 4, hasAlpha: true })
      const { data: alpha, info } = await sharp(buffer).extractChannel('alpha').raw().toBuffer({ resolveWithObject: true })
      expect(frameHasAlpha(alpha, info.width, 0), `${entry.id} first frame`).toBe(false)
      expect(frameHasAlpha(alpha, info.width, 15), `${entry.id} last frame`).toBe(false)
      for (let index = 1; index < 15; index++) {
        expect(frameHasAlpha(alpha, info.width, index), `${entry.id} frame ${index + 1}`).toBe(true)
      }
    }
  }, 90_000)
})
