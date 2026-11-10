import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { initialGameSave } from '@/save/gamePersistence'
import { defaultAdminTheme } from '@/theme/defaultAdminTheme'
import { getLocalMap } from '@/data/localMaps'
import type { GameState } from '@/store/gameStore'
import { makePublicSnapshot, type PublicSnapshot } from './publicSnapshot'
import { PublicMap } from './PublicMap'

function snapshot(): PublicSnapshot {
  const game = initialGameSave() as GameState
  game.scenaCorrente = { scena: 'mappa-principale' }
  return makePublicSnapshot(game, defaultAdminTheme, null, false)
}
function roadPoints(markup: string, key: string): number[][] {
  const points = markup.match(new RegExp(`data-public-road="${key}" points="([^"]+)"`))?.[1]
  if (!points) throw new Error(`Missing road ${key}`)
  return points.split(' ').map(point => point.split(',').map(Number))
}

describe('passive public map geometry', () => {
  it('anchors world roads to current nodes rather than drawing obsolete saved endpoints', () => {
    const view = snapshot()
    view.nodes = { Venezia: { x: 10, y: 10 }, Percorso_1: { x: 30, y: 30 } }
    view.roads = { Venezia__Percorso_1: [{ x: 90, y: 90 }, { x: 15, y: 15 }, { x: 20, y: 25 }, { x: 80, y: 80 }] }
    view.players = []
    const points = roadPoints(renderToStaticMarkup(<PublicMap snapshot={view} />), 'Venezia__Percorso_1')
    expect(points[0]).toEqual([192, 108])
    expect(points[points.length - 1]).toEqual([576, 324])
    expect(points.every((point, index) => !index || point[0] === points[index - 1][0] || point[1] === points[index - 1][1])).toBe(true)
    expect(points.flat().every(coordinate => coordinate <= 576)).toBe(true)
  })
  it('interprets legacy orthogonal controls exactly like the world map renderer', () => {
    const view = snapshot()
    view.nodes = { Venezia: { x: 10, y: 10 }, Percorso_1: { x: 30, y: 30 } }
    view.roads = { Venezia__Percorso_1: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }] }
    view.players = []
    expect(roadPoints(renderToStaticMarkup(<PublicMap snapshot={view} />), 'Venezia__Percorso_1'))
      .toEqual([[192, 108], [384, 108], [384, 216], [576, 216], [576, 324]])
  })
  it('keeps local road interior bends, including intentional diagonals', () => {
    const map = getLocalMap('Venezia')!
    const road = map.roads.find(candidate => candidate.points?.length)!
    const view = snapshot()
    view.scene = 'citta'; view.place = map.id; view.players = []
    const points = roadPoints(renderToStaticMarkup(<PublicMap snapshot={view} />), `${road.from}__${road.to}`)
    expect(points).toEqual([map.nodes.find(node => node.id === road.from)!, ...road.points!, map.nodes.find(node => node.id === road.to)!]
      .map(node => [node.x * 1920 / 100, node.y * 1080 / 100]))
  })
  it('uses a pixel plane and separate short player badges without exposing hidden nodes or controls', () => {
    const view = snapshot()
    view.players = [{ id: 1, name: 'Melia', place: 'Venezia', badges: 0, leagueWins: 0 }, { id: 2, name: 'Maggi', place: 'Venezia', badges: 0, leagueWins: 0 }]
    const markup = renderToStaticMarkup(<PublicMap snapshot={view} />)
    expect(markup).toContain('viewBox="0 0 1920 1080"')
    const markers = [...markup.matchAll(/data-public-player="(\d)" cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)]
    expect(markers).toHaveLength(2)
    expect(Math.abs(Number(markers[0][2]) - Number(markers[1][2]))).toBeGreaterThan(Number(markers[0][4]) + Number(markers[1][4]))
    expect(markup).toContain('>G1</text>')
    expect(markup).toContain('>G2</text>')
    expect(markup).not.toMatch(/>Melia<|>Maggi<|Percorso_15|<button|onclick=/)
    expect(markup).toContain('aria-label="G1 · Melia"')
  })
  it('keeps coincident badges separated and inside the image at a local-map edge', () => {
    const view = snapshot()
    view.scene = 'citta'; view.place = 'Palermo'
    view.players = [{ id: 1, name: 'Melia', place: 'Palermo', node: 'n55', badges: 0, leagueWins: 0 },
      { id: 2, name: 'Maggi', place: 'Palermo', node: 'n55', badges: 0, leagueWins: 0 }]
    const markup = renderToStaticMarkup(<PublicMap snapshot={view} />)
    const markers = [...markup.matchAll(/data-public-player="(\d)" cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)]
    expect(markers).toHaveLength(2)
    expect(Math.abs(Number(markers[0][2]) - Number(markers[1][2]))).toBeGreaterThan(Number(markers[0][4]) + Number(markers[1][4]))
    expect(markers.every(marker => Number(marker[2]) - Number(marker[4]) >= 0)).toBe(true)
  })
})
