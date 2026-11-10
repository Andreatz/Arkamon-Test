import { create } from 'zustand'
import { serializeGameBackup, validateGameBackup } from './gameBackup'
import type { GameSaveState } from './gamePersistence'
import { isUiStudioPreview } from '@/ui-studio/previewMode'

export const AUTO_BACKUP_STORAGE_KEY = 'arkamon-automatic-backups-v1'
export interface RecoveryCopy { createdAt: string; backup: string }
interface WriteStatus {
  error: string | null
  retry: (() => boolean) | null
  cancel: (() => void) | null
  local: boolean
  backupWarning: string | null
  clear: () => void
}
/** Volatile diagnostics must never trigger another write to the failed storage. */
export const useSaveWriteStatus = create<WriteStatus>((set) => ({
  error: null, retry: null, cancel: null, local: false, backupWarning: null,
  clear: () => set({ error: null, retry: null, cancel: null, local: false }),
}))
export function reportSaveFailure(retry: () => boolean, local = false, cancel?: () => void) {
  useSaveWriteStatus.setState({ error: 'Il browser non ha salvato questa operazione. I progressi già salvati restano intatti.', retry, cancel: cancel ?? null, local })
}
interface CachedCopies { raw: string | null; copies: RecoveryCopy[]; firstCampaign: string | null }
const recoveryCache = new WeakMap<object, CachedCopies>()
export function readRecoveryCopies(storage?: Pick<Storage, 'getItem'>): RecoveryCopy[] {
  if (isUiStudioPreview()) return []
  try {
    const target = storage ?? localStorage
    const raw = target.getItem(AUTO_BACKUP_STORAGE_KEY)
    const cached = recoveryCache.get(target)
    if (cached?.raw === raw) return cached.copies.map((copy) => ({ ...copy }))
    const value = JSON.parse(raw ?? 'null')
    const copies: RecoveryCopy[] = value?.version !== 1 || !Array.isArray(value.copies) ? [] : value.copies.slice(0, 8).filter((entry: unknown): entry is RecoveryCopy => {
      if (!entry || typeof entry !== 'object') return false
      const copy = entry as RecoveryCopy
      return typeof copy.createdAt === 'string' && Number.isFinite(Date.parse(copy.createdAt)) && typeof copy.backup === 'string' && validateGameBackup(copy.backup).ok
    }).slice(0, 2)
    recoveryCache.set(target, { raw, copies, firstCampaign: copies[0] ? JSON.stringify(JSON.parse(copies[0].backup).campaign) : null })
    return copies.map((copy) => ({ ...copy }))
  } catch { return [] }
}
/** Preserve the previous valid checkpoint, never an unreadable disk envelope. */
export function rememberRecoveryCopy(previous: GameSaveState, storage?: Pick<Storage, 'getItem' | 'setItem'>): void {
  if (isUiStudioPreview()) return
  try {
    const target = storage ?? localStorage
    const backup = serializeGameBackup(previous)
    const copies = readRecoveryCopies(target)
    const campaign = JSON.stringify(JSON.parse(backup).campaign)
    if (recoveryCache.get(target)?.firstCampaign === campaign) return
    const nextCopies = [{ createdAt: new Date().toISOString(), backup }, ...copies].slice(0, 2)
    const raw = JSON.stringify({ version: 1, copies: nextCopies })
    target.setItem(AUTO_BACKUP_STORAGE_KEY, raw)
    recoveryCache.set(target, { raw, copies: nextCopies, firstCampaign: campaign })
    useSaveWriteStatus.setState({ backupWarning: null })
  } catch {
    // A backup quota error must not prevent an otherwise writable primary save.
    useSaveWriteStatus.setState({ backupWarning: 'La copia automatica non è disponibile. Scarica un backup della partita.' })
  }
}

let pendingCopy: { previous: GameSaveState; canWrite: () => boolean; canRun: () => boolean } | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null
/** The primary checkpoint is already durable. Coalesce recovery work outside the
 * input/impact task and never publish a stale copy after ownership/restore changes. */
export function scheduleRecoveryCopy(previous: GameSaveState, canWrite: () => boolean, canRun: () => boolean = () => true): void {
  if (isUiStudioPreview()) return
  pendingCopy = { previous, canWrite, canRun }
  if (pendingTimer !== null) return
  pendingTimer = setTimeout(runDeferredRecoveryCopy, 350)
}
function runDeferredRecoveryCopy(): void {
  pendingTimer = null
  if (isUiStudioPreview()) { pendingCopy = null; return }
  if (pendingCopy && !pendingCopy.canWrite()) { pendingCopy = null; return }
  // Battle impact and scene transitions declare busy independently. Retain the
  // newest pending checkpoint and try again after the presentation cue finishes.
  if (pendingCopy && !pendingCopy.canRun()) { pendingTimer = setTimeout(runDeferredRecoveryCopy, 250); return }
  flushPendingRecoveryCopy()
}
export function flushPendingRecoveryCopy(): void {
  if (pendingTimer !== null) clearTimeout(pendingTimer)
  const pending = pendingCopy
  pendingTimer = null; pendingCopy = null
  if (isUiStudioPreview()) return
  if (pending?.canWrite()) rememberRecoveryCopy(pending.previous)
}
export function cancelPendingRecoveryCopy(): void {
  if (pendingTimer !== null) clearTimeout(pendingTimer)
  pendingTimer = null; pendingCopy = null
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushPendingRecoveryCopy)
  import.meta.hot?.dispose(() => { window.removeEventListener('pagehide', flushPendingRecoveryCopy); cancelPendingRecoveryCopy() })
}
