import { describe, expect, it } from 'vitest'
import type { LocalMapDefinition } from '@data/localMaps'
import {
  canMoveOnLocalMap,
  getAdjacentLocalMapNodes,
  getLocalMapNode,
  getLocalRoadPath,
} from '@engine/localMapMovement'

const map: LocalMapDefinition = {
  id: 'Test', image: '/maps/Test.png', startNode: 'a',
  nodes: [
    { id: 'a', x: 10, y: 20 }, { id: 'b', x: 40, y: 30 },
    { id: 'c', x: 70, y: 80 }, { id: 'isolato', x: 90, y: 90 },
  ],
  roads: [
    { from: 'a', to: 'b', points: [{ x: 20, y: 22 }, { x: 30, y: 28 }] },
    { from: 'b', to: 'c' },
  ],
}

describe('movimento mappe locali', () => {
  it('percorre solo strade adiacenti, in entrambe le direzioni', () => {
    expect(getAdjacentLocalMapNodes(map, 'b')).toEqual(['a', 'c'])
    expect(canMoveOnLocalMap(map, 'a', 'b')).toBe(true)
    expect(canMoveOnLocalMap(map, 'b', 'a')).toBe(true)
    expect(canMoveOnLocalMap(map, 'a', 'c')).toBe(false)
    expect(canMoveOnLocalMap(map, 'a', 'a')).toBe(false)
    expect(canMoveOnLocalMap(map, 'a', 'isolato')).toBe(false)
    expect(getAdjacentLocalMapNodes(map, 'sconosciuto')).toEqual([])
  })

  it('non percorre riferimenti a nodi inesistenti anche se presenti nelle strade', () => {
    const malformed = { ...map, roads: [...map.roads, { from: 'a', to: 'fantasma' }] }
    expect(getAdjacentLocalMapNodes(malformed, 'a')).toEqual(['b'])
    expect(canMoveOnLocalMap(malformed, 'fantasma', 'a')).toBe(false)
  })

  it('segue tutte le curve del percorso e le inverte tornando indietro', () => {
    const forward = getLocalRoadPath(map, 'a', 'b')
    expect(forward).toEqual([
      { x: 10, y: 20 }, { x: 20, y: 22 }, { x: 30, y: 28 }, { x: 40, y: 30 },
    ])
    expect(getLocalRoadPath(map, 'b', 'a')).toEqual([...forward].reverse())
    expect(getLocalRoadPath(map, 'a', 'c')).toEqual([])
    expect(map.roads[0].points).toEqual([{ x: 20, y: 22 }, { x: 30, y: 28 }])
  })

  it('usa il punto di ingresso per una posizione precedente non più valida', () => {
    expect(getLocalMapNode(map, 'b').id).toBe('b')
    expect(getLocalMapNode(map).id).toBe('a')
    expect(getLocalMapNode(map, 'rimosso').id).toBe('a')
  })
})
