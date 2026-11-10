import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalMap, type LocalMapNode } from '@data/localMaps'
import { getLocalMapNode } from '@engine/localMapMovement'
import { ALLENATORI } from '@data/index'
import { useGameStore } from '@store/gameStore'
import type { PosizioneAvatar } from '@/types'
import referenceData from '@data/__tests__/fixtures/routeTorinoReferences.json'

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

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

const references: CityReference[] = referenceData
const allGymIds = ALLENATORI.filter((trainer) => trainer.tipo === 'Capopalestra').map((trainer) => trainer.id)

function prepareMap(city: string) {
  useGameStore.getState().reset()
  const state = useGameStore.getState()
  const world: PosizioneAvatar = { mappaId: 'mappa-principale', luogo: city, x: 0, y: 0, direzione: 'S' }
  useGameStore.setState({
    posizione1: world, posizione2: { ...world },
    giocatore1: { ...state.giocatore1, allenatoriSconfitti: new Set(allGymIds) },
    giocatore2: { ...state.giocatore2, allenatoriSconfitti: new Set(allGymIds) },
  })
}

describe.each(references)('store - $city rinumerata e collegata come nella foto', (reference) => {
  const map = getLocalMap(reference.city)!
  const idOf = (number: number) => reference.nodes.find((node) => node.label === `Punto ${number}`)!.id

  beforeEach(() => {
    prepareMap(reference.city)
  })

  it('ricarica tutti gli ID precedenti per entrambi i giocatori senza spostarli o ripristinare azioni', () => {
    const oldNodes = reference.nodes.filter((node) => !reference.addedNumbers.includes(Number(node.label.replace('Punto ', ''))))
    const options = useGameStore.persist.getOptions()
    for (let index = 0; index < oldNodes.length; index += 1) {
      const first = oldNodes[index]
      const second = oldNodes[oldNodes.length - 1 - index]
      const actions = index % 3
      const activePlayer = (index % 2 + 1) as 1 | 2
      useGameStore.setState({
        posizioniLocali1: { [reference.city]: first.id, Venezia: 'n56' },
        posizioniLocali2: { [reference.city]: second.id, Venezia: 'n54' },
        giocatoreAttivo: activePlayer,
        turnoOverworld: { giocatoreAttivo: activePlayer, azioniRimaste: actions },
      })
      const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
      const restored = options.merge!(saved, useGameStore.getState())
      expect(restored.posizioniLocali1).toEqual({ [reference.city]: first.id, Venezia: 'n56' })
      expect(restored.posizioniLocali2).toEqual({ [reference.city]: second.id, Venezia: 'n54' })
      expect(restored.turnoOverworld).toEqual({ giocatoreAttivo: activePlayer, azioniRimaste: actions })
      expect(getLocalMapNode(map, restored.posizioniLocali1[reference.city])).toMatchObject(first)
      expect(getLocalMapNode(map, restored.posizioniLocali2[reference.city])).toMatchObject(second)
      useGameStore.setState(restored)
      expect(useGameStore.getState().inizializzaPosizioneLocale(1, reference.city)).toBe(first.id)
      expect(useGameStore.getState().inizializzaPosizioneLocale(2, reference.city)).toBe(second.id)
      expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(actions)
    }
  })

  it('percorre due strade, blocca la terza anche dopo la ricarica e mantiene fermo l’altro avatar', () => {
    const [start, first, second, third] = reference.paths[0].map(idOf)
    const otherStart = idOf(reference.paths[1][0])
    useGameStore.setState({
      posizioniLocali1: { [reference.city]: start },
      posizioniLocali2: { [reference.city]: otherStart },
    })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(1, reference.city, first)).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.muoviAvatarMappaLocale(1, reference.city, second)).toBe(true)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 0 })
    expect(store.muoviAvatarMappaLocale(1, reference.city, third)).toBe(false)
    expect(useGameStore.getState().posizioniLocali1[reference.city]).toBe(second)
    expect(useGameStore.getState().posizioniLocali2[reference.city]).toBe(otherStart)

    const options = useGameStore.persist.getOptions()
    const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
    useGameStore.setState(options.merge!(saved, useGameStore.getState()))
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(store.muoviAvatarMappaLocale(1, reference.city, third)).toBe(false)
  })

  it('passa a G2 mantenendo la posizione di G1 e consente un movimento più un’interazione', () => {
    const firstPosition = idOf(reference.paths[0][2])
    const [otherStart, otherNext, otherSecond] = reference.paths[1].map(idOf)
    useGameStore.setState({
      posizioniLocali1: { [reference.city]: firstPosition },
      posizioniLocali2: { [reference.city]: otherStart },
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 0 },
    })
    const store = useGameStore.getState()
    expect(store.passaTurnoMappaLocale()).toBe(true)
    expect(useGameStore.getState().giocatoreAttivo).toBe(2)
    expect(store.muoviAvatarMappaLocale(2, reference.city, otherNext)).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.consumaInterazioneMappaLocale(2, reference.city)).toBe(true)
    expect(store.muoviAvatarMappaLocale(2, reference.city, otherSecond)).toBe(false)
    expect(useGameStore.getState().posizioniLocali1[reference.city]).toBe(firstPosition)
    expect(useGameStore.getState().posizioniLocali2[reference.city]).toBe(otherNext)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
  })

  it.each(reference.removedEdges)('blocca %s–%s senza consumare azioni o modificare le posizioni', (from, to) => {
    for (const [origin, destination] of [[from, to], [to, from]]) {
      useGameStore.setState({
        posizioniLocali1: { [reference.city]: origin },
        posizioniLocali2: { [reference.city]: reference.startNode },
      })
      const before = useGameStore.getState()
      expect(before.muoviAvatarMappaLocale(1, reference.city, destination)).toBe(false)
      const after = useGameStore.getState()
      expect(after.posizioniLocali1).toBe(before.posizioniLocali1)
      expect(after.posizioniLocali2).toBe(before.posizioniLocali2)
      expect(after.turnoOverworld).toBe(before.turnoOverworld)
    }
  })

  it.each(reference.addedNumbers)('salva il nuovo Punto %i per entrambi gli avatar senza riportarli all’ingresso', (number) => {
    const id = idOf(number)
    useGameStore.setState({
      posizioniLocali1: { [reference.city]: id }, posizioniLocali2: { [reference.city]: id },
      turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 1 },
    })
    const options = useGameStore.persist.getOptions()
    const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
    const restored = options.merge!(saved, useGameStore.getState())
    expect(restored.posizioniLocali1[reference.city]).toBe(id)
    expect(restored.posizioniLocali2[reference.city]).toBe(id)
    expect(restored.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 1 })
  })
})

describe('store - raccordi senza fermata dei percorsi e di Torino', () => {
  const junctionRoutes = referenceData.flatMap((reference) => reference.sharedJunctions.flatMap((junction) =>
    junction.edges.map(([from, to]) => ({ city: reference.city, from, to }))))

  it.each(junctionRoutes)('$city: il raccordo $from–$to costa una sola azione per ogni senso', ({ city, from, to }) => {
    prepareMap(city)
    const reference = references.find((candidate) => candidate.city === city)!
    const idOf = (number: number) => reference.nodes.find((node) => node.label === `Punto ${number}`)!.id
    const otherNode = reference.startNode
    useGameStore.setState({ posizioniLocali1: { [city]: idOf(from) }, posizioniLocali2: { [city]: otherNode } })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(1, city, idOf(to))).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.muoviAvatarMappaLocale(1, city, idOf(from))).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(useGameStore.getState().posizioniLocali1[city]).toBe(idOf(from))
    expect(useGameStore.getState().posizioniLocali2[city]).toBe(otherNode)
  })
})

describe('store - nuovi pallini di Torino e collegamento confermato del luogo segreto', () => {
  it.each([[12, 13, 14], [45, 47, 48]])('Torino: richiede due movimenti per %i→%i→%i senza saltare il nuovo pallino', (from, middle, to) => {
    prepareMap('Torino')
    const reference = references.find((candidate) => candidate.city === 'Torino')!
    const idOf = (number: number) => reference.nodes.find((node) => node.label === `Punto ${number}`)!.id
    useGameStore.setState({ posizioniLocali1: { Torino: idOf(from) }, posizioniLocali2: { Torino: idOf(19) } })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(1, 'Torino', idOf(to))).toBe(false)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
    expect(store.muoviAvatarMappaLocale(1, 'Torino', idOf(middle))).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.muoviAvatarMappaLocale(1, 'Torino', idOf(to))).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(useGameStore.getState().posizioniLocali1.Torino).toBe(idOf(to))
    expect(useGameStore.getState().posizioniLocali2.Torino).toBe(idOf(19))
  })

  it('dopo gli otto capipalestra reali percorre 35–36 di Percorso 15 spendendo un movimento per lato', () => {
    expect(allGymIds).toHaveLength(8)
    prepareMap('Percorso_15')
    useGameStore.setState({ posizioniLocali1: { Percorso_15: 'n31' }, posizioniLocali2: { Percorso_15: 'n10' } })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(1, 'Percorso_15', 'n34')).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.muoviAvatarMappaLocale(1, 'Percorso_15', 'n31')).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(useGameStore.getState().posizioniLocali1.Percorso_15).toBe('n31')
    expect(useGameStore.getState().posizioniLocali2.Percorso_15).toBe('n10')
  })
})
