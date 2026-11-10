import { describe, expect, it } from 'vitest'
import { getPokemon } from '@/data'
import { initialGameSave, type GameSaveState } from '@/save/gamePersistence'
import { recordArkadex } from '@/arkadex/arkadexModel'
import type { PokemonIstanza, StatoBattaglia } from '@/types'
import { trackGameChange } from '../trackGameChange'

const pokemon = (speciesId: number, id = `pokemon-${speciesId}`, level = 5, xp = 0): PokemonIstanza => ({ istanzaId: id, specieId: speciesId, nome: getPokemon(speciesId)!.nome, livello: level, hp: 3, xp })
const campaign = (): GameSaveState => {
  const state = initialGameSave()
  state.scenaCorrente = { scena: 'mappa-principale' }
  state.giocatore1 = { ...state.giocatore1, nome: 'Uno', squadra: [pokemon(1)] }
  state.giocatore2 = { ...state.giocatore2, nome: 'Due', squadra: [pokemon(5)] }
  state.arkadex = recordArkadex(recordArkadex(state.arkadex, 1, 1, true), 2, 5, true)
  return state
}
const battle = (attacker: PokemonIstanza, includeSquad = true): StatoBattaglia => ({
  tipo: 'Selvatico', pokemonA: attacker, pokemonB: pokemon(13, 'opponent'),
  ...(includeSquad ? { squadraA: [attacker] } : {}), hpMaxA: 30, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null,
})
const commit = (previous: GameSaveState, next: GameSaveState): GameSaveState => ({ ...next, ...trackGameChange(previous, next) })

describe('Committed campaign tracking', () => {
  it('starts a new campaign without carrying reset movements or the previous battle into its register', () => {
    const before = campaign()
    before.posizione1 = { ...before.posizione1, luogo: 'Roma' }
    before.posizione2 = { ...before.posizione2, luogo: 'Venezia' }
    before.battaglia = battle(before.giocatore1.squadra[0])
    const next = initialGameSave()
    const committed = commit(before, next)
    expect(committed.matchLog.events.map((event) => event.kind)).toEqual(['start'])
    expect(committed.matchLog.events[0].sequence).toBe(1)
    expect(committed.arkadex).toEqual(next.arkadex)
    const lab = commit(committed, { ...committed, scenaCorrente: { scena: 'laboratorio' } })
    expect(lab.matchLog.events.map((event) => event.kind)).toEqual(['start'])
  })

  it('records real starter selection and keeps the other player undiscovered', () => {
    const before = initialGameSave()
    const next = { ...before, giocatore1: { ...before.giocatore1, squadra: [pokemon(1)] } }
    const tracked = trackGameChange(before, next)
    expect(tracked.matchLog.events).toHaveLength(1)
    expect(tracked.matchLog.events[0]).toMatchObject({ kind: 'starter', playerId: 1, speciesId: 1 })
    expect(tracked.arkadex.caught1).toEqual([1]); expect(tracked.arkadex.caught2).toEqual([])
  })

  it('does not create events for rendering or repeated settled checkpoints', () => {
    const before = campaign(); before.battaglia = battle(before.giocatore1.squadra[0])
    const next = { ...before, battaglia: { ...before.battaglia, log: [...before.battaglia.log] } }
    const tracked = trackGameChange(before, next)
    expect(tracked.matchLog.events).toEqual([])
    expect(trackGameChange(next, { ...next, ...tracked }).matchLog.events).toEqual([])
  })

  it('records capture in the deposit and preserves residual HP and individual discoveries', () => {
    const before = campaign(), captured = pokemon(13, 'caught-13')
    const next = { ...before, giocatore1: { ...before.giocatore1, deposito: { '1:1': captured } } }
    const tracked = trackGameChange(before, next)
    expect(tracked.matchLog.events[0]).toMatchObject({ kind: 'capture', playerId: 1, speciesId: 13 })
    expect(tracked.matchLog.events[0].message).toContain('Nel deposito')
    expect(tracked.arkadex.caught1).toEqual([1, 13]); expect(tracked.arkadex.seen2).not.toContain(13)
    expect(next.giocatore1.deposito['1:1'].hp).toBe(3)
    expect(trackGameChange(next, { ...next, ...tracked }).matchLog.events).toHaveLength(1)
  })

  it('records an evolution once and keeps the earlier obtained stage', () => {
    const before = campaign(), original = before.giocatore1.squadra[0]
    const evolved = { ...original, specieId: 2, livello: 15, nome: getPokemon(2)!.nome }
    const next = { ...before, giocatore1: { ...before.giocatore1, squadra: [evolved] } }
    const committed = commit(before, next)
    expect(committed.matchLog.events[0]).toMatchObject({ kind: 'evolution', playerId: 1, speciesId: 2 })
    expect(committed.arkadex.caught1).toEqual([1, 2])
    expect(trackGameChange(committed, { ...committed }).matchLog.events).toHaveLength(1)
  })

  it('distinguishes shop purchases from trainer penalties and records real quantities', () => {
    const before = campaign(); before.giocatore1 = { ...before.giocatore1, monete: 500, inventario: { potion: 1 } }
    const next = { ...before, giocatore1: { ...before.giocatore1, monete: 300, inventario: { potion: 3 } } }
    const tracked = trackGameChange(before, next)
    expect(tracked.matchLog.events[0]).toMatchObject({ kind: 'shop', playerId: 1, amount: -200 })
    expect(tracked.matchLog.events[0].message).toContain('Pozione ×2')
    expect(trackGameChange(before, { ...next, giocatore1: { ...next.giocatore1, inventario: before.giocatore1.inventario } }).matchLog.events).toEqual([])
  })

  it('tracks a collection move without recording a second capture', () => {
    const before = campaign(), original = before.giocatore1.squadra[0]
    const next = { ...before, giocatore1: { ...before.giocatore1, squadra: [], deposito: { '1:1': original } } }
    const tracked = trackGameChange(before, next)
    expect(tracked.matchLog.events.map((event) => event.kind)).toEqual(['deposit'])
    expect(tracked.arkadex.caught1).toEqual([1])
  })

  it('tracks legacy battles that only contain pokemonA and deduplicates a repeated level checkpoint', () => {
    const before = campaign(); before.battaglia = battle(pokemon(1, 'actor', 14), false)
    const leveled = { ...before.battaglia.pokemonA, livello: 15 }
    const next = { ...before, battaglia: { ...before.battaglia, pokemonA: leveled } }
    const committed = commit(before, next)
    expect(committed.matchLog.events).toHaveLength(1)
    expect(committed.matchLog.events[0]).toMatchObject({ kind: 'level', playerId: 1, speciesId: 1 })
    expect(committed.matchLog.events[0].message).toContain('14 → 15')
    expect(trackGameChange(committed, { ...committed, battaglia: { ...committed.battaglia! } }).matchLog.events).toHaveLength(1)
  })

  it('does not turn legacy stored XP into a level event', () => {
    const before = campaign(); before.battaglia = battle(pokemon(1, 'actor', 10))
    const progressed = { ...before.battaglia.pokemonA, xp: 1 }
    const next = { ...before, battaglia: { ...before.battaglia, pokemonA: progressed, squadraA: [progressed] } }
    const committed = commit(before, next)
    expect(committed.matchLog.events).toEqual([])
    expect(trackGameChange(committed, { ...committed }).matchLog.events).toEqual([])
  })

  it('logs a concluded battle once without granting rewards or healing from tracking', () => {
    const before = campaign(); before.battaglia = battle(before.giocatore1.squadra[0])
    before.battaglia.checkpoint = { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended', openingComplete: true, outcome: 'vittoria', evolutions: [], rivalMessages: [] }
    const next = { ...before, battaglia: null }
    const committed = commit(before, next)
    expect(committed.matchLog.events[0]).toMatchObject({ kind: 'battle', title: 'Battaglia vinta' })
    expect(committed.giocatore1.monete).toBe(0); expect(committed.giocatore1.squadra[0].hp).toBe(3)
    expect(trackGameChange(committed, { ...committed }).matchLog.events).toHaveLength(1)
  })
})
