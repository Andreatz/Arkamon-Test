import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, creaIstanza } from '../gameStore'
import { MAIN_MAP_START_NODE } from '@/data/mainMapRoads'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

describe('recupero dei campi corrotti senza perdere la partita valida', () => {
  beforeEach(() => useGameStore.getState().reset())
  const restore = (saved: unknown) => useGameStore.persist.getOptions().merge!(saved, useGameStore.getState())

  it('rifiuta Set non iterabili e squadra/deposito null preservando nome e monete', () => {
    const state = restore({ giocatore1: {
      nome: 'Andrea', monete: 1200, squadra: null, deposito: null,
      cespugliVisitati: {}, allenatoriSconfitti: 13, caselleConsumate: false,
    } })
    expect(state.giocatore1).toMatchObject({ nome: 'Andrea', monete: 1200, squadra: [], deposito: {} })
    expect(state.giocatore1.cespugliVisitati).toEqual(new Set())
    expect(state.giocatore1.allenatoriSconfitti).toEqual(new Set())
    expect(state.giocatore1.caselleConsumate).toEqual(new Set())
  })

  it('i dati persistiti non sostituiscono le azioni dello store', () => {
    const reset = useGameStore.getState().reset
    const state = restore({ reset: 'danneggiato', scegliStarter: null, vaiAScena: [] })
    expect(state.reset).toBe(reset)
    expect(typeof state.scegliStarter).toBe('function')
    expect(typeof state.vaiAScena).toBe('function')
  })

  it('un nodo principale non più esistente torna all’ingresso, evitando un avatar bloccato', () => {
    const state = restore({ posizione1: { mappaId: 'mappa-principale', luogo: 'Citta_rimossa' } })
    expect(state.posizione1.luogo).toBe(MAIN_MAP_START_NODE)
  })

  it('campi scena null e turno invalido non impediscono la riapertura', () => {
    const state = restore({ scenaCorrente: null, scenaPrecedente: [], giocatoreAttivo: 9,
      turnoOverworld: { giocatoreAttivo: 7, azioniRimaste: 'due' }, audioMuted: 'false' })
    expect(state.scenaCorrente).toEqual({ scena: 'titolo' })
    expect(state.scenaPrecedente).toBeNull()
    expect(state.giocatoreAttivo).toBe(1)
    expect(state.turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
    expect(state.audioMuted).toBe(false)
  })

  it('recupera separatamente ogni creatura e conserva HP residui, PAR e progressi validi', () => {
    const pokemon = { ...creaIstanza(1, 15)!, hp: 3, xp: 2,
      stato: { tipo: 'Paralizzato' as const, turniRimanenti: -1 } }
    const state = restore({ giocatore2: { squadra: [null, pokemon], deposito: { '1:1': null, '1:2': pokemon },
      allenatoriSconfitti: [101, '102', null], cespugliVisitati: ['Percorso_1:A', 4],
      inventario: { masterball: -4 }, monete: -1 } })
    expect(state.giocatore2.squadra).toEqual([{ ...pokemon, xp: 0 }])
    expect(state.giocatore2.deposito['1:2']).toEqual({ ...pokemon, xp: 0, istanzaId: `${pokemon.istanzaId}-recovered-1` })
    expect(state.saveRecoveryWarnings.join(' ')).toContain('identità duplicate')
    expect(state.giocatore2.allenatoriSconfitti).toEqual(new Set([101]))
    expect(state.giocatore2.cespugliVisitati).toEqual(new Set(['Percorso_1:A']))
    expect(state.giocatore2.monete).toBe(0)
    expect(state.giocatore2.inventario.masterball).toBe(0)
  })

  it('la vera ricarica localStorage recupera il primo starter e permette la seconda scelta', async () => {
    const primo = creaIstanza(5, 5)!
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: { nome: 'Andrea', squadra: [primo], cespugliVisitati: {} },
      giocatore2: { squadra: null }, scegliStarter: null,
      scenaCorrente: { scena: 'laboratorio' },
    } }))
    await useGameStore.persist.rehydrate()
    expect(useGameStore.persist.hasHydrated()).toBe(true)
    expect(useGameStore.getState().giocatore1.squadra).toEqual([primo])
    expect(useGameStore.getState().scegliStarter(9)).toBe(true)
    expect(useGameStore.getState().giocatore2.squadra[0].specieId).toBe(9)
    expect(useGameStore.getState().rivaleStarterId).toBe(1)
  })

  it('una battaglia incompleta viene scartata senza bloccare il router e senza perdere squadra e HP', () => {
    const pokemon = { ...creaIstanza(1, 5)!, hp: 4 }
    const state = restore({ giocatore1: { squadra: [pokemon] }, battaglia: { tipo: 'NPC', pokemonA: pokemon },
      scenaCorrente: { scena: 'battaglia' } })
    expect(state.battaglia).toBeNull()
    expect(state.scenaCorrente).toEqual({ scena: 'mappa-principale' })
    expect(state.giocatore1.squadra[0].hp).toBe(4)
  })

  it('un vecchio Pokémon senza nome e XP conserva identità, livello e HP', () => {
    const pokemon = creaIstanza(1, 15)!
    const state = restore({ giocatore1: { squadra: [{ istanzaId: pokemon.istanzaId, specieId: 1, livello: 15, hp: 2 }] } })
    expect(state.giocatore1.squadra).toEqual([{ ...pokemon, hp: 2, xp: 0 }])
  })
})
