import { create } from 'zustand'

/** A visual project is independent from campaign checkpoints. The envelope is
 * written last; startup recovers either all previous or all new visual keys. */
export const VISUAL_JOURNAL_KEY = 'arkamon-presentation-journal-v1'
export const VISUAL_RECOVERY_ARCHIVE_KEY = 'arkamon-presentation-recovery-originals-v1'
const keys = ['arkamon-admin-theme', 'arkamon-vfx-authoring-v1', 'arkamon-presentation-project-v1'] as const
export interface VisualEntry { key: string; before: string | null; after: string }
interface VisualJournal { version: 1; entries: VisualEntry[] }
export type VisualStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const conflictMessage = 'Il progetto visivo è stato modificato dopo l’interruzione. Le modifiche più recenti e il journal sono conservati; recupera gli originali prima di riapplicare un progetto.'
export const useVisualRecoveryStatus = create<{ error: string | null; reloadRequired: boolean }>(() => ({ error: null, reloadRequired: false }))
let ownedWrites = 0
/** Only the synchronous apply/rollback that created the journal may write through it. */
export function withVisualTransactionWrites<T>(operation: () => T): T {
  ownedWrites += 1
  try { return operation() } finally { ownedWrites -= 1 }
}
function assertUnchanged(storage: VisualStorage, entries: VisualEntry[]): void {
  for (const entry of entries) {
    const current = storage.getItem(entry.key)
    if (current !== entry.before && current !== entry.after) throw new Error(conflictMessage)
  }
}
export function assertVisualStorageWritable(storage?: VisualStorage): void {
  if (ownedWrites) return
  if (useVisualRecoveryStatus.getState().reloadRequired) throw new Error('Gli originali sono conservati. Riapri il gioco per caricare le impostazioni mantenute prima di modificarle.')
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  if (target?.getItem(VISUAL_JOURNAL_KEY)) {
    const error = 'Un progetto visivo interrotto richiede il recupero al riavvio. Il journal e le modifiche sono conservati.'
    useVisualRecoveryStatus.setState({ error })
    throw new Error(error)
  }
}
export function exportVisualRecovery(storage?: VisualStorage): string {
  const target = storage ?? localStorage
  return JSON.stringify({ version: 1, journal: target.getItem(VISUAL_JOURNAL_KEY), current: keys.map(key => ({ key, value: target.getItem(key) })), previous: target.getItem(VISUAL_RECOVERY_ARCHIVE_KEY) }, null, 2)
}
/** Explicit recovery keeps the latest values and archives every original before
 * releasing the interrupted operation. A failed archive never clears its journal. */
export function preserveCurrentVisualSettings(storage?: VisualStorage): { ok: boolean; error: string | null } {
  try {
    const target = storage ?? localStorage, journal = target.getItem(VISUAL_JOURNAL_KEY)
    if (!journal) return { ok: true, error: null }
    const current = keys.map(key => ({ key, value: target.getItem(key) }))
    target.setItem(VISUAL_RECOVERY_ARCHIVE_KEY, JSON.stringify({ version: 1, journal, current, previous: target.getItem(VISUAL_RECOVERY_ARCHIVE_KEY) }))
    if (target.getItem(VISUAL_JOURNAL_KEY) !== journal || current.some(entry => target.getItem(entry.key) !== entry.value)) throw new Error(conflictMessage)
    target.removeItem(VISUAL_JOURNAL_KEY)
    useVisualRecoveryStatus.setState({ error: 'Originali conservati. Riapri il gioco per caricare le impostazioni attuali.', reloadRequired: true })
    return { ok: true, error: null }
  } catch (cause) {
    const error = cause instanceof Error && cause.message === conflictMessage ? conflictMessage : 'Non è stato possibile conservare gli originali. Libera spazio o scaricali; il journal resta intatto.'
    useVisualRecoveryStatus.setState({ error })
    return { ok: false, error }
  }
}
function parse(raw: string): VisualJournal {
  const value = JSON.parse(raw) as VisualJournal
  if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.length !== keys.length) throw new Error('Journal visivo non valido.')
  for (const [index, entry] of value.entries.entries()) {
    if (entry?.key !== keys[index] || entry.before !== null && typeof entry.before !== 'string' || typeof entry.after !== 'string') throw new Error('Journal visivo non valido.')
    for (const text of [entry.before, entry.after]) if (text !== null && (!JSON.parse(text) || typeof JSON.parse(text) !== 'object')) throw new Error('Dati del journal visivo non validi.')
  }
  return value
}
export function prepareVisualTransaction(storage: VisualStorage, next: [string, string, string]): VisualEntry[] {
  assertVisualStorageWritable(storage)
  if (storage.getItem(VISUAL_JOURNAL_KEY)) throw new Error('Un progetto visivo interrotto richiede il recupero al riavvio.')
  const entries = keys.map((key, index) => ({ key, before: storage.getItem(key), after: next[index] }))
  const raw = JSON.stringify({ version: 1, entries })
  parse(raw)
  storage.setItem(VISUAL_JOURNAL_KEY, raw)
  return entries
}
export function rollbackVisualTransaction(storage: VisualStorage, entries: VisualEntry[]): void {
  // Preflight the whole journal before touching any key, then recheck each
  // value immediately before writing in case another window changed it.
  assertUnchanged(storage, entries)
  // Restore the commit marker first so an interruption during rollback also
  // selects the previous project, never a mixture of the two.
  for (const entry of [...entries].reverse()) {
    assertUnchanged(storage, [entry])
    if (entry.before === null) storage.removeItem(entry.key)
    else storage.setItem(entry.key, entry.before)
  }
  storage.removeItem(VISUAL_JOURNAL_KEY)
}
export function recoverPresentationStorage(storage?: VisualStorage): { ok: boolean; error: string | null } {
  try {
    // Accessing the getter can fail before getItem is called in embedded/private contexts.
    if (!storage && typeof localStorage === 'undefined') return { ok: true, error: null }
    const target = storage ?? localStorage
    const raw = target.getItem(VISUAL_JOURNAL_KEY)
    if (!raw) { useVisualRecoveryStatus.setState({ error: null, reloadRequired: false }); return { ok: true, error: null } }
    const journal = parse(raw), marker = journal.entries[journal.entries.length - 1]
    assertUnchanged(target, journal.entries)
    if (target.getItem(marker.key) === marker.after) {
      for (const entry of journal.entries) { assertUnchanged(target, [entry]); target.setItem(entry.key, entry.after) }
      target.removeItem(VISUAL_JOURNAL_KEY)
    } else rollbackVisualTransaction(target, journal.entries)
    useVisualRecoveryStatus.setState({ error: null, reloadRequired: false })
    return { ok: true, error: null }
  } catch (cause) {
    const error = cause instanceof Error && cause.message === conflictMessage ? conflictMessage : 'Recupero del progetto visivo in attesa. Libera spazio e riapri il gioco; il journal è conservato. La campagna non viene modificata.'
    useVisualRecoveryStatus.setState({ error })
    return { ok: false, error }
  }
}
