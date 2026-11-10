import { afterEach, describe, expect, it, vi } from 'vitest'
import { GAME_SAVE_STORAGE_KEY, PREVIOUS_BACKUP_STORAGE_KEY } from './gamePersistence'
import { BACKUP_RESTORE_JOURNAL_KEY, prepareBackupRestore, finishBackupRestore, recoverInterruptedBackupRestore, useBackupRestoreRecoveryStatus } from './restoreJournal'
import { SessionCoordinator } from '@/session/sessionCoordinator'

const catalogKey = 'arkamon-interactions-v1', archiveKey = 'arkamon-battle-archive-v1'
const keys = [PREVIOUS_BACKUP_STORAGE_KEY, catalogKey, archiveKey, GAME_SAVE_STORAGE_KEY]
function fixture() {
  const data = new Map(keys.map((key) => [key, JSON.stringify({ state: { name: `old-${key}` }, version: 0 })]))
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { data.set(key, value) }), removeItem: (key: string) => { data.delete(key) } }
  const before = new Map(data)
  const values = keys.map((key) => ({ key, after: JSON.stringify({ state: { name: `new-${key}` }, version: 0 }) }))
  return { data, storage, before, values }
}
afterEach(() => useBackupRestoreRecoveryStatus.setState({ error: null }))
describe('write-ahead journal for compound backup restore', () => {
  it.each([0, 1, 2, 3, 4])('recovers an interrupted process after %i durable entries without mixing campaigns and catalogs', (written) => {
    const { data, storage, before, values } = fixture()
    const entries = prepareBackupRestore(storage, values)
    for (const entry of entries.slice(0, written)) storage.setItem(entry.key, entry.after)
    expect(recoverInterruptedBackupRestore(storage).ok).toBe(true)
    expect(data).toEqual(written === 4 ? new Map(values.map(({ key, after }) => [key, after])) : before)
    expect(storage.getItem(BACKUP_RESTORE_JOURNAL_KEY)).toBeNull()
    expect(recoverInterruptedBackupRestore(storage)).toEqual({ ok: true, message: '' })
  })
  it('recognizes the committed checkpoint despite session metadata and cleans a surviving commit marker', () => {
    const { data, storage, values } = fixture()
    const entries = prepareBackupRestore(storage, values)
    for (const entry of entries) storage.setItem(entry.key, entry.after)
    const current = JSON.parse(data.get(GAME_SAVE_STORAGE_KEY)!)
    data.set(GAME_SAVE_STORAGE_KEY, JSON.stringify({ ...current, arkamonSession: { version: 1, writer: 'next-owner', revision: 22 } }))
    const removeItem = storage.removeItem
    storage.removeItem = () => { throw new Error('Interrupted before journal cleanup') }
    expect(() => finishBackupRestore(storage, entries)).toThrow()
    storage.removeItem = removeItem
    expect(recoverInterruptedBackupRestore(storage).ok).toBe(true)
    expect(data.has(BACKUP_RESTORE_JOURNAL_KEY)).toBe(false)
    expect(JSON.parse(data.get(GAME_SAVE_STORAGE_KEY)!).arkamonSession.revision).toBe(22)
  })
  it('leaves the journal intact when recovery storage is blocked and completes safely after retry', () => {
    const { data, storage, before, values } = fixture()
    const entries = prepareBackupRestore(storage, values)
    storage.setItem(entries[0].key, entries[0].after)
    const setItem = storage.setItem
    storage.setItem = vi.fn(() => { throw new Error('QuotaExceededError') })
    expect(recoverInterruptedBackupRestore(storage).ok).toBe(false)
    expect(data.has(BACKUP_RESTORE_JOURNAL_KEY)).toBe(true)
    expect(useBackupRestoreRecoveryStatus.getState().error).toContain('Recupero')
    storage.setItem = setItem
    expect(recoverInterruptedBackupRestore(storage).ok).toBe(true)
    expect(data).toEqual(before)
  })
  it('recovers under the lock-held hydration fence before ordinary writes are enabled', async () => {
    const { data, storage, values } = fixture()
    const entries = prepareBackupRestore(storage, values)
    storage.setItem(catalogKey, entries.find((entry) => entry.key === catalogKey)!.after)
    const coordinator = new SessionCoordinator({ storage, token: 'recovery-owner', locks: { request: async (_name, _options, callback) => callback({}) } })
    coordinator.setHydration(() => {
      expect(coordinator.canWrite()).toBe(false)
      expect(coordinator.canRecover()).toBe(true)
      const internal = new Set([BACKUP_RESTORE_JOURNAL_KEY, PREVIOUS_BACKUP_STORAGE_KEY])
      const result = recoverInterruptedBackupRestore({
        getItem: (key) => internal.has(key) ? storage.getItem(key) : coordinator.read(key),
        setItem: (key, value) => { if (internal.has(key)) storage.setItem(key, value); else coordinator.recoverWrite(key, value) },
        removeItem: (key) => { if (internal.has(key)) storage.removeItem(key); else coordinator.recoverRemove(key) },
      })
      expect(result.ok).toBe(true)
    })
    try {
      expect(await coordinator.acquire()).toBe(true)
      expect(JSON.parse(data.get(catalogKey)!).state.name).toBe(`old-${catalogKey}`)
      expect(data.has(BACKUP_RESTORE_JOURNAL_KEY)).toBe(false)
      expect(() => coordinator.write(catalogKey, JSON.stringify({ version: 0, state: { name: 'new-authorized-write' } }))).not.toThrow()
      expect(JSON.parse(data.get(catalogKey)!).arkamonSession.writer).toBe('recovery-owner')
    } finally { await coordinator.release() }
  })
  it('refuses corrupt journals and unrelated edits without overwriting either', () => {
    const { data, storage, values } = fixture()
    prepareBackupRestore(storage, values)
    data.set(catalogKey, JSON.stringify({ state: { unrelated: true } }))
    const changed = new Map(data)
    expect(recoverInterruptedBackupRestore(storage).ok).toBe(false)
    expect(data).toEqual(changed)
    data.set(BACKUP_RESTORE_JOURNAL_KEY, JSON.stringify({ version: 1, phase: 'prepared', entries: [{ key: 'arkamon-host-token', before: null, after: '{}' }] }))
    const invalid = new Map(data)
    expect(recoverInterruptedBackupRestore(storage).ok).toBe(false)
    expect(data).toEqual(invalid)
  })
})
