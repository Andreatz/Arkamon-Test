import { useGameStore } from '@/store/gameStore'
import { INTERACTION_STORAGE_KEY, useInteractionStore } from '@/interactions/interactionStore'
import { isCampaignWritable, readCampaignCheckpoint, removeCampaignCheckpoint, sessionOwnershipMessage, writeCampaignCheckpoint } from '@/session/sessionOwnership'
import { GAME_SAVE_STORAGE_KEY } from '@/save/gamePersistence'
import { useSaveWriteStatus } from '@/save/durableWrites'
import { isUiStudioPreview } from '@/ui-studio/previewMode'
import { interactionRecoveryMessage, useInteractionRecoveryStatus } from '@/interactions/interactionRecovery'
import { parseCampaignPackage, type CampaignPackage } from './campaignPackage'

export const CAMPAIGN_IMPORT_RECOVERY_KEY = 'arkamon-configuration-transaction-v1'
interface ConfigurationJournal {
  version: 1
  /** Optional only for journals written before the explicit commit protocol. */
  phase?: 'prepared' | 'committed'
  beforeCatalog: string | null
  afterCatalog: string
  beforeLeague: unknown
  afterLeague: unknown
  /** Distinguishes a no-op League update from a commit that never happened. */
  beforeCampaign?: string | null
}
export interface ConfigurationApplyResult { ok: boolean; message: string }

/** Ownership revisions may change during recovery; authored catalog data may not. */
function sameCatalog(left: string | null, right: string | null): boolean {
  if (left === right) return true
  if (left === null || right === null) return false
  try {
    const a = JSON.parse(left), b = JSON.parse(right)
    delete a.arkamonSession; delete b.arkamonSession
    return JSON.stringify(a) === JSON.stringify(b)
  } catch { return false }
}

function publishCatalog(interactions: CampaignPackage['catalog']['interactions']) {
  // The catalog was already written synchronously in the compound transaction.
  const storage = useInteractionStore.persist.getOptions().storage
  useInteractionStore.persist.setOptions({ storage: storage ? { ...storage, setItem: () => undefined } : undefined })
  try { useInteractionStore.setState({ interactions }) } finally { useInteractionStore.persist.setOptions({ storage }) }
}
function restoreRawCatalog(raw: string | null) {
  if (raw === null) removeCampaignCheckpoint(INTERACTION_STORAGE_KEY)
  else writeCampaignCheckpoint(INTERACTION_STORAGE_KEY, raw)
}
function readJournal(raw: string | null): ConfigurationJournal | null {
  try {
    const journal: unknown = JSON.parse(raw ?? 'null')
    if (!journal || typeof journal !== 'object') return null
    const value = journal as ConfigurationJournal
    if (value.version !== 1 || value.phase !== undefined && value.phase !== 'prepared' && value.phase !== 'committed'
      || !(value.beforeCatalog === null || typeof value.beforeCatalog === 'string') || typeof value.afterCatalog !== 'string'
      || value.beforeCampaign !== undefined && value.beforeCampaign !== null && typeof value.beforeCampaign !== 'string') return null
    const catalog = JSON.parse(value.afterCatalog)
    const parsed = parseCampaignPackage(JSON.stringify({ format: 'arkamon-campaign-configuration', version: 1, name: 'Ripristino importazione', catalog: { version: 1, interactions: catalog.state.interactions }, league: value.afterLeague }))
    return parsed.error ? null : value
  } catch { return null }
}

/** Writes are journaled before either durable key changes; progress is never imported. */
export function applyCampaignConfiguration(configuration: CampaignPackage): ConfigurationApplyResult {
  if (isUiStudioPreview()) return { ok: false, message: 'La configurazione della campagna è disponibile nella partita. Questa anteprima non modifica i salvataggi.' }
  if (useInteractionRecoveryStatus.getState().recovery) return { ok: false, message: interactionRecoveryMessage }
  const validated = parseCampaignPackage(JSON.stringify(configuration))
  if (!validated.configuration) return { ok: false, message: validated.error }
  if (!isCampaignWritable()) return { ok: false, message: sessionOwnershipMessage() }
  const game = useGameStore.getState()
  if (game.battaglia || game.challengeContext || game.league.players[1].attempt > 0 || game.league.players[2].attempt > 0)
    return { ok: false, message: 'Concludi battaglie e sfide. Dopo il primo tentativo della Lega, configurazione e avversari restano fissi.' }
  const config = validated.configuration
  const pendingWriteBeforeImport = useSaveWriteStatus.getState()
  const discardImportRetry = () => {
    const pending = useSaveWriteStatus.getState()
    if (pending.retry === pendingWriteBeforeImport.retry) return
    // A rolled-back compound import must not leave a retry that applies only
    // its League patch. Preserve an older pending action and optional backup diagnostics.
    useSaveWriteStatus.setState({ error: pendingWriteBeforeImport.error, retry: pendingWriteBeforeImport.retry,
      cancel: pendingWriteBeforeImport.cancel, local: pendingWriteBeforeImport.local })
  }
  let journal: ConfigurationJournal | null = null
  let committed = false
  try {
    if (localStorage.getItem(CAMPAIGN_IMPORT_RECOVERY_KEY)) return { ok: false, message: 'È presente un’importazione interrotta. Recuperala prima di applicare un altro pacchetto.' }
    // Enrol this key in the same ownership fence as normal catalog writes. A
    // semantic comparison still rejects a stale in-memory catalog before import.
    const beforeCatalog = readCampaignCheckpoint(INTERACTION_STORAGE_KEY)
    const savedEntries = beforeCatalog ? JSON.parse(beforeCatalog)?.state?.interactions : []
    if (JSON.stringify(savedEntries) !== JSON.stringify(useInteractionStore.getState().interactions)) return { ok: false, message: 'Il catalogo è cambiato in un’altra finestra. Ricarica la console prima di importare.' }
    journal = { version: 1, phase: 'prepared', beforeCatalog, afterCatalog: JSON.stringify({ state: { interactions: config.catalog.interactions }, version: 0 }), beforeLeague: game.league.config,
      afterLeague: config.league, beforeCampaign: localStorage.getItem(GAME_SAVE_STORAGE_KEY) }
    localStorage.setItem(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify(journal))
    writeCampaignCheckpoint(INTERACTION_STORAGE_KEY, journal.afterCatalog)
    if (!useGameStore.getState().aggiornaStato({ league: { ...game.league, config: config.league } })) {
      discardImportRetry()
      restoreRawCatalog(journal.beforeCatalog)
      localStorage.removeItem(CAMPAIGN_IMPORT_RECOVERY_KEY)
      return { ok: false, message: 'Configurazione non applicata: il salvataggio della partita non è disponibile. Il catalogo precedente è stato conservato.' }
    }
    try { localStorage.setItem(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify({ ...journal, phase: 'committed' })) }
    catch (error) {
      // An actual campaign write already supplies an unambiguous commit point.
      // A catalog-only update needs the marker before it can announce success.
      if (localStorage.getItem(GAME_SAVE_STORAGE_KEY) === journal.beforeCampaign) throw error
    }
    committed = true
    publishCatalog(config.catalog.interactions)
    try { localStorage.removeItem(CAMPAIGN_IMPORT_RECOVERY_KEY) } catch { /* Recovery completes this successful write after reload. */ }
    return { ok: true, message: 'Configurazione applicata. Squadre delle giocatrici, monete, inventari, posizioni e progressi conservati.' }
  } catch {
    // A quota failure before the first write changes nothing. If rollback itself
    // fails, the journal remains available for deterministic startup recovery.
    if (!committed) {
      discardImportRetry()
      try { if (journal) restoreRawCatalog(journal.beforeCatalog); localStorage.removeItem(CAMPAIGN_IMPORT_RECOVERY_KEY) } catch { /* Keep recovery journal. */ }
    }
    return { ok: false, message: 'Importazione non completata: archivio pieno o bloccato. Nessun progresso importato. Se il recupero è ancora in attesa, ricarica la console prima di proseguire.' }
  }
}

/** Call after save hydration and session ownership, before enabling gameplay. */
export function recoverCampaignConfigurationImport(): ConfigurationApplyResult {
  // A preview never owns the live campaign's interrupted import or its journal.
  if (isUiStudioPreview()) return { ok: true, message: '' }
  if (!isCampaignWritable()) return { ok: false, message: sessionOwnershipMessage() }
  let raw: string | null
  try { raw = localStorage.getItem(CAMPAIGN_IMPORT_RECOVERY_KEY) } catch { return { ok: false, message: 'Archivio configurazioni non disponibile.' } }
  if (!raw) return { ok: true, message: '' }
  const journal = readJournal(raw)
  if (!journal) return { ok: false, message: 'Il recupero della configurazione non è leggibile. Conserva un backup prima di intervenire sull’archivio.' }
  const league = useGameStore.getState().league.config
  try {
    const currentCatalog = readCampaignCheckpoint(INTERACTION_STORAGE_KEY)
    if (!sameCatalog(currentCatalog, journal.beforeCatalog) && !sameCatalog(currentCatalog, journal.afterCatalog))
      return { ok: false, message: 'Il catalogo è cambiato dopo l’importazione interrotta. Nessuna modifica automatica: conserva un backup e verifica il pacchetto.' }
    const currentCampaign = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    const checkpointUnchanged = journal.beforeCampaign !== undefined && currentCampaign === journal.beforeCampaign
    if ((journal.phase === 'committed' || !checkpointUnchanged) && JSON.stringify(league) === JSON.stringify(journal.afterLeague)) {
      writeCampaignCheckpoint(INTERACTION_STORAGE_KEY, journal.afterCatalog)
      publishCatalog(JSON.parse(journal.afterCatalog).state.interactions)
      localStorage.removeItem(CAMPAIGN_IMPORT_RECOVERY_KEY)
      return { ok: true, message: 'Importazione interrotta completata. Tutti i progressi sono stati conservati.' }
    }
    if (JSON.stringify(league) === JSON.stringify(journal.beforeLeague)) {
      restoreRawCatalog(journal.beforeCatalog)
      const entries = journal.beforeCatalog ? JSON.parse(journal.beforeCatalog).state.interactions : []
      publishCatalog(entries)
      localStorage.removeItem(CAMPAIGN_IMPORT_RECOVERY_KEY)
      return { ok: true, message: 'Importazione interrotta annullata: configurazione precedente ripristinata senza modificare i progressi.' }
    }
    return { ok: false, message: 'La configurazione Lega è cambiata dopo l’importazione interrotta. Nessuna modifica automatica: conserva un backup e verifica il pacchetto.' }
  } catch { return { ok: false, message: 'Recupero configurazione ancora in attesa: libera spazio nel browser e ricarica la console.' } }
}
