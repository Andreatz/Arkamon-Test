import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isCampaignWritable, sessionOwnershipMessage, readCampaignCheckpoint, writeCampaignCheckpoint, removeCampaignCheckpoint } from '@/session/sessionOwnership'
import type { BattleChronicle, StatoBattaglia } from '@/types'
import { normalizeBattleChronicle } from './battleChronicle'

export const MAX_ARCHIVED_BATTLES = 20
export const BATTLE_ARCHIVE_STORAGE_KEY = 'arkamon-battle-archive-v1'
export interface ArchivedBattle {
  id: string
  title: string
  completedAt: string
  playerId: 1 | 2
  outcome: 'vittoria' | 'sconfitta'
  location: string
  battleType: StatoBattaglia['tipo']
  chronicle: BattleChronicle
}
export interface BattleArchive { version: 1; matches: ArchivedBattle[] }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))

export function normalizeBattleArchive(value: unknown): BattleArchive {
  if (!record(value) || !Array.isArray(value.matches)) return { version: 1, matches: [] }
  const matches: ArchivedBattle[] = []
  const ids = new Set<string>()
  for (const item of value.matches.slice(0, MAX_ARCHIVED_BATTLES)) {
    if (!record(item) || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)
      || (item.outcome !== 'vittoria' && item.outcome !== 'sconfitta') || (item.playerId !== 1 && item.playerId !== 2)
      || (item.battleType !== 'NPC' && item.battleType !== 'PVP' && item.battleType !== 'Selvatico')) continue
    ids.add(item.id)
    const chronicle = normalizeBattleChronicle(item.chronicle, item.id)
    if (chronicle.battleId !== item.id) continue
    matches.push({ id: item.id, outcome: item.outcome, playerId: item.playerId, battleType: item.battleType, chronicle,
      title: typeof item.title === 'string' ? item.title.slice(0, 240) : 'Battaglia Arkamon',
      location: typeof item.location === 'string' ? item.location.slice(0, 100) : '',
      completedAt: typeof item.completedAt === 'string' && Number.isFinite(Date.parse(item.completedAt)) ? item.completedAt : new Date(0).toISOString(),
    })
  }
  return { version: 1, matches }
}

export type BattleArchiveWriteResult = { ok: true } | { ok: false; error: string }
interface BattleArchiveStore extends BattleArchive {
  /** Session-only notice; never exported or persisted with the archive. */
  storageWarning: string | null
  archiveBattle: (match: Omit<ArchivedBattle, 'id' | 'completedAt'>) => void
  importArchive: (archive: unknown) => BattleArchiveWriteResult
  clearArchive: () => BattleArchiveWriteResult
  saveArchive: () => BattleArchiveWriteResult
}

const archiveStorageWarning = 'Non riesco a salvare le cronache su questo dispositivo. Restano consultabili in questa sessione: scarica i replay che vuoi conservare, libera spazio e riprova il salvataggio.'

/** Zustand normally writes after notifying subscribers; publish only our already-handled write result. */
function publishArchive(archive: BattleArchive, storageWarning: string | null) {
  const store = useBattleArchiveStore
  const storage = store.persist.getOptions().storage
  if (storage) store.persist.setOptions({ storage: { ...storage, setItem: () => undefined } })
  try { store.setState({ ...archive, storageWarning }) }
  finally { if (storage) store.persist.setOptions({ storage }) }
}

/** The configured browser localStorage writer is synchronous and atomic per key. */
function writeArchive(archive: BattleArchive, failure: string, retainOnFailure = false): BattleArchiveWriteResult {
  if (!isCampaignWritable()) return { ok: false, error: sessionOwnershipMessage() }
  try {
    const storage = useBattleArchiveStore.persist.getOptions().storage
    if (!storage) throw new Error('Storage unavailable')
    storage.setItem(BATTLE_ARCHIVE_STORAGE_KEY, { state: archive, version: 1 })
    publishArchive(archive, null)
    return { ok: true }
  } catch {
    const current = useBattleArchiveStore.getState()
    const kept = retainOnFailure ? archive : { version: 1 as const, matches: current.matches }
    // Repeated completion callbacks must not publish a warning-driven render loop.
    if (current.storageWarning !== failure || JSON.stringify(current.matches) !== JSON.stringify(kept.matches)) {
      publishArchive(kept, failure)
    }
    return { ok: false, error: failure }
  }
}

export const useBattleArchiveStore = create<BattleArchiveStore>()(persist((_set, get) => ({
  version: 1, matches: [], storageWarning: null,
  archiveBattle: (match) => {
    const chronicle = normalizeBattleChronicle(match.chronicle)
    if (!chronicle.events.length) return
    const old = get().matches.find((item) => item.id === chronicle.battleId)
    const item: ArchivedBattle = { ...match, chronicle, id: chronicle.battleId, completedAt: old?.completedAt ?? new Date().toISOString() }
    writeArchive(normalizeBattleArchive({ matches: [item, ...get().matches.filter((candidate) => candidate.id !== item.id)] }), archiveStorageWarning, true)
  },
  importArchive: (value) => writeArchive(normalizeBattleArchive(value), 'Non riesco a salvare l’archivio importato. Le cronache precedenti restano intatte; libera spazio e riprova l’importazione.'),
  clearArchive: () => writeArchive({ version: 1, matches: [] }, 'Non riesco a svuotare l’archivio sul dispositivo. Le cronache restano intatte; libera spazio e riprova l’eliminazione.'),
  saveArchive: () => writeArchive({ version: 1, matches: get().matches }, archiveStorageWarning),
}), {
  name: BATTLE_ARCHIVE_STORAGE_KEY, version: 1,
  // Resolve browser storage at operation time so disabled storage cannot remove
  // the persist API needed by safe writes and atomic campaign restore.
  storage: createJSONStorage(() => ({
    getItem: (key) => { try { return readCampaignCheckpoint(key) } catch { return null } },
    setItem: (key, value) => writeCampaignCheckpoint(key, value),
    removeItem: (key) => removeCampaignCheckpoint(key),
  })),
  partialize: (state) => ({ version: 1, matches: state.matches }),
  merge: (saved, current) => ({ ...current, ...normalizeBattleArchive(saved) }),
}))

const setArchiveState = useBattleArchiveStore.setState
useBattleArchiveStore.setState = ((...args: Parameters<typeof setArchiveState>) => {
  if (isCampaignWritable()) setArchiveState(...args)
}) as typeof useBattleArchiveStore.setState
