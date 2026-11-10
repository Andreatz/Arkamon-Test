import { describe, expect, it } from 'vitest'
import { getMainMapJourney, mapJourneyTiming } from './mapJourney'

const roads = [{ key: 'Roma__Venezia', points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }] }]
describe('main map journeys', () => {
  it('follows the saved bend in both directions without mutating the catalog', () => {
    expect(getMainMapJourney(roads, 'Roma', 'Venezia')).toEqual(roads[0].points)
    const reverse = getMainMapJourney(roads, 'Venezia', 'Roma')
    expect(reverse).toEqual([...roads[0].points].reverse())
    reverse[0].x = 88
    expect(roads[0].points[2].x).toBe(20)
    expect(getMainMapJourney(roads, 'Roma', 'Milano')).toEqual([])
    expect(getMainMapJourney(roads, 'Roma', 'Roma')).toEqual([])
  })
  it('uses screen distance rather than percentage distance for even speed', () => {
    const timing = mapJourneyTiming(roads[0].points, 1920, 1080)
    expect(timing.times).toEqual([0, 192 / 300, 1])
    expect(timing.duration).toBeCloseTo(300 / 650)
    expect(mapJourneyTiming([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1920, 1080).duration).toBe(.35)
    expect(mapJourneyTiming([{ x: 0, y: 0 }, { x: 100, y: 100 }], 1920, 1080).duration).toBe(.65)
    expect(mapJourneyTiming([{ x: 0, y: 0 }, { x: 0, y: 0 }], 0, 0).times).toEqual([0, 1])
  })
})
