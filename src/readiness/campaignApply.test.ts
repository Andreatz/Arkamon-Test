import { beforeEach, describe, expect, it, vi } from 'vitest'
import { draftLeagueConfiguration } from '@/league/leagueModel'
import { getLocalMap } from '@/data/localMaps'
import { newInteractionDefinition } from '@/interactions/types'
import { exportCampaignPackage, parseCampaignPackage } from './campaignPackage'
import { SessionCoordinator } from '@/session/sessionCoordinator'
import { GAME_SAVE_STORAGE_KEY } from '@/save/gamePersistence'
import { reportSaveFailure, useSaveWriteStatus } from '@/save/durableWrites'

const context = vi.hoisted(() => ({
  values: new Map<string, string>(), failKey: '', writable: true, gameCommit: true,
  game: {} as Record<string, unknown>, interactions: [] as unknown[],
  onGameCommitFailure: null as ((patch: Record<string, unknown>) => void) | null,
  checkpoint: null as { read(key: string): string | null; write(key: string, value: string): unknown; remove(key: string): void } | null,
}))
vi.mock('@/session/sessionOwnership', () => ({ isCampaignWritable: () => context.writable, sessionOwnershipMessage: () => 'Un’altra console controlla la partita.',
  readCampaignCheckpoint: (key: string) => context.checkpoint ? context.checkpoint.read(key) : localStorage.getItem(key),
  writeCampaignCheckpoint: (key: string, value: string) => context.checkpoint ? context.checkpoint.write(key, value) : localStorage.setItem(key, value),
  removeCampaignCheckpoint: (key: string) => context.checkpoint ? context.checkpoint.remove(key) : localStorage.removeItem(key),
}))
vi.mock('@/store/gameStore', () => ({ useGameStore: { getState: () => ({ ...context.game, aggiornaStato: (patch: Record<string, unknown>) => {
  if (!context.gameCommit) { context.onGameCommitFailure?.(patch); return false }
  context.checkpoint?.write('arkamon-save', JSON.stringify({ state: { ...context.game, ...patch }, version: 0 }))
  Object.assign(context.game, patch); return true
} }) } }))
vi.mock('@/interactions/interactionStore', () => ({ INTERACTION_STORAGE_KEY: 'arkamon-interactions-v1', useInteractionStore: {
  getState: () => ({ interactions: context.interactions }), setState: (patch: { interactions: unknown[] }) => { context.interactions = patch.interactions },
  persist: { getOptions: () => ({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } }), setOptions: () => undefined },
} }))
import { applyCampaignConfiguration, CAMPAIGN_IMPORT_RECOVERY_KEY, recoverCampaignConfigurationImport } from './campaignApply'

const catalogKey = 'arkamon-interactions-v1'
const map = getLocalMap('Venezia')!
const entry = { ...newInteractionDefinition(map.id, map.startNode, 'new'), title: 'Nuova tappa' }
function configuration() { return parseCampaignPackage(exportCampaignPackage('Prova', { version: 1, interactions: [entry] }, draftLeagueConfiguration())).configuration! }
describe('applicazione durevole della sola configurazione', () => {
  beforeEach(() => {
    context.values.clear(); context.failKey = ''; context.writable = true; context.gameCommit = true; context.interactions = []; context.checkpoint = null; context.onGameCommitFailure = null
    useSaveWriteStatus.getState().clear()
    useSaveWriteStatus.setState({ backupWarning: null })
    context.game = { league: { config: null, players: { 1: { attempt: 0 }, 2: { attempt: 0 } }, winner: null }, giocatore1: { nome: 'Melia', monete: 123, squadra: [{ id: 'real' }] }, posizione1: { luogo: 'Venezia' }, interactionProgress: { completed1: ['old'] }, battaglia: null, challengeContext: null }
    vi.stubGlobal('localStorage', { getItem: (key: string) => context.values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (key === context.failKey) throw new Error('quota'); context.values.set(key, value) }, removeItem: (key: string) => context.values.delete(key) })
  })
  it('applica il catalogo e la Lega conservando tutte le identità dei progressi', () => {
    const player = context.game.giocatore1, position = context.game.posizione1, progress = context.game.interactionProgress
    expect(applyCampaignConfiguration(configuration()).ok).toBe(true)
    expect(context.interactions).toEqual([entry])
    expect(context.game.giocatore1).toBe(player)
    expect(context.game.posizione1).toBe(position)
    expect(context.game.interactionProgress).toBe(progress)
    expect(context.values.has(CAMPAIGN_IMPORT_RECOVERY_KEY)).toBe(false)
  })
  it('una seconda console non può scrivere neppure il catalogo', () => {
    context.writable = false
    expect(applyCampaignConfiguration(configuration()).ok).toBe(false)
    expect(context.values.size).toBe(0)
  })
  it('con main save rifiutato ripristina il catalogo precedente senza pubblicare dati parziali', () => {
    context.gameCommit = false
    expect(applyCampaignConfiguration(configuration()).ok).toBe(false)
    expect(context.interactions).toEqual([])
    expect(context.values.get(catalogKey)).toBeUndefined()
    expect(context.game.league).toMatchObject({ config: null })
  })
  it('il rollback ritira il retry che applicherebbe soltanto la Lega del pacchetto respinto', () => {
    context.gameCommit = false
    context.onGameCommitFailure = patch => reportSaveFailure(() => { Object.assign(context.game, patch); return true })
    expect(applyCampaignConfiguration(configuration()).ok).toBe(false)
    expect(useSaveWriteStatus.getState()).toMatchObject({ error: null, retry: null, cancel: null, local: false })
    // The failed-save dialog can no longer resurrect a partial import after quota is restored.
    expect(useSaveWriteStatus.getState().retry?.()).toBeUndefined()
    expect(context.game.league).toMatchObject({ config: null })
    expect(context.interactions).toEqual([])
    expect(context.values.get(catalogKey)).toBeUndefined()
    expect(context.values.has(CAMPAIGN_IMPORT_RECOVERY_KEY)).toBe(false)
  })
  it('ritirare il retry dell’import conserva un’operazione precedente e gli avvisi del backup', () => {
    const previousRetry = vi.fn(() => true), previousCancel = vi.fn()
    reportSaveFailure(previousRetry, true, previousCancel)
    useSaveWriteStatus.setState({ backupWarning: 'Copia automatica non disponibile' })
    const previousError = useSaveWriteStatus.getState().error
    context.gameCommit = false
    context.onGameCommitFailure = patch => reportSaveFailure(() => { Object.assign(context.game, patch); return true })
    expect(applyCampaignConfiguration(configuration()).ok).toBe(false)
    expect(useSaveWriteStatus.getState()).toMatchObject({ error: previousError, retry: previousRetry, cancel: previousCancel,
      local: true, backupWarning: 'Copia automatica non disponibile' })
    expect(previousRetry).not.toHaveBeenCalled()
    expect(previousCancel).not.toHaveBeenCalled()
    expect(context.game.league).toMatchObject({ config: null })
  })
  it.each([CAMPAIGN_IMPORT_RECOVERY_KEY, catalogKey])('una scrittura fallita di %s non cambia catalogo né progressi', key => {
    context.failKey = key
    expect(applyCampaignConfiguration(configuration()).ok).toBe(false)
    expect(context.interactions).toEqual([])
    expect(context.game.league).toMatchObject({ config: null })
  })
  it('un catalogo modificato altrove deve essere riletto prima dell’importazione', () => {
    context.values.set(catalogKey, JSON.stringify({ state: { interactions: [entry] }, version: 0 }))
    expect(applyCampaignConfiguration(configuration()).message).toContain('altra finestra')
    expect(context.values.has(CAMPAIGN_IMPORT_RECOVERY_KEY)).toBe(false)
  })
  it('recupera un’interruzione dopo il commit Lega completando solo il catalogo', () => {
    const config = configuration()
    const afterCatalog = JSON.stringify({ state: { interactions: config.catalog.interactions }, version: 0 })
    context.values.set(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify({ version: 1, beforeCatalog: null, afterCatalog, beforeLeague: null, afterLeague: config.league }))
    ;(context.game.league as { config: unknown }).config = config.league
    expect(recoverCampaignConfigurationImport().message).toContain('completata')
    expect(context.interactions).toEqual([entry])
    expect(context.values.has(CAMPAIGN_IMPORT_RECOVERY_KEY)).toBe(false)
  })
  it('recupera un’interruzione prima del commit Lega annullando il catalogo preparato', () => {
    const config = configuration(), afterCatalog = JSON.stringify({ state: { interactions: [entry] }, version: 0 })
    context.values.set(catalogKey, afterCatalog)
    context.values.set(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify({ version: 1, beforeCatalog: null, afterCatalog, beforeLeague: null, afterLeague: config.league }))
    expect(recoverCampaignConfigurationImport().message).toContain('annullata')
    expect(context.interactions).toEqual([])
    expect(context.values.get(catalogKey)).toBeUndefined()
  })
  it('non altera una configurazione Lega modificata dopo il crash', () => {
    const config = configuration(), beforeLeague = { ...config.league, defeat: 'restart' }
    context.values.set(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify({ version: 1, beforeCatalog: null, afterCatalog: JSON.stringify({ state: { interactions: [entry] }, version: 0 }), beforeLeague, afterLeague: config.league }))
    expect(recoverCampaignConfigurationImport().ok).toBe(false)
    expect(context.values.has(CAMPAIGN_IMPORT_RECOVERY_KEY)).toBe(true)
  })
  it.each(['complete', 'rollback'] as const)('non sovrascrive un catalogo modificato dopo il crash durante il recovery %s', operation => {
    const config = configuration(), afterCatalog = JSON.stringify({ state: { interactions: [entry] }, version: 0 })
    const external = { ...entry, id: 'external-change', title: 'Modifica successiva al crash' }
    const unrelatedCatalog = JSON.stringify({ state: { interactions: [external] }, version: 0 })
    context.interactions = [external]
    context.values.set(catalogKey, unrelatedCatalog)
    context.values.set(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify({ version: 1, beforeCatalog: null, afterCatalog, beforeLeague: null, afterLeague: config.league }))
    if (operation === 'complete') (context.game.league as { config: unknown }).config = config.league
    const saved = new Map(context.values)
    expect(recoverCampaignConfigurationImport()).toMatchObject({ ok: false, message: expect.stringMatching(/catalogo.*cambiato/i) })
    expect(context.values).toEqual(saved)
    expect(context.interactions).toEqual([external])
  })
  it('blocca la sostituzione dei contenuti durante la gara Lega', () => {
    ;(context.game.league as { players: Record<number, { attempt: number }> }).players[1].attempt = 1
    expect(applyCampaignConfiguration(configuration()).ok).toBe(false)
    expect(context.values.size).toBe(0)
  })
  it('importa tramite il fence e il successivo salvataggio del catalogo non produce conflitti', async () => {
    const coordinator = new SessionCoordinator({ storage: localStorage, token: 'import-owner', settle: async () => {} })
    expect(await coordinator.acquire()).toBe(true)
    context.checkpoint = coordinator
    expect(applyCampaignConfiguration(configuration()).ok).toBe(true)
    expect(JSON.parse(context.values.get(catalogKey)!).arkamonSession.writer).toBe('import-owner')
    coordinator.write(catalogKey, JSON.stringify({ state: { interactions: [{ ...entry, title: 'Modifica successiva' }] }, version: 0 }))
    expect(coordinator.getSnapshot().mode).toBe('owner')
    coordinator.write(GAME_SAVE_STORAGE_KEY, JSON.stringify({ state: context.game, version: 0 }))
    expect(coordinator.getSnapshot().mode).toBe('owner')
  })
  it('il rollback di un import respinto aggiorna il fence prima della successiva modifica normale', async () => {
    const before = { ...entry, id: 'previous', title: 'Precedente' }
    context.interactions = [before]
    context.values.set(catalogKey, JSON.stringify({ state: { interactions: [before] }, version: 0 }))
    const coordinator = new SessionCoordinator({ storage: localStorage, token: 'rollback-owner', settle: async () => {} })
    expect(await coordinator.acquire()).toBe(true)
    context.checkpoint = coordinator; context.gameCommit = false
    expect(applyCampaignConfiguration(configuration()).ok).toBe(false)
    expect(JSON.parse(context.values.get(catalogKey)!).state.interactions).toEqual([before])
    coordinator.write(catalogKey, JSON.stringify({ state: { interactions: [before] }, version: 0 }))
    expect(coordinator.getSnapshot().mode).toBe('owner')
  })
  it.each(['complete', 'rollback'] as const)('il recovery %s resta compatibile con il fence del prossimo salvataggio', async operation => {
    const config = configuration(), beforeCatalog = JSON.stringify({ state: { interactions: [] }, version: 0 })
    const afterCatalog = JSON.stringify({ state: { interactions: [entry] }, version: 0 })
    context.values.set(catalogKey, afterCatalog)
    context.values.set(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify({ version: 1, beforeCatalog, afterCatalog, beforeLeague: null, afterLeague: config.league }))
    if (operation === 'complete') (context.game.league as { config: unknown }).config = config.league
    const coordinator = new SessionCoordinator({ storage: localStorage, token: `recovery-${operation}`, settle: async () => {} })
    expect(await coordinator.acquire()).toBe(true)
    context.checkpoint = coordinator
    expect(recoverCampaignConfigurationImport().ok).toBe(true)
    coordinator.write(catalogKey, JSON.stringify({ state: { interactions: context.interactions }, version: 0 }))
    expect(coordinator.getSnapshot().mode).toBe('owner')
  })
  it('un crash prima del main commit annulla il catalogo anche se la Lega importata era identica', () => {
    const afterCatalog = JSON.stringify({ state: { interactions: [entry] }, version: 0 })
    context.values.set(catalogKey, afterCatalog)
    context.values.set(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify({ version: 1, beforeCatalog: null, afterCatalog, beforeLeague: null, afterLeague: null, beforeCampaign: null }))
    expect(recoverCampaignConfigurationImport().message).toContain('annullata')
    expect(context.interactions).toEqual([])
  })
})
