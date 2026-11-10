import { describe, expect, it } from 'vitest'
import { getBattleVfxImageBudget } from './battleMediaBudget'
import { getNativeSpriteBudget } from '@/utils/spritePageCache'

const MIB = 1024 * 1024
describe('battle decoded-image memory budgets', () => {
  it('reduces the default VFX retention ceiling without changing source resolution', () => {
    expect(getBattleVfxImageBudget('auto')).toBe(64 * MIB)
    expect(getBattleVfxImageBudget('low')).toBe(32 * MIB)
    expect(getBattleVfxImageBudget('full')).toBe(128 * MIB)
  })
  it('keeps total retained caches under selected budgets, independently of active clip pixels', () => {
    expect(getBattleVfxImageBudget('low') + getNativeSpriteBudget('low', 2, true)).toBe(64 * MIB)
    expect(getBattleVfxImageBudget('auto') + getNativeSpriteBudget('auto', 8, false)).toBe(128 * MIB)
  })
})
