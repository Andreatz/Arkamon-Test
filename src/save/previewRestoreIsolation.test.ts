import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/store/gameStore'
import { useInteractionStore, INTERACTION_STORAGE_KEY } from '@/interactions/interactionStore'
import { useBattleArchiveStore, BATTLE_ARCHIVE_STORAGE_KEY } from '@/components/battle/battleArchiveStore'
import { readCampaignCheckpoint, writeCampaignCheckpoint, removeCampaignCheckpoint,
  recoverCampaignCheckpoint, retireRecoveredCampaignCheckpoint } from '@/session/sessionOwnership'
import { createChallengeSession } from '@/challenges/challengeRules'
import { launchChallenge, exitChallenge } from '@/challenges/challengeRuntime'
import { useChallengeStore } from '@/challenges/challengeStore'
import { ACTIVE_CHALLENGE_STORAGE_KEY, scopedGameStorage } from '@/challenges/challengePersistence'
import { initialGameSave, GAME_SAVE_STORAGE_KEY, PREVIOUS_BACKUP_STORAGE_KEY } from './gamePersistence'
import { serializeGameBackup, validateGameBackup } from './gameBackup'
import { readPreviousGameBackup, restoreGameBackup } from './restoreGameBackup'
import { BACKUP_RESTORE_JOURNAL_KEY, backupRestoreStorage, recoverInterruptedBackupRestore } from './restoreJournal'
import { AUTO_BACKUP_STORAGE_KEY, readRecoveryCopies, rememberRecoveryCopy, scheduleRecoveryCopy,
  flushPendingRecoveryCopy, cancelPendingRecoveryCopy } from './durableWrites'
import { applyCampaignConfiguration, CAMPAIGN_IMPORT_RECOVERY_KEY, recoverCampaignConfigurationImport } from '@/readiness/campaignApply'
import type { CampaignPackage } from '@/readiness/campaignPackage'

const fixture = vi.hoisted(() => {
  const values = new Map<string, string>()
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  }
  vi.stubGlobal('localStorage', storage)
  return { values, storage }
})

beforeEach(() => {
  cancelPendingRecoveryCopy()
  vi.stubGlobal('window', undefined)
  vi.stubGlobal('localStorage', fixture.storage)
  useGameStore.setState({ ...initialGameSave(), challengeContext: null, saveRecoveryWarnings: [], teamRuleMessage: null })
  useInteractionStore.setState({ interactions: [] })
  useBattleArchiveStore.setState({ version: 1, matches: [] })
  fixture.values.clear()
  for (const key of [GAME_SAVE_STORAGE_KEY, PREVIOUS_BACKUP_STORAGE_KEY, INTERACTION_STORAGE_KEY,
    BATTLE_ARCHIVE_STORAGE_KEY, BACKUP_RESTORE_JOURNAL_KEY, ACTIVE_CHALLENGE_STORAGE_KEY]) fixture.values.set(key, `saved:${key}`)
  vi.clearAllMocks()
})
afterEach(() => {
  cancelPendingRecoveryCopy()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('backup restore isolation in UI previews without a session coordinator', () => {
  it.each(['?uiConcepts=1', '?uiStudioPreview=1', '?uiReferences=1'])('does not apply or recover a campaign configuration against real storage in %s', (search) => {
    const configuration: CampaignPackage = { format: 'arkamon-campaign-configuration', version: 1, name: 'Preview configuration', catalog: { version: 1, interactions: [] }, league: null }
    // An interrupted import belongs to the live campaign, not the preview.
    fixture.values.set(CAMPAIGN_IMPORT_RECOVERY_KEY, JSON.stringify({ version: 1, beforeCatalog: null,
      afterCatalog: JSON.stringify({ state: { interactions: [] }, version: 0 }), beforeLeague: null, afterLeague: null }))
    const game = useGameStore.getState(), catalog = useInteractionStore.getState(), saved = new Map(fixture.values)
    vi.stubGlobal('window', { location: { search } })

    expect(applyCampaignConfiguration(configuration)).toMatchObject({ ok: false, message: expect.stringMatching(/anteprima/) })
    expect(recoverCampaignConfigurationImport()).toEqual({ ok: true, message: '' })
    expect(useGameStore.getState()).toBe(game)
    expect(useInteractionStore.getState()).toBe(catalog)
    expect(fixture.values).toEqual(saved)
    expect(fixture.storage.getItem).not.toHaveBeenCalled()
    expect(fixture.storage.setItem).not.toHaveBeenCalled()
    expect(fixture.storage.removeItem).not.toHaveBeenCalled()
  })

  it.each(['?uiConcepts=1', '?uiStudioPreview=1'])('refuses restore without touching campaign, catalog, archive or storage in %s', (search) => {
    const imported = initialGameSave()
    imported.giocatore1.nome = 'Partita importata'
    const validated = validateGameBackup(serializeGameBackup(imported))
    expect(validated.ok).toBe(true)
    if (!validated.ok) throw new Error(validated.error)
    const game = useGameStore.getState()
    const catalog = useInteractionStore.getState()
    const archive = useBattleArchiveStore.getState()
    const saved = new Map(fixture.values)
    vi.stubGlobal('window', { location: { search } })

    // Passing the real storage explicitly must not bypass the preview boundary.
    expect(restoreGameBackup(validated.preview, fixture.storage)).toMatchObject({ ok: false, error: expect.stringMatching(/anteprima/) })
    expect(restoreGameBackup(validated.preview).ok).toBe(false)
    expect(readPreviousGameBackup(fixture.storage)).toBeNull()
    expect(useGameStore.getState()).toBe(game)
    expect(useInteractionStore.getState()).toBe(catalog)
    expect(useBattleArchiveStore.getState()).toBe(archive)
    expect(fixture.values).toEqual(saved)
    expect(fixture.storage.setItem).not.toHaveBeenCalled()
    expect(fixture.storage.removeItem).not.toHaveBeenCalled()
  })

  it.each(['?uiConcepts=1', '?uiStudioPreview=1'])('keeps ordinary, recovery and journal checkpoint operations off real storage in %s', (search) => {
    const saved = new Map(fixture.values)
    vi.stubGlobal('window', { location: { search } })

    expect(readCampaignCheckpoint(GAME_SAVE_STORAGE_KEY)).toBeNull()
    writeCampaignCheckpoint(GAME_SAVE_STORAGE_KEY, 'replacement')
    removeCampaignCheckpoint(INTERACTION_STORAGE_KEY)
    recoverCampaignCheckpoint(GAME_SAVE_STORAGE_KEY, 'recovered')
    retireRecoveredCampaignCheckpoint(BATTLE_ARCHIVE_STORAGE_KEY)
    expect(scopedGameStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull()
    scopedGameStorage.setItem(GAME_SAVE_STORAGE_KEY, JSON.stringify({ state: { challengeContext: {} } }))
    scopedGameStorage.removeItem(ACTIVE_CHALLENGE_STORAGE_KEY)
    for (const recovering of [false, true]) {
      const target = backupRestoreStorage(fixture.storage, recovering)
      expect(target.getItem(PREVIOUS_BACKUP_STORAGE_KEY)).toBeNull()
      target.setItem(BACKUP_RESTORE_JOURNAL_KEY, 'replacement-journal')
      target.setItem(PREVIOUS_BACKUP_STORAGE_KEY, 'replacement-backup')
      target.removeItem(BACKUP_RESTORE_JOURNAL_KEY)
    }
    expect(recoverInterruptedBackupRestore()).toEqual({ ok: true, message: '' })
    expect(fixture.values).toEqual(saved)
    expect(fixture.storage.getItem).not.toHaveBeenCalled()
    expect(fixture.storage.setItem).not.toHaveBeenCalled()
    expect(fixture.storage.removeItem).not.toHaveBeenCalled()
  })

  it.each(['?uiConcepts=1', '?uiStudioPreview=1'])('refuses challenge launch and exit instead of announcing a durable transition in %s', (search) => {
    const session = createChallengeSession({ version: 1, mode: 'seed', seed: 'Preview isolation', speciesIds: [] })
    const game = useGameStore.getState()
    const challenges = useChallengeStore.getState()
    const saved = new Map(fixture.values)
    vi.stubGlobal('window', { location: { search } })

    expect(launchChallenge(session)).toMatchObject({ ok: false, message: expect.stringMatching(/anteprima/) })
    expect(exitChallenge()).toMatchObject({ ok: false, message: expect.stringMatching(/anteprima/) })
    expect(exitChallenge(true)).toMatchObject({ ok: false, message: expect.stringMatching(/anteprima/) })
    expect(useGameStore.getState()).toBe(game)
    expect(useChallengeStore.getState()).toBe(challenges)
    expect(fixture.values).toEqual(saved)
    expect(fixture.storage.setItem).not.toHaveBeenCalled()
    expect(fixture.storage.removeItem).not.toHaveBeenCalled()
  })

  it.each(['?uiConcepts=1', '?uiStudioPreview=1'])('preserves an active challenge checkpoint and campaign if exit is requested in %s', (search) => {
    const session = createChallengeSession({ version: 1, mode: 'seed', seed: 'Existing challenge', speciesIds: [] })
    expect(launchChallenge(session).ok).toBe(true)
    const game = useGameStore.getState()
    const challenges = useChallengeStore.getState()
    const saved = new Map(fixture.values)
    vi.clearAllMocks()
    vi.stubGlobal('window', { location: { search } })

    expect(exitChallenge()).toMatchObject({ ok: false, message: expect.stringMatching(/anteprima/) })
    expect(exitChallenge(true).ok).toBe(false)
    expect(useGameStore.getState()).toBe(game)
    expect(useChallengeStore.getState()).toBe(challenges)
    expect(fixture.values).toEqual(saved)
    expect(fixture.storage.setItem).not.toHaveBeenCalled()
    expect(fixture.storage.removeItem).not.toHaveBeenCalled()
  })

  it.each(['?uiConcepts=1', '?uiStudioPreview=1'])('does not read, write or enqueue automatic recovery copies in %s', (search) => {
    vi.useFakeTimers()
    fixture.values.set(AUTO_BACKUP_STORAGE_KEY, 'existing-automatic-copies')
    const saved = new Map(fixture.values)
    const previous = initialGameSave()
    const canWrite = vi.fn(() => true)
    vi.stubGlobal('window', { location: { search } })

    expect(readRecoveryCopies()).toEqual([])
    expect(readRecoveryCopies(fixture.storage)).toEqual([])
    rememberRecoveryCopy(previous)
    rememberRecoveryCopy(previous, fixture.storage)
    const timers = vi.getTimerCount()
    scheduleRecoveryCopy(previous, canWrite)
    expect(vi.getTimerCount()).toBe(timers)
    flushPendingRecoveryCopy()
    expect(canWrite).not.toHaveBeenCalled()
    expect(fixture.values).toEqual(saved)
    expect(fixture.storage.getItem).not.toHaveBeenCalled()
    expect(fixture.storage.setItem).not.toHaveBeenCalled()
    expect(fixture.storage.removeItem).not.toHaveBeenCalled()
  })

  it.each(['?uiConcepts=1', '?uiStudioPreview=1'])('drops an earlier recovery queue when a preview is active at flush time in %s', (search) => {
    vi.useFakeTimers()
    const saved = new Map(fixture.values)
    const canWrite = vi.fn(() => true)
    scheduleRecoveryCopy(initialGameSave(), canWrite)
    expect(vi.getTimerCount()).toBe(1)
    vi.stubGlobal('window', { location: { search } })

    vi.advanceTimersByTime(350)
    flushPendingRecoveryCopy()
    expect(vi.getTimerCount()).toBe(0)
    expect(canWrite).not.toHaveBeenCalled()
    expect(fixture.values).toEqual(saved)
    expect(fixture.storage.getItem).not.toHaveBeenCalled()
    expect(fixture.storage.setItem).not.toHaveBeenCalled()
  })

  it('retains the normal unmanaged checkpoint and explicit journal storage behavior outside a preview', () => {
    writeCampaignCheckpoint(GAME_SAVE_STORAGE_KEY, 'normal-checkpoint')
    expect(readCampaignCheckpoint(GAME_SAVE_STORAGE_KEY)).toBe('normal-checkpoint')
    recoverCampaignCheckpoint(INTERACTION_STORAGE_KEY, 'normal-recovery')
    expect(fixture.values.get(INTERACTION_STORAGE_KEY)).toBe('normal-recovery')
    expect(backupRestoreStorage(fixture.storage)).toBe(fixture.storage)
    expect(readPreviousGameBackup()).toBe(`saved:${PREVIOUS_BACKUP_STORAGE_KEY}`)
    removeCampaignCheckpoint(GAME_SAVE_STORAGE_KEY)
    retireRecoveredCampaignCheckpoint(INTERACTION_STORAGE_KEY)
    expect(fixture.values.has(GAME_SAVE_STORAGE_KEY)).toBe(false)
    expect(fixture.values.has(INTERACTION_STORAGE_KEY)).toBe(false)
  })
})
