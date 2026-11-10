import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applicaXP } from '@/engine/battleEngine'
import { creaIstanza, useGameStore } from '@/store/gameStore'
import { normalizeChallengeContext } from '@/challenges/challengePersistence'
import { createChallengeSession } from '@/challenges/challengeRules'
import { createSeededRandomState } from '@/challenges/seededRandom'
import { initialGameSave, normalizeGameSave, serializeGameState } from './gamePersistence'
import { serializeGameBackup, stateFromValidatedBackup, validateGameBackup } from './gameBackup'

const storage = vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  return values
})

function oldCampaign() {
  const state = initialGameSave()
  const active = { ...creaIstanza(1, 10)!, hp: 3, xp: 9, stato: { tipo: 'Paralizzato' as const, turniRimanenti: -1 } }
  const rival = { ...creaIstanza(5, 11)!, hp: 0, xp: 4 }
  state.giocatore1.squadra = [active]
  state.giocatore1.deposito = { '30:35': { ...creaIstanza(9, 40)!, hp: 2, xp: 7 } }
  state.giocatore2.squadra = [rival]
  state.scenaCorrente = { scena: 'battaglia' }
  state.battaglia = {
    tipo: 'PVP', pokemonA: active, pokemonB: rival, squadraA: [active], squadraB: [rival],
    hpMaxA: 19, hpMaxB: 21, turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null,
    seeded: createSeededRandomState('Roma', 7),
    checkpoint: { version: 1, initialPriority: 'B', actedThisRound: ['B'], phase: 'player',
      openingComplete: true, outcome: null, evolutions: [], rivalMessages: ['Turno già risolto'] },
  }
  return state
}

describe('EXP senza accumulo nei salvataggi e nei trasferimenti di creature', () => {
  beforeEach(() => { storage.clear(); useGameStore.getState().reset() })

  it('recupera team, deposito e copie della battaglia senza cambiare livelli, HP, PAR, dadi o checkpoint', () => {
    const old = oldCampaign()
    const recovered = normalizeGameSave(old)
    const instances = [...recovered.state.giocatore1.squadra, ...Object.values(recovered.state.giocatore1.deposito),
      ...recovered.state.giocatore2.squadra, recovered.state.battaglia!.pokemonA, recovered.state.battaglia!.pokemonB,
      ...recovered.state.battaglia!.squadraA!, ...recovered.state.battaglia!.squadraB!]
    expect(instances.every((pokemon) => pokemon.xp === 0)).toBe(true)
    expect(recovered.state.giocatore1.squadra[0]).toEqual({ ...old.giocatore1.squadra[0], xp: 0 })
    expect(recovered.state.giocatore1.deposito['30:35']).toEqual({ ...old.giocatore1.deposito['30:35'], xp: 0 })
    expect(recovered.state.giocatore2.squadra[0]).toEqual({ ...old.giocatore2.squadra[0], xp: 0 })
    expect(recovered.state.battaglia!.seeded).toEqual(old.battaglia!.seeded)
    expect(recovered.state.battaglia!.checkpoint).toMatchObject(old.battaglia!.checkpoint!)
    expect(recovered.warnings.join(' ')).toContain('rimossa l’esperienza accumulata')
    expect(applicaXP(recovered.state.giocatore1.squadra[0], 0).istanza.livello).toBe(10)
    expect(old.giocatore1.squadra[0].xp).toBe(9)
  })

  it('la serializzazione non può scrivere residui EXP e non modifica gli oggetti ricevuti', () => {
    const old = oldCampaign()
    const saved = JSON.parse(JSON.stringify(serializeGameState(old)))
    expect(saved.giocatore1.squadra[0].xp).toBe(0)
    expect(saved.giocatore1.deposito['30:35'].xp).toBe(0)
    expect(saved.giocatore2.squadra[0].xp).toBe(0)
    expect(saved.battaglia.pokemonA.xp).toBe(0)
    expect(saved.battaglia.pokemonB.xp).toBe(0)
    expect(saved.battaglia.squadraA[0].xp).toBe(0)
    expect(saved.battaglia.squadraB[0].xp).toBe(0)
    expect(saved.battaglia.seeded.cursor).toBe(7)
    expect(old.giocatore1.squadra[0].xp).toBe(9)
    expect(old.giocatore2.squadra[0].xp).toBe(4)
  })

  it('un backup legacy avvisa dell’EXP rimossa e non la ripristina neppure dopo un nuovo cap', () => {
    const file = JSON.parse(serializeGameBackup(oldCampaign()))
    file.campaign.giocatore1.squadra[0].xp = 90
    file.campaign.giocatore1.deposito['30:35'].xp = 12
    file.campaign.battaglia.pokemonA.xp = 90
    const validation = validateGameBackup(JSON.stringify(file))
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.preview.warnings.join(' ')).toContain('esperienza accumulata')
    const restored = stateFromValidatedBackup(validation.preview)!
    expect(restored.giocatore1.squadra[0]).toMatchObject({ livello: 10, hp: 3, xp: 0 })
    expect(restored.giocatore1.deposito['30:35']).toMatchObject({ livello: 40, hp: 2, xp: 0 })
    expect(applicaXP(restored.giocatore1.squadra[0], 0, 100).istanza.livello).toBe(10)
    expect(applicaXP(restored.giocatore1.squadra[0], 1, 100).istanza).toMatchObject({ livello: 11, hp: 3, xp: 0 })
  })

  it('azzera i residui anche nella campagna custodita da una sfida a seed', () => {
    const old = oldCampaign()
    const context = normalizeChallengeContext({ version: 1, attemptId: 'seed-attempt',
      session: createChallengeSession({ version: 1, seed: 'Roma', mode: 'seed', speciesIds: [] }), campaign: old })!
    const restored = normalizeGameSave(context.campaign).state
    expect(restored.giocatore1.squadra[0]).toMatchObject({ livello: 10, hp: 3, xp: 0 })
    expect(restored.giocatore2.squadra[0]).toMatchObject({ livello: 11, hp: 0, xp: 0 })
    expect(restored.battaglia!.seeded!.cursor).toBe(7)
  })

  it('aggiunta e aggiornamento di squadra/deposito non reintroducono una banca EXP', () => {
    const original = { ...creaIstanza(1, 10)!, hp: 3, xp: 90 }
    useGameStore.getState().aggiungiPokemon(1, original)
    expect(useGameStore.getState().giocatore1.squadra[0]).toEqual({ ...original, xp: 0 })
    useGameStore.getState().aggiornaPokemon(1, { ...original, hp: 2, xp: 100 })
    expect(useGameStore.getState().giocatore1.squadra[0]).toMatchObject({ livello: 10, hp: 2, xp: 0 })
    const reserve = { ...creaIstanza(5, 40)!, hp: 1, xp: 5 }
    useGameStore.getState().aggiungiPokemon(1, reserve)
    useGameStore.getState().aggiornaPokemon(1, { ...reserve, xp: 8 })
    expect(useGameStore.getState().giocatore1.deposito['1:1']).toEqual({ ...reserve, xp: 0 })
    expect(original.xp).toBe(90)
  })

  it('i checkpoint di battaglia e la cattura lasciano tutte le copie con EXP zero', () => {
    const state = oldCampaign()
    const target = { ...state.battaglia!.pokemonB, hp: 3 }
    const battle = { ...state.battaglia!, tipo: 'Selvatico' as const, pokemonB: target, squadraB: [target] }
    useGameStore.setState({ giocatore1: { ...state.giocatore1, squadra: state.giocatore1.squadra.map((pokemon) => ({ ...pokemon, xp: 0 })) } })
    useGameStore.getState().iniziaBattaglia(battle)
    expect(useGameStore.getState().battaglia!.pokemonA.xp).toBe(0)
    useGameStore.getState().aggiornaBattaglia({ pokemonA: { ...battle.pokemonA, xp: 123 } })
    expect(useGameStore.getState().battaglia!.pokemonA).toEqual({ ...battle.pokemonA, xp: 0 })
    expect(useGameStore.getState().concludiCattura(1, target, { pokemonB: { ...target, xp: 5 },
      checkpoint: { ...battle.checkpoint!, phase: 'ended', outcome: 'vittoria' } })).toBe(true)
    expect(useGameStore.getState().giocatore1.squadra[1]).toEqual({ ...target, xp: 0 })
    expect(useGameStore.getState().battaglia!.pokemonB.xp).toBe(0)
    expect(useGameStore.getState().battaglia!.squadraB![0].xp).toBe(0)
  })
})
