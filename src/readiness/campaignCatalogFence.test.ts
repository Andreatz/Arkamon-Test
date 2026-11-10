import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionCoordinator } from '@/session/sessionCoordinator'
import { draftLeagueConfiguration } from '@/league/leagueModel'
import { getLocalMap } from '@/data/localMaps'
import { newInteractionDefinition } from '@/interactions/types'
import { exportCampaignPackage, parseCampaignPackage } from './campaignPackage'

const context = vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => values.delete(key) })
  return { values, coordinator: null as { read(key: string): string | null; write(key: string, value: string): unknown; remove(key: string): void; canWrite(): boolean } | null,
    league: { config: null as unknown, players: { 1: { attempt: 0 }, 2: { attempt: 0 } }, winner: null } }
})
vi.mock('@/session/sessionOwnership', () => ({ isCampaignWritable: () => context.coordinator?.canWrite() ?? true, sessionOwnershipMessage: () => 'Console in sola lettura.',
  readCampaignCheckpoint: (key: string) => context.coordinator ? context.coordinator.read(key) : localStorage.getItem(key),
  writeCampaignCheckpoint: (key: string, value: string) => context.coordinator ? context.coordinator.write(key, value) : localStorage.setItem(key, value),
  removeCampaignCheckpoint: (key: string) => context.coordinator ? context.coordinator.remove(key) : localStorage.removeItem(key),
}))
vi.mock('@/store/gameStore', () => ({ useGameStore: { getState: () => ({ league: context.league, battaglia: null, challengeContext: null, aggiornaStato: ({ league }: { league: typeof context.league }) => {
  context.coordinator?.write('arkamon-save', JSON.stringify({ version: 0, state: { league } })); context.league = league; return true
} }) } }))
import { INTERACTION_STORAGE_KEY, useInteractionStore } from '@/interactions/interactionStore'
import { applyCampaignConfiguration, recoverCampaignConfigurationImport } from './campaignApply'

const map = getLocalMap('Venezia')!
const entry = { ...newInteractionDefinition(map.id, map.startNode, 'entry'), title: 'Tappa importata' }
describe('catalogo reale: importazione pacchetto e modifiche ordinarie condividono il fence', () => {
  beforeEach(() => {
    context.coordinator = null; context.values.clear()
    context.league = { config: null, players: { 1: { attempt: 0 }, 2: { attempt: 0 } }, winner: null }
    useInteractionStore.setState({ interactions: [] })
  })
  it('import → editor normale → nuova importazione → ricaricamento restano scrivibili', async () => {
    const coordinator = new SessionCoordinator({ storage: localStorage, token: 'catalog-owner', settle: async () => {} })
    coordinator.setHydration(async () => { await useInteractionStore.persist.rehydrate(); coordinator.read('arkamon-save') })
    context.coordinator = coordinator
    expect(await coordinator.acquire()).toBe(true)
    const bundle = parseCampaignPackage(exportCampaignPackage('Campagna', { version: 1, interactions: [entry] }, draftLeagueConfiguration())).configuration!
    expect(applyCampaignConfiguration(bundle).ok).toBe(true)
    expect(useInteractionStore.getState().saveInteraction({ ...entry, title: 'Modifica editor' })).toBeNull()
    expect(applyCampaignConfiguration(bundle).ok).toBe(true)
    await useInteractionStore.persist.rehydrate()
    expect(useInteractionStore.getState().removeInteraction(entry.id)).toBeNull()
    expect(recoverCampaignConfigurationImport().ok).toBe(true)
    expect(coordinator.getSnapshot().mode).toBe('owner')
    expect(JSON.parse(context.values.get(INTERACTION_STORAGE_KEY)!).state.interactions).toEqual([])
    coordinator.release()
  })
  it('l’editor normale respinge una sovrascrittura esterna senza accettare il checkpoint obsoleto', async () => {
    const coordinator = new SessionCoordinator({ storage: localStorage, token: 'catalog-owner', settle: async () => {} })
    coordinator.setHydration(async () => { await useInteractionStore.persist.rehydrate() })
    context.coordinator = coordinator; await coordinator.acquire()
    expect(useInteractionStore.getState().saveInteraction(entry)).toBeNull()
    const foreign = JSON.stringify({ state: { interactions: [{ ...entry, title: 'Versione esterna' }] }, version: 0 })
    localStorage.setItem(INTERACTION_STORAGE_KEY, foreign)
    expect(useInteractionStore.getState().saveInteraction({ ...entry, title: 'Versione obsoleta' })).not.toBeNull()
    expect(localStorage.getItem(INTERACTION_STORAGE_KEY)).toBe(foreign)
    expect(coordinator.getSnapshot().mode).toBe('conflict')
    coordinator.release()
  })
})
