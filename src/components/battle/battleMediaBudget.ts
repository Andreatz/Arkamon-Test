import type { GamePreferences } from '@/settings/gamePreferences'

const MIB = 1024 * 1024

/** Separate short-lived VFX image budget from the already bounded native page pool. */
export function getBattleVfxImageBudget(mode: GamePreferences['graphicsMemory']): number {
  switch (mode) {
    case 'low': return 32 * MIB
    case 'full': return 128 * MIB
    default: return 64 * MIB
  }
}
