import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALLENATORI } from '@/data'
import { useGameStore } from '../gameStore'
import { settledBattleCheckpoint, restoreBattleCheckpoint } from '@/components/battle/battleCheckpoint'
import { GAME_SAVE_STORAGE_KEY, serializeGameState } from '@/save/gamePersistence'
import type { PokemonIstanza, StatoBattaglia } from '@/types'

const storageValues = vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  })
  return values
})

const a: PokemonIstanza = { istanzaId: 'player', specieId: 1, nome: 'A', livello: 5, hp: 7, xp: 0 }
const b: PokemonIstanza = { istanzaId: 'wild', specieId: 13, nome: 'B', livello: 5, hp: 3, xp: 0 }
const checkpoint = settledBattleCheckpoint({
  initialPriority: 'A', actedThisRound: new Set(), turnA: true, pvp: false,
  chooseRivalMove: false, outcome: 'vittoria', openingComplete: true,
  evolutions: [], rivalMessages: [],
})
function setup() {
  const battle: StatoBattaglia = {
    tipo: 'Selvatico', pokemonA: a, pokemonB: b, hpMaxA: 12, hpMaxB: 12,
    turnoCorrente: 'A', luogoRitorno: 'Percorso_1', log: [], evoluzioneInAttesa: null,
  }
  useGameStore.setState((state) => ({
    battaglia: battle, giocatoreAttivo: 1,
    giocatore1: { ...state.giocatore1, squadra: [a], deposito: {}, inventario: { masterball: 1 } },
  }))
}
describe('atomic capture and reward settlement', () => {
  beforeEach(() => { storageValues.clear(); useGameStore.getState().reset(); setup() })
  it('stores Masterball consumption, captured Pokémon and ended battle in one state update', () => {
    let updates = 0
    const unsubscribe = useGameStore.subscribe(() => { updates += 1 })
    expect(useGameStore.getState().concludiCattura(1, b, { checkpoint }, true)).toBe(true)
    unsubscribe()
    expect(updates).toBe(1)
    const state = useGameStore.getState()
    expect(state.giocatore1.squadra.map((pokemon) => pokemon.istanzaId)).toEqual(['player', 'wild'])
    expect(state.giocatore1.inventario.masterball).toBe(0)
    expect(restoreBattleCheckpoint(JSON.parse(JSON.stringify(state.battaglia))).phase).toBe('ended')
    expect(state.concludiCattura(1, b, { checkpoint })).toBe(false)
    expect(useGameStore.getState().giocatore1.squadra).toHaveLength(2)
  })
  it('keeps item, squad and battle intact when an unavailable Masterball is requested', () => {
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, inventario: { masterball: 0 } } }))
    const original = useGameStore.getState()
    expect(original.concludiCattura(1, b, { checkpoint }, true)).toBe(false)
    expect(useGameStore.getState()).toBe(original)
  })
  it.each([
    { masterball: false, fullTeam: false }, { masterball: true, fullTeam: false },
    { masterball: false, fullTeam: true }, { masterball: true, fullTeam: true },
  ])('a failed durable capture preserves every state and retries once: %j', ({ masterball, fullTeam }) => {
    const captured = { ...b, stato: { tipo: 'Paralizzato' as const, turniRimanenti: -1 } }
    useGameStore.setState((state) => ({
      giocatore1: { ...state.giocatore1, squadra: fullTeam
        ? [a, ...Array.from({ length: 5 }, (_, i) => ({ ...a, istanzaId: `reserve-${i}` }))]
        : [a] },
      battaglia: { ...state.battaglia!, pokemonB: captured,
        seeded: { algorithm: 'arkamon-counter-v1', seed: 'capture-retry', cursor: 12 } },
    }))
    const original = useGameStore.getState()
    const diskBefore = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    const options = useGameStore.persist.getOptions(), storage = options.storage!
    let updates = 0
    const unsubscribe = useGameStore.subscribe(() => { updates += 1 })
    useGameStore.persist.setOptions({ storage: { ...storage, setItem: () => { throw new Error('QuotaExceededError') } } })
    try {
      expect(original.concludiCattura(1, captured, { checkpoint }, masterball)).toBe(false)
      expect(useGameStore.getState()).toBe(original)
      expect(useGameStore.getState().arkadex).toBe(original.arkadex)
      expect(useGameStore.getState().matchLog).toBe(original.matchLog)
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(diskBefore)
      expect(updates).toBe(0)
    } finally { useGameStore.persist.setOptions({ storage }) }

    expect(original.concludiCattura(1, captured, { checkpoint }, masterball)).toBe(true)
    const current = useGameStore.getState()
    const owned = [...current.giocatore1.squadra, ...Object.values(current.giocatore1.deposito)]
    expect(owned.filter((pokemon) => pokemon.istanzaId === captured.istanzaId)).toEqual([captured])
    expect(current.giocatore1.inventario.masterball).toBe(masterball ? 0 : 1)
    expect(fullTeam ? current.giocatore1.deposito['1:1'] : current.giocatore1.squadra[1]).toEqual(captured)
    expect(current.battaglia?.checkpoint).toEqual(checkpoint)
    expect(current.battaglia?.seeded).toEqual(original.battaglia?.seeded)
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!).state).toEqual(serializeGameState(current))
    expect(updates).toBe(1)
    expect(current.concludiCattura(1, captured, { checkpoint }, masterball)).toBe(false)
    expect(updates).toBe(1)
    unsubscribe()
  })
  it.each([false, true])('preserva PAR dopo la cattura e la chiusura, anche se la squadra è piena: %s', (squadraPiena) => {
    const par = { tipo: 'Paralizzato' as const, turniRimanenti: -1 }
    const player = { ...a, stato: par }
    const captured = { ...b, stato: par }
    const squadra = squadraPiena
      ? [player, ...Array.from({ length: 5 }, (_, i) => ({ ...a, istanzaId: `reserve-${i}` }))]
      : [player]
    useGameStore.setState((state) => ({
      giocatore1: { ...state.giocatore1, squadra },
      battaglia: { ...state.battaglia!, pokemonA: player, pokemonB: captured, squadraA: squadra },
    }))

    expect(useGameStore.getState().concludiCattura(1, captured, { checkpoint }, true)).toBe(true)
    useGameStore.getState().terminaBattaglia(false)

    const state = useGameStore.getState()
    expect(state.battaglia).toBeNull()
    expect(state.giocatore1.inventario.masterball).toBe(0)
    expect(state.giocatore1.squadra[0]).toEqual(player)
    const ricevuto = squadraPiena ? state.giocatore1.deposito['1:1'] : state.giocatore1.squadra[1]
    expect(ricevuto).toEqual(captured)
  })
  it('settles NPC coins once, including after serializing and restoring the finished battle', () => {
    const npc = ALLENATORI.find((trainer) => trainer.tipo === 'NPC')!
    useGameStore.setState((state) => ({ battaglia: { ...state.battaglia!, tipo: 'NPC', allenatoreId: npc.id, checkpoint } }))
    const before = useGameStore.getState().giocatore1.monete
    useGameStore.getState().risolviBattagliaNPC('vittoria')
    expect(useGameStore.getState().giocatore1.monete).toBe(before + 200)
    useGameStore.setState({ battaglia: JSON.parse(JSON.stringify(useGameStore.getState().battaglia)) })
    useGameStore.getState().risolviBattagliaNPC('vittoria')
    expect(useGameStore.getState().giocatore1.monete).toBe(before + 200)
  })
})
