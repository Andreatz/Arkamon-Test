import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getLocalMap, LOCAL_MAPS, type LocalMapDefinition } from '@data/localMaps'
import { LocalMapBoard } from '../LocalMapBoard'
import { VENEZIA_REFERENCE_NODES } from '@data/__tests__/fixtures/veneziaReference'
import { CAGLIARI_REFERENCE_NODES } from '@data/__tests__/fixtures/cagliariReference'
import { FOGGIA_REFERENCE_NODES } from '@data/__tests__/fixtures/foggiaReference'

function renderMap(map: LocalMapDefinition, nodeId = map.startNode) {
  return renderToStaticMarkup(
    <LocalMapBoard
      map={map}
      players={[{ id: 1, name: 'Alice', nodeId }, { id: 2, name: 'Bruno', nodeId }]}
      activePlayerId={1} remainingActions={2} canMove
      onMove={() => true} onSelectNode={() => undefined}
    />,
  )
}

function nodeButtons(markup: string) {
  return [...markup.matchAll(/<button\b([^>]*data-local-map-node="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)]
    .map((match) => ({ id: match[2], attributes: match[1], body: match[3] }))
}

function accessibleNumbers(markup: string) {
  return nodeButtons(markup).map((button) => ({
    id: button.id,
    number: Number(button.attributes.match(/aria-label="Punto (\d+),/)?.[1]),
  })).sort((a, b) => a.number - b.number)
}

describe('LocalMapBoard - numerazione interna senza testo sui pallini', () => {
  it('conserva le 57 etichette accessibili della foto senza scrivere numeri sui pallini', () => {
    const markup = renderMap(getLocalMap('Venezia')!)
    expect(accessibleNumbers(markup)).toEqual(VENEZIA_REFERENCE_NODES.map(([number, id]) => ({ id, number })))
    for (const button of nodeButtons(markup)) {
      expect(button.body.replace(/<[^>]*>/g, '').trim(), button.id).toBe('')
    }
    expect(markup).toContain('aria-label="Punto 29, posizione attuale; mostra interazione"')
  })

  it('ricava le etichette dalle label anche riordinando i nodi, senza usare ID o indice', () => {
    const map = getLocalMap('Venezia')!
    const markup = renderMap({ ...map, nodes: [...map.nodes].reverse() })
    expect(accessibleNumbers(markup)).toEqual(VENEZIA_REFERENCE_NODES.map(([number, id]) => ({ id, number })))
    for (const button of nodeButtons(markup)) {
      expect(button.body.replace(/<[^>]*>/g, '').trim(), button.id).toBe('')
    }
  })

  it.each([
    { city: 'Cagliari', nodes: CAGLIARI_REFERENCE_NODES },
    { city: 'Foggia', nodes: FOGGIA_REFERENCE_NODES },
  ])('$city: usa i numeri della foto nelle etichette mantenendo i pallini senza numeri visibili', ({ city, nodes }) => {
    const markup = renderMap(getLocalMap(city)!)
    expect(accessibleNumbers(markup)).toEqual(nodes.map(([number, id]) => ({ id, number })))
    for (const button of nodeButtons(markup)) {
      expect(button.body.replace(/<[^>]*>/g, '').trim(), button.id).toBe('')
    }
    expect(markup).toContain('aria-label="Punto 1, posizione attuale; mostra interazione"')
  })

  it.each([
    { city: 'Cagliari', current: 'n16', point: 20, neighbors: ['n11', 'n22'] },
    { city: 'Foggia', current: 'n1', point: 37, neighbors: ['n11'] },
  ])('$city: il punto prima isolato offre solo le uscite disegnate nella foto', ({ city, current, point, neighbors }) => {
    const buttons = nodeButtons(renderMap(getLocalMap(city)!, current))
    const currentButton = buttons.find((button) => button.id === current)!
    expect(currentButton.attributes).toContain(`aria-label="Punto ${point}, posizione attuale; mostra interazione"`)
    expect(currentButton.attributes).toContain('aria-current="location"')
    expect(currentButton.attributes).not.toContain('disabled=')
    const adjacent = buttons.filter((button) => button.attributes.includes('data-reachable="true"'))
    expect(adjacent.map((button) => button.id).sort()).toEqual([...neighbors].sort())
    for (const button of adjacent) expect(button.attributes).not.toContain('disabled=')
  })

  it('identifica il Punto 42 corrente e offre Vai a Punto 41, 43 e 57 usando i numeri della foto', () => {
    const buttons = nodeButtons(renderMap(getLocalMap('Venezia')!, 'n17'))
    const current = buttons.find((button) => button.id === 'n17')!
    expect(current.attributes).toContain('aria-current="location"')
    expect(current.attributes).toContain('aria-label="Punto 42, posizione attuale; mostra interazione"')
    expect(current.attributes).not.toContain('disabled=')
    const adjacent = buttons.filter((button) => button.attributes.includes('data-reachable="true"'))
    expect(adjacent.map((button) => button.id).sort()).toEqual(['n13', 'n20', 'n21'])
    for (const [number, id] of [[41, 'n20'], [43, 'n13'], [57, 'n21']] as const) {
      const destination = adjacent.find((button) => button.id === id)!
      expect(destination.attributes).toContain(`title="Vai a Punto ${number}"`)
      expect(destination.attributes).toContain(`aria-label="Punto ${number}, muoviti qui"`)
      expect(destination.attributes).not.toContain('disabled=')
    }
    for (const button of buttons.filter((item) => item.id !== current.id && !adjacent.includes(item))) {
      expect(button.attributes, button.id).toContain('disabled=""')
    }
  })

  it.each(Object.values(LOCAL_MAPS))('$id: lascia tutti i pallini senza testo numerico visibile', (map) => {
    const buttons = nodeButtons(renderMap(map))
    expect(buttons).toHaveLength(map.nodes.length)
    for (const button of buttons) {
      expect(button.body.replace(/<[^>]*>/g, '').trim(), button.id).toBe('')
    }
  })

  it('disegna solo i sei pallini aggiunti nelle foto, senza numeri o altri marcatori', () => {
    for (const map of Object.values(LOCAL_MAPS)) {
      const buttons = nodeButtons(renderMap(map))
      const markers = buttons.filter((button) => button.body.includes('class="local-map-node-marker"'))
      const expected: Record<string, string[]> = { Cagliari: ['n41'], Milano: ['n56'], ReggioCalabria: ['n45', 'n46'], Torino: ['n50', 'n51'] }
      expect(markers.map((button) => button.id), map.id).toEqual(expected[map.id] ?? [])
      for (const marker of markers) {
        expect(marker.body).toContain('class="local-map-node-marker" aria-hidden="true"')
        expect(marker.body.replace(/<[^>]*>/g, '').trim()).toBe('')
      }
    }
  })
})
