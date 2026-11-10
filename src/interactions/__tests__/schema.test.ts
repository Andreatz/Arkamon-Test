import { describe, expect, it } from 'vitest'
import { getLocalMap } from '@/data/localMaps'
import { newInteractionDefinition } from '../types'
import { completionPrerequisiteOptions, normalizeInteractionProgress, validateCatalog, validateInteraction } from '../schema'
import { exportTiledInteractions, importTiledInteractions } from '../tiledAdapter'

function entry(id = 'first-step') {
  const map = getLocalMap('Venezia')!
  return { ...newInteractionDefinition(map.id, map.startNode, id), title: 'Tappa di prova' }
}
describe('catalogo interazioni e adattatore Tiled', () => {
  it('l’editor propone solo completamenti possibili e lascia rimuovere un prerequisito storico ripetibile', () => {
    const draft = entry('draft'), oneShot = entry('one-shot')
    const repeatable = { ...entry('repeatable'), repeatable: true }
    const shop = { ...entry('shop'), repeatable: true, action: { kind: 'shop' as const } }
    expect(completionPrerequisiteOptions([draft, oneShot, repeatable, shop], draft)).toEqual([oneShot])
    const legacy = { ...draft, requirements: { ...draft.requirements, completedInteractions: ['repeatable'] } }
    expect(completionPrerequisiteOptions([draft, oneShot, repeatable, shop], legacy)).toEqual([oneShot, repeatable])
    expect(validateCatalog({ version: 1, interactions: [repeatable, legacy] }).error).toMatch(/ripetibile/)
  })
  it('il catalogo vuoto è valido e non aggiunge contenuti al luogo segreto', () => {
    expect(validateCatalog({ version: 1, interactions: [] }).catalog?.interactions).toEqual([])
    const item = { ...entry(), mapId: 'Percorso_15', nodeId: getLocalMap('Percorso_15')!.startNode }
    expect(validateInteraction(item)).toBeNull()
  })
  it.each([
    { nodeId: 'absent' }, { mapId: 'absent' }, { title: '' }, { reward: { coins: -1, items: {} } },
    { reward: { coins: 1, items: { unknown: 1 } } }, { cost: { coins: .5, items: {} } },
    { requirements: { ...entry().requirements, minLevel: 101 } },
    { action: { kind: 'encounter', speciesId: 999, level: 5 } },
    { action: { kind: 'encounter', speciesId: 1, level: 4 } },
    { action: { kind: 'bush', bush: 'Z' } },
    { repeatable: true, reward: { coins: 1, items: {} } },
  ])('rifiuta valori non eseguibili: %j', (patch) => expect(validateInteraction({ ...entry(), ...patch })).not.toBeNull())
  it('rifiuta ID duplicati, prerequisiti assenti e dipendenze circolari', () => {
    expect(validateCatalog({ version: 1, interactions: [entry(), entry()] }).error).toMatch(/stesso identificatore/)
    const first = { ...entry(), requirements: { ...entry().requirements, completedInteractions: ['second-step'] } }
    expect(validateCatalog({ version: 1, interactions: [first] }).error).toMatch(/assente/)
    const second = { ...entry('second-step'), requirements: { ...entry().requirements, completedInteractions: ['first-step'] } }
    expect(validateCatalog({ version: 1, interactions: [first, second] }).error).toMatch(/ciclo/)
  })
  it('consente catene di missioni in luoghi differenti senza condividerne accidentalmente gli oggetti', () => {
    const first = entry()
    const second = { ...entry('second-step'), mapId: 'Roma', nodeId: getLocalMap('Roma')!.startNode, requirements: { ...entry().requirements, completedInteractions: [first.id] } }
    const result = validateCatalog({ version: 1, interactions: [first, second] })
    expect(result.error).toBeUndefined()
    result.catalog!.interactions[0].reward.coins = 99
    expect(first.reward.coins).toBe(0)
  })
  it('rifiuta un negozio come tappa precedente ma permette di sbloccarlo con una missione completabile', () => {
    const shop = { ...entry('shop-step'), title: 'Arkastore', repeatable: true, action: { kind: 'shop' as const } }
    const quest = { ...entry('quest-step'), requirements: { ...entry().requirements, completedInteractions: [shop.id] } }
    const before = structuredClone([shop, quest])
    expect(validateInteraction(shop)).toBeNull()
    const blocked = validateCatalog({ version: 1, interactions: [shop, quest] })
    expect(blocked.catalog).toBeUndefined()
    expect(blocked.error).toMatch(/Arkastore.*non possono essere tappe precedenti/)
    expect([shop, quest]).toEqual(before)

    const completedQuest = { ...quest, requirements: { ...quest.requirements, completedInteractions: [] } }
    const unlockedShop = { ...shop, requirements: { ...shop.requirements, completedInteractions: [completedQuest.id] } }
    expect(validateCatalog({ version: 1, interactions: [completedQuest, unlockedShop] }).error).toBeUndefined()
  })
  it.each(['dialogue', 'heal'] as const)('rifiuta il prerequisito %s ripetibile che non registra completamenti', (kind) => {
    const prerequisite = { ...entry('repeatable-step'), repeatable: true, action: { kind } }
    const dependent = { ...entry('dependent-step'), requirements: { ...entry().requirements, completedInteractions: [prerequisite.id] } }
    const before = structuredClone([prerequisite, dependent])
    expect(validateInteraction(prerequisite)).toBeNull()
    const result = validateCatalog({ version: 1, interactions: [prerequisite, dependent] })
    expect(result.catalog).toBeUndefined()
    expect(result.error).toMatch(/ripetibile.*non.*tappe precedenti/)
    expect([prerequisite, dependent]).toEqual(before)
    const legacy = validateCatalog({ version: 1, interactions: before }, { allowLegacyRepeatableRequirements: true })
    expect(legacy.catalog?.interactions).toEqual(before)
    expect(legacy.warning).toMatch(/Correggi il requisito/)
    expect(validateCatalog({ version: 1, interactions: [{ ...prerequisite, repeatable: false }, dependent] }).catalog).toBeDefined()
  })
  it('Tiled roundtrip conserva mappe, nodi e definizioni; spostare un oggetto non riscrive le strade', () => {
    const map = getLocalMap('Venezia')!
    const original = JSON.stringify(map)
    const item = entry()
    const exported = JSON.parse(exportTiledInteractions(map, [item]))
    exported.layers[1].objects[0].x = -999
    const result = importTiledInteractions(JSON.stringify(exported), [])
    expect(result.interactions).toEqual([item])
    expect(JSON.stringify(map)).toBe(original)
  })
  it('Tiled importa il luogo selezionato e conserva le configurazioni delle altre città', () => {
    const other = { ...entry('other'), mapId: 'Roma', nodeId: getLocalMap('Roma')!.startNode }
    const result = importTiledInteractions(exportTiledInteractions(getLocalMap('Venezia')!, [entry()]), [other])
    expect(result.interactions?.map((item) => item.id)).toEqual(['other', 'first-step'])
    expect(importTiledInteractions('{', []).error).toBeDefined()
  })
  it('recupera solo progressi e cronache con riferimenti validi', () => {
    const result = normalizeInteractionProgress({ completed1: ['first-step', 'first-step', 9, '<invalid>'], log1: [{ interactionId: 'first-step', title: 'Titolo', mapId: 'Venezia', nodeId: getLocalMap('Venezia')!.startNode, message: 'Testo' }, { interactionId: 'bad', title: 'X', mapId: 'absent', nodeId: 'none', message: 'X' }], pendingBattle: { interactionId: 'bad', playerId: 1, title: 'X', mapId: 'absent', nodeId: 'none', scope: 'player', reward: { coins: 1, items: {} } } })
    expect(result.completed1).toEqual(['first-step']); expect(result.log1).toHaveLength(1); expect(result.pendingBattle).toBeNull()
  })
})
