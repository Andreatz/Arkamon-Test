import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { openConfiguredShop, seedConfiguredShop } from './helpers/configuredShop'

const SAVE_KEY = 'arkamon-save'
async function fixture(page: Page, scenario: 'battle' | 'city' | 'evolution' | 'names' | 'turn' | 'item' = 'city') {
  if (scenario === 'city') await seedConfiguredShop(page)
  await page.addInitScript(({ scenario }) => {
    if (localStorage.getItem('durable-fixture')) return
    const first = { istanzaId: 'durable-one', specieId: 1, nome: 'Vyrath campagna', livello: scenario === 'evolution' ? 15 : 10, hp: 7, xp: 0,
      ...(scenario === 'item' ? {} : { stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }) }
    const final = { ...first, livello: 11, hp: 3 }
    const opponent = { istanzaId: 'durable-opponent', specieId: 13, nome: scenario === 'item' ? 'Wormaren avversario' : 'Wormaren KO', livello: 5, hp: scenario === 'item' ? 12 : 0, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: `Campagna ${id}`, squadra: scenario === 'names' ? [] : [id === 1 ? first : { ...first, istanzaId: 'durable-two', specieId: 5, nome: 'Darklaw due', stato: undefined }],
      deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: id === 1 ? 700 : 125,
      inventario: { masterball: id, ...(scenario === 'item' && id === 1 ? { potion: 2 } : {}) } })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    const campaign = { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: scenario === 'turn' ? { ...position, luogo: 'Pordenone' } : position, posizioniLocali1: { Venezia: 'n56' }, posizioniLocali2: {},
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, audioMuted: true, scenaPrecedente: { scena: 'mappa-principale' },
      scenaCorrente: scenario === 'city' || scenario === 'turn' ? { scena: 'citta', payload: { luogo: 'Venezia' } } : scenario === 'names' ? { scena: 'laboratorio' } : scenario === 'evolution'
        ? { scena: 'evoluzione', payload: { evoluzioni: [{ istanzaId: first.istanzaId, oldSpecieId: 1, newSpecieId: 2 }], luogoRitorno: 'mappa-principale', giocatoreId: 1 } }
        : { scena: 'battaglia' },
      battaglia: scenario === 'battle' || scenario === 'item' ? { tipo: 'NPC', allenatoreId: 202, pokemonA: scenario === 'item' ? first : final, pokemonB: opponent, squadraA: [scenario === 'item' ? first : final], squadraB: [opponent],
        hpMaxA: 21, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'mappa-principale', log: ['Sfida conclusa.'], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: scenario === 'item' ? 'player' : 'ended', openingComplete: true, outcome: scenario === 'item' ? null : 'vittoria', evolutions: [], rivalMessages: [] } } : null }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: campaign }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
    localStorage.setItem('durable-fixture', 'ready')
  }, { scenario })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
}

async function refusePrimary(page: Page, transitionOnly = false) {
  await page.evaluate(({ transitionOnly }) => {
    const original = Storage.prototype.setItem
    Object.assign(window, { durableAttempts: 0, durableSuccesses: 0, durableWrittenStates: [], restoreDurableStorage: () => { Storage.prototype.setItem = original },
      allowDurableStorage: () => { Object.assign(window, { durableAllow: true, durableAttempts: 0, durableSuccesses: 0, durableWrittenStates: [] }) }, durableAllow: false })
    Storage.prototype.setItem = function (key, value) {
      const fixture = window as unknown as { durableAttempts: number; durableSuccesses: number; durableAllow: boolean; durableWrittenStates: unknown[] }
      if (key === 'arkamon-save') {
        fixture.durableAttempts++
        if (!fixture.durableAllow && (!transitionOnly || JSON.parse(value).state.scenaCorrente.scena === 'mappa-principale')) {
          throw new DOMException('Durable quota fixture', 'QuotaExceededError')
        }
        fixture.durableSuccesses++
        fixture.durableWrittenStates.push(JSON.parse(value).state)
      }
      return original.call(this, key, value)
    }
  }, { transitionOnly })
}
const snapshot = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
const allow = (page: Page) => page.evaluate(() => (window as unknown as { allowDurableStorage: () => void }).allowDurableStorage())

test('finished NPC reward, residual roster and navigation wait for one successful retry', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await fixture(page, 'battle')
  const proceed = page.getByRole('button', { name: 'Prosegui', exact: true })
  await expect(proceed).toBeVisible()
  const before = await snapshot(page)
  await refusePrimary(page)
  await proceed.click()
  const failure = page.getByRole('dialog', { name: 'Salvataggio da completare', exact: true })
  await expect(failure).toBeVisible()
  expect(await snapshot(page)).toEqual(before)
  await expect(page.locator('[data-presented-scene="battaglia"]')).toBeVisible()
  await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  await expect(failure).toBeVisible()
  expect(await snapshot(page)).toEqual(before)
  await allow(page)
  await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  await expect(failure).toHaveCount(0)
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  const saved = await snapshot(page)
  expect(saved.giocatore1.monete).toBe(900)
  expect(saved.giocatore1.allenatoriSconfitti).toContain(202)
  expect(saved.giocatore1.squadra[0]).toMatchObject({ livello: 11, hp: 3, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
  expect(saved.giocatore2).toEqual(before.giocatore2)
  expect(saved.battaglia).toBeNull()
  expect(await page.evaluate(() => (window as unknown as { durableSuccesses: number }).durableSuccesses)).toBe(1)
  await page.reload()
  expect((await snapshot(page)).giocatore1).toEqual(saved.giocatore1)
  expect(errors).toEqual([])
})

test('a shop save dialog traps focus above PlayerUi and retries a purchase once', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await fixture(page, 'city')
  const shop = await openConfiguredShop(page)
  await shop.getByLabel('Quantità di Pozione', { exact: true }).fill('1')
  const before = await snapshot(page)
  const archived = await page.evaluate(async () => {
    const archivePath = '/src/components/battle/battleArchiveStore.ts', chroniclePath = '/src/components/battle/battleChronicle.ts'
    const { useBattleArchiveStore } = await import(archivePath)
    const { createBattleChronicle, appendBattleEvents } = await import(chroniclePath)
    const chronicle = appendBattleEvents(createBattleChronicle('durable-export-replay'), [{
      id: 'durable-export-replay:outcome', kind: 'outcome', title: 'Vittoria conservata', messages: ['Cronaca completa nel backup.'], winnerSide: 'A',
    }])
    useBattleArchiveStore.getState().archiveBattle({ chronicle, outcome: 'vittoria', playerId: 1, location: 'Venezia',
      battleType: 'NPC', title: 'Replay prima della quota' })
    return useBattleArchiveStore.getState().matches
  })
  expect(archived).toHaveLength(1)
  await refusePrimary(page)
  await shop.getByRole('button', { name: 'Acquista carrello', exact: true }).click()
  const failure = page.getByRole('dialog', { name: 'Salvataggio da completare', exact: true })
  await expect(failure).toBeVisible()
  expect(await snapshot(page)).toEqual(before)
  const downloaded = page.waitForEvent('download')
  await failure.getByRole('button', { name: 'Scarica progressi conservati', exact: true }).click()
  const download = await downloaded
  expect(await download.failure()).toBeNull()
  const file = await download.path()
  expect(file).not.toBeNull()
  const exported = JSON.parse(await readFile(file!, 'utf8'))
  expect(exported.campaign.giocatore1).toEqual(before.giocatore1)
  expect(exported.campaign.giocatore2).toEqual(before.giocatore2)
  expect(exported.interactionCatalog.interactions).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'ui-venezia-shop', title: 'Arkastore del punto', action: { kind: 'shop' } }),
  ]))
  expect(exported.battleArchive.matches).toEqual(archived)
  await expect(failure).toBeVisible()
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab')
    expect(await failure.evaluate(element => element.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Shift+Tab')
  expect(await failure.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await allow(page)
  await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  await expect(failure).toHaveCount(0)
  await expect(shop).toBeVisible()
  const saved = await snapshot(page)
  expect(saved.giocatore1.monete).toBe(600)
  expect(saved.giocatore1.inventario.potion).toBe(1)
  expect(saved.giocatore1.squadra).toEqual(before.giocatore1.squadra)
  expect(saved.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
  expect(await page.evaluate(() => (window as unknown as { durableSuccesses: number }).durableSuccesses)).toBe(1)
  await page.keyboard.press('Tab')
  expect(await shop.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(shop).toHaveCount(0)
  expect(errors).toEqual([])
})

test('evolution confirmation appears only after its new species is durably saved', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await fixture(page, 'evolution')
  const before = await snapshot(page)
  await refusePrimary(page)
  await page.getByRole('button', { name: '✨ Evolvi!', exact: true }).click()
  const failure = page.getByRole('dialog', { name: 'Salvataggio da completare', exact: true })
  await expect(failure).toBeVisible()
  expect(await snapshot(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Fine', exact: true })).toHaveCount(0)
  await allow(page)
  await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  await expect(failure).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Fine', exact: true })).toBeVisible()
  const evolved = await snapshot(page)
  expect(evolved.giocatore1.squadra[0]).toMatchObject({ specieId: 2, livello: 15, hp: 7, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
  expect(evolved.giocatore2).toEqual(before.giocatore2)
  expect(await page.evaluate(() => (window as unknown as { durableSuccesses: number }).durableSuccesses)).toBe(1)
  await page.getByRole('button', { name: 'Fine', exact: true }).click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  await page.reload()
  expect((await snapshot(page)).giocatore1.squadra[0]).toEqual(evolved.giocatore1.squadra[0])
  expect(errors).toEqual([])
})

test('corrupt primary data offers an automatic copy preview and waits for explicit confirmation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await fixture(page, 'city')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.posizioniLocali2.Venezia)).toBe('n56')
  const previous = await snapshot(page)
  // Install corruption before the next game's hydration. A mounted city's
  // delayed position checkpoint must not overwrite this test-only fixture.
  await page.addInitScript((campaign) => {
    if (localStorage.getItem('durable-corrupt-primary-fixture')) return
    const backup = JSON.stringify({ format: 'arkamon-campaign-backup', version: 1, saveSchemaVersion: 1,
      createdAt: '2026-10-12T12:00:00Z', campaign })
    localStorage.setItem('arkamon-automatic-backups-v1', JSON.stringify({ version: 1,
      copies: [{ createdAt: '2026-10-12T12:00:00Z', backup }] }))
    localStorage.setItem('arkamon-save', '{corrupt-primary')
    localStorage.setItem('durable-corrupt-primary-fixture', 'ready')
  }, previous)
  await page.reload()
  await expect(page.getByText('Alcuni dati del salvataggio sono stati recuperati. Controlla gli avvisi prima di continuare.', { exact: true })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY)).toBe('{corrupt-primary')
  await page.getByRole('button', { name: 'Mostra dettagli', exact: true }).click()
  const backup = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await backup.getByRole('button', { name: 'Controlla copia automatica 1', exact: true }).click()
  await expect(backup.getByLabel('Anteprima ripristino', { exact: true })).toBeVisible()
  await expect(backup.getByRole('button', { name: 'Ripristina questa partita', exact: true })).toBeDisabled()
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY)).toBe('{corrupt-primary')
  await backup.getByRole('checkbox', { name: /Confermo la sostituzione/ }).check()
  await backup.getByRole('button', { name: 'Ripristina questa partita', exact: true }).click()
  const restored = await snapshot(page)
  expect(restored.giocatore1).toEqual(previous.giocatore1)
  expect(restored.giocatore2).toEqual(previous.giocatore2)
  expect(errors).toEqual([])
})

test('both player names remain pending and the starter choice appears only after one successful retry', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await fixture(page, 'names')
  const nameOne = page.getByLabel('Giocatore 1', { exact: true }), nameTwo = page.getByLabel('Giocatore 2', { exact: true })
  await nameOne.fill('Ada durable')
  await nameTwo.fill('Bruno durable')
  const before = await snapshot(page)
  await refusePrimary(page)
  await page.getByRole('button', { name: 'Continua', exact: true }).click()
  const failure = page.getByRole('dialog', { name: 'Salvataggio da completare', exact: true })
  await expect(failure).toBeVisible()
  expect(await snapshot(page)).toEqual(before)
  await expect(nameOne).toBeVisible()
  await expect(nameTwo).toBeVisible()
  const starterPrompt = page.getByText('Ada durable, scegli il tuo Starter.', { exact: true })
  await expect(starterPrompt).toHaveCount(0)
  await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  expect(await snapshot(page)).toEqual(before)
  await expect(starterPrompt).toHaveCount(0)
  await allow(page)
  await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  await expect(failure).toHaveCount(0)
  await expect(starterPrompt).toBeVisible()
  const saved = await snapshot(page)
  expect(saved.giocatore1.nome).toBe('Ada durable')
  expect(saved.giocatore2.nome).toBe('Bruno durable')
  expect(saved.giocatore1.squadra).toEqual([])
  expect(saved.giocatore2.squadra).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { durableSuccesses: number }).durableSuccesses)).toBe(1)
  expect(errors).toEqual([])
})

for (const transitionOnly of [false, true]) {
  test('passing from G1 Venezia to G2 Pordenone remains atomic when ' + (transitionOnly ? 'the navigation checkpoint is refused' : 'the first write is refused'), async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await fixture(page, 'turn')
    const before = await snapshot(page)
    expect(before.giocatoreAttivo).toBe(1)
    expect(before.posizione1.luogo).toBe('Venezia')
    expect(before.posizione2.luogo).toBe('Pordenone')
    await refusePrimary(page, transitionOnly)
    await page.getByRole('button', { name: 'Passa turno', exact: true }).click()
    const failure = page.getByRole('dialog', { name: 'Salvataggio da completare', exact: true })
    await expect(failure).toBeVisible()
    expect(await snapshot(page)).toEqual(before)
    await expect(page.getByRole('region', { name: 'Esplorazione Venezia', exact: true })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { durableSuccesses: number }).durableSuccesses)).toBe(0)
    await allow(page)
    await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
    await expect(failure).toHaveCount(0)
    await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
    const saved = await snapshot(page)
    expect(saved.giocatoreAttivo).toBe(2)
    expect(saved.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    expect(saved.posizione1).toEqual(before.posizione1)
    expect(saved.posizione2).toEqual(before.posizione2)
    expect(saved.giocatore1).toEqual(before.giocatore1)
    expect(saved.giocatore2).toEqual(before.giocatore2)
    expect(await page.evaluate(() => (window as unknown as { durableSuccesses: number }).durableSuccesses)).toBe(1)
    await page.reload()
    expect((await snapshot(page)).giocatoreAttivo).toBe(2)
    expect((await snapshot(page)).turnoOverworld).toEqual(saved.turnoOverworld)
    expect(errors).toEqual([])
  })
}

test('a refused battle Potion retains its original retry and restores HP, inventory and enemy turn together', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await fixture(page, 'item')
  await expect(page.getByRole('button', { name: 'Borsa', exact: true })).toBeEnabled()
  const before = await snapshot(page)
  const expected = await page.evaluate(async () => {
    const effectsPath = '/src/shop/itemEffects.ts'
    const { resolveItemEffect } = await import(effectsPath)
    const battle = JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia
    return resolveItemEffect(battle.pokemonA, 'potion').pokemon
  })
  expect(expected.hp).toBeGreaterThan(before.battaglia.pokemonA.hp)
  await refusePrimary(page)
  await page.getByRole('button', { name: 'Borsa', exact: true }).click()
  const bag = page.getByRole('dialog', { name: 'Borsa in battaglia', exact: true })
  await bag.getByRole('button', { name: 'Usa Pozione', exact: true }).click()
  const failure = page.getByRole('dialog', { name: 'Salvataggio da completare', exact: true })
  await expect(failure).toBeVisible()
  expect(await snapshot(page)).toEqual(before)
  const pending = await page.evaluate(async () => {
    const statusPath = '/src/save/durableWrites.ts'
    const { useSaveWriteStatus } = await import(statusPath)
    const retry = useSaveWriteStatus.getState().retry
    Object.assign(window, { durableItemRetry: retry })
    return Boolean(retry)
  })
  expect(pending).toBe(true)
  // Reproduce the later settled checkpoint that previously replaced the item.
  const unchangedRetry = await page.evaluate(async () => {
    const statusPath = '/src/save/durableWrites.ts', storePath = '/src/store/gameStore.ts'
    const { useSaveWriteStatus } = await import(statusPath)
    const { useGameStore } = await import(storePath)
    useGameStore.getState().aggiornaBattaglia({ log: ['Checkpoint automatico tardivo da ignorare'] })
    return useSaveWriteStatus.getState().retry === (window as unknown as { durableItemRetry: unknown }).durableItemRetry
  })
  expect(unchangedRetry).toBe(true)
  expect(await snapshot(page)).toEqual(before)
  await allow(page)
  await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  await expect(failure).toHaveCount(0)
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: /^Avversario$/i })).toBeVisible()
  const saved = await snapshot(page)
  expect(saved.giocatore1.inventario.potion).toBe(1)
  expect(saved.battaglia.pokemonA.hp).toBe(expected.hp)
  expect(saved.battaglia.squadraA[0].hp).toBe(expected.hp)
  expect(saved.battaglia.turnoCorrente).toBe('B')
  expect(saved.battaglia.checkpoint.phase).toBe('opponent')
  expect(saved.battaglia.cronaca.events.filter((event: { kind: string }) => event.kind === 'heal')).toHaveLength(1)
  expect(saved.giocatore2).toEqual(before.giocatore2)
  await expect(page.locator('[data-battle-hp-side="player"]')).toHaveAttribute('data-battle-hp', String(expected.hp))
  const writes = await page.evaluate(() => (window as unknown as { durableWrittenStates: { battaglia: unknown }[] }).durableWrittenStates.map(state => state.battaglia))
  if (writes.length !== 1) console.log('Potion retry checkpoint writes:', JSON.stringify(writes))
  expect(await page.evaluate(() => (window as unknown as { durableSuccesses: number }).durableSuccesses)).toBe(1)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Avversario$/i })).toBeVisible()
  await expect(page.locator('[data-battle-hp-side="player"]')).toHaveAttribute('data-battle-hp', String(expected.hp))
  const reloaded = await snapshot(page)
  expect(reloaded.giocatore1.inventario.potion).toBe(1)
  expect(reloaded.battaglia.pokemonA.hp).toBe(expected.hp)
  expect(reloaded.battaglia.checkpoint.phase).toBe('opponent')
  expect(errors).toEqual([])
})
