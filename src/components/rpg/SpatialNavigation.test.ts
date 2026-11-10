import { describe, expect, it } from 'vitest'
import { nextSpatialIndex } from './SpatialNavigation'

describe('spatial command navigation', () => {
  it('moves by a full row inside the 7 by 5 deposit without leaving its boundaries', () => {
    expect(nextSpatialIndex(0, 35, 'ArrowDown', 7)).toBe(7)
    expect(nextSpatialIndex(34, 35, 'ArrowDown', 7)).toBe(34)
    expect(nextSpatialIndex(0, 35, 'ArrowUp', 7)).toBe(0)
    expect(nextSpatialIndex(34, 35, 'Home', 7)).toBe(0)
    expect(nextSpatialIndex(0, 35, 'End', 7)).toBe(34)
  })
  it('handles a partial bag row and an empty group', () => {
    expect(nextSpatialIndex(5, 7, 'ArrowDown', 4)).toBe(6)
    expect(nextSpatialIndex(0, 0, 'ArrowDown', 4)).toBe(-1)
    expect(nextSpatialIndex(5, 7, 'Enter', 4)).toBe(5)
  })
})
