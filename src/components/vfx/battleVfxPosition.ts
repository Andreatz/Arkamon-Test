import type {
  AdminBattleLayout,
  AdminLayoutRect,
} from '@/theme/adminThemeTypes'
import type { VfxAnchor } from './types'

export type BattleVfxPosition = {
  x: number
  y: number
}

function centerOf(rect: AdminLayoutRect): BattleVfxPosition {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  }
}

function rectForSide(
  layout: AdminBattleLayout,
  side: 'A' | 'B'
): AdminLayoutRect {
  return side === 'A'
    ? layout.playerSprite
    : layout.enemySprite
}

export function getBattleSideCenter(
  layout: AdminBattleLayout,
  side: 'A' | 'B'
): BattleVfxPosition {
  return centerOf(rectForSide(layout, side))
}

export function getBattleVfxAnchorPosition(
  layout: AdminBattleLayout,
  attackingSide: 'A' | 'B',
  anchor: VfxAnchor
): BattleVfxPosition {
  if (anchor === 'screen') return { x: 50, y: 50 }
  if (anchor === 'center') {
    return { x: 50, y: 48 }
  }

  if (anchor === 'target') {
    return getBattleSideCenter(
      layout,
      attackingSide === 'A' ? 'B' : 'A'
    )
  }

  // attacker e self
  return getBattleSideCenter(layout, attackingSide)
}

export function getBattleDamagePosition(
  layout: AdminBattleLayout,
  side: 'A' | 'B'
): BattleVfxPosition {
  const rect = rectForSide(layout, side)

  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h * 0.25,
  }
}
