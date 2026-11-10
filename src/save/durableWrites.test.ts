import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_BACKUP_STORAGE_KEY, cancelPendingRecoveryCopy, flushPendingRecoveryCopy, scheduleRecoveryCopy, readRecoveryCopies, rememberRecoveryCopy, reportSaveFailure, useSaveWriteStatus } from './durableWrites'
import { initialGameSave } from './gamePersistence'
import { stateFromValidatedBackup, validateGameBackup } from './gameBackup'

function memoryStorage() {
  const data = new Map<string, string>()
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: vi.fn((key: string, text: string) => { data.set(key, text) }) }
}
function campaign(coins: number) {
  const state = initialGameSave()
  state.giocatore1 = { ...state.giocatore1, nome: 'Andrea', monete: coins, squadra: [{ istanzaId: 'saved-one', specieId: 1, nome: 'Compagno',
    livello: 10, hp: 2, xp: 0, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }] }
  state.scenaCorrente = { scena: 'mappa-principale' }
  return state
}
const restoredCoins = (backup: string) => {
  const validation = validateGameBackup(backup)
  if (!validation.ok) throw new Error(validation.error)
  return stateFromValidatedBackup(validation.preview)!.giocatore1.monete
}

describe('bounded automatic recovery copies and volatile diagnostics', () => {
  beforeEach(() => { useSaveWriteStatus.getState().clear(); useSaveWriteStatus.setState({ backupWarning: null }) })
  afterEach(() => { cancelPendingRecoveryCopy(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('coalesces recovery work outside primary writes and cancels stale/ownership-lost work', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    scheduleRecoveryCopy(campaign(100), () => true)
    scheduleRecoveryCopy(campaign(200), () => true)
    expect(storage.setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(349)
    expect(storage.setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(readRecoveryCopies(storage).map((copy) => restoredCoins(copy.backup))).toEqual([200])
    scheduleRecoveryCopy(campaign(300), () => false)
    flushPendingRecoveryCopy()
    expect(readRecoveryCopies(storage).map((copy) => restoredCoins(copy.backup))).toEqual([200])
    scheduleRecoveryCopy(campaign(400), () => true)
    cancelPendingRecoveryCopy()
    vi.runAllTimers()
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('protects cached copies from callers and invalidates the cache after an external storage change', () => {
    const storage = memoryStorage()
    rememberRecoveryCopy(campaign(100), storage)
    const original = readRecoveryCopies(storage)[0]
    readRecoveryCopies(storage)[0].backup = 'mutated UI object'
    expect(readRecoveryCopies(storage)[0]).toEqual(original)
    storage.data.set(AUTO_BACKUP_STORAGE_KEY, JSON.stringify({ version: 1, copies: [] }))
    expect(readRecoveryCopies(storage)).toEqual([])
    storage.data.set(AUTO_BACKUP_STORAGE_KEY, JSON.stringify({ version: 1, copies: [original] }))
    expect(readRecoveryCopies(storage)).toEqual([original])
  })
  it('waits for a battle or transition cue to finish before running recovery serialization', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    let busy = true
    scheduleRecoveryCopy(campaign(100), () => true, () => !busy)
    vi.advanceTimersByTime(1000)
    expect(storage.setItem).not.toHaveBeenCalled()
    busy = false
    vi.advanceTimersByTime(250)
    expect(readRecoveryCopies(storage).map((copy) => restoredCoins(copy.backup))).toEqual([100])
  })

  it('preserves two most recent distinct valid campaigns with original residual HP and status', () => {
    const storage = memoryStorage()
    rememberRecoveryCopy(campaign(100), storage)
    rememberRecoveryCopy(campaign(200), storage)
    rememberRecoveryCopy(campaign(300), storage)
    const copies = readRecoveryCopies(storage)
    expect(copies).toHaveLength(2)
    expect(copies.map(copy => restoredCoins(copy.backup))).toEqual([300, 200])
    for (const copy of copies) {
      const validation = validateGameBackup(copy.backup)
      expect(validation.ok).toBe(true)
      if (validation.ok) expect(stateFromValidatedBackup(validation.preview)!.giocatore1.squadra[0]).toMatchObject({ hp: 2, livello: 10, xp: 0,
        stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
    }
    expect(JSON.parse(storage.getItem(AUTO_BACKUP_STORAGE_KEY)!).copies).toHaveLength(2)
  })

  it('does not write another copy for the same campaign even if timestamps or audio preferences differ', () => {
    const storage = memoryStorage(), previous = campaign(100)
    rememberRecoveryCopy(previous, storage)
    const first = storage.getItem(AUTO_BACKUP_STORAGE_KEY)
    rememberRecoveryCopy({ ...previous, audioMuted: true }, storage)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.getItem(AUTO_BACKUP_STORAGE_KEY)).toBe(first)
  })

  it('ignores unreadable copies and an unknown envelope rather than treating them as restorable campaigns', () => {
    const storage = memoryStorage()
    rememberRecoveryCopy(campaign(100), storage)
    const valid = readRecoveryCopies(storage)[0]
    storage.data.set(AUTO_BACKUP_STORAGE_KEY, JSON.stringify({ version: 1, copies: [{ createdAt: '2026-10-12', backup: '{broken' }, valid] }))
    expect(readRecoveryCopies(storage)).toEqual([valid])
    storage.data.set(AUTO_BACKUP_STORAGE_KEY, JSON.stringify({ version: 2, copies: [valid] }))
    expect(readRecoveryCopies(storage)).toEqual([])
    storage.data.set(AUTO_BACKUP_STORAGE_KEY, '{unreadable')
    expect(readRecoveryCopies(storage)).toEqual([])
    expect(readRecoveryCopies({ getItem: () => { throw new Error('Access denied') } })).toEqual([])
  })

  it('recovers valid copies after corrupt earlier slots and only inspects the bounded first eight candidates', () => {
    const storage = memoryStorage()
    rememberRecoveryCopy(campaign(100), storage)
    const first = readRecoveryCopies(storage)[0]
    rememberRecoveryCopy(campaign(200), storage)
    const second = readRecoveryCopies(storage)[0]
    const broken = { createdAt: '2026-10-12T12:00:00Z', backup: '{broken' }
    const invalidDate = { ...first, createdAt: 'not a date' }
    storage.data.set(AUTO_BACKUP_STORAGE_KEY, JSON.stringify({ version: 1, copies: [broken, invalidDate, first, second] }))
    expect(readRecoveryCopies(storage)).toEqual([first, second])
    storage.data.set(AUTO_BACKUP_STORAGE_KEY, JSON.stringify({ version: 1, copies: [...Array.from({ length: 8 }, () => broken), first] }))
    expect(readRecoveryCopies(storage)).toEqual([])
  })

  it('leaves saved copies intact on a quota error and exposes a separate recovery warning', () => {
    const storage = memoryStorage()
    rememberRecoveryCopy(campaign(100), storage)
    const saved = storage.getItem(AUTO_BACKUP_STORAGE_KEY)
    storage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(() => rememberRecoveryCopy(campaign(200), storage)).not.toThrow()
    expect(storage.getItem(AUTO_BACKUP_STORAGE_KEY)).toBe(saved)
    expect(useSaveWriteStatus.getState().backupWarning).toContain('copia automatica')
    expect(useSaveWriteStatus.getState().error).toBeNull()
  })

  it('keeps recovery and export tools available when obtaining browser storage itself is blocked', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const denied = vi.fn(() => { throw new DOMException('Browser storage access denied', 'SecurityError') })
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: denied })
    try {
      expect(() => readRecoveryCopies()).not.toThrow()
      expect(readRecoveryCopies()).toEqual([])
      expect(() => rememberRecoveryCopy(campaign(200))).not.toThrow()
      expect(denied).toHaveBeenCalled()
      expect(useSaveWriteStatus.getState().backupWarning).toContain('copia automatica')
      expect(useSaveWriteStatus.getState().error).toBeNull()
      // Explicit storage injection remains usable without touching the denied getter.
      denied.mockClear()
      const storage = memoryStorage()
      rememberRecoveryCopy(campaign(100), storage)
      expect(readRecoveryCopies(storage)).toHaveLength(1)
      expect(denied).not.toHaveBeenCalled()
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })

  it('stores retry and cancellation only in memory and clearing them keeps independent backup diagnostics', () => {
    const retry = vi.fn(() => false), cancel = vi.fn()
    useSaveWriteStatus.setState({ backupWarning: 'Copia automatica assente' })
    reportSaveFailure(retry, true, cancel)
    expect(useSaveWriteStatus.getState()).toMatchObject({ local: true, error: expect.any(String), retry, cancel })
    useSaveWriteStatus.getState().clear()
    expect(useSaveWriteStatus.getState()).toMatchObject({ local: false, error: null, retry: null, cancel: null,
      backupWarning: 'Copia automatica assente' })
    expect(cancel).not.toHaveBeenCalled()
  })
})
