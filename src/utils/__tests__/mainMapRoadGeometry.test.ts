import { describe, expect, it } from 'vitest'
import {
  hasOnlyOrthogonalSegments,
  orthogonalizeRoadPoints,
} from '@/utils/mainMapRoadGeometry'

describe('mainMapRoadGeometry', () => {
  it('trasforma i segmenti diagonali in angoli a 90 gradi', () => {
    const points = orthogonalizeRoadPoints([
      { x: 10, y: 10 },
      { x: 20, y: 15 },
      { x: 25, y: 15 },
    ])

    expect(points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 15 },
      { x: 25, y: 15 },
    ])
    expect(hasOnlyOrthogonalSegments(points)).toBe(true)
  })

  it('rimuove punti duplicati e punti intermedi sulla stessa retta', () => {
    expect(
      orthogonalizeRoadPoints([
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        { x: 15, y: 10 },
        { x: 20, y: 10 },
      ])
    ).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ])
  })
})
