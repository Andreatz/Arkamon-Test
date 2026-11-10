import type { BattleChronicle } from '@/types'

/** Summarise only settled/revealed events. This never calculates new rolls or rewards. */
export function battleOutcomeSummary(chronicle: BattleChronicle) {
  const levels = new Map<string, { name: string; before: number; after: number }>()
  for (const event of chronicle.events) {
    if (event.kind !== 'xp' || event.side !== 'A' || !event.actor || event.levelBefore === undefined || event.levelAfter === undefined || event.levelAfter <= event.levelBefore) continue
    const existing = levels.get(event.actor.instanceId)
    levels.set(event.actor.instanceId, { name: event.actor.name, before: existing?.before ?? event.levelBefore, after: event.levelAfter })
  }
  return {
    enemyKOs: chronicle.events.filter((event) => event.kind === 'ko' && event.side === 'B').length,
    playerKOs: chronicle.events.filter((event) => event.kind === 'ko' && event.side === 'A').length,
    levels: [...levels.values()], partial: chronicle.omittedEvents > 0,
  }
}
