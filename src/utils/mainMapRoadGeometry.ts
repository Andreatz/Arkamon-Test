import type { AdminMapRoadPoint } from '@/theme/adminThemeTypes'

function samePoint(a: AdminMapRoadPoint, b: AdminMapRoadPoint): boolean {
  return a.x === b.x && a.y === b.y
}

function isCollinear(
  a: AdminMapRoadPoint,
  b: AdminMapRoadPoint,
  c: AdminMapRoadPoint
): boolean {
  return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)
}

export function compactRoadPoints(points: AdminMapRoadPoint[]): AdminMapRoadPoint[] {
  const compacted: AdminMapRoadPoint[] = []

  for (const point of points) {
    const current = { x: point.x, y: point.y }
    const previous = compacted[compacted.length - 1]
    if (!previous || !samePoint(previous, current)) {
      compacted.push(current)
    }
  }

  let index = 1
  while (index < compacted.length - 1) {
    if (isCollinear(compacted[index - 1], compacted[index], compacted[index + 1])) {
      compacted.splice(index, 1)
    } else {
      index += 1
    }
  }

  return compacted
}

export function orthogonalizeRoadPoints(
  points: AdminMapRoadPoint[]
): AdminMapRoadPoint[] {
  if (points.length <= 1) {
    return points.map((point) => ({ ...point }))
  }

  const orthogonal: AdminMapRoadPoint[] = [{ ...points[0] }]

  for (const target of points.slice(1)) {
    const previous = orthogonal[orthogonal.length - 1]
    const next = { x: target.x, y: target.y }

    if (previous.x !== next.x && previous.y !== next.y) {
      orthogonal.push({ x: next.x, y: previous.y })
    }

    orthogonal.push(next)
  }

  return compactRoadPoints(orthogonal)
}

export function hasOnlyOrthogonalSegments(points: AdminMapRoadPoint[]): boolean {
  return points.every((point, index) => {
    const next = points[index + 1]
    return !next || point.x === next.x || point.y === next.y
  })
}
