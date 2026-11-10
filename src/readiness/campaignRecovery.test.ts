import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/store/gameStore'
import { initialGameSave, GAME_SAVE_STORAGE_KEY } from '@/save/gamePersistence'
import { INTERACTION_STORAGE_KEY, useInteractionStore } from '@/interactions/interactionStore'
import { getLocalMap } from '@/data/localMaps'
import { newInteractionDefinition } from '@/interactions/types'
import { useSaveWriteStatus } from '@/save/durableWrites'
import { applyCampaignConfiguration, CAMPAIGN_IMPORT_RECOVERY_KEY, recoverCampaignConfigurationImport } from './campaignApply'
import type { CampaignPackage } from './campaignPackage'

const values = vi.hoisted(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => data.delete(key) })
  return data
})
const map = getLocalMap('Venezia')!
const entry = { ...newInteractionDefinition(map.id, map.startNode, 'only-catalog'), title: 'Importazione solo catalogo' }
const configuration: CampaignPackage = { format: 'arkamon-campaign-configuration', version: 1, name: 'Solo catalogo', catalog: { version: 1, interactions: [entry] }, league: null }

describe('configuration recovery with the real campaign durable store', () => {
  beforeEach(() => {
    values.clear()
    useSaveWriteStatus.getState().clear()
    useGameStore.setState({ ...initialGameSave(), challengeContext: null, saveRecoveryWarnings: [] })
    useInteractionStore.setState({ interactions: [] })
  })
  afterEach(() => vi.restoreAllMocks())

  it('retains a successful catalog-only import after journal cleanup fails with an unchanged campaign checkpoint', () => {
    const campaign = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    const removeItem = localStorage.removeItem
    vi.spyOn(localStorage, 'removeItem').mockImplementation(key => {
      if (key === CAMPAIGN_IMPORT_RECOVERY_KEY) throw new Error('Interrupted cleanup')
      return removeItem(key)
    })
    expect(applyCampaignConfiguration(configuration).ok).toBe(true)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(campaign)
    expect(useInteractionStore.getState().interactions).toEqual([entry])
    expect(values.has(CAMPAIGN_IMPORT_RECOVERY_KEY)).toBe(true)
    vi.restoreAllMocks()

    expect(recoverCampaignConfigurationImport().message).toContain('completata')
    expect(useInteractionStore.getState().interactions).toEqual([entry])
    expect(JSON.parse(localStorage.getItem(INTERACTION_STORAGE_KEY)!).state.interactions).toEqual([entry])
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(campaign)
    expect(values.has(CAMPAIGN_IMPORT_RECOVERY_KEY)).toBe(false)
  })

  it('does not announce success or publish the catalog when its no-op campaign cannot get a durable commit marker', () => {
    const campaign = localStorage.getItem(GAME_SAVE_STORAGE_KEY), setItem = localStorage.setItem
    let journalWrites = 0
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === CAMPAIGN_IMPORT_RECOVERY_KEY && ++journalWrites > 1) throw new Error('Quota for commit marker')
      setItem(key, value)
    })

    expect(applyCampaignConfiguration(configuration).ok).toBe(false)
    expect(useInteractionStore.getState().interactions).toEqual([])
    expect(JSON.parse(localStorage.getItem(INTERACTION_STORAGE_KEY)!).state.interactions).toEqual([])
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(campaign)
  })
})
