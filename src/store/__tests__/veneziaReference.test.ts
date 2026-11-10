import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalMap } from '@data/localMaps'
import { getLocalMapNode } from '@engine/localMapMovement'
import { useGameStore } from '@store/gameStore'
import type { PosizioneAvatar } from '@/types'
import { VENEZIA_REFERENCE_NODES, VENEZIA_REMOVED_SHORTCUTS } from '@data/__tests__/fixtures/veneziaReference'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

const map = getLocalMap('Venezia')!
const world = (): PosizioneAvatar => ({ mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' })
const idOf = (number: number) => map.nodes.find((node) => node.label === `Punto ${number}`)!.id

describe('store - Venezia rinumerata senza teletrasporti o nuove azioni', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({ posizione1: world(), posizione2: world() })
  })

  it('ricarica tutti i 57 ID precedenti per entrambi i giocatori nello stesso punto fisico', () => {
    const options = useGameStore.persist.getOptions()
    for (let index = 0; index < VENEZIA_REFERENCE_NODES.length; index += 1) {
      const [number1, id1, x1, y1] = VENEZIA_REFERENCE_NODES[index]
      const [number2, id2, x2, y2] = VENEZIA_REFERENCE_NODES[VENEZIA_REFERENCE_NODES.length - 1 - index]
      const actions = index % 2
      useGameStore.setState({
        posizioniLocali1: { Venezia: id1, Roma: 'n2' },
        posizioniLocali2: { Venezia: id2, Roma: 'n3' },
        turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: actions },
      })
      const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
      const restored = options.merge!(saved, useGameStore.getState())
      expect(restored.posizioniLocali1).toEqual({ Venezia: id1, Roma: 'n2' })
      expect(restored.posizioniLocali2).toEqual({ Venezia: id2, Roma: 'n3' })
      expect(restored.turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: actions })
      const node1 = getLocalMapNode(map, restored.posizioniLocali1.Venezia)
      const node2 = getLocalMapNode(map, restored.posizioniLocali2.Venezia)
      expect(node1).toMatchObject({ id: id1, x: x1, y: y1, label: `Punto ${number1}` })
      expect(node2).toMatchObject({ id: id2, x: x2, y: y2, label: `Punto ${number2}` })
      useGameStore.setState(restored)
      expect(useGameStore.getState().inizializzaPosizioneLocale(1, 'Venezia')).toBe(id1)
      expect(useGameStore.getState().inizializzaPosizioneLocale(2, 'Venezia')).toBe(id2)
      expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(actions)
    }
  })

  it.each(VENEZIA_REMOVED_SHORTCUTS)('blocca %i–%i senza consumare azioni o muovere l’altro giocatore', (from, to) => {
    for (const [a, b] of [[from, to], [to, from]]) {
      useGameStore.setState({
        posizioniLocali1: { Venezia: idOf(a) },
        posizioniLocali2: { Venezia: idOf(29) },
      })
      const before = useGameStore.getState()
      expect(before.muoviAvatarMappaLocale(1, 'Venezia', idOf(b))).toBe(false)
      const after = useGameStore.getState()
      expect(after.posizioniLocali1).toBe(before.posizioniLocali1)
      expect(after.posizioniLocali2).toBe(before.posizioniLocali2)
      expect(after.turnoOverworld).toBe(before.turnoOverworld)
      expect(after.turnoOverworld.azioniRimaste).toBe(2)
    }
  })

  it('percorre 42 → 57 → 56 con due azioni e conserva posizione e budget dell’altro avatar', () => {
    useGameStore.setState({
      posizioniLocali1: { Venezia: idOf(42) }, posizioniLocali2: { Venezia: idOf(19) },
    })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', idOf(57))).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', idOf(56))).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', idOf(55))).toBe(false)
    expect(useGameStore.getState().posizioniLocali1.Venezia).toBe(idOf(56))
    expect(useGameStore.getState().posizioniLocali2.Venezia).toBe(idOf(19))
    expect(store.passaTurnoMappaLocale()).toBe(true)
    expect(store.muoviAvatarMappaLocale(2, 'Venezia', idOf(20))).toBe(true)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 1 })
    expect(useGameStore.getState().posizioniLocali1.Venezia).toBe(idOf(56))
    expect(useGameStore.getState().posizioniLocali2.Venezia).toBe(idOf(20))
  })

  it('mantiene la regola di un movimento e un’interazione sulle nuove biforcazioni', () => {
    useGameStore.setState({
      posizioniLocali1: { Venezia: idOf(42) }, posizioniLocali2: { Venezia: idOf(46) },
    })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', idOf(43))).toBe(true)
    expect(store.consumaInterazioneMappaLocale(1, 'Venezia')).toBe(true)
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', idOf(44))).toBe(false)
    expect(useGameStore.getState().posizioniLocali1.Venezia).toBe(idOf(43))
    expect(useGameStore.getState().posizioniLocali2.Venezia).toBe(idOf(46))
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
  })
})
