import { useGameStore } from '@/store/gameStore'
import { stateFromValidatedBackup, serializeGameBackup, validateGameBackup, type GameBackupPreview } from './gameBackup'
import { GAME_SAVE_STORAGE_KEY, PREVIOUS_BACKUP_STORAGE_KEY, serializeGameState } from './gamePersistence'
import { INTERACTION_STORAGE_KEY, useInteractionStore } from '@/interactions/interactionStore'
import { BATTLE_ARCHIVE_STORAGE_KEY, useBattleArchiveStore } from '@/components/battle/battleArchiveStore'
import { isCampaignWritable, sessionOwnershipMessage } from '@/session/sessionOwnership'
import { backupRestoreStorage, prepareBackupRestore, finishBackupRestore, rollbackBackupRestore, useBackupRestoreRecoveryStatus, type RestoreEntry } from './restoreJournal'
import { cancelPendingRecoveryCopy } from './durableWrites'
import { isUiStudioPreview } from '@/ui-studio/previewMode'
import { interactionRecoveryMessage, useInteractionRecoveryStatus } from '@/interactions/interactionRecovery'

type BackupStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type GameBackupRestoreResult = { ok: true; previousBackup: string } | { ok: false; error: string }

/** Write durable data first, then publish one in-memory state update. Failed writes leave the game untouched. */
export function restoreGameBackup(preview: GameBackupPreview, storage?: BackupStorage): GameBackupRestoreResult {
  if (isUiStudioPreview()) return { ok: false, error: 'Il ripristino dei backup è disponibile nella partita. Questa anteprima non modifica i salvataggi.' }
  if (useInteractionRecoveryStatus.getState().recovery) return { ok: false, error: interactionRecoveryMessage }
  if (!isCampaignWritable()) return { ok: false, error: sessionOwnershipMessage() }
  if (useGameStore.getState().challengeContext) return { ok: false, error: 'Torna alla campagna prima di ripristinare un backup.' }
  const restored = stateFromValidatedBackup(preview)
  if (!restored) return { ok: false, error: 'Il backup non è più valido. Riapri il file e controlla l’anteprima.' }
  const revalidated = validateGameBackup(preview.source)
  if (!revalidated.ok) return { ok: false, error: revalidated.error }
  const catalog = revalidated.preview.interactionCatalog
  const archive = revalidated.preview.battleArchive
  const state = useGameStore.getState()
  restored.audioMuted = state.audioMuted
  let previousBackup: string
  try { previousBackup = serializeGameBackup(state, new Date(), useInteractionStore.getState().interactions, useBattleArchiveStore.getState()) }
  catch (cause) { return { ok: false, error: cause instanceof Error ? `Impossibile conservare la partita precedente: ${cause.message}` : 'Impossibile conservare la partita precedente. Nessun dato è stato sostituito.' } }
  const target = backupRestoreStorage(storage)
  let entries: RestoreEntry[] | null = null
  cancelPendingRecoveryCopy()
  try {
    entries = prepareBackupRestore(target, [
      { key: PREVIOUS_BACKUP_STORAGE_KEY, after: previousBackup },
      ...(catalog ? [{ key: INTERACTION_STORAGE_KEY, after: JSON.stringify({ state: { interactions: catalog.interactions }, version: 0 }) }] : []),
      ...(archive ? [{ key: BATTLE_ARCHIVE_STORAGE_KEY, after: JSON.stringify({ state: archive, version: 1 }) }] : []),
      { key: GAME_SAVE_STORAGE_KEY, after: JSON.stringify({ state: serializeGameState(restored), version: 0 }) },
    ])
    for (const entry of entries) target.setItem(entry.key, entry.after)
  } catch {
    try { if (entries) rollbackBackupRestore(target, entries) } catch {
      useBackupRestoreRecoveryStatus.setState({ error: 'Ripristino interrotto: rileggi la sessione per recuperare il journal prima di proseguire.' })
    }
    return { ok: false, error: 'Spazio di salvataggio non disponibile. La partita attuale non è stata sostituita; libera spazio o scarica prima un backup.' }
  }
  try { finishBackupRestore(target, entries) } catch {
    // The restored campaign is complete, but no later action may make the
    // still-pending journal ambiguous before recovery clears it.
    useBackupRestoreRecoveryStatus.setState({ error: 'La partita è stata ripristinata. Rileggi la sessione per completare la pulizia del journal prima di proseguire.' })
  }
  const options = useGameStore.persist.getOptions()
  const persistence = options.storage
  const interactionPersistence = useInteractionStore.persist.getOptions().storage
  const archivePersistence = useBattleArchiveStore.persist.getOptions().storage
  if (persistence) {
    // Zustand normally writes after notifying subscribers. The durable write above is already complete.
    useGameStore.persist.setOptions({ storage: { ...persistence, setItem: () => undefined } })
  }
  if (catalog && interactionPersistence) useInteractionStore.persist.setOptions({ storage: { ...interactionPersistence, setItem: () => undefined } })
  if (archive && archivePersistence) useBattleArchiveStore.persist.setOptions({ storage: { ...archivePersistence, setItem: () => undefined } })
  try {
    if (catalog) useInteractionStore.setState({ interactions: catalog.interactions })
    if (archive) useBattleArchiveStore.setState({ ...archive, storageWarning: null })
    useGameStore.setState({ ...restored, campaignRevision: state.campaignRevision + 1, saveRecoveryWarnings: [...preview.warnings] })
  } finally {
    if (persistence) useGameStore.persist.setOptions({ storage: persistence })
    if (catalog && interactionPersistence) useInteractionStore.persist.setOptions({ storage: interactionPersistence })
    if (archive && archivePersistence) useBattleArchiveStore.persist.setOptions({ storage: archivePersistence })
  }
  return { ok: true, previousBackup }
}

export function readPreviousGameBackup(storage?: BackupStorage): string | null {
  if (isUiStudioPreview()) return null
  try { return (storage ?? localStorage).getItem(PREVIOUS_BACKUP_STORAGE_KEY) } catch { return null }
}

export function downloadGameBackup(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
