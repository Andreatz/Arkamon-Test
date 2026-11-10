import { useEffect, useRef, useState } from 'react'
import { MAIN_MAP_ROAD_CONNECTIONS } from '@/data/mainMapRoads'
import { getLocalMap } from '@/data/localMaps'
import { hasOnlyOrthogonalSegments, orthogonalizeRoadPoints } from '@/utils/mainMapRoadGeometry'
import type { AdminMapRoadPoint } from '@/theme/adminThemeTypes'
import type { PublicSnapshot } from './publicSnapshot'

const villages = new Set(['Piacenza', 'Civitavecchia', 'Molisnt', 'ReggioCalabria'])

/** Saved world roads include both endpoints; local roads contain only interior bends. */
function worldRoadPoints(from: AdminMapRoadPoint, to: AdminMapRoadPoint, saved?: AdminMapRoadPoint[]): AdminMapRoadPoint[] {
  const anchored = [from, ...(saved && saved.length >= 2 ? saved.slice(1, -1) : []), to]
  // This is the same legacy-control interpretation used by MappaPrincipaleScene.
  const controls = anchored.length > 3 && hasOnlyOrthogonalSegments(anchored)
    ? anchored.filter((_, index) => index === 0 || index === anchored.length - 1 || index % 2 === 0) : anchored
  return orthogonalizeRoadPoints(controls)
}

/** Visible map geometry only: no event handlers, exits or point interaction engine. */
export function PublicMap({ snapshot }: { snapshot: PublicSnapshot }) {
  const root = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 1920, height: 1080 })
  useEffect(() => {
    const element = root.current
    if (!element) return
    const update = () => {
      const { width, height } = element.getBoundingClientRect()
      if (width > 0 && height > 0) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    window.addEventListener('resize', update)
    return () => { observer?.disconnect(); window.removeEventListener('resize', update) }
  }, [])
  const x = (percent: number) => percent * size.width / 100
  const y = (percent: number) => percent * size.height / 100
  const unit = Math.min(size.width / 1920, size.height / 1080)
  const map = ['citta', 'percorso'].includes(snapshot.scene) ? getLocalMap(snapshot.place) : undefined
  const nodes = map ? Object.fromEntries(map.nodes.map(node => [node.id, node])) : snapshot.nodes
  const roads = map ? map.roads : MAIN_MAP_ROAD_CONNECTIONS.map(([from, to]) => ({ from, to, points: snapshot.roads[`${from}__${to}`] }))
  return <svg ref={root} className="arka-public-map" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none" aria-label="Mappa e posizioni delle giocatrici">
    {roads.map((road, i) => {
      const from = nodes[road.from], to = nodes[road.to]
      if (!from || !to) return null
      const points = map ? [from, ...(road.points ?? []), to] : worldRoadPoints(from, to, road.points)
      return <polyline key={i} data-public-road={`${road.from}__${road.to}`}
        points={points.map(node => `${x(node.x)},${y(node.y)}`).join(' ')} fill="none" stroke="#102338" strokeWidth={(map ? 5 : 4) * unit} strokeLinejoin="round" />
    })}
    {Object.entries(nodes).map(([id, node]) => <g key={id}><circle cx={x(node.x)} cy={y(node.y)} r={(map ? 6 : 9) * unit}
      fill={map ? '#dd63bd' : id === 'Pordenone' ? '#2da584' : id.startsWith('Percorso') ? '#df428a' : villages.has(id) ? '#e9aa27' : '#266cae'} stroke="#e3efff" strokeWidth={1.5 * unit} />
      {!map && <text x={x(node.x)} y={y(node.y) + 24 * unit} textAnchor="middle" fill="white" stroke="#10243b" strokeWidth={3 * unit} paintOrder="stroke" fontSize={16 * unit}>{id.replace(/_/g, ' ')}</text>}
    </g>)}
    {snapshot.players.filter(player => !map || player.place === map.id).map(player => {
      const node = nodes[map ? player.node ?? map.startNode : player.place]
      if (!node) return null
      const coincident = snapshot.players.some(other => other.id !== player.id && other.place === player.place
        && (!map || (other.node ?? map.startNode) === (player.node ?? map.startNode)))
      const radius = (player.id === snapshot.active ? 16 : 14) * unit
      // Fit the pair together near the edge, rather than clamping each badge
      // onto the other (several local-map exits are less than 1% from the edge).
      const anchorX = coincident ? Math.max(38 * unit, Math.min(size.width - 38 * unit, x(node.x))) : x(node.x)
      const centerX = Math.max(radius + 2 * unit, Math.min(size.width - radius - 2 * unit,
        anchorX + (coincident ? player.id === 1 ? -20 : 20 : 0) * unit))
      return <g key={player.id} aria-label={`G${player.id} · ${player.name}`}><circle className="arka-public-player" data-public-player={player.id} cx={centerX} cy={y(node.y)} r={radius} fill={player.id === 1 ? '#ee3584' : '#1597b9'} stroke="white" strokeWidth={2.5 * unit} />
        <text className="arka-public-player arka-public-player-badge" x={centerX} y={y(node.y)} dy=".35em" textAnchor="middle" fill="white" fontSize={13 * unit}>G{player.id}</text></g>
    })}
  </svg>
}
