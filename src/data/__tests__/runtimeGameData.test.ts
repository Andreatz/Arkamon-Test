import { describe, expect, it } from 'vitest'
import authoringMoves from '../mosse.json'
import authoringVfx from '../move-vfx-assignments.json'
import { BASE_RUNTIME_MOVES, RUNTIME_STATUS_ASSIGNMENTS } from '../runtimeGameData'

describe('compact startup game catalog', () => {
  it('reproduces all 220 authored definitions and every value at every level', () => {
    expect(BASE_RUNTIME_MOVES).toEqual(authoringMoves)
    expect(BASE_RUNTIME_MOVES).toHaveLength(220)
  })

  it('does not share mutable level tables between definitions', () => {
    const tables = BASE_RUNTIME_MOVES.flatMap(move => [move.dadiPerLivello, move.incrementoPerLivello])
    expect(new Set(tables).size).toBe(tables.length)
  })

  it('projects exactly the nine authorized status definitions without importing the VFX authoring catalog', () => {
    const ids = new Set([221, 225, 227, 230, 242, 253, 256, 270, 271])
    const expected = authoringVfx.moves.filter(move => ids.has(move.sourceMoveId)
      && move.gameMoveId === null && move.type === 'Status (Paralisi)')
      .map(({ sourceMoveId, gameMoveId, name, type, element, arkamon }) => ({ sourceMoveId, gameMoveId, name, type, element, arkamon }))
    expect(RUNTIME_STATUS_ASSIGNMENTS).toEqual(expected)
  })
})
