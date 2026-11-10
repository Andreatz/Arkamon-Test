import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/store/gameStore'
import { INTERACTION_STORAGE_KEY, useInteractionStore } from '@/interactions/interactionStore'
import { interactionCatalogForBackup, useInteractionRecoveryStatus } from '@/interactions/interactionRecovery'
import { applyCampaignConfiguration } from '@/readiness/campaignApply'
import { initialGameSave } from './gamePersistence'
import { serializeGameBackup, validateGameBackup } from './gameBackup'
import { restoreGameBackup } from './restoreGameBackup'

const values = vi.hoisted(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => data.delete(key) })
  return data
})
const raw = '{original catalog to recover'
beforeEach(async () => {
  values.clear(); useInteractionRecoveryStatus.setState({ recovery: null })
  useGameStore.setState({ ...initialGameSave(), challengeContext: null })
  useInteractionStore.setState({ interactions: [] })
  values.set(INTERACTION_STORAGE_KEY, raw)
  await useInteractionStore.persist.rehydrate()
})
afterEach(() => useInteractionRecoveryStatus.setState({ recovery: null }))

describe('campaign backup while an interaction catalog is quarantined', () => {
  it('exports a complete campaign while explicitly omitting the quarantined catalog, preserving its original bytes separately', () => {
    const campaign = initialGameSave(); campaign.giocatore1.nome = 'Campagna da conservare'; campaign.giocatore1.monete = 731
    const selected = interactionCatalogForBackup(useInteractionStore.getState().interactions)
    expect(selected).toBeUndefined()
    const backup = serializeGameBackup(campaign, new Date(), selected)
    const envelope = JSON.parse(backup), validated = validateGameBackup(backup)
    expect(envelope.interactionCatalog).toBeUndefined()
    expect(envelope.campaign.giocatore1).toMatchObject({ nome: 'Campagna da conservare', monete: 731 })
    expect(validated.ok).toBe(true)
    expect(useInteractionStore.getState().exportCatalog()).toBe(raw)
    expect(values.get(INTERACTION_STORAGE_KEY)).toBe(raw)
    expect(() => serializeGameBackup(campaign, new Date(), useInteractionStore.getState().interactions)).toThrow(/senza catalogo/)
  })
  it('blocks ordinary campaign imports and restores until the original catalog has an explicit recovery decision', () => {
    const backup = validateGameBackup(serializeGameBackup(initialGameSave()))
    if (!backup.ok) throw new Error(backup.error)
    const saved = new Map(values), game = useGameStore.getState()
    expect(restoreGameBackup(backup.preview)).toMatchObject({ ok: false, error: expect.stringMatching(/recuper/) })
    expect(applyCampaignConfiguration({ format: 'arkamon-campaign-configuration', version: 1, name: 'Accidental empty replacement', catalog: { version: 1, interactions: [] }, league: null })).toMatchObject({ ok: false, message: expect.stringMatching(/recuper/) })
    expect(values).toEqual(saved)
    expect(useGameStore.getState()).toBe(game)
  })
})
