import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalMap } from '@data/localMaps'
import { getAdjacentLocalMapNodes } from '@engine/localMapMovement'
import { calcolaHPMax } from '@engine/battleEngine'
import { creaIstanza, useGameStore } from '@store/gameStore'
import type { PosizioneAvatar, StatoBattaglia } from '@/types'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

const world = (luogo: string): PosizioneAvatar => ({
  mappaId: 'mappa-principale', luogo, x: 0, y: 0, direzione: 'S',
})

function firstStep(luogo: string): { start: string; next: string } {
  const map = getLocalMap(luogo)!
  const next = getAdjacentLocalMapNodes(map, map.startNode)[0]
  if (!next) throw new Error(`Il punto d'ingresso di ${luogo} non ha strade.`)
  return { start: map.startNode, next }
}

function ongoingBattle(): StatoBattaglia {
  const pokemonA = { ...creaIstanza(1, 5)!, hp: 7 }
  const pokemonB = { ...creaIstanza(13, 5)!, hp: 3 }
  return { tipo: 'NPC', pokemonA, pokemonB, squadraA: [pokemonA], squadraB: [pokemonB],
    hpMaxA: calcolaHPMax(pokemonA), hpMaxB: calcolaHPMax(pokemonB), turnoCorrente: 'A',
    luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null,
    checkpoint: { version: 1, phase: 'player', initialPriority: 'A', actedThisRound: [],
      openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] },
  }
}

describe('store - mappe locali e due azioni condivise', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState({ posizione1: world('Venezia'), posizione2: world('Venezia') })
  })

  it('apre il disegno senza spendere azioni o cambiare il nodo principale e conserva due avatar distinti', () => {
    const { start } = firstStep('Venezia')
    const initialWorld = useGameStore.getState().posizione1
    expect(useGameStore.getState().apriMappaLocale(1, 'Venezia')).toBe(true)
    expect(useGameStore.getState().posizioniLocali1.Venezia).toBe(start)
    expect(useGameStore.getState().posizioniLocali2).toEqual({})
    expect(useGameStore.getState().inizializzaPosizioneLocale(2, 'Venezia')).toBe(start)
    expect(useGameStore.getState().posizione1).toBe(initialWorld)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
  })

  it('consente due strade locali e blocca il terzo movimento senza spendere azioni dell’altro giocatore', () => {
    const { start, next } = firstStep('Venezia')
    const store = useGameStore.getState()
    store.apriMappaLocale(1, 'Venezia')
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', next)).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', start)).toBe(true)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 0 })
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', next)).toBe(false)
    expect(store.consumaInterazioneMappaLocale(1, 'Venezia')).toBe(false)
    expect(useGameStore.getState().giocatoreAttivo).toBe(1)
    expect(useGameStore.getState().posizioniLocali2).toEqual({})
  })

  it('condivide le azioni tra movimento principale e locale: aprire e tornare indietro non le ripristina', () => {
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaPrincipale(1, 'Percorso_1')).toBe(true)
    expect(store.apriMappaLocale(1, 'Percorso_1')).toBe(true)
    const { next } = firstStep('Percorso_1')
    expect(store.muoviAvatarMappaLocale(1, 'Percorso_1', next)).toBe(true)
    store.vaiAScena('mappa-principale')
    expect(store.apriMappaLocale(1, 'Percorso_1')).toBe(true)
    expect(useGameStore.getState().posizioniLocali1.Percorso_1).toBe(next)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(store.muoviAvatarMappaPrincipale(1, 'Piacenza')).toBe(false)
    expect(useGameStore.getState().posizione1.luogo).toBe('Percorso_1')
  })

  it('un movimento e un’interazione terminano il turno, mantenendo il giocatore per completare l’attività', () => {
    const store = useGameStore.getState()
    const { next } = firstStep('Venezia')
    store.apriMappaLocale(1, 'Venezia')
    store.muoviAvatarMappaLocale(1, 'Venezia', next)
    const g1 = useGameStore.getState().giocatore1
    expect(store.consumaInterazioneMappaLocale(1, 'Venezia')).toBe(true)
    expect(useGameStore.getState().giocatoreAttivo).toBe(1)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', next)).toBe(false)
    expect(store.consumaInterazioneMappaLocale(1, 'Venezia')).toBe(false)
    expect(useGameStore.getState().giocatore1).toBe(g1)
    expect(g1.cespugliVisitati.size).toBe(0)
    expect(g1.caselleConsumate.size).toBe(0)
  })

  it('attiva il prossimo giocatore già accodato senza saltarlo, poi passa normalmente al successivo', () => {
    const store = useGameStore.getState()
    store.apriMappaLocale(1, 'Venezia')
    store.consumaInterazioneMappaLocale(1, 'Venezia')
    expect(store.passaTurnoMappaLocale()).toBe(true)
    expect(useGameStore.getState().giocatoreAttivo).toBe(2)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    expect(store.apriMappaLocale(2, 'Venezia')).toBe(true)
    expect(store.passaTurnoMappaLocale()).toBe(true)
    expect(useGameStore.getState().giocatoreAttivo).toBe(1)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
  })

  it('durante la battaglia non passa il controllo dalla mappa principale', () => {
    const before = useGameStore.getState().turnoOverworld
    useGameStore.setState({ battaglia: ongoingBattle() })
    useGameStore.getState().passaTurnoOverworld()
    expect(useGameStore.getState().turnoOverworld).toBe(before)
    expect(useGameStore.getState().giocatoreAttivo).toBe(1)
  })

  it('durante la battaglia blocca anche movimento e interazione sulla mappa principale', () => {
    const before = useGameStore.getState()
    useGameStore.setState({ battaglia: ongoingBattle() })
    const store = useGameStore.getState()
    expect(store.muoviAvatarMappaPrincipale(1, 'Percorso_1')).toBe(false)
    expect(store.interagisciLuogoMappaPrincipale(1)).toEqual({ tipo: 'no-op' })
    expect(useGameStore.getState().posizione1).toBe(before.posizione1)
    expect(useGameStore.getState().turnoOverworld).toBe(before.turnoOverworld)
  })

  it('mantiene la posizione di ciascun giocatore e di ciascun luogo durante i cambi di turno', () => {
    const store = useGameStore.getState()
    const { start, next } = firstStep('Venezia')
    store.apriMappaLocale(1, 'Venezia')
    store.muoviAvatarMappaLocale(1, 'Venezia', next)
    store.passaTurnoMappaLocale()
    store.apriMappaLocale(2, 'Venezia')
    expect(useGameStore.getState().posizioniLocali2.Venezia).toBe(start)
    store.passaTurnoMappaLocale()
    store.muoviAvatarMappaPrincipale(1, 'Percorso_1')
    store.apriMappaLocale(1, 'Percorso_1')
    expect(useGameStore.getState().posizioniLocali1.Venezia).toBe(next)
    expect(useGameStore.getState().posizioniLocali1.Percorso_1).toBe(firstStep('Percorso_1').start)
    expect(useGameStore.getState().posizione2.luogo).toBe('Venezia')
  })

  it('non teletrasporta un giocatore aprendo un luogo diverso e rifiuta nodi sconosciuti', () => {
    const store = useGameStore.getState()
    const before = useGameStore.getState().posizione1
    expect(store.apriMappaLocale(1, 'Roma')).toBe(false)
    expect(store.inizializzaPosizioneLocale(1, 'Roma')).toBeNull()
    expect(store.muoviAvatarMappaLocale(1, 'Roma', 'qualunque')).toBe(false)
    expect(store.consumaInterazioneMappaLocale(1, 'Roma')).toBe(false)
    store.apriMappaLocale(1, 'Venezia')
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', 'inesistente')).toBe(false)
    expect(store.apriMappaLocale(2, 'Venezia')).toBe(false)
    expect(store.muoviAvatarMappaLocale(2, 'Venezia', firstStep('Venezia').next)).toBe(false)
    expect(useGameStore.getState().posizione1).toBe(before)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
  })

  it('non permette movimento, apertura o cambio di turno durante una battaglia', () => {
    const store = useGameStore.getState()
    store.apriMappaLocale(1, 'Venezia')
    useGameStore.setState({ battaglia: ongoingBattle() })
    expect(store.apriMappaLocale(1, 'Venezia')).toBe(false)
    expect(store.muoviAvatarMappaLocale(1, 'Venezia', firstStep('Venezia').next)).toBe(false)
    expect(store.consumaInterazioneMappaLocale(1, 'Venezia')).toBe(false)
    expect(store.passaTurnoMappaLocale()).toBe(false)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
  })

  it('ripristina posizione locale e budget senza concedere nuove azioni dopo la ricarica', () => {
    const store = useGameStore.getState()
    const { next } = firstStep('Venezia')
    store.apriMappaLocale(1, 'Venezia')
    store.muoviAvatarMappaLocale(1, 'Venezia', next)
    const options = useGameStore.persist.getOptions()
    const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
    const restored = options.merge!(saved, useGameStore.getState())
    expect(restored.posizioniLocali1.Venezia).toBe(next)
    expect(restored.turnoOverworld.azioniRimaste).toBe(1)
    expect(restored.posizione1.luogo).toBe('Venezia')
  })

  it('supporta i vecchi salvataggi e riporta al punto d’ingresso i pallini rimossi dal disegno', () => {
    const options = useGameStore.persist.getOptions()
    const old = options.merge!({ posizione1: world('Venezia') }, useGameStore.getState())
    expect(old.posizioniLocali1).toEqual({})
    expect(old.posizioniLocali2).toEqual({})
    const stale = options.merge!({ posizioniLocali1: { Venezia: 'rimosso', Sconosciuta: 'a' } }, useGameStore.getState())
    expect(stale.posizioniLocali1).toEqual({ Venezia: firstStep('Venezia').start })
    expect(stale.posizioniLocali2).toEqual({})
  })

  it('la nuova partita elimina tutte le posizioni locali', () => {
    const store = useGameStore.getState()
    store.apriMappaLocale(1, 'Venezia')
    store.inizializzaPosizioneLocale(2, 'Venezia')
    store.reset()
    expect(useGameStore.getState().posizioniLocali1).toEqual({})
    expect(useGameStore.getState().posizioniLocali2).toEqual({})
  })
})
