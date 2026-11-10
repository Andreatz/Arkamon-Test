import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { getMoveVfxAsset } from '../vfx/vfxManifest'
import {
  BATTLE_DICE_ASSET_IDS,
  BATTLE_DICE_ROLL_VISIBLE_MS,
  getBattleDiceSequence,
} from './battleDiceAssets'

function sequenceFor(value: number) {
  const sequence = getBattleDiceSequence(value)
  if (!sequence) throw new Error(`Missing battle die sequence for result ${value}`)
  return sequence
}

describe('battle dice sprite sequences', () => {
  it('preloads six distinct result sheets and selects the exact face rolled by the engine', () => {
    expect(BATTLE_DICE_ASSET_IDS).toHaveLength(6)
    expect(new Set(BATTLE_DICE_ASSET_IDS).size).toBe(6)

    const preloadedSources = BATTLE_DICE_ASSET_IDS.map((id) => {
      const asset = getMoveVfxAsset(id)
      expect(asset, id).toBeDefined()
      expect(asset?.kind, id).toBe('sprite-sheet')
      return asset?.src
    })
    const resultSources = Array.from({ length: 6 }, (_, index) => {
      const value = index + 1
      const sequence = sequenceFor(value)
      expect(sequence.result.src).toMatch(new RegExp(`/DiceRoll/${value}_sheet\\.png$`))
      return sequence.result.src
    })

    expect(new Set(resultSources).size).toBe(6)
    expect(new Set(preloadedSources)).toEqual(new Set(resultSources))
  })

  it('shares one full rolling intro and joins it to the contiguous six-frame result tail', () => {
    const first = sequenceFor(1)
    expect(first.intro.src).toBe(first.result.src)
    expect(first.intro.sprite).toMatchObject({ startFrame: 0, frameCount: 16 })
    expect(first.result.sprite).toMatchObject({ startFrame: 16, frameCount: 6 })
    expect(first.intro.sprite.startFrame! + first.intro.sprite.frameCount)
      .toBe(first.result.sprite.startFrame)

    for (let value = 2; value <= 6; value++) {
      const sequence = sequenceFor(value)
      expect(sequence.intro).toEqual(first.intro)
      expect(sequence.result.sprite).toMatchObject({ startFrame: 0, frameCount: 6 })
      expect(sequence.result.sprite.fps).toBe(first.result.sprite.fps)
    }
  })

  it('rejects invalid die values rather than silently displaying a different result', () => {
    for (const value of [-1, 0, 1.5, 6.1, 7, Number.NaN, Infinity, -Infinity]) {
      expect(getBattleDiceSequence(value), String(value)).toBeNull()
    }
  })

  it('finishes the full roll and result before the existing battle continuation timer', () => {
    expect(BATTLE_DICE_ROLL_VISIBLE_MS).toBe(2000)
    const durations = new Set<number>()
    for (let value = 1; value <= 6; value++) {
      const sequence = sequenceFor(value)
      const playbackMs = 1000 * (
        sequence.intro.sprite.frameCount / sequence.intro.sprite.fps +
        sequence.result.sprite.frameCount / sequence.result.sprite.fps
      )
      expect(Math.abs(sequence.durationMs - playbackMs)).toBeLessThan(1)
      expect(sequence.durationMs).toBeLessThan(BATTLE_DICE_ROLL_VISIBLE_MS)
      // The landed result remains readable before the turn can continue.
      expect(BATTLE_DICE_ROLL_VISIBLE_MS - sequence.durationMs).toBeGreaterThan(500)
      durations.add(sequence.durationMs)
    }
    expect(durations.size).toBe(1)
  })

  it('decodes sheets with visible first intro, first result and final result frames', async () => {
    for (let value = 1; value <= 6; value++) {
      const sequence = sequenceFor(value)
      for (const region of [sequence.intro, sequence.result]) {
        const path = resolve('public', region.src.replace(/^\/+/, ''))
        expect(existsSync(path), region.src).toBe(true)
        const metadata = await sharp(path).metadata()
        const sprite = region.sprite
        expect(metadata, region.src).toMatchObject({
          format: 'png',
          width: sprite.columns * sprite.frameWidth,
          height: sprite.rows * sprite.frameHeight,
          hasAlpha: true,
        })
        expect(sprite.startFrame ?? 0).toBeGreaterThanOrEqual(0)
        expect(sprite.frameCount).toBeGreaterThan(0)
        expect((sprite.startFrame ?? 0) + sprite.frameCount)
          .toBeLessThanOrEqual(sprite.columns * sprite.rows)

        // Readiness must correspond to a visible die, including reduced-motion
        // results that skip the rolling intro and start at the result segment.
        const firstFrame = sprite.startFrame ?? 0
        const firstAlpha = await sharp(path)
          .extract({
            left: (firstFrame % sprite.columns) * sprite.frameWidth,
            top: Math.floor(firstFrame / sprite.columns) * sprite.frameHeight,
            width: sprite.frameWidth,
            height: sprite.frameHeight,
          })
          .extractChannel('alpha')
          .raw()
          .toBuffer()
        expect(firstAlpha.some((pixel) => pixel > 0), `${region.src} first frame ${firstFrame}`).toBe(true)
      }

      const { src, sprite } = sequence.result
      const finalFrame = (sprite.startFrame ?? 0) + sprite.frameCount - 1
      const alpha = await sharp(resolve('public', src.replace(/^\/+/, '')))
        .extract({
          left: (finalFrame % sprite.columns) * sprite.frameWidth,
          top: Math.floor(finalFrame / sprite.columns) * sprite.frameHeight,
          width: sprite.frameWidth,
          height: sprite.frameHeight,
        })
        .extractChannel('alpha')
        .raw()
        .toBuffer()
      expect(alpha.some((pixel) => pixel > 0), `Result ${value} final frame`).toBe(true)
    }
  })
})
