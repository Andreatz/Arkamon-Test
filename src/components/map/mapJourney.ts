import type { AdminMapRoadPoint } from '@/theme/adminThemeTypes'

export interface MapJourneyRoad { key: string; points: AdminMapRoadPoint[] }

/** Use the drawn road, reversed when necessary. A restored/non-adjacent position has no journey. */
export function getMainMapJourney(roads: MapJourneyRoad[], from: string, to: string): AdminMapRoadPoint[] {
  if (from === to) return []
  const forward = roads.find((road) => road.key === `${from}__${to}`)
  if (forward) return forward.points.map((point) => ({ ...point }))
  const reverse = roads.find((road) => road.key === `${to}__${from}`)
  return reverse ? [...reverse.points].reverse().map((point) => ({ ...point })) : []
}

/** Pixel distances keep movement even on orthogonal roads in a wide viewport. */
export function mapJourneyTiming(points: AdminMapRoadPoint[], width: number, height: number) {
  const distances = [0]
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(
      (points[index].x - points[index - 1].x) * width / 100,
      (points[index].y - points[index - 1].y) * height / 100,
    ))
  }
  const total = distances[distances.length - 1]
  return {
    times: distances.map((distance, index) => total > 0 ? distance / total : index / Math.max(1, points.length - 1)),
    duration: Math.max(0.35, Math.min(0.65, total / 650)),
  }
}
