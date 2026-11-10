import { describe, expect, it } from 'vitest'
import { assertVisualStorageWritable, exportVisualRecovery, preserveCurrentVisualSettings, prepareVisualTransaction, recoverPresentationStorage, rollbackVisualTransaction, useVisualRecoveryStatus, withVisualTransactionWrites, VISUAL_JOURNAL_KEY, VISUAL_RECOVERY_ARCHIVE_KEY } from './presentationTransaction'

const keys = ['arkamon-admin-theme', 'arkamon-vfx-authoring-v1', 'arkamon-presentation-project-v1']
function fixture() {
  useVisualRecoveryStatus.setState({ error: null, reloadRequired: false })
  const data = new Map(keys.map(key => [key, JSON.stringify({ key, revision: 'old' })]))
  data.set('arkamon-save', 'PRIVATE_CAMPAIGN_UNCHANGED')
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const next = keys.map(key => JSON.stringify({ key, revision: 'new' })) as [string, string, string]
  return { data, storage, next }
}
describe('visual project interrupted commits', () => {
  it('explicitly keeps the latest values only after archiving journal and current originals', () => {
    const { data, storage, next } = fixture()
    prepareVisualTransaction(storage, next)
    storage.setItem(keys[0], JSON.stringify({ newer: 'preserve me' }))
    const before = keys.map(key => storage.getItem(key)), journal = storage.getItem(VISUAL_JOURNAL_KEY)
    expect(preserveCurrentVisualSettings(storage)).toEqual({ ok: true, error: null })
    expect(keys.map(key => storage.getItem(key))).toEqual(before)
    expect(storage.getItem(VISUAL_JOURNAL_KEY)).toBeNull()
    expect(JSON.parse(storage.getItem(VISUAL_RECOVERY_ARCHIVE_KEY)!)).toMatchObject({ journal, current: keys.map((key, index) => ({ key, value: before[index] })) })
    expect(exportVisualRecovery(storage)).not.toContain('PRIVATE_CAMPAIGN_UNCHANGED')
    expect(() => assertVisualStorageWritable(storage)).toThrow(/Riapri/)
    // Fresh bootstrap hydrates the values deliberately retained by the user.
    expect(recoverPresentationStorage(storage).ok).toBe(true)
    expect(() => assertVisualStorageWritable(storage)).not.toThrow()
    expect(data.get('arkamon-save')).toBe('PRIVATE_CAMPAIGN_UNCHANGED')
  })
  it('never releases a conflicting journal if its recovery archive cannot be written', () => {
    const { data, storage, next } = fixture()
    prepareVisualTransaction(storage, next)
    const before = [...data]
    const blocked = { ...storage, setItem: () => { throw new Error('Quota') } }
    expect(preserveCurrentVisualSettings(blocked).ok).toBe(false)
    expect([...data]).toEqual(before)
  })
  for (const writes of [0, 3]) for (const changedKey of [0, 1, 2]) it(`preserves a newer key ${changedKey} during ${writes === 3 ? 'commit' : 'rollback'} recovery`, () => {
    const { data, storage, next } = fixture()
    const entries = prepareVisualTransaction(storage, next)
    for (let i = 0; i < writes; i++) storage.setItem(entries[i].key, entries[i].after)
    storage.setItem(keys[changedKey], JSON.stringify({ revision: 'newer-independent-edit' }))
    const before = [...data]
    expect(recoverPresentationStorage(storage)).toMatchObject({ ok: false, error: expect.stringMatching(/modificato dopo/) })
    expect([...data]).toEqual(before)
    expect(data.has(VISUAL_JOURNAL_KEY)).toBe(true)
  })
  it('preflights rollback before changing even the unaffected marker', () => {
    const { data, storage, next } = fixture()
    const entries = prepareVisualTransaction(storage, next)
    storage.setItem(keys[0], JSON.stringify({ newer: true }))
    const before = [...data]
    expect(() => rollbackVisualTransaction(storage, entries)).toThrow(/modificato dopo/)
    expect([...data]).toEqual(before)
  })
  it('blocks independent writes while a journal is pending but scopes ownership to the current synchronous commit', () => {
    const { storage, next } = fixture()
    prepareVisualTransaction(storage, next)
    expect(() => assertVisualStorageWritable(storage)).toThrow(/recupero/)
    withVisualTransactionWrites(() => expect(() => assertVisualStorageWritable(storage)).not.toThrow())
    expect(() => assertVisualStorageWritable(storage)).toThrow(/recupero/)
    expect(() => withVisualTransactionWrites(() => { throw new Error('failed owned write') })).toThrow()
    expect(() => assertVisualStorageWritable(storage)).toThrow(/recupero/)
  })
  for (const writes of [0, 1, 2, 3]) it(`recovers a coherent project after interruption at write ${writes}`, () => {
    const { data, storage, next } = fixture()
    const entries = prepareVisualTransaction(storage, next)
    for (let i = 0; i < writes; i++) storage.setItem(entries[i].key, entries[i].after)
    expect(recoverPresentationStorage(storage).ok).toBe(true)
    for (const [index, key] of keys.entries()) expect(data.get(key)).toBe(writes === 3 ? next[index] : entries[index].before)
    expect(data.has(VISUAL_JOURNAL_KEY)).toBe(false)
    expect(data.get('arkamon-save')).toBe('PRIVATE_CAMPAIGN_UNCHANGED')
  })
  it('retains recovery evidence when storage refuses a recovery write', () => {
    const { data, storage, next } = fixture()
    prepareVisualTransaction(storage, next)
    expect(recoverPresentationStorage({ ...storage, setItem: () => { throw new Error('Quota') } }).ok).toBe(false)
    expect(data.has(VISUAL_JOURNAL_KEY)).toBe(true)
    expect(recoverPresentationStorage(storage).ok).toBe(true)
  })
  it('rejects a forged journal that tries to overwrite campaign storage', () => {
    const { storage, data, next } = fixture()
    const entries = prepareVisualTransaction(storage, next)
    entries[0].key = 'arkamon-save'
    data.set(VISUAL_JOURNAL_KEY, JSON.stringify({ version: 1, entries }))
    expect(recoverPresentationStorage(storage).ok).toBe(false)
    expect(data.get('arkamon-save')).toBe('PRIVATE_CAMPAIGN_UNCHANGED')
  })
  it('does not abort application bootstrap when the browser denies the localStorage getter itself', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage getter denied') } })
    try {
      expect(() => recoverPresentationStorage()).not.toThrow()
      expect(recoverPresentationStorage()).toMatchObject({ ok: false, error: expect.stringMatching(/Recupero/) })
      const { storage } = fixture()
      expect(recoverPresentationStorage(storage)).toEqual({ ok: true, error: null })
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })
})
