import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalMap } from '@data/localMaps'
import { getLocalMapNode } from '@engine/localMapMovement'
import { useGameStore } from '@store/gameStore'
import type { PosizioneAvatar } from '@/types'
import { CAGLIARI_REFERENCE_NODES, CAGLIARI_REMOVED_SHORTCUTS } from '@data/__tests__/fixtures/cagliariReference'
import { FOGGIA_REFERENCE_NODES, FOGGIA_REMOVED_SHORTCUTS } from '@data/__tests__/fixtures/foggiaReference'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

const references = [
  { city: 'Cagliari', nodes: CAGLIARI_REFERENCE_NODES, removed: CAGLIARI_REMOVED_SHORTCUTS,
    g1Path: [31, 32, 33, 34], g2Path: [19, 20, 21, 12], newId: 'n41' },
  { city: 'Foggia', nodes: FOGGIA_REFERENCE_NODES, removed: FOGGIA_REMOVED_SHORTCUTS,
    g1Path: [47, 50, 27, 26], g2Path: [36, 37, 36, 35], newId: undefined },
]

describe.each(references)('store - $city aggiornata senza teletrasporti o nuove azioni', (reference) => {
  const map = getLocalMap(reference.city)!
  const world = (): PosizioneAvatar => ({ mappaId: 'mappa-principale', luogo: reference.city, x: 0, y: 0, direzione: 'S' })
  const idOf = (number: number) => reference.nodes.find(([point]) => point === number)![1]

  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({ posizione1: world(), posizione2: world() })
  })

  it('ricarica tutti gli ID precedenti per entrambi i giocatori nello stesso punto fisico', () => {
    const nodes = reference.nodes.filter(([, id]) => id !== reference.newId)
    const options = useGameStore.persist.getOptions()
    for (let index = 0; index < nodes.length; index += 1) {
      const [number1, id1, x1, y1] = nodes[index]
      const [number2, id2, x2, y2] = nodes[nodes.length - 1 - index]
      const actions = index % 3
      useGameStore.setState({
        posizioniLocali1: { [reference.city]: id1, Venezia: 'n56' },
        posizioniLocali2: { [reference.city]: id2, Venezia: 'n54' },
        turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: actions },
      })
      const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
      const restored = options.merge!(saved, useGameStore.getState())
      expect(restored.posizioniLocali1).toEqual({ [reference.city]: id1, Venezia: 'n56' })
      expect(restored.posizioniLocali2).toEqual({ [reference.city]: id2, Venezia: 'n54' })
      expect(restored.turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: actions })
      expect(getLocalMapNode(map, restored.posizioniLocali1[reference.city]))
        .toMatchObject({ id: id1, x: x1, y: y1, label: `Punto ${number1}` })
      expect(getLocalMapNode(map, restored.posizioniLocali2[reference.city]))
        .toMatchObject({ id: id2, x: x2, y: y2, label: `Punto ${number2}` })
      useGameStore.setState(restored)
      expect(useGameStore.getState().inizializzaPosizioneLocale(1, reference.city)).toBe(id1)
      expect(useGameStore.getState().inizializzaPosizioneLocale(2, reference.city)).toBe(id2)
      expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(actions)
    }
  })

  it.each(reference.removed)('blocca %i–%i senza consumare azioni o muovere l’altro giocatore', (from, to) => {
    for (const [a, b] of [[from, to], [to, from]]) {
      useGameStore.setState({
        posizioniLocali1: { [reference.city]: idOf(a) },
        posizioniLocali2: { [reference.city]: idOf(1) },
      })
      const before = useGameStore.getState()
      expect(before.muoviAvatarMappaLocale(1, reference.city, idOf(b))).toBe(false)
      const after = useGameStore.getState()
      expect(after.posizioniLocali1).toBe(before.posizioniLocali1)
      expect(after.posizioniLocali2).toBe(before.posizioniLocali2)
      expect(after.turnoOverworld).toBe(before.turnoOverworld)
      expect(after.turnoOverworld.azioniRimaste).toBe(2)
    }
  })

  it('percorre due nuovi collegamenti, blocca il terzo movimento e mantiene l’altro avatar fermo', () => {
    const [start, next, second, third] = reference.g1Path
    useGameStore.setState({
      posizioniLocali1: { [reference.city]: idOf(start) },
      posizioniLocali2: { [reference.city]: idOf(reference.g2Path[0]) },
    })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(1, reference.city, idOf(next))).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.muoviAvatarMappaLocale(1, reference.city, idOf(second))).toBe(true)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 0 })
    expect(store.muoviAvatarMappaLocale(1, reference.city, idOf(third))).toBe(false)
    expect(useGameStore.getState().posizioniLocali1[reference.city]).toBe(idOf(second))
    expect(useGameStore.getState().posizioniLocali2[reference.city]).toBe(idOf(reference.g2Path[0]))

    const options = useGameStore.persist.getOptions()
    const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
    useGameStore.setState(options.merge!(saved, useGameStore.getState()))
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(store.muoviAvatarMappaLocale(1, reference.city, idOf(third))).toBe(false)

    expect(store.passaTurnoMappaLocale()).toBe(true)
    expect(store.muoviAvatarMappaLocale(2, reference.city, idOf(reference.g2Path[1]))).toBe(true)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 1 })
    expect(useGameStore.getState().posizioniLocali1[reference.city]).toBe(idOf(second))
    expect(useGameStore.getState().posizioniLocali2[reference.city]).toBe(idOf(reference.g2Path[1]))
  })

  it('raggiunge il punto prima isolato e termina con movimento più interazione senza concedere un terzo passo', () => {
    const [start, formerlyIsolated, second] = reference.g2Path
    useGameStore.setState({
      giocatoreAttivo: 2,
      turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 2 },
      posizioniLocali1: { [reference.city]: idOf(reference.g1Path[0]) },
      posizioniLocali2: { [reference.city]: idOf(start) },
    })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(2, reference.city, idOf(formerlyIsolated))).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.consumaInterazioneMappaLocale(2, reference.city)).toBe(true)
    expect(store.muoviAvatarMappaLocale(2, reference.city, idOf(second))).toBe(false)
    expect(useGameStore.getState().posizioniLocali1[reference.city]).toBe(idOf(reference.g1Path[0]))
    expect(useGameStore.getState().posizioniLocali2[reference.city]).toBe(idOf(formerlyIsolated))
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
  })
})

describe('store - nuovo punto Cagliari e raccordi senza azioni aggiuntive', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    const world: PosizioneAvatar = { mappaId: 'mappa-principale', luogo: 'Cagliari', x: 0, y: 0, direzione: 'S' }
    useGameStore.setState({ posizione1: world, posizione2: { ...world } })
  })

  it('salva il nuovo Punto 32 per entrambi i giocatori senza riportarli all’ingresso', () => {
    useGameStore.setState({
      posizioniLocali1: { Cagliari: 'n41' }, posizioniLocali2: { Cagliari: 'n41' },
      turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 1 },
    })
    const options = useGameStore.persist.getOptions()
    const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
    const restored = options.merge!(saved, useGameStore.getState())
    expect(restored.posizioniLocali1.Cagliari).toBe('n41')
    expect(restored.posizioniLocali2.Cagliari).toBe('n41')
    expect(restored.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 1 })
  })

  it.each([['n27', 'n29'], ['n27', 'n22'], ['n22', 'n29']])(
    'il raccordo %s–%s costa un solo movimento, senza fermate intermedie inventate', (from, to) => {
      useGameStore.setState({ posizioniLocali1: { Cagliari: from }, posizioniLocali2: { Cagliari: 'n16' } })
      const store = useGameStore.getState()
      expect(store.muoviAvatarMappaLocale(1, 'Cagliari', to)).toBe(true)
      expect(useGameStore.getState().posizioniLocali1.Cagliari).toBe(to)
      expect(useGameStore.getState().posizioniLocali2.Cagliari).toBe('n16')
      expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    },
  )
})

describe('store - bivio di Foggia sotto il Punto 28', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    const world: PosizioneAvatar = { mappaId: 'mappa-principale', luogo: 'Foggia', x: 0, y: 0, direzione: 'S' }
    useGameStore.setState({ posizione1: world, posizione2: { ...world } })
  })

  it.each([['n55', 'n56'], ['n55', 'n47'], ['n56', 'n47']])(
    'il raccordo %s–%s costa un solo movimento, anche tornando indietro', (from, to) => {
      useGameStore.setState({ posizioniLocali1: { Foggia: from }, posizioniLocali2: { Foggia: 'n1' } })
      const store = useGameStore.getState()
      expect(store.muoviAvatarMappaLocale(1, 'Foggia', to)).toBe(true)
      expect(useGameStore.getState().posizioniLocali1.Foggia).toBe(to)
      expect(useGameStore.getState().posizioniLocali2.Foggia).toBe('n1')
      expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
      expect(store.muoviAvatarMappaLocale(1, 'Foggia', from)).toBe(true)
      expect(useGameStore.getState().posizioniLocali1.Foggia).toBe(from)
      expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    },
  )

  it('raggiunge 28 da 26 con una sola azione e impedisce di saltare il successivo Punto 29', () => {
    useGameStore.setState({ posizioniLocali1: { Foggia: 'n56' }, posizioniLocali2: { Foggia: 'n55' } })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(1, 'Foggia', 'n41')).toBe(false)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
    expect(store.muoviAvatarMappaLocale(1, 'Foggia', 'n47')).toBe(true)
    expect(useGameStore.getState().posizioniLocali1.Foggia).toBe('n47')
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.muoviAvatarMappaLocale(1, 'Foggia', 'n41')).toBe(true)
    expect(useGameStore.getState().posizioniLocali1.Foggia).toBe('n41')
    expect(useGameStore.getState().posizioniLocali2.Foggia).toBe('n55')
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
  })
})
