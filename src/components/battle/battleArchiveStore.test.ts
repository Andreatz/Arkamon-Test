import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendBattleEvents, createBattleChronicle } from './battleChronicle'

let storage: Map<string, string>
beforeEach(() => {
  vi.resetModules()
  storage = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const match = (id: string) => ({ title: 'Audit · Rivale', outcome: 'vittoria' as const, playerId: 1 as const, location: 'Roma', battleType: 'PVP' as const,
  chronicle: appendBattleEvents(createBattleChronicle(id), [{ id: `${id}:outcome`, kind: 'outcome', title: 'Conclusa', messages: [] }]),
})

describe('archivio delle cronache concluse', () => {
  it('salva una battaglia una volta e la ricarica senza eseguire ricompense', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-10T12:00:00Z')
    const { useBattleArchiveStore, BATTLE_ARCHIVE_STORAGE_KEY } = await import('./battleArchiveStore')
    useBattleArchiveStore.getState().archiveBattle(match('battle'))
    const timestamp = useBattleArchiveStore.getState().matches[0].completedAt
    vi.advanceTimersByTime(1000)
    useBattleArchiveStore.getState().archiveBattle(match('battle'))
    expect(useBattleArchiveStore.getState().matches).toHaveLength(1)
    expect(useBattleArchiveStore.getState().matches[0].completedAt).toBe(timestamp)
    expect(storage.get(BATTLE_ARCHIVE_STORAGE_KEY)).not.toContain('archiveBattle')
    vi.resetModules()
    const loaded = (await import('./battleArchiveStore')).useBattleArchiveStore.getState()
    expect(loaded.matches).toHaveLength(1)
    expect(loaded.matches[0]).toMatchObject({ id: 'battle', outcome: 'vittoria', chronicle: { events: [{ id: 'battle:outcome' }] } })
  })
  it('conserva le ultime venti e importa soltanto record validi', async () => {
    const { useBattleArchiveStore, normalizeBattleArchive } = await import('./battleArchiveStore')
    for (let index = 0; index < 24; index++) useBattleArchiveStore.getState().archiveBattle(match(`battle-${index}`))
    expect(useBattleArchiveStore.getState().matches).toHaveLength(20)
    expect(useBattleArchiveStore.getState().matches[0].id).toBe('battle-23')
    expect(useBattleArchiveStore.getState().matches[19]?.id).toBe('battle-4')
    const valid = useBattleArchiveStore.getState().matches[0]
    expect(normalizeBattleArchive({ matches: [null, { id: 'wrong' }, valid, valid] }).matches).toHaveLength(1)
    useBattleArchiveStore.getState().importArchive({ version: 1, matches: [valid] })
    expect(useBattleArchiveStore.getState().matches).toHaveLength(1)
    useBattleArchiveStore.getState().clearArchive()
    expect(useBattleArchiveStore.getState().matches).toEqual([])
  })
  it('mantiene il replay in memoria con un avviso quando la quota impedisce il salvataggio automatico', async () => {
    let quota = false
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { if (quota) throw new DOMException('Full', 'QuotaExceededError'); storage.set(key, value) },
      removeItem: (key: string) => storage.delete(key),
    })
    const { useBattleArchiveStore, BATTLE_ARCHIVE_STORAGE_KEY } = await import('./battleArchiveStore')
    useBattleArchiveStore.getState().archiveBattle(match('durable'))
    const previous = storage.get(BATTLE_ARCHIVE_STORAGE_KEY)
    quota = true
    const changed = vi.fn()
    const unsubscribe = useBattleArchiveStore.subscribe(changed)
    expect(() => useBattleArchiveStore.getState().archiveBattle(match('session-only'))).not.toThrow()
    expect(useBattleArchiveStore.getState().matches.map((item) => item.id)).toEqual(['session-only', 'durable'])
    expect(useBattleArchiveStore.getState().storageWarning).toContain('questa sessione')
    expect(storage.get(BATTLE_ARCHIVE_STORAGE_KEY)).toBe(previous)
    useBattleArchiveStore.getState().archiveBattle(match('session-only'))
    expect(changed).toHaveBeenCalledTimes(1)
    unsubscribe()
    vi.resetModules()
    expect((await import('./battleArchiveStore')).useBattleArchiveStore.getState().matches.map((item) => item.id)).toEqual(['durable'])
  })
  it('conferma importazione ed eliminazione solo dopo una scrittura riuscita e recupera le cronache temporanee', async () => {
    let quota = false
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { if (quota) throw new DOMException('Full', 'QuotaExceededError'); storage.set(key, value) },
      removeItem: (key: string) => storage.delete(key),
    })
    const { useBattleArchiveStore, BATTLE_ARCHIVE_STORAGE_KEY } = await import('./battleArchiveStore')
    const archive = useBattleArchiveStore.getState()
    archive.archiveBattle(match('durable'))
    const previous = storage.get(BATTLE_ARCHIVE_STORAGE_KEY)
    quota = true
    expect(archive.clearArchive()).toMatchObject({ ok: false, error: expect.stringContaining('restano intatte') })
    expect(archive.importArchive({ matches: [] })).toMatchObject({ ok: false, error: expect.stringContaining('precedenti restano intatte') })
    expect(useBattleArchiveStore.getState().matches.map((item) => item.id)).toEqual(['durable'])
    expect(storage.get(BATTLE_ARCHIVE_STORAGE_KEY)).toBe(previous)
    archive.archiveBattle(match('session-only'))
    expect(archive.saveArchive()).toMatchObject({ ok: false })
    quota = false
    expect(archive.saveArchive()).toEqual({ ok: true })
    expect(useBattleArchiveStore.getState().storageWarning).toBeNull()
    const written = JSON.parse(storage.get(BATTLE_ARCHIVE_STORAGE_KEY)!)
    expect(written.state.matches.map((item: { id: string }) => item.id)).toEqual(['session-only', 'durable'])
    expect(written.state.storageWarning).toBeUndefined()
    expect(archive.importArchive({ matches: [written.state.matches[1]] })).toEqual({ ok: true })
    expect(useBattleArchiveStore.getState().matches.map((item) => item.id)).toEqual(['durable'])
    expect(archive.clearArchive()).toEqual({ ok: true })
    expect(useBattleArchiveStore.getState().matches).toEqual([])
    expect(JSON.parse(storage.get(BATTLE_ARCHIVE_STORAGE_KEY)!).state.matches).toEqual([])
  })
})
