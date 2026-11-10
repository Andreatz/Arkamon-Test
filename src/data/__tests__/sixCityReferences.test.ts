import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getLocalMap, type LocalMapNode } from '../localMaps'
import { canMoveOnLocalMap, getAdjacentLocalMapNodes, getLocalMapNode, getLocalRoadPath } from '@engine/localMapMovement'
import { LocalMapBoard } from '@components/map/LocalMapBoard'
import referenceData from './fixtures/sixCityReferences.json'

interface CityReference {
  city: string
  startNode: string
  nodes: Array<LocalMapNode & { label: string }>
  edges: string[][]
  numbers: number[]
  addedNumbers: number[]
  removedEdges: string[][]
  paths: number[][]
}

const references: CityReference[] = referenceData
const counts: Record<string, [number, number]> = {
  Napoli: [40, 44], ReggioCalabria: [46, 59], Roma: [50, 57],
  Piacenza: [56, 67], Milano: [56, 69], Palermo: [55, 62],
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

describe('precisazioni dei riferimenti Napoli, Reggio Calabria e Milano', () => {
  const idOf = (city: string, number: number) => references.find((reference) => reference.city === city)!
    .nodes.find((node) => node.label === `Punto ${number}`)!.id

  it('Napoli identifica con 40 il ramo alto dell’ex doppio 11, mantenendo il vero 11 su n15', () => {
    const map = getLocalMap('Napoli')!
    expect(getLocalMapNode(map, 'n8').label).toBe('Punto 40')
    expect(getLocalMapNode(map, 'n15').label).toBe('Punto 11')
    expect(map.nodes.filter((node) => node.label === 'Punto 11').map((node) => node.id)).toEqual(['n15'])
    expect(getAdjacentLocalMapNodes(map, 'n8').sort()).toEqual(['n12', 'n5'])
  })

  it('Reggio Calabria conserva il salto da 22 a 24 nei numeri, aggiungendo solo 21 e 26', () => {
    const map = getLocalMap('ReggioCalabria')!
    expect(map.nodes.map((node) => Number(node.label?.replace('Punto ', ''))).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 47 }, (_, index) => index + 1).filter((number) => number !== 23))
    expect(map.nodes.some((node) => node.label === 'Punto 23')).toBe(false)
    expect(getLocalMapNode(map, 'n45')).toMatchObject({ label: 'Punto 21', drawMarker: true })
    expect(getLocalMapNode(map, 'n46')).toMatchObject({ label: 'Punto 26', drawMarker: true })
    expect(map.nodes.filter((node) => node.drawMarker).map((node) => node.id).sort()).toEqual(['n45', 'n46'])
  })

  it('Milano aggiunge il Punto 28 fra 25, 27 e 29 e impedisce di saltarlo', () => {
    const map = getLocalMap('Milano')!
    expect(getLocalMapNode(map, 'n56')).toMatchObject({ label: 'Punto 28', drawMarker: true })
    expect(getAdjacentLocalMapNodes(map, 'n56').sort()).toEqual([25, 27, 29].map((number) => idOf('Milano', number)).sort())
    for (const from of [25, 27]) {
      expect(canMoveOnLocalMap(map, idOf('Milano', from), idOf('Milano', 29))).toBe(false)
      expect(canMoveOnLocalMap(map, idOf('Milano', 29), idOf('Milano', from))).toBe(false)
    }
  })

  it.each([[11, 17], [11, 48], [17, 48]])('Milano percorre il raccordo senza pallino %i–%i in entrambi i sensi', (from, to) => {
    const map = getLocalMap('Milano')!
    expect(canMoveOnLocalMap(map, idOf('Milano', from), idOf('Milano', to))).toBe(true)
    expect(canMoveOnLocalMap(map, idOf('Milano', to), idOf('Milano', from))).toBe(true)
  })
})
