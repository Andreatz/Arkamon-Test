import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { InteractionDefinition } from './types'
import { validateCatalog, validateInteraction } from './schema'
import { isCampaignWritable, readCampaignCheckpoint, removeCampaignCheckpoint, sessionOwnershipMessage, writeCampaignCheckpoint } from '@/session/sessionOwnership'
import { interactionRecoveryMessage, useInteractionRecoveryStatus } from './interactionRecovery'

export const INTERACTION_STORAGE_KEY = 'arkamon-interactions-v1'
interface InteractionState {
  interactions: InteractionDefinition[]
  saveInteraction: (interaction: InteractionDefinition) => string | null
  removeInteraction: (id: string) => string | null
  importCatalog: (json: string) => string | null
  replaceDamagedCatalog: (json: string) => string | null
  exportCatalog: () => string
}
/** Write the validated catalog before publishing it to subscribers. Quota errors leave both copies unchanged. */
function commitCatalog(interactions: InteractionDefinition[], set: (patch: Pick<InteractionState, 'interactions'>) => void, replaceDamaged = false): string | null {
  if (!isCampaignWritable()) return sessionOwnershipMessage()
  const recovery = useInteractionRecoveryStatus.getState().recovery
  if (recovery && !replaceDamaged) return interactionRecoveryMessage
  const options = useInteractionStore.persist.getOptions()
  const storage = options.storage
  if (!storage) return 'Il salvataggio delle interazioni non è disponibile in questo browser. La configurazione precedente è stata conservata.'
  try {
    if (recovery && readCampaignCheckpoint(INTERACTION_STORAGE_KEY) !== recovery.raw) return 'Il catalogo originale è cambiato. Rileggi la sessione prima di scegliere il recupero.'
    const result = storage.setItem(options.name ?? INTERACTION_STORAGE_KEY, { state: { interactions }, version: options.version ?? 0 })
    // This catalog uses synchronous browser storage. Never publish an unconfirmed asynchronous write.
    if (result instanceof Promise) {
      void result.catch(() => {})
      return 'Il salvataggio delle interazioni richiede un archivio locale disponibile. La configurazione precedente è stata conservata.'
    }
    useInteractionStore.persist.setOptions({ storage: { ...storage, setItem: () => undefined } })
    try { set({ interactions }) } finally { useInteractionStore.persist.setOptions({ storage }) }
    useInteractionRecoveryStatus.setState({ recovery: null })
    return null
  } catch {
    return 'Non è stato possibile salvare le interazioni: lo spazio del browser è esaurito o bloccato. La configurazione precedente è stata conservata; scarica un catalogo prima di liberare spazio.'
  }
}
function recordRecovery(error: string) {
  let raw: string | null = null
  try { raw = readCampaignCheckpoint(INTERACTION_STORAGE_KEY) } catch { /* Storage may be unavailable at its getter. */ }
  // A denied getter does not prove that a damaged catalog exists; the campaign's
  // failed-write flow already handles unavailable storage without inventing one.
  if (raw === null) return
  useInteractionRecoveryStatus.setState({ recovery: { error, raw } })
}
function readStoredCatalog(key: string): string | null {
  const raw = readCampaignCheckpoint(key)
  if (raw !== null) {
    try { JSON.parse(raw) }
    catch {
      // Route unreadable JSON through merge too, so an existing in-memory
      // catalog is quarantined without rewriting the original bytes.
      return JSON.stringify({ state: { interactions: null }, version: 0 })
    }
  }
  return raw
}
export const useInteractionStore = create<InteractionState>()(persist((set, get) => ({
  interactions: [],
  saveInteraction: (interaction) => {
    const error = validateInteraction(interaction)
    if (error) return error
    const existing = get().interactions
    const next = existing.some((entry) => entry.id === interaction.id)
      ? existing.map((entry) => entry.id === interaction.id ? interaction : entry) : [...existing, interaction]
    const validated = validateCatalog({ version: 1, interactions: next }, { legacyInteractions: existing })
    if (validated.error) return validated.error
    return commitCatalog(validated.catalog!.interactions, set)
  },
  removeInteraction: (id) => {
    if (get().interactions.some((entry) => entry.requirements.completedInteractions.includes(id))) return 'Questa interazione è richiesta da una tappa successiva: rimuovi prima quel requisito.'
    return commitCatalog(get().interactions.filter((entry) => entry.id !== id), set)
  },
  importCatalog: (json) => {
    try {
      const validated = validateCatalog(JSON.parse(json))
      if (validated.error) return validated.error
      return commitCatalog(validated.catalog!.interactions, set)
    } catch { return 'Il file non contiene un JSON valido.' }
  },
  replaceDamagedCatalog: (json) => {
    if (!useInteractionRecoveryStatus.getState().recovery) return 'Non è presente un catalogo da recuperare.'
    try {
      const validated = validateCatalog(JSON.parse(json))
      if (validated.error) return validated.error
      return commitCatalog(validated.catalog!.interactions, set, true)
    } catch { return 'Il file non contiene un JSON valido.' }
  },
  exportCatalog: () => {
    const recovery = useInteractionRecoveryStatus.getState().recovery
    if (recovery) {
      if (recovery.raw !== null) return recovery.raw
      throw new Error('L’archivio originale non è leggibile. Rileggi la sessione prima di esportarlo.')
    }
    return JSON.stringify({ version: 1, interactions: get().interactions }, null, 2)
  },
}), {
  name: INTERACTION_STORAGE_KEY,
  storage: createJSONStorage(() => ({ getItem: readStoredCatalog, setItem: writeCampaignCheckpoint, removeItem: removeCampaignCheckpoint })),
  partialize: (state) => ({ interactions: state.interactions }),
  onRehydrateStorage: () => (_state, error) => {
    if (error) recordRecovery('Il catalogo salvato non è leggibile. Le interazioni restano sospese e l’originale viene conservato.')
  },
  merge: (saved, current) => {
    const hasInteractions = saved && typeof saved === 'object' && 'interactions' in saved
    const raw = readCampaignCheckpoint(INTERACTION_STORAGE_KEY)
    const validated = validateCatalog({ version: 1, interactions: hasInteractions ? saved.interactions : raw === null ? [] : null }, { allowLegacyRepeatableRequirements: true })
    if (!validated.catalog) {
      recordRecovery(validated.error ?? 'Il catalogo salvato non è valido.')
      return { ...current, interactions: [] }
    }
    useInteractionRecoveryStatus.setState({ recovery: null })
    return { ...current, interactions: validated.catalog.interactions }
  },
}))
