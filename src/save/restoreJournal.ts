import { create } from 'zustand'
import { canRecoverCampaignCheckpoint, isCampaignWritable, readCampaignCheckpoint, recoverCampaignCheckpoint,
  retireRecoveredCampaignCheckpoint, writeCampaignCheckpoint, removeCampaignCheckpoint } from '@/session/sessionOwnership'
import { GAME_SAVE_STORAGE_KEY, PREVIOUS_BACKUP_STORAGE_KEY } from './gamePersistence'
import { isUiStudioPreview, uiPreviewCampaignStorage } from '@/ui-studio/previewMode'

export const BACKUP_RESTORE_JOURNAL_KEY = 'arkamon-backup-restore-transaction-v1'
const allowedKeys = new Set([GAME_SAVE_STORAGE_KEY, PREVIOUS_BACKUP_STORAGE_KEY, 'arkamon-interactions-v1', 'arkamon-battle-archive-v1'])
export type BackupRestoreStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export interface RestoreEntry { key: string; before: string | null; after: string }
interface RestoreJournal { version: 1; phase: 'prepared' | 'committed'; entries: RestoreEntry[] }
export const useBackupRestoreRecoveryStatus = create<{ error: string | null }>(() => ({ error: null }))

function parseJournal(raw: string): RestoreJournal | null {
  try {
    const value = JSON.parse(raw) as RestoreJournal
    if (value?.version !== 1 || !['prepared', 'committed'].includes(value.phase) || !Array.isArray(value.entries)
      || value.entries.length < 2 || value.entries.length > 4 || new Set(value.entries.map((entry) => entry.key)).size !== value.entries.length
      || value.entries[value.entries.length - 1]?.key !== GAME_SAVE_STORAGE_KEY
      || !value.entries.some((entry) => entry.key === GAME_SAVE_STORAGE_KEY)
      || !value.entries.some((entry) => entry.key === PREVIOUS_BACKUP_STORAGE_KEY)) return null
    for (const entry of value.entries) {
      if (!allowedKeys.has(entry.key) || entry.before !== null && typeof entry.before !== 'string' || typeof entry.after !== 'string') return null
      if (!JSON.parse(entry.after) || typeof JSON.parse(entry.after) !== 'object') return null
    }
    return value
  } catch { return null }
}
function equivalent(left: string | null, right: string | null): boolean {
  if (left === right) return true
  if (left === null || right === null) return false
  try {
    const a = JSON.parse(left), b = JSON.parse(right)
    delete a.arkamonSession; delete b.arkamonSession
    return JSON.stringify(a) === JSON.stringify(b)
  } catch { return false }
}

/** Session metadata belongs to the current owner. Journal values contain data;
 * replay writes pass through the same fence as ordinary campaign checkpoints. */
export function backupRestoreStorage(storage?: BackupRestoreStorage, recovering = false): BackupRestoreStorage {
  if (isUiStudioPreview()) return uiPreviewCampaignStorage
  if (storage) return storage
  return {
    getItem: (key) => key === BACKUP_RESTORE_JOURNAL_KEY || key === PREVIOUS_BACKUP_STORAGE_KEY ? localStorage.getItem(key) : readCampaignCheckpoint(key),
    setItem: (key, value) => {
      if (key === BACKUP_RESTORE_JOURNAL_KEY || key === PREVIOUS_BACKUP_STORAGE_KEY) localStorage.setItem(key, value)
      else if (recovering) recoverCampaignCheckpoint(key, value)
      else writeCampaignCheckpoint(key, value)
    },
    removeItem: (key) => {
      if (key === BACKUP_RESTORE_JOURNAL_KEY || key === PREVIOUS_BACKUP_STORAGE_KEY) localStorage.removeItem(key)
      else if (recovering) retireRecoveredCampaignCheckpoint(key)
      else removeCampaignCheckpoint(key)
    },
  }
}
export function prepareBackupRestore(target: BackupRestoreStorage, values: { key: string; after: string }[]): RestoreEntry[] {
  if (target.getItem(BACKUP_RESTORE_JOURNAL_KEY)) throw new Error('Un ripristino precedente richiede il recupero.')
  const entries = values.map((entry) => ({ ...entry, before: target.getItem(entry.key) }))
  const journal: RestoreJournal = { version: 1, phase: 'prepared', entries }
  if (!parseJournal(JSON.stringify(journal))) throw new Error('Transazione di ripristino non valida.')
  target.setItem(BACKUP_RESTORE_JOURNAL_KEY, JSON.stringify(journal))
  return entries
}
export function finishBackupRestore(target: BackupRestoreStorage, entries: RestoreEntry[]): void {
  // A crash after the campaign write is detected even before this marker; the
  // marker also disambiguates a restore whose campaign payload was identical.
  target.setItem(BACKUP_RESTORE_JOURNAL_KEY, JSON.stringify({ version: 1, phase: 'committed', entries } satisfies RestoreJournal))
  target.removeItem(BACKUP_RESTORE_JOURNAL_KEY)
}
export function rollbackBackupRestore(target: BackupRestoreStorage, entries: RestoreEntry[]): void {
  for (const entry of [...entries].reverse()) {
    // Avoid writing an unchanged final checkpoint when its write was refused.
    if (target.getItem(entry.key) === entry.before) continue
    if (entry.before === null) target.removeItem(entry.key)
    else target.setItem(entry.key, entry.before)
  }
  target.removeItem(BACKUP_RESTORE_JOURNAL_KEY)
}

/** Run under the writer lock before rehydrating any participating store. A
 * process interruption produces either the complete old or complete new set. */
export function recoverInterruptedBackupRestore(storage?: BackupRestoreStorage): { ok: boolean; message: string } {
  if (!storage && !canRecoverCampaignCheckpoint() && !isCampaignWritable()) return { ok: false, message: 'Il recupero richiede il controllo della sessione.' }
  try {
    const target = backupRestoreStorage(storage, !isCampaignWritable())
    const raw = target.getItem(BACKUP_RESTORE_JOURNAL_KEY)
    if (!raw) { useBackupRestoreRecoveryStatus.setState({ error: null }); return { ok: true, message: '' } }
    const journal = parseJournal(raw)
    if (!journal) throw new Error('Il journal del ripristino non è leggibile. Conserva i dati locali e un backup prima di intervenire.')
    for (const entry of journal.entries) {
      const current = target.getItem(entry.key)
      if (!equivalent(current, entry.before) && !equivalent(current, entry.after)) throw new Error('I dati sono cambiati dopo il ripristino interrotto. Nessuna modifica automatica: conserva un backup e verifica l’archivio.')
    }
    const campaign = journal.entries.find((entry) => entry.key === GAME_SAVE_STORAGE_KEY)!
    const currentCampaign = target.getItem(GAME_SAVE_STORAGE_KEY)
    const committed = journal.phase === 'committed' || currentCampaign !== campaign.before && equivalent(currentCampaign, campaign.after)
    if (committed) {
      for (const entry of journal.entries) if (!equivalent(target.getItem(entry.key), entry.after)) target.setItem(entry.key, entry.after)
      target.removeItem(BACKUP_RESTORE_JOURNAL_KEY)
    } else rollbackBackupRestore(target, journal.entries)
    useBackupRestoreRecoveryStatus.setState({ error: null })
    return { ok: true, message: committed ? 'Ripristino interrotto completato.' : 'Ripristino interrotto annullato: recuperata la partita precedente.' }
  } catch (error) {
    const message = error instanceof Error && /journal|dati sono cambiati/.test(error.message) ? error.message : 'Recupero del backup in attesa: libera spazio nel browser e rileggi la sessione. Il journal è stato conservato.'
    useBackupRestoreRecoveryStatus.setState({ error: message })
    return { ok: false, message }
  }
}
