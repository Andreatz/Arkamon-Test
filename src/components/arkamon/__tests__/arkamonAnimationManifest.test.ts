import { describe, expect, it } from 'vitest'
import { getPokemon } from '@/data'
import sourceCountsNovember4 from './fixtures/native-import-2026-11-04.json'
import sourceCountsNovember5 from './fixtures/native-import-2026-11-05.json'
import sourceCountsNovember9 from './fixtures/native-import-2026-11-09.json'
import {
  ARKAMON_ANIMATION_MANIFEST,
  getArkamonAnimationAsset,
  getArkamonAnimationDurationMs,
  resolveArkamonAnimationAsset,
  getArkamonRuntimeAsset,
  type ArkamonBattleAnimation,
} from '../arkamonAnimationManifest'

// Type checking rejects an additional legacy animation key in the public API.
const ANIMATION_CONTRACT: Record<ArkamonBattleAnimation, true> = {
  idle: true, attack: true, hit: true, victory: true, ko: true,
}
const PLAYABLE_SPECIES_IDS = Array.from({ length: 110 }, (_, index) => index + 1)
const PENDING_SPECIES_IDS = Array.from({ length: 46 }, (_, index) => index + 111)
const SPECIES_IDS = [...PLAYABLE_SPECIES_IDS, ...PENDING_SPECIES_IDS]
const ORIGINAL_SPECIES_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21]
const ANIMATIONS = Object.keys(ANIMATION_CONTRACT) as ArkamonBattleAnimation[]

describe('Arkamon animation manifest', () => {
  it('provides every supplied species with a complete front set and a single attack animation', () => {
    expect(Object.keys(ARKAMON_ANIMATION_MANIFEST).map(Number)).toEqual(SPECIES_IDS)
    for (const speciesId of SPECIES_IDS) {
      expect(Object.keys(ARKAMON_ANIMATION_MANIFEST[speciesId]!.front!).sort()).toEqual([...ANIMATIONS].sort())
      expect(ARKAMON_ANIMATION_MANIFEST[speciesId]!.front).not.toHaveProperty('physical')
      expect(ARKAMON_ANIMATION_MANIFEST[speciesId]!.front).not.toHaveProperty('special')
      for (const animation of ANIMATIONS) {
        expect(resolveArkamonAnimationAsset(speciesId, 'back', animation)).toBeUndefined()
        expect(getArkamonAnimationDurationMs(speciesId, 'back', animation)).toBe(0)
      }
    }
    expect(resolveArkamonAnimationAsset(207, 'front', 'attack')).toBeUndefined()
    expect(resolveArkamonAnimationAsset(207, 'back', 'attack')).toBeUndefined()
  })

  it('adds supplied graphics without inventing playable species or battle data', () => {
    for (const speciesId of PLAYABLE_SPECIES_IDS) expect(getPokemon(speciesId)).toBeDefined()
    for (const speciesId of PENDING_SPECIES_IDS) {
      expect(getArkamonAnimationAsset(speciesId, 'front', 'idle')).toBeDefined()
      expect(getPokemon(speciesId)).toBeUndefined()
    }
    expect(SPECIES_IDS.filter(id => getPokemon(id))).toEqual(PLAYABLE_SPECIES_IDS)
  })

  it.each(SPECIES_IDS.flatMap((speciesId) => ANIMATIONS.map((animation) => ({ speciesId, animation }))))(
    'selects the dedicated $animation sheet for species $speciesId', ({ speciesId, animation }) => {
    const asset = getArkamonAnimationAsset(speciesId, 'front', animation)
    expect(asset).toBeDefined()
    expect(asset!.src).toBe(`/sprites/arkamon/${speciesId}/front/${animation}.webp`)
    expect(resolveArkamonAnimationAsset(speciesId, 'front', animation)).toEqual({
      asset: getArkamonRuntimeAsset(asset!), animation, isIdleFallback: false,
    })
    expect(asset!.loop).toBe(animation === 'idle')
    expect(getArkamonAnimationDurationMs(speciesId, 'front', animation)).toBe(asset!.durationMs)
  })

  it.each(SPECIES_IDS)('uses native-frame cues only on attack and hit for species %s', (speciesId) => {
    const attack = getArkamonAnimationAsset(speciesId, 'front', 'attack')!
    const hit = getArkamonAnimationAsset(speciesId, 'front', 'hit')!
    for (const [asset, marker] of [[attack, attack.releaseFrame], [hit, hit.reactionFrame]] as const) {
      expect(Number.isInteger(marker)).toBe(true)
      expect(marker).toBeGreaterThanOrEqual(0)
      expect(marker).toBeLessThan(asset.frameCount)
      expect(marker! / asset.fps * 1000).toBeLessThan(asset.durationMs!)
    }
    expect(attack.reactionFrame).toBeUndefined()
    expect(hit.releaseFrame).toBeUndefined()
    for (const animation of ['idle', 'victory', 'ko'] as const) {
      const asset = getArkamonAnimationAsset(speciesId, 'front', animation)!
      expect(asset.releaseFrame).toBeUndefined()
      expect(asset.reactionFrame).toBeUndefined()
    }
  })

  it('retains all 7,990 independently decoded frames of the seventeen November forms', () => {
    const counts = sourceCountsNovember4 as Record<string, Record<ArkamonBattleAnimation, number>>
    expect(Object.keys(counts).map(Number)).toEqual([117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 134, 139])
    let frames = 0
    for (const [id, actions] of Object.entries(counts)) for (const animation of ANIMATIONS) {
      const asset = getArkamonAnimationAsset(Number(id), 'front', animation)!
      expect(asset.frameCount).toBe(actions[animation])
      expect(asset.fps).toBe(24)
      expect(asset.durationMs).toBeCloseTo(actions[animation] / 24 * 1000)
      frames += asset.frameCount
    }
    expect(frames).toBe(7_990)
  })

  it('retains all 6,580 independently decoded frames of the fourteen November 5 forms', () => {
    const counts = sourceCountsNovember5 as Record<string, Record<ArkamonBattleAnimation, number>>
    expect(Object.keys(counts).map(Number)).toEqual([132, 133, 135, 136, 137, 138, 140, 141, 142, 143, 144, 145, 149, 150])
    let frames = 0
    for (const [id, actions] of Object.entries(counts)) for (const animation of ANIMATIONS) {
      const asset = getArkamonAnimationAsset(Number(id), 'front', animation)!
      expect(asset.frameCount).toBe(actions[animation])
      expect(asset.fps).toBe(24)
      expect(asset.durationMs).toBeCloseTo(actions[animation] / 24 * 1000)
      frames += asset.frameCount
    }
    expect(frames).toBe(6_580)
  })

  it('retains the 4,700 source frames of the nine new sets and replacement form 149 without padding', () => {
    const counts = sourceCountsNovember9 as Record<string, Record<ArkamonBattleAnimation, number>>
    expect(Object.keys(counts).map(Number)).toEqual([146, 147, 148, 149, 151, 152, 153, 154, 155, 156])
    let frames = 0
    for (const [id, actions] of Object.entries(counts)) for (const animation of ANIMATIONS) {
      const asset = getArkamonAnimationAsset(Number(id), 'front', animation)!
      expect(asset.frameCount).toBe(actions[animation])
      expect(asset.fps).toBe(24)
      expect(asset.durationMs).toBeCloseTo(actions[animation] / 24 * 1000)
      frames += asset.frameCount
    }
    expect(frames).toBe(4_700)
  })

  it('retains a view’s idle as the fallback when a dedicated action is unavailable', () => {
    const front = ARKAMON_ANIMATION_MANIFEST[5]!.front!
    const hit = front.hit
    delete front.hit
    try {
      expect(resolveArkamonAnimationAsset(5, 'front', 'hit')).toEqual({
        asset: getArkamonRuntimeAsset(front.idle!), animation: 'idle', isIdleFallback: true,
      })
    } finally {
      front.hit = hit
    }
  })

  it('retains all source frames at native timing within the frame grid', () => {
    for (const speciesId of SPECIES_IDS) for (const animation of ANIMATIONS) {
      const asset = getArkamonAnimationAsset(speciesId, 'front', animation)!
      expect(Number.isInteger(asset.frameCount)).toBe(true)
      expect(asset.frameCount).toBeGreaterThan(1)
      expect(asset.fps).toBeGreaterThan(0)
      expect(asset.durationMs).toBeCloseTo(asset.frameCount / asset.fps * 1000)
      expect((asset.startFrame ?? 0) + asset.frameCount).toBeLessThanOrEqual(asset.columns * asset.rows)
      expect(asset.width / asset.height).toBeCloseTo(asset.frameWidth / asset.frameHeight)
    }
  })

  it('keeps the original eleven front sets at their existing native 96 frames and 24 FPS', () => {
    for (const speciesId of ORIGINAL_SPECIES_IDS) for (const animation of ANIMATIONS) {
      const asset = getArkamonAnimationAsset(speciesId, 'front', animation)!
      expect(asset.frameCount).toBe(96)
      expect(asset.fps).toBe(24)
      expect(asset.durationMs).toBe(4000)
    }
  })

  it('preserves all short native clips without padding and all other new clips at 96 frames', () => {
    // Independently decoded supplied videos contain these 95-frame clips.
    // Their real final frame must not be replaced with a padded 96th frame.
    const shortClips = new Set(['41/idle', '41/attack', '47/hit', '52/attack', '52/ko', '79/victory', '83/ko',
      '107/idle', '107/attack', '107/hit', '107/victory', '107/ko',
      '108/attack', '108/ko', '109/hit', '109/victory', '110/attack', '110/hit', '110/victory'])
    for (const speciesId of PLAYABLE_SPECIES_IDS.filter(id => id >= 39)) for (const animation of ANIMATIONS) {
      const asset = getArkamonAnimationAsset(speciesId, 'front', animation)!
      const count = shortClips.has(`${speciesId}/${animation}`) ? 95 : 96
      expect(asset.frameCount).toBe(count)
      expect(asset.fps).toBe(24)
      expect(asset.durationMs).toBeCloseTo(count / 24 * 1000)
    }
  })

  it('keeps the 2,830 supplied frames of the six pending forms at 24 FPS without padding', () => {
    const nativeCounts: Record<number, Record<ArkamonBattleAnimation, number>> = {
      111: { idle: 94, attack: 95, hit: 94, victory: 95, ko: 95 },
      112: { idle: 95, attack: 95, hit: 94, victory: 95, ko: 95 },
      113: { idle: 94, attack: 95, hit: 95, victory: 94, ko: 95 },
      114: { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 },
      115: { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 },
      116: { idle: 94, attack: 94, hit: 94, victory: 94, ko: 94 },
    }
    let total = 0
    for (const speciesId of [111, 112, 113, 114, 115, 116]) for (const animation of ANIMATIONS) {
      const asset = getArkamonAnimationAsset(speciesId, 'front', animation)!
      expect(asset.frameCount).toBe(nativeCounts[speciesId][animation])
      expect(asset.fps).toBe(24)
      expect(asset.durationMs).toBeCloseTo(nativeCounts[speciesId][animation] / 24 * 1000)
      total += asset.frameCount
    }
    expect(total).toBe(2_830)
  })
})
