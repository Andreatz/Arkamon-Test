import { describe, expect, it } from 'vitest'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { LOCAL_MAPS, getLocalMap, type LocalMapPoint } from '../localMaps'
import { PENDING_LOCAL_MAP_ARTWORK } from '../localMaps/artworkInventory'
import sixCityReferences from './fixtures/sixCityReferences.json'
import routeTorinoReferences from './fixtures/routeTorinoReferences.json'

const imageDirectory = fileURLToPath(new URL('../../../public/maps/', import.meta.url))
const mapDefinitions = Object.values(LOCAL_MAPS)

/** Dimensioni del disegno, per confrontare distanze in pixel senza distorcere gli assi. */
function distanceToSegment(point: LocalMapPoint, from: LocalMapPoint, to: LocalMapPoint): number {
  const dx = (to.x - from.x) * 16.19
  const dy = (to.y - from.y) * 9.71
  const px = (point.x - from.x) * 16.19
  const py = (point.y - from.y) * 9.71
  const lengthSquared = dx * dx + dy * dy
  const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
  return Math.hypot(px - fraction * dx, py - fraction * dy)
}

describe('mappe locali disegnate', () => {
  it('accounts for every painting as reviewed geometry or pending source artwork', async () => {
    const images = (await readdir(imageDirectory)).filter((name) => name.endsWith('.png')).sort()
    const reviewed = mapDefinitions.map(map => map.image.replace('/maps/', ''))
    const pending = PENDING_LOCAL_MAP_ARTWORK.map(map => map.image.replace('/maps/', ''))
    expect([...reviewed, ...pending].sort()).toEqual(images)
    expect(new Set([...reviewed, ...pending]).size).toBe(images.length)
    for (const artwork of PENDING_LOCAL_MAP_ARTWORK) expect(getLocalMap(artwork.id)).toBeUndefined()
    expect(mapDefinitions).toHaveLength(16)
    expect(getLocalMap('ReggioCalabria')?.image).toBe('/maps/Reggio-Calabria.png')
    expect(getLocalMap('Percorso_15')?.image).toBe('/maps/Percorso_15.png')
    expect(getLocalMap('Pordenone')).toBeUndefined()
    expect(getLocalMap('toString')).toBeUndefined()
  })

  it('conserva tutti i pallini contati e verificati visivamente sulle sedici immagini', () => {
    expect(Object.fromEntries(mapDefinitions.map((map) => [map.id, map.nodes.length]))).toEqual({
      Cagliari: 41, Foggia: 59, Milano: 56, Napoli: 40, Palermo: 55,
      Percorso_1: 50, Percorso_13: 36, Percorso_14: 48, Percorso_15: 36,
      Percorso_2: 43, Percorso_4: 47, Piacenza: 56, ReggioCalabria: 46,
      Roma: 50, Torino: 51, Venezia: 57,
    })
  })

  it.each(mapDefinitions)('$id: i centri corrispondono ai pallini rossi del PNG originale', async (map) => {
    const { data, info } = await sharp(`${imageDirectory}/${map.image.replace('/maps/', '')}`)
      .removeAlpha().raw().toBuffer({ resolveWithObject: true })
    for (const node of map.nodes) {
      // Le sole aggiunte delle foto sono congelate nei riferimenti indipendenti.
      if (map.id === 'Cagliari' && node.id === 'n41') {
        expect(node).toMatchObject({ x: 72.267, y: 62.719, label: 'Punto 32', drawMarker: true })
        continue
      }
      const photoAdded = [...sixCityReferences, ...routeTorinoReferences].find((reference) => reference.city === map.id)?.nodes
        .find((expected) => expected.id === node.id && 'drawMarker' in expected && expected.drawMarker === true)
      if (photoAdded) {
        expect(node).toEqual(photoAdded)
        continue
      }
      const x = Math.round(node.x / 100 * info.width)
      const y = Math.round(node.y / 100 * info.height)
      const offset = (y * info.width + x) * info.channels
      expect(data[offset], `${map.id}/${node.id}: rosso`).toBeGreaterThan(145)
      expect(data[offset + 1], `${map.id}/${node.id}: verde`).toBeLessThan(data[offset] * .6)
      expect(data[offset + 2], `${map.id}/${node.id}: blu`).toBeLessThan(data[offset] * .6)
    }
  })

  it.each(mapDefinitions)('$id: posizioni e strade sono coerenti, senza saltare altri pallini', (map) => {
    expect(LOCAL_MAPS[map.id]).toBe(map)
    const nodes = new Map(map.nodes.map((node) => [node.id, node]))
    expect(nodes.size).toBe(map.nodes.length)
    expect(nodes.has(map.startNode)).toBe(true)
    expect(map.roads.some((road) => road.from === map.startNode || road.to === map.startNode)).toBe(true)
    const roadIds = new Set<string>()
    const points = [...map.nodes, ...map.roads.flatMap((road) => road.points ?? [])]
    for (const point of points) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(100)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(100)
    }
    for (const road of map.roads) {
      expect(nodes.has(road.from)).toBe(true)
      expect(nodes.has(road.to)).toBe(true)
      expect(road.from).not.toBe(road.to)
      const id = [road.from, road.to].sort().join(':')
      expect(roadIds.has(id), `${map.id}: strada duplicata ${id}`).toBe(false)
      roadIds.add(id)
      const path = [nodes.get(road.from)!, ...(road.points ?? []), nodes.get(road.to)!]
      for (const node of map.nodes) {
        if (node.id === road.from || node.id === road.to) continue
        const distance = Math.min(...path.slice(1).map((point, i) => distanceToSegment(node, path[i], point)))
        expect(distance, `${map.id}: ${road.from}–${road.to} passa per ${node.id}`).toBeGreaterThan(9)
      }
    }
  })

  it('raggiunge tutti i pallini, compresi gli accessi precisati dalle foto di Cagliari e Foggia', () => {
    const isolated = mapDefinitions.flatMap((map) => map.nodes
      .filter((node) => !map.roads.some((road) => road.from === node.id || road.to === node.id))
      .map((node) => `${map.id}/${node.id}`))
    expect(isolated).toEqual([])
    const inaccessible: string[] = []
    for (const map of mapDefinitions) {
      const reached = new Set([map.startNode])
      const queue = [map.startNode]
      while (queue.length > 0) {
        const current = queue.shift()!
        for (const road of map.roads) {
          const adjacent = road.from === current ? road.to : road.to === current ? road.from : undefined
          if (adjacent !== undefined && !reached.has(adjacent)) {
            reached.add(adjacent)
            queue.push(adjacent)
          }
        }
      }
      inaccessible.push(...map.nodes.filter((node) => !reached.has(node.id)).map((node) => `${map.id}/${node.id}`))
    }
    expect(inaccessible.sort()).toEqual(isolated)
  })
})
