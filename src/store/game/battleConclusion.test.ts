import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calcolaHPMax } from '@/engine/battleEngine'
import { getLocalMap } from '@/data/localMaps'
import { GAME_SAVE_STORAGE_KEY, initialGameSave, serializeGameState } from '@/save/gamePersistence'
import { cancelPendingRecoveryCopy, useSaveWriteStatus } from '@/save/durableWrites'
import { useBackupRestoreRecoveryStatus } from '@/save/restoreJournal'
import * as ownership from '@/session/sessionOwnership'
import type { BattleCheckpoint, PokemonIstanza, StatoBattaglia } from '@/types'
import { useGameStore } from '../gameStore'

const disk = vi.hoisted(() => {
  const values = new Map<string, string>(), writes: string[] = [], blocked = new Set<string>()
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); if (blocked.has(key)) throw new Error('QuotaExceededError'); values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) } })
  return { values, writes, blocked }
})
const pokemon = (id: string, level: number, hp: number): PokemonIstanza => ({ istanzaId: id, nome: id, specieId: 1, livello: level, hp, xp: 0 })
const ended: BattleCheckpoint = { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended',
  openingComplete: true, outcome: 'vittoria', evolutions: [], rivalMessages: [] }
const writes = () => disk.writes.filter(key => key === GAME_SAVE_STORAGE_KEY).length

function fixture(reverse = false) {
  const initial = initialGameSave(), a = pokemon('higher-first', 10, 0), b = pokemon('lower-second', 5, 12)
  const finalA = { ...a, livello: 11, hp: 11, stato: { tipo: 'Paralizzato' as const, turniRimanenti: -1 } }
  const finalB = { ...b, livello: 6, hp: 0, stato: { tipo: 'Addormentato' as const, turniRimanenti: 2 } }
  const team = reverse ? [b, a] : [a, b], result = reverse ? [finalB, finalA] : [finalA, finalB]
  const enemy = pokemon('interaction-prize-1-0', 5, 0)
  const battle: StatoBattaglia = { tipo: 'NPC', allenatoreId: 202, pokemonA: finalA, pokemonB: enemy, squadraA: result,
    squadraB: [enemy], hpMaxA: calcolaHPMax(finalA), hpMaxB: calcolaHPMax(enemy), turnoCorrente: 'A',
    luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null, checkpoint: ended }
  useGameStore.setState({ ...initial, challengeContext: null, campaignRevision: 0, teamRuleMessage: null,
    giocatore1: { ...initial.giocatore1, squadra: team, monete: 300, inventario: { revive: 0, masterball: 3 } },
    battaglia: battle, scenaCorrente: { scena: 'battaglia' },
    interactionProgress: { ...initial.interactionProgress, pendingBattle: { interactionId: 'prize', playerId: 1, title: 'Sfida speciale',
      mapId: 'Venezia', nodeId: getLocalMap('Venezia')!.startNode, scope: 'player', reward: { coins: 50, items: { masterball: 2 } } } },
  })
  disk.writes.length = 0
  return { a, b, finalA, finalB, battle }
}

beforeEach(() => {
  cancelPendingRecoveryCopy(); disk.values.clear(); disk.writes.length = 0; disk.blocked.clear()
  useSaveWriteStatus.getState().clear()
  useBackupRestoreRecoveryStatus.setState({ error: null })
  fixture()
})
afterEach(() => {
  cancelPendingRecoveryCopy(); disk.blocked.clear(); vi.restoreAllMocks()
  useSaveWriteStatus.getState().clear(); useBackupRestoreRecoveryStatus.setState({ error: null })
})

describe('durable complete campaign battle conclusion', () => {
  it.each([false, true])('settles the entire final roster regardless of its order, one write and one publication: %s', async reverse => {
    const { finalA, finalB } = fixture(reverse)
    let publications = 0
    const unsubscribe = useGameStore.subscribe(() => { publications++ })
    const before = useGameStore.getState()
    expect(before.concludiBattaglia('vittoria')).toMatchObject({ ok: true, changed: true })
    unsubscribe()
    const state = useGameStore.getState(), cleanB = { ...finalB, stato: undefined }
    expect(state.giocatore1.squadra).toEqual(reverse ? [cleanB, finalA] : [finalA, cleanB])
    expect(state.giocatore1.monete).toBe(550)
    expect(state.giocatore1.inventario).toEqual({ revive: 0, masterball: 5 })
    expect(state.giocatore1.allenatoriSconfitti.has(202)).toBe(true)
    expect(state.giocatore2).toEqual(before.giocatore2)
    expect(state.turnoOverworld).toBe(before.turnoOverworld)
    expect(state.battaglia).toBeNull()
    expect(state.interactionProgress).toMatchObject({ pendingBattle: null, completed1: ['prize'], log1: [expect.any(Object)] })
    expect(state.scenaCorrente).toEqual({ scena: 'citta', payload: { luogo: 'Venezia' } })
    expect(writes()).toBe(1); expect(publications).toBe(1)
    const saved = serializeGameState(state)
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!).state).toEqual(saved)
    await useGameStore.persist.rehydrate()
    expect(serializeGameState(useGameStore.getState())).toEqual(saved)
    expect(useGameStore.getState().concludiBattaglia('vittoria').ok).toBe(false)
    expect(writes()).toBe(1)
  })

  it('keeps the complete ended checkpoint and rewards intact on quota failure, then retries exactly once', () => {
    const before = useGameStore.getState(), diskBefore = new Map(disk.values)
    let publications = 0
    const unsubscribe = useGameStore.subscribe(() => { publications++ })
    disk.blocked.add(GAME_SAVE_STORAGE_KEY)
    expect(before.concludiBattaglia('vittoria')).toMatchObject({ ok: false, code: 'save-failed' })
    expect(useGameStore.getState()).toBe(before)
    expect(disk.values).toEqual(diskBefore)
    expect(publications).toBe(0)
    const retry = useSaveWriteStatus.getState().retry!
    expect(useSaveWriteStatus.getState()).toMatchObject({ error: expect.any(String), local: false })
    disk.blocked.clear(); disk.writes.length = 0
    expect(retry()).toBe(true)
    const state = useGameStore.getState()
    expect(state.giocatore1.squadra.map(p => [p.livello, p.hp])).toEqual([[11, 11], [6, 0]])
    expect(state.giocatore1.monete).toBe(550)
    expect(state.giocatore1.inventario.masterball).toBe(5)
    expect(state.battaglia).toBeNull()
    expect(writes()).toBe(1); expect(publications).toBe(1)
    expect(retry()).toBe(false)
    expect(state.concludiBattaglia('vittoria').ok).toBe(false)
    expect(writes()).toBe(1)
    unsubscribe()
  })

  it.each(['foreign', 'duplicate', 'species', 'level', 'hp', 'cap'] as const)('rejects a malformed %s result without rewards, navigation, save or cleanup', kind => {
    const state = useGameStore.getState(), battle = state.battaglia!, result = [...battle.squadraA!]
    if (kind === 'foreign') result[1] = { ...result[1], istanzaId: 'not-owned' }
    if (kind === 'duplicate') result[1] = result[0]
    if (kind === 'species') result[1] = { ...result[1], specieId: 13 }
    if (kind === 'level') result[1] = { ...result[1], livello: 101 }
    if (kind === 'hp') result[1] = { ...result[1], hp: 1000 }
    if (kind === 'cap') result[1] = { ...result[1], livello: 5 }
    useGameStore.setState({ battaglia: { ...battle, squadraA: result } })
    disk.writes.length = 0
    const before = useGameStore.getState()
    expect(before.concludiBattaglia('vittoria').ok).toBe(false)
    expect(useGameStore.getState()).toBe(before)
    expect(writes()).toBe(0)
  })

  it.each(['unfinished', 'different-outcome', 'league', 'challenge', 'readonly', 'recovery', 'pending'] as const)('rejects %s before changing durable state', kind => {
    const state = useGameStore.getState()
    if (kind === 'unfinished') useGameStore.setState({ battaglia: { ...state.battaglia!, checkpoint: { ...ended, phase: 'player', outcome: null } } })
    if (kind === 'different-outcome') useGameStore.setState({ battaglia: { ...state.battaglia!, checkpoint: { ...ended, outcome: 'sconfitta' } } })
    if (kind === 'league') useGameStore.setState({ battaglia: { ...state.battaglia!, leagueBattle: { runId: 'league', stageIndex: 0, playerId: 1 } } })
    if (kind === 'challenge') useGameStore.setState({ challengeContext: { version: 1 } as never })
    if (kind === 'readonly') vi.spyOn(ownership, 'isCampaignWritable').mockReturnValue(false)
    if (kind === 'recovery') useBackupRestoreRecoveryStatus.setState({ error: 'Journal conflict' })
    if (kind === 'pending') useSaveWriteStatus.setState({ error: 'Previous write failed', local: false })
    disk.writes.length = 0
    const before = useGameStore.getState()
    expect(before.concludiBattaglia('vittoria').ok).toBe(false)
    expect(useGameStore.getState()).toBe(before)
    expect(writes()).toBe(0)
  })

  it.each([false, true])('retains an already committed capture in squad or deposit: boxed=%s', boxed => {
    const state = useGameStore.getState(), lead = pokemon('lead', 5, 7), captured = pokemon('captured', 5, 3)
    useGameStore.setState({ giocatore1: { ...state.giocatore1, squadra: boxed ? [lead] : [lead, captured], deposito: boxed ? { '1:1': captured } : {} },
      interactionProgress: { ...state.interactionProgress, pendingBattle: null },
      battaglia: { ...state.battaglia!, tipo: 'Selvatico', allenatoreId: undefined, pokemonA: lead, pokemonB: captured,
        squadraA: [lead], squadraB: [captured] } })
    disk.writes.length = 0
    expect(useGameStore.getState().concludiBattaglia('vittoria').ok).toBe(true)
    const after = useGameStore.getState().giocatore1
    expect([...after.squadra, ...Object.values(after.deposito)]).toEqual([lead, captured])
    expect(after.monete).toBe(300)
    expect(writes()).toBe(1)
  })

  it('restores the deferred evolution and destination from the durable checkpoint', () => {
    const state = useGameStore.getState(), before = pokemon('evolving', 14, 2), result = { ...before, livello: 15 }
    const evolution = { istanzaId: result.istanzaId, oldSpecieId: 1, newSpecieId: 2 }
    useGameStore.setState({ giocatore1: { ...state.giocatore1, squadra: [before] },
      battaglia: { ...state.battaglia!, pokemonA: result, squadraA: [result], checkpoint: { ...ended, evolutions: [evolution] } } })
    disk.writes.length = 0
    expect(useGameStore.getState().concludiBattaglia('vittoria').ok).toBe(true)
    expect(useGameStore.getState().giocatore1.squadra).toEqual([result])
    expect(useGameStore.getState().scenaCorrente).toEqual({ scena: 'evoluzione', payload: { evoluzioni: [evolution], luogoRitorno: 'Venezia', giocatoreId: 1 } })
    expect(writes()).toBe(1)
  })

  it('preserves reserves from an old checkpoint without a complete squad array', () => {
    const state = useGameStore.getState(), result = state.battaglia!.squadraA![0]
    const reserve = { ...state.giocatore1.squadra[1], livello: 6 }
    useGameStore.setState({ giocatore1: { ...state.giocatore1, squadra: [state.giocatore1.squadra[0], reserve] },
      battaglia: { ...state.battaglia!, squadraA: undefined } })
    expect(useGameStore.getState().concludiBattaglia('vittoria').ok).toBe(true)
    expect(useGameStore.getState().giocatore1.squadra).toEqual([result, reserve])
  })
})
