import { describe, expect, it } from 'vitest'
import { getLocalMap } from '../localMaps'
import { canMoveOnLocalMap, getAdjacentLocalMapNodes, getLocalMapNode, getLocalRoadPath } from '@engine/localMapMovement'
import {
  CAGLIARI_ADDED_CONNECTIONS, CAGLIARI_REFERENCE_EDGES, CAGLIARI_REFERENCE_NODES,
  CAGLIARI_REMOVED_SHORTCUTS, CAGLIARI_SHARED_JUNCTION,
} from './fixtures/cagliariReference'
import {
  FOGGIA_ADDED_CONNECTIONS, FOGGIA_REFERENCE_EDGES, FOGGIA_REFERENCE_NODES, FOGGIA_REMOVED_SHORTCUTS,
  FOGGIA_SHARED_JUNCTION,
} from './fixtures/foggiaReference'

const references = [
  { city: 'Cagliari', nodes: CAGLIARI_REFERENCE_NODES, edges: CAGLIARI_REFERENCE_EDGES,
    removed: CAGLIARI_REMOVED_SHORTCUTS, added: CAGLIARI_ADDED_CONNECTIONS, startId: 'n4', edgeCount: 44 },
  { city: 'Foggia', nodes: FOGGIA_REFERENCE_NODES, edges: FOGGIA_REFERENCE_EDGES,
    removed: FOGGIA_REMOVED_SHORTCUTS, added: FOGGIA_ADDED_CONNECTIONS, startId: 'n58', edgeCount: 77 },
]
const edgeKey = (from: number, to: number) => [from, to].sort((a, b) => a - b).join(':')

describe.each(references)('$city - riferimento indipendente della foto dell’utente', (reference) => {
  const map = getLocalMap(reference.city)!
  const numberOf = (id: string) => Number(getLocalMapNode(map, id).label?.replace('Punto ', ''))
  const idOf = (number: number) => reference.nodes.find(([point]) => point === number)![1]

  it('assegna i numeri della foto conservando ID e coordinate dei pallini salvati', () => {
    const actual = map.nodes.map((node) => [numberOf(node.id), node.id, node.x, node.y])
      .sort((a, b) => Number(a[0]) - Number(b[0]))
    expect(actual).toEqual(reference.nodes)
    expect(map.startNode).toBe(reference.startId)
    expect(getLocalMapNode(map, map.startNode).label).toBe('Punto 1')
  })

  it('include esattamente i collegamenti rosa, senza inventare o perdere strade', () => {
    const actual = map.roads.map((road) => edgeKey(numberOf(road.from), numberOf(road.to))).sort()
    expect(actual).toHaveLength(reference.edgeCount)
    expect(actual).toEqual(reference.edges.map(([from, to]) => edgeKey(from, to)).sort())
  })

  it('offre a ogni pallino le sole destinazioni adiacenti della foto, anche alle biforcazioni', () => {
    for (const [number, id] of reference.nodes) {
      const expected = reference.edges.flatMap(([from, to]) =>
        from === number ? [to] : to === number ? [from] : []).sort((a, b) => a - b)
      const actual = getAdjacentLocalMapNodes(map, id).map(numberOf).sort((a, b) => a - b)
      expect(actual, `Punto ${number}`).toEqual(expected)
    }
  })

  it('raggiunge tutti i punti dall’ingresso, compresi quelli in precedenza isolati', () => {
    const visited = new Set([reference.startId])
    const pending = [reference.startId]
    while (pending.length) {
      for (const neighbor of getAdjacentLocalMapNodes(map, pending.shift()!)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          pending.push(neighbor)
        }
      }
    }
    expect([...visited].sort()).toEqual(reference.nodes.map(([, id]) => id).sort())
  })

  it('percorre tutte le strade in entrambi i sensi seguendo le stesse curve', () => {
    for (const [from, to] of reference.edges) {
      const a = idOf(from)
      const b = idOf(to)
      expect(canMoveOnLocalMap(map, a, b), `${from} → ${to}`).toBe(true)
      expect(canMoveOnLocalMap(map, b, a), `${to} → ${from}`).toBe(true)
      const forward = getLocalRoadPath(map, a, b)
      expect(forward.length).toBeGreaterThanOrEqual(2)
      expect(getLocalRoadPath(map, b, a)).toEqual([...forward].reverse())
    }
  })

  it.each(reference.removed)('rifiuta la vecchia scorciatoia %i–%i in entrambi i sensi', (from, to) => {
    expect(canMoveOnLocalMap(map, idOf(from), idOf(to))).toBe(false)
    expect(canMoveOnLocalMap(map, idOf(to), idOf(from))).toBe(false)
    expect(getLocalRoadPath(map, idOf(from), idOf(to))).toEqual([])
    expect(getLocalRoadPath(map, idOf(to), idOf(from))).toEqual([])
  })

  it.each(reference.added)('apre il collegamento %i–%i disegnato nella foto', (from, to) => {
    expect(canMoveOnLocalMap(map, idOf(from), idOf(to))).toBe(true)
    expect(canMoveOnLocalMap(map, idOf(to), idOf(from))).toBe(true)
  })
})

describe('Cagliari - nuovo punto della foto', () => {
  it('collega il nuovo Punto 32 solo a 31 e 33 e impedisce di saltarlo', () => {
    const map = getLocalMap('Cagliari')!
    expect(getLocalMapNode(map, 'n41')).toMatchObject({ label: 'Punto 32', x: 72.267, y: 62.719, drawMarker: true })
    expect(getAdjacentLocalMapNodes(map, 'n41').sort()).toEqual(['n25', 'n36'])
    expect(canMoveOnLocalMap(map, 'n25', 'n36')).toBe(false)
  })
})

describe.each([
  { city: 'Cagliari', nodeCount: 41, junction: CAGLIARI_SHARED_JUNCTION,
    edges: [['n27', 'n22'], ['n22', 'n29'], ['n27', 'n29']] },
  { city: 'Foggia', nodeCount: 59, junction: FOGGIA_SHARED_JUNCTION,
    edges: [['n55', 'n56'], ['n55', 'n47'], ['n56', 'n47']] },
])('$city - raccordo senza pallino aggiuntivo', ({ city, nodeCount, junction, edges }) => {
  it('collega le tre strade del raccordo della foto senza introdurre una fermata', () => {
    const map = getLocalMap(city)!
    expect(map.nodes).toHaveLength(nodeCount)
    for (const [from, to] of edges) {
      const path = getLocalRoadPath(map, from, to)
      const distance = Math.min(...path.slice(1).map((point, index) => {
        const origin = path[index]
        const dx = (point.x - origin.x) * 16.19
        const dy = (point.y - origin.y) * 9.71
        const px = (junction.x - origin.x) * 16.19
        const py = (junction.y - origin.y) * 9.71
        const lengthSquared = dx * dx + dy * dy
        const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
        return Math.hypot(px - fraction * dx, py - fraction * dy)
      }))
      expect(distance, `${from}–${to}: raccordo della foto`).toBeLessThan(6)
    }
  })
})
