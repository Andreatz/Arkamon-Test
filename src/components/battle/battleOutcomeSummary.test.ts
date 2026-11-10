import { describe, expect, it } from 'vitest'
import { createBattleChronicle } from './battleChronicle'
import { battleOutcomeSummary } from './battleOutcomeSummary'
import type { BattleLogEvent } from '@/types'

describe('battle outcome summary', () => {
  it('reports only player advancement and real KO events, merging multiple levels', () => {
    const actor = { instanceId: 'a', speciesId: 1, name: 'Vyrath', level: 12, hp: 1 }
    const events: BattleLogEvent[] = [
      { id: '1', kind: 'xp', side: 'A', title: '', messages: [], actor, levelBefore: 10, levelAfter: 11 },
      { id: '2', kind: 'xp', side: 'A', title: '', messages: [], actor, levelBefore: 11, levelAfter: 12 },
      { id: '3', kind: 'xp', side: 'A', title: '', messages: [], actor, levelBefore: 12, levelAfter: 12 },
      { id: '4', kind: 'ko', side: 'B', title: '', messages: [] },
      { id: '5', kind: 'ko', side: 'A', title: '', messages: [] },
    ]
    expect(battleOutcomeSummary({ ...createBattleChronicle('b'), events })).toEqual({ enemyKOs: 1, playerKOs: 1, levels: [{ name: 'Vyrath', before: 10, after: 12 }], partial: false })
    expect(battleOutcomeSummary({ ...createBattleChronicle('b'), events, omittedEvents: 20 }).partial).toBe(true)
  })
})
