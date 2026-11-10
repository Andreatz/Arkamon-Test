import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getLocalMap, LOCAL_MAPS, type LocalMapNode } from '../localMaps'
import { canMoveOnLocalMap, getAdjacentLocalMapNodes, getLocalMapNode, getLocalRoadPath } from '@engine/localMapMovement'
import { LocalMapBoard } from '@components/map/LocalMapBoard'
import referenceData from './fixtures/routeTorinoReferences.json'

interface CityReference {
  city: string
  startNode: string
  nodes: Array<LocalMapNode & { label: string }>
  edges: string[][]
  numbers: number[]
  addedNumbers: number[]
  removedEdges: string[][]
  paths: number[][]
  sharedJunctions: SharedJunction[]
  authorizedNonMagentaEdges: number[][]
}

interface SharedJunction {
  terminalNumbers: number[]
  edges: number[][]
  pointPercent: { x: number; y: number }
}

const references: CityReference[] = referenceData
const counts: Record<string, [number, number]> = {
  Percorso_1: [50, 63], Percorso_2: [43, 58], Percorso_4: [47, 52],
  Percorso_13: [36, 48], Percorso_14: [48, 59], Percorso_15: [36, 40], Torino: [51, 61],
}
const edgeKey = (from: string, to: string) => [from, to].sort().join(':')
const normalizedNodes = (nodes: LocalMapNode[]) => nodes.map(({ id, x, y, label, drawMarker }) =>
  ({ id, x, y, label, drawMarker: Boolean(drawMarker) })).sort((a, b) => a.id.localeCompare(b.id))

describe.each(references)('$city - riferimento della foto e coordinate dei salvataggi', (reference) => {
  const map = getLocalMap(reference.city)!

  it('conserva ingresso, ID e coordinate originali assegnando tutte le etichette della foto', () => {
    expect(map.startNode).toBe(reference.startNode)
    expect(map.nodes).toHaveLength(counts[reference.city][0])
    expect(normalizedNodes(map.nodes)).toEqual(normalizedNodes(reference.nodes))
    const numbers = map.nodes.map((node) => Number(node.label?.replace('Punto ', ''))).sort((a, b) => a - b)
    expect(numbers).toEqual(reference.numbers)
    expect(new Set(numbers).size).toBe(map.nodes.length)
  })

  it('include esattamente tutti i collegamenti della foto, senza scorciatoie o strade mancanti', () => {
    expect(map.roads).toHaveLength(counts[reference.city][1])
    const actual = map.roads.map((road) => edgeKey(road.from, road.to)).sort()
    expect(actual).toEqual(reference.edges.map(([from, to]) => edgeKey(from, to)).sort())
    expect(new Set(actual).size).toBe(map.roads.length)
  })

  it('offre a ogni pallino soltanto le uscite della foto, anche ai raccordi senza pallino', () => {
    for (const node of reference.nodes) {
      const expected = reference.edges.flatMap(([from, to]) =>
        from === node.id ? [to] : to === node.id ? [from] : []).sort()
      expect(getAdjacentLocalMapNodes(map, node.id).sort(), node.label).toEqual(expected)
    }
  })

  it('percorre tutte le strade in entrambi i sensi mantenendo le medesime curve', () => {
    for (const [from, to] of reference.edges) {
      expect(canMoveOnLocalMap(map, from, to), `${from} → ${to}`).toBe(true)
      expect(canMoveOnLocalMap(map, to, from), `${to} → ${from}`).toBe(true)
      const forward = getLocalRoadPath(map, from, to)
      expect(forward.length).toBeGreaterThanOrEqual(2)
      expect(forward[0]).toEqual({ x: getLocalMapNode(map, from).x, y: getLocalMapNode(map, from).y })
      expect(forward[forward.length - 1]).toEqual({ x: getLocalMapNode(map, to).x, y: getLocalMapNode(map, to).y })
      expect(getLocalRoadPath(map, to, from)).toEqual([...forward].reverse())
    }
  })

  it('rende tutti i pallini raggiungibili dall’ingresso mantenuto', () => {
    const visited = new Set([reference.startNode])
    const pending = [reference.startNode]
    while (pending.length) {
      for (const destination of getAdjacentLocalMapNodes(map, pending.shift()!)) {
        if (!visited.has(destination)) {
          visited.add(destination)
          pending.push(destination)
        }
      }
    }
    expect([...visited].sort()).toEqual(reference.nodes.map((node) => node.id).sort())
  })

  it.each(reference.removedEdges)('rifiuta la vecchia scorciatoia %s–%s in entrambi i sensi', (from, to) => {
    expect(canMoveOnLocalMap(map, from, to)).toBe(false)
    expect(canMoveOnLocalMap(map, to, from)).toBe(false)
    expect(getLocalRoadPath(map, from, to)).toEqual([])
    expect(getLocalRoadPath(map, to, from)).toEqual([])
  })

  it('usa le etichette della foto nei controlli e lascia i pallini senza numeri visibili', () => {
    const markup = renderToStaticMarkup(createElement(LocalMapBoard, {
      map,
      players: [{ id: 1, name: 'Alice', nodeId: map.startNode }, { id: 2, name: 'Bruno', nodeId: map.startNode }],
      activePlayerId: 1, remainingActions: 2, canMove: true,
      onMove: () => true, onSelectNode: () => undefined,
    }))
    const buttons = [...markup.matchAll(/<button\b([^>]*data-local-map-node="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)]
    expect(buttons).toHaveLength(reference.nodes.length)
    for (const [, attributes, id, body] of buttons) {
      const expected = reference.nodes.find((node) => node.id === id)!
      expect(attributes, id).toContain(`aria-label="${expected.label},`)
      expect(body.replace(/<[^>]*>/g, '').trim(), id).toBe('')
      expect(body.includes('class="local-map-node-marker"'), id).toBe(Boolean(expected.drawMarker))
    }
  })
})

describe('raccordi senza pallino dei nuovi percorsi e di Torino', () => {
  for (const reference of references) {
    for (const junction of reference.sharedJunctions) {
      it(`${reference.city}: collega ${junction.terminalNumbers.join('/')} attraverso lo stesso raccordo senza fermate`, () => {
        const map = getLocalMap(reference.city)!
        const idOf = (number: number) => reference.nodes.find((node) => node.label === `Punto ${number}`)!.id
        expect(map.nodes).toHaveLength(counts[reference.city][0])
        for (const [from, to] of junction.edges) {
          const forward = getLocalRoadPath(map, idOf(from), idOf(to))
          expect(forward).toContainEqual(junction.pointPercent)
          expect(getLocalRoadPath(map, idOf(to), idOf(from))).toEqual([...forward].reverse())
        }
      })
    }
  }
})

describe('precisazioni Torino e Percorso 15', () => {
  const torino = references.find((reference) => reference.city === 'Torino')!
  const idOf = (number: number) => torino.nodes.find((node) => node.label === `Punto ${number}`)!.id

  it('Torino disegna soltanto i nuovi pallini 13 e 47 e impedisce di saltarli', () => {
    const map = getLocalMap('Torino')!
    expect(getLocalMapNode(map, 'n50')).toMatchObject({ label: 'Punto 13', x: 63.62, y: 12.049, drawMarker: true })
    expect(getLocalMapNode(map, 'n51')).toMatchObject({ label: 'Punto 47', x: 38.11, y: 43.769, drawMarker: true })
    expect(map.nodes.filter((node) => node.drawMarker).map((node) => node.id).sort()).toEqual(['n50', 'n51'])
    expect(getAdjacentLocalMapNodes(map, 'n50').sort()).toEqual([12, 14].map(idOf).sort())
    expect(getAdjacentLocalMapNodes(map, 'n51').sort()).toEqual([45, 48].map(idOf).sort())
    for (const [from, to] of [[12, 14], [45, 48]]) {
      expect(canMoveOnLocalMap(map, idOf(from), idOf(to))).toBe(false)
      expect(canMoveOnLocalMap(map, idOf(to), idOf(from))).toBe(false)
    }
  })

  it('conserva il collegamento 35–36 di Percorso 15 espressamente confermato dall’utente e la sua curva precedente', () => {
    const reference = references.find((candidate) => candidate.city === 'Percorso_15')!
    expect(reference.authorizedNonMagentaEdges).toEqual([[35, 36]])
    const map = getLocalMap('Percorso_15')!
    const forward = getLocalRoadPath(map, 'n31', 'n34')
    expect(forward).toEqual([
      { x: 17.116, y: 66.684 }, { x: 12.292, y: 69.516 }, { x: 6.665, y: 71.74 },
    ])
    expect(getLocalRoadPath(map, 'n34', 'n31')).toEqual([...forward].reverse())
  })

  it('completa le sedici mappe con 771 punti, 922 collegamenti e soltanto sei pallini aggiunti', () => {
    const maps = Object.values(LOCAL_MAPS)
    expect(maps).toHaveLength(16)
    expect(maps.reduce((total, map) => total + map.nodes.length, 0)).toBe(771)
    expect(maps.reduce((total, map) => total + map.roads.length, 0)).toBe(922)
    expect(maps.flatMap((map) => map.nodes.filter((node) => node.drawMarker)
      .map((node) => `${map.id}/${node.id}`)).sort()).toEqual([
      'Cagliari/n41', 'Milano/n56', 'ReggioCalabria/n45', 'ReggioCalabria/n46', 'Torino/n50', 'Torino/n51',
    ])
  })
})
