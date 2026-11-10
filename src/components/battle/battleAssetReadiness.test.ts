import { describe, expect, it } from 'vitest'
import { getBattleReadinessPlan } from './useBattleAssetReadiness'
describe('battle asset readiness priorities', () => {
  it('warms only unique current actors in the foreground and queues reserves separately', () => {
    expect(getBattleReadinessPlan([1, 13, 1], [1, 2, 3, 13, 2, 5])).toEqual({ current: [1, 13], deferred: [2, 3, 5] })
  })
  it('does not mutate the live squad or its order', () => {
    const team = [1, 2, 3]
    getBattleReadinessPlan([1], team).deferred.shift()
    expect(team).toEqual([1, 2, 3])
  })
})
