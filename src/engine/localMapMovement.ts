/** Movimento lungo i collegamenti delle mappe locali. Coordinate espresse in percentuale. */
import type { LocalMapDefinition, LocalMapNode, LocalMapPoint } from '@data/localMaps'

/** Un riferimento salvato non più presente nel disegno torna al punto d'ingresso. */
export function getLocalMapNode(map: LocalMapDefinition, nodeId?: string): LocalMapNode {
  const node = map.nodes.find((candidate) => candidate.id === nodeId)
    ?? map.nodes.find((candidate) => candidate.id === map.startNode)
  if (!node) throw new Error(`La mappa ${map.id} non ha un punto d'ingresso valido.`)
  return node
}

/** Le strade sono percorribili in entrambe le direzioni; non si possono saltare pallini. */
export function getAdjacentLocalMapNodes(map: LocalMapDefinition, nodeId: string): string[] {
  if (!map.nodes.some((node) => node.id === nodeId)) return []
  const adjacent = new Set<string>()
  for (const road of map.roads) {
    const destination = road.from === nodeId ? road.to : road.to === nodeId ? road.from : undefined
    if (destination && destination !== nodeId && map.nodes.some((node) => node.id === destination)) {
      adjacent.add(destination)
    }
  }
  return [...adjacent]
}

export function canMoveOnLocalMap(map: LocalMapDefinition, from: string, to: string): boolean {
  return getAdjacentLocalMapNodes(map, from).includes(to)
}

/** Il percorso grafico comprende gli estremi e segue le curve anche percorrendolo al contrario. */
export function getLocalRoadPath(map: LocalMapDefinition, from: string, to: string): LocalMapPoint[] {
  if (!canMoveOnLocalMap(map, from, to)) return []
  const origin = getLocalMapNode(map, from)
  const destination = getLocalMapNode(map, to)
  const road = map.roads.find((candidate) =>
    (candidate.from === from && candidate.to === to) || (candidate.from === to && candidate.to === from))!
  const intermediates = road.from === from ? road.points ?? [] : [...(road.points ?? [])].reverse()
  return [origin, ...intermediates, destination].map(({ x, y }) => ({ x, y }))
}
