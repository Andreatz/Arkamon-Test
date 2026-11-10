import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalMap } from '@/data/localMaps'
import { INTERACTION_STORAGE_KEY, useInteractionStore } from '../interactionStore'
import { newInteractionDefinition } from '../types'
import { useInteractionRecoveryStatus } from '../interactionRecovery'
const storageState = vi.hoisted(() => {
  const values = new Map<string, string>()
  const control = { fail: false, writes: 0, values }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { control.writes += 1; if (control.fail) throw new Error('QuotaExceededError'); values.set(key, value) },
    removeItem: (key: string) => values.delete(key),
  })
  return control
})
function entry(id: string) {
  const map = getLocalMap('Venezia')!
  return { ...newInteractionDefinition(map.id, map.startNode, id), title: id }
}
describe('catalogo: pubblicazione soltanto dopo il salvataggio duraturo', () => {
  beforeEach(() => {
    storageState.fail = false
    useInteractionRecoveryStatus.setState({ recovery: null })
    useInteractionStore.setState({ interactions: [] })
    storageState.writes = 0
    useInteractionStore.getState().saveInteraction(entry('previous'))
  })
  it.each(['save', 'import', 'remove'] as const)('%s con archivio pieno conserva catalogo memoria e file, senza lanciare errori UI', (action) => {
    const before = useInteractionStore.getState().interactions
    const file = storageState.values.get(INTERACTION_STORAGE_KEY)
    storageState.fail = true
    const store = useInteractionStore.getState()
    const message = action === 'save' ? store.saveInteraction(entry('new'))
      : action === 'remove' ? store.removeInteraction('previous')
      : store.importCatalog(JSON.stringify({ version: 1, interactions: [entry('imported')] }))
    expect(message).toMatch(/spazio.*esaurito o bloccato/)
    expect(useInteractionStore.getState().interactions).toBe(before)
    expect(storageState.values.get(INTERACTION_STORAGE_KEY)).toBe(file)
    storageState.fail = false
  })
  it('i subscriber vedono il catalogo solo quando la sua stessa versione è già scritta, con una sola scrittura', () => {
    storageState.writes = 0
    const observations: string[][] = []
    const release = useInteractionStore.subscribe((state) => {
      const file = JSON.parse(storageState.values.get(INTERACTION_STORAGE_KEY)!)
      expect(file.state.interactions).toEqual(state.interactions)
      observations.push(state.interactions.map((item) => item.id))
    })
    expect(useInteractionStore.getState().saveInteraction(entry('next'))).toBeNull()
    release()
    expect(observations).toEqual([['previous', 'next']])
    expect(storageState.writes).toBe(1)
  })
  it('un’importazione non valida non modifica il catalogo né scrive nell’archivio', () => {
    storageState.writes = 0
    const previous = useInteractionStore.getState().interactions
    expect(useInteractionStore.getState().importCatalog('{')).toMatch(/JSON/)
    expect(useInteractionStore.getState().importCatalog(JSON.stringify({ version: 1, interactions: [entry('duplicate'), entry('duplicate')] }))).toMatch(/stesso identificatore/)
    expect(useInteractionStore.getState().interactions).toBe(previous)
    expect(storageState.writes).toBe(0)
  })
  it('non sostituisce un catalogo persistito invalido con il vuoto dopo idratazione e salvataggio ordinario', async () => {
    const good = entry('valid'), broken = { ...entry('broken'), nodeId: 'no-longer-existing' }
    const raw = JSON.stringify({ state: { interactions: [good, broken] }, version: 0 })
    storageState.values.set(INTERACTION_STORAGE_KEY, raw)
    await useInteractionStore.persist.rehydrate()
    expect(useInteractionStore.getState().interactions).toEqual([])
    expect(useInteractionStore.getState().saveInteraction(entry('new'))).toMatch(/recuper/)
    expect(storageState.values.get(INTERACTION_STORAGE_KEY)).toBe(raw)
  })
  it.each(['missing-reference', 'cycle', 'invalid-node', 'unreadable-json'] as const)('conserva l’originale %s e blocca tutte le sostituzioni ordinarie', async problem => {
    const first = entry('first'), second = entry('second')
    if (problem === 'missing-reference') first.requirements.completedInteractions = ['missing']
    if (problem === 'cycle') { first.requirements.completedInteractions = [second.id]; second.requirements.completedInteractions = [first.id] }
    if (problem === 'invalid-node') second.nodeId = 'unavailable'
    const raw = problem === 'unreadable-json' ? '{broken catalog' : JSON.stringify({ state: { interactions: [first, second] }, version: 0 })
    storageState.values.set(INTERACTION_STORAGE_KEY, raw)
    storageState.writes = 0
    await useInteractionStore.persist.rehydrate()

    expect(useInteractionStore.getState().interactions).toEqual([])
    expect(useInteractionRecoveryStatus.getState().recovery).toEqual({ error: expect.any(String), raw })
    const store = useInteractionStore.getState()
    expect(store.exportCatalog()).toBe(raw)
    expect(store.saveInteraction(entry('new'))).toMatch(/recuper/)
    expect(store.removeInteraction('first')).toMatch(/recuper/)
    expect(store.importCatalog(JSON.stringify({ version: 1, interactions: [entry('new')] }))).toMatch(/recuper/)
    expect(storageState.values.get(INTERACTION_STORAGE_KEY)).toBe(raw)
    expect(storageState.writes).toBe(0)
  })
  it('richiede una sostituzione esplicita e valida prima di riabilitare il catalogo', async () => {
    const raw = '{original unreadable catalog'
    storageState.values.set(INTERACTION_STORAGE_KEY, raw)
    await useInteractionStore.persist.rehydrate()
    const store = useInteractionStore.getState(), valid = JSON.stringify({ version: 1, interactions: [entry('recovered')] })
    expect(store.replaceDamagedCatalog('{')).toMatch(/JSON/)
    expect(storageState.values.get(INTERACTION_STORAGE_KEY)).toBe(raw)
    storageState.fail = true
    expect(store.replaceDamagedCatalog(valid)).toMatch(/spazio/)
    expect(storageState.values.get(INTERACTION_STORAGE_KEY)).toBe(raw)
    expect(useInteractionRecoveryStatus.getState().recovery?.raw).toBe(raw)
    storageState.fail = false
    expect(store.replaceDamagedCatalog(valid)).toBeNull()
    expect(useInteractionRecoveryStatus.getState().recovery).toBeNull()
    expect(useInteractionStore.getState().interactions).toEqual([entry('recovered')])
    expect(JSON.parse(storageState.values.get(INTERACTION_STORAGE_KEY)!).state.interactions).toEqual([entry('recovered')])
    expect(store.saveInteraction(entry('next'))).toBeNull()
  })
  it('non sostituisce un originale cambiato dopo l’anteprima di recupero', async () => {
    storageState.values.set(INTERACTION_STORAGE_KEY, '{first broken catalog')
    await useInteractionStore.persist.rehydrate()
    const changed = '{different broken catalog'
    storageState.values.set(INTERACTION_STORAGE_KEY, changed)
    expect(useInteractionStore.getState().replaceDamagedCatalog(JSON.stringify({ version: 1, interactions: [] }))).toMatch(/cambiato/)
    expect(storageState.values.get(INTERACTION_STORAGE_KEY)).toBe(changed)
  })
  it('distingue una nuova installazione e un catalogo riparato da un archivio da recuperare', async () => {
    storageState.values.set(INTERACTION_STORAGE_KEY, '{broken')
    await useInteractionStore.persist.rehydrate()
    expect(useInteractionRecoveryStatus.getState().recovery).not.toBeNull()
    storageState.values.set(INTERACTION_STORAGE_KEY, JSON.stringify({ version: 0, state: { interactions: [entry('repaired')] } }))
    await useInteractionStore.persist.rehydrate()
    expect(useInteractionRecoveryStatus.getState().recovery).toBeNull()
    expect(useInteractionStore.getState().interactions).toEqual([entry('repaired')])
    storageState.values.delete(INTERACTION_STORAGE_KEY)
    await useInteractionStore.persist.rehydrate()
    expect(useInteractionRecoveryStatus.getState().recovery).toBeNull()
    expect(useInteractionStore.getState().interactions).toEqual([])
  })
  it.each(['null', '{}', '{"version":0,"state":{}}'])('un envelope persistito incompleto %s non viene scambiato per una nuova installazione', async raw => {
    storageState.values.set(INTERACTION_STORAGE_KEY, raw)
    storageState.writes = 0
    await useInteractionStore.persist.rehydrate()
    expect(useInteractionStore.getState().interactions).toEqual([])
    expect(useInteractionRecoveryStatus.getState().recovery?.raw).toBe(raw)
    expect(useInteractionStore.getState().saveInteraction(entry('new'))).toMatch(/recuper/)
    expect(storageState.values.get(INTERACTION_STORAGE_KEY)).toBe(raw)
    expect(storageState.writes).toBe(0)
  })
  it('ripara gradualmente i vecchi prerequisiti ripetibili senza autorizzarne di nuovi', () => {
    const repeatable = { ...entry('repeatable'), repeatable: true }
    const dependent = (id: string) => ({ ...entry(id), requirements: { ...entry(id).requirements, completedInteractions: [repeatable.id] } })
    const first = dependent('first'), second = dependent('second')
    useInteractionStore.setState({ interactions: [repeatable, first, second] })
    const repaired = { ...first, requirements: { ...first.requirements, completedInteractions: [] } }
    expect(useInteractionStore.getState().saveInteraction(repaired)).toBeNull()
    expect(useInteractionStore.getState().interactions).toEqual([repeatable, repaired, second])
    const before = storageState.values.get(INTERACTION_STORAGE_KEY)
    expect(useInteractionStore.getState().saveInteraction(dependent('new'))).toMatch(/ripetibile/)
    expect(useInteractionStore.getState().saveInteraction(first)).toMatch(/ripetibile/)
    expect(useInteractionStore.getState().importCatalog(JSON.stringify({ version: 1, interactions: [repeatable, repaired, second] }))).toMatch(/ripetibile/)
    expect(storageState.values.get(INTERACTION_STORAGE_KEY)).toBe(before)
    expect(useInteractionStore.getState().saveInteraction({ ...second, requirements: { ...second.requirements, completedInteractions: [] } })).toBeNull()
  })
})
