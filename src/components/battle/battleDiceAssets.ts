import { GENERATED_MOVE_VFX_ASSETS } from '../vfx/generatedVfxAssets'
import type { SpriteSheetMeta } from '../vfx/types'

export const BATTLE_DICE_ROLL_VISIBLE_MS = 2000

type DiceValue = 1 | 2 | 3 | 4 | 5 | 6

export const BATTLE_DICE_ASSETS: Record<DiceValue, string> = {
  1: 'generated:effectpl-img_dicemaster-images_nested__diceroll__1_sheet',
  2: 'generated:effectpl-img_dicemaster-images_nested__diceroll__2_sheet',
  3: 'generated:effectpl-img_dicemaster-images_nested__diceroll__3_sheet',
  4: 'generated:effectpl-img_dicemaster-images_nested__diceroll__4_sheet',
  5: 'generated:effectpl-img_dicemaster-images_nested__diceroll__5_sheet',
  6: 'generated:effectpl-img_dicemaster-images_nested__diceroll__6_sheet',
}

export const BATTLE_DICE_ASSET_IDS = Object.values(BATTLE_DICE_ASSETS)

interface DiceSpriteSegment {
  src: string
  sprite: SpriteSheetMeta
}

export interface BattleDiceSequence {
  intro: DiceSpriteSegment
  result: DiceSpriteSegment
  durationMs: number
}

/** The first sheet includes the roll; every sheet ends with six result frames. */
export function getBattleDiceSequence(value: number): BattleDiceSequence | null {
  if (!Number.isInteger(value) || value < 1 || value > 6) return null

  const common = GENERATED_MOVE_VFX_ASSETS[BATTLE_DICE_ASSETS[1]]
  const outcome = GENERATED_MOVE_VFX_ASSETS[BATTLE_DICE_ASSETS[value as DiceValue]]
  const resultFrameCount = 6
  if (!common?.sprite || !outcome?.sprite) return null
  const introFrameCount = common.sprite.frameCount - resultFrameCount
  if (introFrameCount < 1 || outcome.sprite.frameCount < resultFrameCount) return null

  return {
    intro: {
      src: common.src,
      sprite: { ...common.sprite, startFrame: 0, frameCount: introFrameCount },
    },
    result: {
      src: outcome.src,
      sprite: {
        ...outcome.sprite,
        startFrame: outcome.sprite.frameCount - resultFrameCount,
        frameCount: resultFrameCount,
      },
    },
    durationMs: Math.ceil(
      (introFrameCount / common.sprite.fps + resultFrameCount / outcome.sprite.fps) * 1000
    ),
  }
}
