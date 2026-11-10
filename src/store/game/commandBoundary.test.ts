import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calcolaHPMax } from '@/engine/battleEngine'
import type { PokemonIstanza, StatoBattaglia } from '@/types'
import { initialGameSave, serializeGameState } from '@/save/gamePersistence'
import { useSaveWriteStatus } from '@/save/durableWrites'
import { useBackupRestoreRecoveryStatus } from '@/save/restoreJournal'
import * as ownership from '@/session/sessionOwnership'
import { useGameStore } from '../gameStore'
import { canManagePlayerTeam } from './commandPolicy'

const storage = vi.hoisted(() => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }), removeItem: (key: string) => { values.delete(key) } }
  vi.stubGlobal('localStorage', storage)
  return storage
})

const pokemon = (id: string, level = 10, hp = 5): PokemonIstanza => ({ istanzaId: id, nome: id, specieId: 1, livello: level, hp, xp: 0,
  stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
const source = { tipo: 'deposito', chiave: '1:1' } as const
const target = { tipo: 'squadra', indice: 0 } as const
function request(): StatoBattaglia {
  const lead = useGameStore.getState().giocatore1.squadra[0], enemy = pokemon('enemy')
  return { tipo: 'Selvatico', pokemonA: lead, pokemonB: enemy, hpMaxA: calcolaHPMax(lead), hpMaxB: calcolaHPMax(enemy),
    luogoRitorno: 'Percorso_1', turnoCorrente: 'A', log: [], evoluzioneInAttesa: null }
}
beforeEach(() => {
  useSaveWriteStatus.getState().clear()
  useBackupRestoreRecoveryStatus.setState({ error: null })
  const initial = initialGameSave()
  initial.scenaCorrente = { scena: 'mappa-principale' }
  initial.giocatore1.squadra = [pokemon('lead'), pokemon('reserve', 8, 0)]
  initial.giocatore1.deposito = { '1:1': pokemon('boxed', 9, 2) }
  initial.giocatore2.squadra = [pokemon('other')]
  useGameStore.setState({ ...initial, challengeContext: null, teamRuleMessage: null })
  storage.setItem.mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
  useSaveWriteStatus.getState().clear()
  useBackupRestoreRecoveryStatus.setState({ error: null })
})

describe('domain boundaries of campaign commands', () => {
  it('applies a valid swap once and preserves every identity, HP, status, inventory, other player and turn', async () => {
    const before = useGameStore.getState(), turn = before.turnoOverworld, other = before.giocatore2
    expect(canManagePlayerTeam(before, 1)).toBe(true)
    const result = before.scambiaSlot(1, source, target)
    expect(result).toMatchObject({ ok: true, code: 'applied', changed: true })
    const after = useGameStore.getState()
    expect(after.giocatore1.squadra).toEqual([before.giocatore1.deposito['1:1'], before.giocatore1.squadra[1]])
    expect(after.giocatore1.deposito['1:1']).toEqual(before.giocatore1.squadra[0])
    expect(after.giocatore1.inventario).toBe(before.giocatore1.inventario)
    expect(after.giocatore2).toBe(other)
    expect(after.turnoOverworld).toBe(turn)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const saved = serializeGameState(after)
    await useGameStore.persist.rehydrate()
    expect(serializeGameState(useGameStore.getState())).toEqual(saved)
  })

  it.each(['battle', 'pending-battle', 'challenge', 'league', 'completed-league', 'other-player', 'spent-turn', 'laboratory', 'title', 'evolution'] as const)(
    'the UI and direct swap command reject %s without a save or state change', kind => {
      const state = useGameStore.getState()
      if (kind === 'battle') useGameStore.setState({ battaglia: request() })
      if (kind === 'pending-battle') useGameStore.setState({ interactionProgress: { ...state.interactionProgress,
        pendingBattle: { interactionId: 'pending', playerId: 1, title: 'Pending', mapId: 'Venezia', nodeId: 'n1', scope: 'player', reward: { coins: 0, items: {} } } } })
      if (kind === 'challenge') useGameStore.setState({ challengeContext: { version: 1 } as never })
      if (kind === 'league') useGameStore.setState({ league: { ...state.league, players: { ...state.league.players, 1: { ...state.league.players[1], status: 'running' } } } })
      if (kind === 'completed-league') useGameStore.setState({ league: { ...state.league, winner: { playerId: 1, name: 'Melia', team: state.giocatore1.squadra, runId: 'finished', completedAt: '2026-10-26T00:00:00Z' } } })
      if (kind === 'other-player') useGameStore.setState({ giocatoreAttivo: 2, turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 2 } })
      if (kind === 'spent-turn') useGameStore.setState({ turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 0 } })
      if (kind === 'laboratory' || kind === 'title' || kind === 'evolution') useGameStore.setState({ scenaCorrente: { scena: kind === 'laboratory' ? 'laboratorio' : kind === 'title' ? 'titolo' : 'evoluzione' } })
      const before = useGameStore.getState()
      storage.setItem.mockClear()
      expect(canManagePlayerTeam(before, 1)).toBe(false)
      expect(before.scambiaSlot(1, source, target).ok).toBe(false)
      expect(useGameStore.getState()).toBe(before)
      expect(storage.setItem).not.toHaveBeenCalled()
    })

  it.each([
    { tipo: 'squadra', indice: -1 }, { tipo: 'squadra', indice: 6 }, { tipo: 'squadra', indice: 1.5 },
    { tipo: 'deposito', chiave: '31:1' }, { tipo: 'deposito', chiave: '1:36' }, { tipo: 'deposito', chiave: '01:1' },
    { tipo: 'deposito', chiave: '__proto__' }, { tipo: 'deposito', chiave: '1:0' },
  ] as const)('rejects invalid target $tipo without losing the source creature', invalid => {
    const before = useGameStore.getState()
    expect(before.scambiaSlot(1, source, invalid)).toMatchObject({ ok: false, code: 'invalid-slot' })
    expect(useGameStore.getState()).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('distinguishes an empty source, a no-op, and a rejected cap without treating any as applied', () => {
    const before = useGameStore.getState()
    expect(before.scambiaSlot(1, { tipo: 'deposito', chiave: '1:2' }, target)).toMatchObject({ ok: false, code: 'empty-slot' })
    expect(before.scambiaSlot(1, source, source)).toMatchObject({ ok: true, code: 'unchanged', changed: false })
    expect(useGameStore.getState()).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
    useGameStore.setState({ giocatore1: { ...before.giocatore1, deposito: { '1:1': pokemon('too-high', 30) } } })
    storage.setItem.mockClear()
    const current = useGameStore.getState()
    expect(current.scambiaSlot(1, source, target)).toMatchObject({ ok: false, code: 'team-level-cap' })
    expect(useGameStore.getState().giocatore1).toBe(current.giocatore1)
    expect(useGameStore.getState().teamRuleMessage).toContain('5 livelli')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['readonly', 'recovery-required', 'save-pending', 'save-failed'] as const)('returns %s and preserves the complete checkpoint', failure => {
    if (failure === 'readonly') vi.spyOn(ownership, 'isCampaignWritable').mockReturnValue(false)
    if (failure === 'recovery-required') useBackupRestoreRecoveryStatus.setState({ error: 'Unresolved restore journal' })
    if (failure === 'save-pending') useSaveWriteStatus.setState({ error: 'Unsaved battle action', local: false })
    if (failure === 'save-failed') storage.setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
    const before = useGameStore.getState()
    expect(before.scambiaSlot(1, source, target)).toMatchObject({ ok: false, code: failure })
    expect(useGameStore.getState()).toBe(before)
    if (failure !== 'save-failed') expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('an active battle cannot be replaced, healed, or reassigned to another player by campaign commands', () => {
    const first = useGameStore.getState().iniziaBattaglia(request())
    expect(first).toMatchObject({ ok: true, code: 'applied' })
    const before = useGameStore.getState()
    storage.setItem.mockClear()
    expect(before.iniziaBattaglia(request())).toMatchObject({ ok: false, code: 'battle-active' })
    expect(before.iniziaBattagliaNPC(1, 'Percorso_1')).toBe(false)
    expect(before.curaSquadra(1)).toMatchObject({ ok: false, code: 'battle-active' })
    expect(before.cambiaGiocatoreAttivo()).toMatchObject({ ok: false, code: 'battle-active' })
    expect(useGameStore.getState()).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['battle', 'pending-battle', 'challenge'] as const)('ordinary map commands cannot advance %s snapshots', kind => {
    const initial = useGameStore.getState()
    if (kind === 'battle') useGameStore.setState({ battaglia: request() })
    if (kind === 'pending-battle') useGameStore.setState({ interactionProgress: { ...initial.interactionProgress,
      pendingBattle: { interactionId: 'pending', playerId: 1, title: 'Pending', mapId: 'Venezia', nodeId: 'n1', scope: 'player', reward: { coins: 0, items: {} } } } })
    if (kind === 'challenge') useGameStore.setState({ challengeContext: { version: 1 } as never })
    const before = useGameStore.getState()
    storage.setItem.mockClear()
    // Pordenone→Venezia is a real connected road and succeeds outside these contexts.
    expect(before.muoviAvatarMappaPrincipale(1, 'Venezia')).toBe(false)
    expect(before.interagisciLuogoMappaPrincipale(1)).toEqual({ tipo: 'no-op' })
    expect(before.passaTurnoMappaLocale()).toBe(false)
    before.passaTurnoOverworld()
    expect(before.eseguiInterazioneConfigurata(1, 'anything').message).toMatch(/battaglia|sfida/)
    expect(before.acquistaOggetti(1, { potion: 1 }, 'Venezia').message).toMatch(/battaglia|sfida/)
    expect(useGameStore.getState()).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('isolated challenge snapshots reject ordinary campaign continuations but retain their battle checkpoint API', () => {
    useGameStore.setState({ challengeContext: { version: 1 } as never, battaglia: request() })
    const before = useGameStore.getState()
    storage.setItem.mockClear()
    expect(before.curaSquadra(1)).toMatchObject({ ok: false, code: 'challenge-active' })
    expect(before.cambiaGiocatoreAttivo()).toMatchObject({ ok: false, code: 'challenge-active' })
    expect(before.iniziaBattaglia(request())).toMatchObject({ ok: false, code: 'challenge-active' })
    expect(before.iniziaBattagliaNPC(1, 'Percorso_1')).toBe(false)
    expect(useGameStore.getState()).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
    before.aggiornaBattaglia({ log: ['Seeded battle progressed'] })
    expect(useGameStore.getState().battaglia?.log).toEqual(['Seeded battle progressed'])
    expect(storage.setItem.mock.calls[storage.setItem.mock.calls.length - 1]?.[0]).toBe('arkamon-active-challenge-v1')
  })
})
