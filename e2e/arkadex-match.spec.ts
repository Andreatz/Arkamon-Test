import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

async function openTools(page: Page, tab: 'Arkadex' | 'Registro del match') {
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await dialog.getByRole('button', { name: tab === 'Registro del match' ? 'Apri Registro' : tab, exact: true }).click()
  return dialog
}

async function startCampaign(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Nuova Partita', exact: true }).click()
  await expect(page.locator('[data-presented-scene="laboratorio"]')).toHaveAttribute('aria-busy', 'false')
  await page.getByLabel('Giocatore 1', { exact: true }).fill('Dex Uno')
  await page.getByLabel('Giocatore 2', { exact: true }).fill('Dex Due')
  await page.getByRole('button', { name: 'Continua', exact: true }).click()
  await page.getByRole('button', { name: /Vyrath/ }).click()
  await page.getByRole('button', { name: /Darklaw/ }).click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
}

async function battleFixture(page: Page, fixture: 'battle' | 'evolution' | 'final-stage' = 'battle') {
  await page.addInitScript(({ fixture }) => {
    if (localStorage.getItem('e2e-arkadex-fixture')) return
    const evolution = fixture === 'evolution'
    const finalStageOnly = fixture === 'final-stage'
    const attacker = finalStageOnly
      ? { istanzaId: 'final-only', specieId: 4, nome: 'Vyrath finale', livello: 100, hp: 1, xp: 0 }
      : { istanzaId: 'arkadex-a', specieId: 1, nome: 'Vyrath Dex', livello: evolution ? 14 : 10, hp: evolution ? 1 : 10, xp: 0 }
    const defender = { istanzaId: 'arkadex-b', specieId: 13, nome: 'Wormaren Dex', livello: 5, hp: evolution ? 1 : 4, xp: 0 }
    const secondStarter = { istanzaId: 'arkadex-player2', specieId: 5, nome: 'Darklaw Dex', livello: 5, hp: 12, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: `Dex ${id}`, squadra: id === 1 ? [attacker] : [secondStarter], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], monete: 0, inventario: { masterball: 1 }, caselleConsumate: [] })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
      scenaCorrente: finalStageOnly ? { scena: 'citta', payload: { luogo: 'Venezia' } } : { scena: 'battaglia' }, scenaPrecedente: { scena: 'mappa-principale' },
      arkadex: { seen1: [attacker.specieId], seen2: [5], caught1: [attacker.specieId], caught2: [5] },
      matchLog: { version: 1, nextSequence: 1, events: [] },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: finalStageOnly ? null : { tipo: 'Selvatico', pokemonA: attacker, pokemonB: defender, squadraA: [attacker], squadraB: [defender], hpMaxA: evolution ? 25 : 19, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'mappa-principale', log: ['Incontro per verifica Arkadex.'], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'player', openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] },
      },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
    localStorage.setItem('e2e-arkadex-fixture', 'seeded')
  }, { fixture })
  await page.goto('/')
  const scene = fixture === 'final-stage' ? 'citta:Venezia' : 'battaglia'
  await expect(page.locator(`[data-presented-scene="${scene}"]`)).toHaveAttribute('aria-busy', 'false')
}

test('Arkadex keeps starter discoveries personal, locks unknown search and is accessible', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await startCampaign(page)
  const dialog = await openTools(page, 'Arkadex')
  const dex = dialog.getByRole('region', { name: 'Arkadex', exact: true })
  await expect(dex).toContainText('1 / 110 viste · 1 / 110 ottenute')
  await expect(dex.getByRole('button', { name: 'Numero 1: Vyrath · Ottenuto', exact: true })).toBeVisible()
  await expect(dex.getByRole('button', { name: 'Numero 5: specie da scoprire · Da scoprire', exact: true })).toBeVisible()
  await dex.getByLabel('Cerca specie scoperta o numero').fill('Voider')
  await expect(dex.getByRole('status')).toContainText('0 schede')
  await expect(dex.getByRole('button', { name: /Numero 110:/ })).toHaveCount(0)
  await dex.getByLabel('Cerca specie scoperta o numero').fill('#110')
  await dex.getByRole('button', { name: 'Numero 110: specie da scoprire · Da scoprire', exact: true }).click()
  await expect(dex.getByRole('article', { name: 'Scheda da scoprire', exact: true })).toContainText('Specie da scoprire')
  await expect(dex).not.toContainText('Voider')
  await dex.getByLabel('Cerca specie scoperta o numero').fill('')
  await page.getByRole('group', { name: 'Giocatore degli strumenti', exact: true }).getByRole('button').nth(1).click()
  await expect(dex.getByRole('button', { name: 'Numero 5: Darklaw · Ottenuto', exact: true })).toBeVisible()
  await expect(dex.getByRole('button', { name: 'Numero 1: specie da scoprire · Da scoprire', exact: true })).toBeVisible()
  await dex.getByLabel('Cerca specie scoperta o numero').fill('Darklaw')
  await expect(dex.getByRole('article', { name: 'Scheda di Darklaw', exact: true })).toContainText('livello 5')
  expect((await new AxeBuilder({ page }).include('[data-game-dialog]').analyze()).violations).toEqual([])
  await test.info().attach('Arkadex personale', { body: await page.screenshot(), contentType: 'image/png' })
  await page.keyboard.press('Escape'); await page.reload()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(saved.arkadex.caught1).toEqual([1]); expect(saved.arkadex.caught2).toEqual([5])
  expect(errors).toEqual([])
})

test('match register records actual campaign start and starters and exports the selected player', async ({ page }) => {
  await startCampaign(page)
  const dialog = await openTools(page, 'Registro del match')
  const register = dialog.getByRole('region', { name: 'Registro del match', exact: true })
  // The tools window opens the register for its selected player; the campaign view is explicit.
  await expect(register.getByRole('combobox', { name: 'Giocatore del registro', exact: true })).toHaveValue('1')
  await expect(register).toContainText('Dex Uno sceglie Vyrath')
  await expect(register.locator('.match-events')).not.toContainText('Dex Due sceglie Darklaw')
  await register.getByRole('combobox', { name: 'Giocatore del registro', exact: true }).selectOption('all')
  await expect(register).toContainText('Dex Due sceglie Darklaw')
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.matchLog)
  expect(initial.events.filter((event: { kind: string }) => event.kind === 'start')).toHaveLength(1)
  expect(initial.events.filter((event: { kind: string }) => event.kind === 'starter')).toHaveLength(2)
  await register.getByLabel('Giocatore del registro').selectOption('2')
  await register.getByLabel('Tipo di evento').selectOption('starter')
  await expect(register.locator('.match-events > li')).toHaveCount(1)
  await expect(register.locator('.match-events')).not.toContainText('Dex Uno')
  const downloadPromise = page.waitForEvent('download')
  await register.getByRole('button', { name: 'Esporta registro JSON', exact: true }).click()
  const download = await downloadPromise
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported.format).toBe('arkamon-match-register')
  expect(exported.events).toHaveLength(1)
  expect(exported.events[0]).toMatchObject({ kind: 'starter', playerId: 2, speciesId: 5 })
  const textPromise = page.waitForEvent('download')
  await register.getByRole('button', { name: 'Esporta registro testo', exact: true }).click()
  const text = await readFile((await (await textPromise).path())!, 'utf8')
  expect(text).toContain('Giocatore 2'); expect(text).toContain('Dex Due sceglie Darklaw'); expect(text).not.toContain('Dex Uno')
  expect((await new AxeBuilder({ page }).include('[data-game-dialog]').analyze()).violations).toEqual([])
  await test.info().attach('Registro della campagna', { body: await page.screenshot(), contentType: 'image/png' })
  await page.keyboard.press('Escape'); await page.reload()
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.matchLog)
  expect(resumed.events).toEqual(initial.events)
})

test('Masterball capture records one event, persists discovered species and leaves G2 locked', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await battleFixture(page)
  await page.getByRole('button', { name: 'Masterball x1', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  const captured = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(captured.arkadex.caught1).toEqual([1, 13]); expect(captured.arkadex.caught2).toEqual([5])
  expect(captured.giocatore1.inventario.masterball).toBe(0)
  expect(captured.giocatore1.squadra.find((pokemon: { specieId: number }) => pokemon.specieId === 13)).toMatchObject({ livello: 5, hp: 4 })
  expect(captured.matchLog.events.filter((event: { kind: string }) => event.kind === 'capture')).toHaveLength(1)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(resumed.matchLog.events.filter((event: { kind: string }) => event.kind === 'capture')).toHaveLength(1)
  expect(resumed.giocatore1.inventario.masterball).toBe(0)
  await page.getByRole('button', { name: 'Prosegui', exact: true }).click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  const dialog = await openTools(page, 'Arkadex')
  const dex = dialog.getByRole('region', { name: 'Arkadex', exact: true })
  await expect(dex).toContainText('2 / 110 viste · 2 / 110 ottenute')
  await dex.getByLabel('Cerca specie scoperta o numero').fill('#13')
  await expect(dex.getByRole('button', { name: 'Numero 13: Wormaren · Ottenuto', exact: true })).toBeVisible()
  await expect(dex.getByRole('article', { name: 'Scheda di Wormaren', exact: true })).toContainText('livello 5')
  await page.getByRole('group', { name: 'Giocatore degli strumenti', exact: true }).getByRole('button').nth(1).click()
  await expect(dex).toContainText('1 / 110 viste · 1 / 110 ottenute')
  await dex.getByLabel('Cerca specie scoperta o numero').fill('#13')
  await expect(dex.getByRole('button', { name: 'Numero 13: specie da scoprire · Da scoprire', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Menù Partita', exact: true }).click()
  await dialog.getByRole('button', { name: 'Apri Registro', exact: true }).click()
  const register = dialog.getByRole('region', { name: 'Registro del match', exact: true })
  await expect(register.getByRole('combobox', { name: 'Giocatore del registro', exact: true })).toHaveValue('2')
  await register.getByLabel('Tipo di evento').selectOption('capture')
  await expect(register.locator('.match-events > li')).toHaveCount(0)
  await register.getByRole('combobox', { name: 'Giocatore del registro', exact: true }).selectOption('1')
  await expect(register.locator('.match-events > li')).toHaveCount(1)
  await expect(register.locator('.match-events')).toContainText('Wormaren Dex entra nella collezione')
  expect(errors).toEqual([])
})

test('a real battle evolution retains both obtained stages and logs the change once', async ({ page }) => {
  await battleFixture(page, 'evolution')
  await page.getByRole('button', { name: /Soffio/ }).click()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Prosegui', exact: true }).click()
  await expect(page.locator('[data-presented-scene="evoluzione"]')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: /Evolvi!/ }).click()
  await page.getByRole('button', { name: 'Fine', exact: true }).click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  const evolved = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(evolved.giocatore1.squadra[0]).toMatchObject({ specieId: 2, livello: 15, hp: 1 })
  expect(evolved.arkadex.caught1).toEqual([1, 2]); expect(evolved.arkadex.caught2).toEqual([5])
  expect(evolved.matchLog.events.filter((event: { kind: string }) => event.kind === 'evolution')).toHaveLength(1)
  await page.reload()
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(resumed.matchLog.events.filter((event: { kind: string }) => event.kind === 'evolution')).toHaveLength(1)
  const dialog = await openTools(page, 'Arkadex')
  const dex = dialog.getByRole('region', { name: 'Arkadex', exact: true })
  await dex.getByRole('combobox', { name: 'Scoperta', exact: true }).selectOption('caught')
  await expect(dex.getByRole('button', { name: 'Numero 1: Vyrath · Ottenuto', exact: true })).toBeVisible()
  await expect(dex.getByRole('button', { name: 'Numero 2: Vyrath · Ottenuto', exact: true })).toBeVisible()
  await dex.getByRole('button', { name: 'Numero 2: Vyrath · Ottenuto', exact: true }).click()
  await expect(dex.getByRole('article', { name: 'Scheda di Vyrath', exact: true })).toContainText('livello 15')
  await dex.getByRole('navigation', { name: 'Sezioni della scheda Arkadex', exact: true }).getByRole('button', { name: 'Evoluzioni', exact: true }).click()
  const steps = dex.locator('.pu-evolution-step')
  await expect(steps).toHaveCount(4)
  await expect(steps.nth(0).locator('strong')).toHaveText('Vyrath')
  await expect(steps.nth(1).locator('strong')).toHaveText('Vyrath')
  await expect(steps.nth(2).locator('strong')).toHaveText('Da scoprire')
  await expect(steps.nth(3).locator('strong')).toHaveText('Da scoprire')
  await expect(steps.nth(3).locator('small')).toHaveText('Da scoprire')
  await expect(steps.nth(2).locator('img')).toHaveCount(0)
  await expect(steps.nth(3).locator('img')).toHaveCount(0)
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state))).toEqual(resumed)
})

test('the evolution tab conceals all thresholds and artwork of undiscovered ancestors', async ({ page }) => {
  // Seed before mounting: a live battle's delayed checkpoint must not race the
  // test's final-stage-only collection. Reload still verifies persistence.
  await battleFixture(page, 'final-stage')
  await page.reload()
  await expect(page.locator('[data-presented-scene="citta:Venezia"]')).toHaveAttribute('aria-busy', 'false')
  // The scene module loads on demand; wait for its initialization, then verify
  // that browsing the encyclopedia introduces no additional campaign writes.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.posizioniLocali1.Venezia)).toBe('n56')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.posizioniLocali2.Venezia)).toBe('n56')
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  const dialog = await openTools(page, 'Arkadex')
  const dex = dialog.getByRole('region', { name: 'Arkadex', exact: true })
  await dex.getByRole('button', { name: 'Numero 4: Vyrath · Ottenuto', exact: true }).click()
  await dex.getByRole('navigation', { name: 'Sezioni della scheda Arkadex', exact: true }).getByRole('button', { name: 'Evoluzioni', exact: true }).click()
  await expect(dex.getByRole('heading', { name: 'Linea evolutiva', exact: true })).toBeVisible()
  const steps = dex.locator('.pu-evolution-step')
  await expect(steps).toHaveCount(4)
  for (let index = 0; index < 3; index++) {
    await expect(steps.nth(index).locator('strong')).toHaveText('Da scoprire')
    await expect(steps.nth(index).locator('img')).toHaveCount(0)
  }
  await expect(steps.nth(3).locator('strong')).toHaveText('Vyrath')
  for (let index = 1; index < 4; index++) await expect(steps.nth(index).locator('small')).toHaveText('Da scoprire')
  await expect(dex.locator('.pu-evolution')).not.toContainText('Lv.')
  await expect(dex.locator('.pu-evolution-step.is-current')).toHaveCount(1)
  await page.getByRole('group', { name: 'Giocatore degli strumenti', exact: true }).getByRole('button').nth(1).click()
  await dex.getByRole('button', { name: 'Numero 4: specie da scoprire · Da scoprire', exact: true }).click()
  await expect(dex.getByRole('article', { name: 'Scheda da scoprire', exact: true })).toBeVisible()
  await expect(dex.locator('.pu-evolution')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)).toEqual(before)
})
