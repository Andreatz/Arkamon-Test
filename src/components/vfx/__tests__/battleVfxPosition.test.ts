import { describe, expect, it } from 'vitest'
import { defaultBattleLayout } from '@/theme/defaultAdminTheme'
import {
  getBattleDamagePosition,
  getBattleSideCenter,
  getBattleVfxAnchorPosition,
} from '../battleVfxPosition'

describe('battle VFX positions', () => {
  const layout = {
    ...defaultBattleLayout,

    playerSprite: {
      x: 10,
      y: 60,
      w: 20,
      h: 30,
    },

    enemySprite: {
      x: 70,
      y: 10,
      w: 20,
      h: 20,
    },
  }

  it('centers both battle sides on their sprite rectangles', () => {
    expect(getBattleSideCenter(layout, 'A')).toEqual({
      x: 20,
      y: 75,
    })

    expect(getBattleSideCenter(layout, 'B')).toEqual({
      x: 80,
      y: 20,
    })
  })

  it('routes attacker and target dynamically', () => {
    expect(
      getBattleVfxAnchorPosition(layout, 'A', 'attacker')
    ).toEqual({
      x: 20,
      y: 75,
    })

    expect(
      getBattleVfxAnchorPosition(layout, 'A', 'target')
    ).toEqual({
      x: 80,
      y: 20,
    })

    expect(
      getBattleVfxAnchorPosition(layout, 'B', 'target')
    ).toEqual({
      x: 20,
      y: 75,
    })
  })

  it('places damage text in the upper part of the target sprite', () => {
    expect(getBattleDamagePosition(layout, 'B')).toEqual({
      x: 80,
      y: 15,
    })
  })
})