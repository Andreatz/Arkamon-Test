import { describe, expect, it } from 'vitest'
import { getLocalMap } from '../localMaps'
import { canMoveOnLocalMap, getAdjacentLocalMapNodes, getLocalMapNode, getLocalRoadPath } from '@engine/localMapMovement'
import { VENEZIA_REFERENCE_EDGES, VENEZIA_REFERENCE_NODES, VENEZIA_REMOVED_SHORTCUTS } from './fixtures/veneziaReference'

const map = getLocalMap('Venezia')!
const numberOf = (id: string) => Number(getLocalMapNode(map, id).label?.replace('Punto ', ''))
const idOf = (number: number) => map.nodes.find((node) => node.label === `Punto ${number}`)!.id
const edgeKey = (from: number, to: number) => [from, to].sort((a, b) => a - b).join(':')

describe('Venezia - riferimento indipendente della foto dell’utente', () => {
  it('assegna i 57 numeri della foto conservando ID e coordinate dei pallini salvati', () => {
    const actual = map.nodes.map((node) => [numberOf(node.id), node.id, node.x, node.y])
      .sort((a, b) => Number(a[0]) - Number(b[0]))
    expect(actual).toEqual(VENEZIA_REFERENCE_NODES)
    expect(map.startNode).toBe('n56')
    expect(getLocalMapNode(map, map.startNode).label).toBe('Punto 29')
  })

  it('include esattamente i 62 collegamenti rosa, senza aggiungerne o perderne altri', () => {
    const actual = map.roads.map((road) => edgeKey(numberOf(road.from), numberOf(road.to))).sort()
    const expected = VENEZIA_REFERENCE_EDGES.map(([from, to]) => edgeKey(from, to)).sort()
    expect(actual).toEqual(expected)
  })

  it('offre a ogni pallino le sole destinazioni adiacenti della foto, anche alle biforcazioni', () => {
    for (const [number, id] of VENEZIA_REFERENCE_NODES) {
      const expected = VENEZIA_REFERENCE_EDGES.flatMap(([from, to]) =>
        from === number ? [to] : to === number ? [from] : []).sort((a, b) => a - b)
      const actual = getAdjacentLocalMapNodes(map, id).map(numberOf).sort((a, b) => a - b)
      expect(actual, `Punto ${number}`).toEqual(expected)
    }
  })

  it('percorre tutti i 62 collegamenti in entrambi i sensi seguendo le stesse curve', () => {
    for (const [from, to] of VENEZIA_REFERENCE_EDGES) {
      const a = idOf(from)
      const b = idOf(to)
      expect(canMoveOnLocalMap(map, a, b), `${from} → ${to}`).toBe(true)
      expect(canMoveOnLocalMap(map, b, a), `${to} → ${from}`).toBe(true)
      const forward = getLocalRoadPath(map, a, b)
      expect(forward.length).toBeGreaterThanOrEqual(2)
      expect(getLocalRoadPath(map, b, a)).toEqual([...forward].reverse())
    }
  })

  it.each(VENEZIA_REMOVED_SHORTCUTS)('rifiuta la vecchia scorciatoia %i–%i in entrambi i sensi', (from, to) => {
    const a = idOf(from)
    const b = idOf(to)
    expect(canMoveOnLocalMap(map, a, b)).toBe(false)
    expect(canMoveOnLocalMap(map, b, a)).toBe(false)
    expect(getLocalRoadPath(map, a, b)).toEqual([])
    expect(getLocalRoadPath(map, b, a)).toEqual([])
  })
})
