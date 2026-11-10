import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { seedConfiguredShop, openConfiguredShop } from './helpers/configuredShop'

const sceneSelector = '[data-presented-scene="citta:Venezia"]'

async function readCampaign(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
}

async function seedCityCampaign(page: Page) {
  await seedConfiguredShop(page)
  // A portable fixture prepares the location; every purchase and item use below goes through the real UI.
  await page.addInitScript(() => {
    if (localStorage.getItem('arkamon-save')) return
    const pokemon = (id: string, speciesId: number, name: string, hp: number) => ({ istanzaId: id, specieId: speciesId, nome: name, livello: 5, xp: 0, hp })
    const player = (id: 1 | 2) => ({
      id, nome: id === 1 ? 'Cliente Uno' : 'Cliente Due',
      squadra: id === 1 ? [{ ...pokemon('shop-player-one', 1, 'Vyrath', 3), stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }] : [pokemon('shop-player-two', 5, 'Darklaw', 8)],
      deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [],
      monete: id === 1 ? 300 : 40, inventario: { masterball: id === 1 ? 1 : 4 },
    })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, battaglia: null, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: { Venezia: 'n56' }, posizioniLocali2: { Venezia: 'n56' },
      scenaCorrente: { scena: 'citta', payload: { luogo: 'Venezia' } }, scenaPrecedente: { scena: 'mappa-principale' },
      audioMuted: true, interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on',
    } }))
  })
  await page.goto('/')
  await expect(page.locator(sceneSelector)).toHaveAttribute('aria-busy', 'false')
}

async function returnControlToPlayerOne(page: Page) {
  const scene = page.locator(sceneSelector)
  // Checkout leaves G1 presenting the city while the next overworld turn belongs to G2.
  await scene.getByRole('button', { name: 'Passa turno', exact: true }).click()
  await expect.poll(async () => (await readCampaign(page)).giocatoreAttivo).toBe(2)
  await scene.getByRole('button', { name: 'Passa turno', exact: true }).click()
  await expect.poll(async () => (await readCampaign(page)).giocatoreAttivo).toBe(1)
  await expect.poll(async () => (await readCampaign(page)).turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
}

async function openBag(page: Page) {
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita' })
  await dialog.getByRole('button', { name: 'Borsa', exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Borsa degli oggetti' })).toBeVisible()
  return dialog
}

test('Arkastore checkout and explicit item cures persist without changing the other player', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await seedCityCampaign(page)
  const playerTwoBefore = (await readCampaign(page)).giocatore2

  await openConfiguredShop(page)
  const shop = page.getByRole('region', { name: 'Arkastore di Venezia' })
  await expect(shop).toBeVisible()

  // An unaffordable cart never charges anything and cannot consume the interaction.
  await shop.getByRole('button', { name: 'Seleziona Masterball', exact: true }).click()
  await shop.getByLabel('Quantità di Masterball', { exact: true }).fill('1')
  await expect(shop).toContainText('Ti mancano 1200 monete.')
  await expect(shop.getByRole('button', { name: 'Acquista carrello', exact: true })).toBeDisabled()
  let saved = await readCampaign(page)
  expect(saved.giocatore1.monete).toBe(300)
  expect(saved.giocatore1.squadra[0].hp).toBe(3)
  expect(saved.giocatore1.squadra[0].stato.tipo).toBe('Paralizzato')
  expect(saved.turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
  await shop.getByRole('button', { name: 'Svuota carrello', exact: true }).click()

  await shop.getByRole('button', { name: 'Seleziona Pozione', exact: true }).click()
  await shop.getByLabel('Quantità di Pozione', { exact: true }).fill('1')
  await shop.getByRole('button', { name: 'Seleziona Antiparalisi', exact: true }).click()
  await shop.getByLabel('Quantità di Antiparalisi', { exact: true }).fill('1')
  await expect(shop).toContainText('Carrello: 2 oggetti · 180 ₳')
  const shopA11y = await new AxeBuilder({ page }).include('.arka-store').analyze()
  expect(shopA11y.violations).toEqual([])
  await test.info().attach('Arkastore e carrello prima dell’acquisto', { body: await page.screenshot(), contentType: 'image/png' })
  await shop.getByRole('button', { name: 'Acquista carrello', exact: true }).click()
  await expect.poll(async () => (await readCampaign(page)).giocatore1.monete).toBe(120)
  saved = await readCampaign(page)
  expect(saved.giocatore1.inventario).toMatchObject({ potion: 1, 'paralysis-heal': 1, masterball: 1 })
  expect(saved.giocatore1.squadra[0]).toMatchObject({ hp: 3, livello: 5, xp: 0, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
  expect(saved.giocatore2).toEqual(playerTwoBefore)
  expect(saved.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })

  await page.reload()
  await expect(page.locator(sceneSelector)).toHaveAttribute('aria-busy', 'false')
  saved = await readCampaign(page)
  expect(saved.giocatore1.monete).toBe(120)
  expect(saved.giocatore1.inventario['paralysis-heal']).toBe(1)
  expect(saved.giocatore1.squadra[0].stato.tipo).toBe('Paralizzato')
  expect(saved.giocatore2).toEqual(playerTwoBefore)
  await returnControlToPlayerOne(page)

  let bag = await openBag(page)
  await expect(bag.getByLabel('Arkamon da curare')).toHaveValue('shop-player-one')
  await bag.getByRole('button', { name: 'Masterball: 1 disponibili', exact: true }).click()
  await expect(bag.getByRole('button', { name: 'Usa Masterball', exact: true })).toBeDisabled()
  await bag.getByRole('button', { name: 'Antiparalisi: 1 disponibili', exact: true }).click()
  const bagA11y = await new AxeBuilder({ page }).include('.arka-item-bag').analyze()
  expect(bagA11y.violations).toEqual([])
  await test.info().attach('Borsa e cura esplicita della paralisi', { body: await page.screenshot(), contentType: 'image/png' })
  await bag.getByRole('button', { name: 'Usa Antiparalisi', exact: true }).click()
  await expect.poll(async () => (await readCampaign(page)).giocatore1.inventario['paralysis-heal']).toBe(0)
  saved = await readCampaign(page)
  expect(saved.giocatore1.squadra[0].stato).toBeUndefined()
  expect(saved.giocatore1.squadra[0].hp).toBe(3)
  expect(saved.giocatore1.monete).toBe(120)
  expect(saved.giocatore1.inventario.potion).toBe(1)
  expect(saved.giocatore2).toEqual(playerTwoBefore)
  expect(saved.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
  await expect(bag.getByRole('button', { name: 'Usa Pozione', exact: true })).toBeDisabled()

  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator(sceneSelector)).toHaveAttribute('aria-busy', 'false')
  expect((await readCampaign(page)).giocatore1.squadra[0].stato).toBeUndefined()
  await returnControlToPlayerOne(page)
  bag = await openBag(page)
  await bag.getByRole('button', { name: 'Pozione: 1 disponibili', exact: true }).click()
  await bag.getByRole('button', { name: 'Usa Pozione', exact: true }).click()
  await expect.poll(async () => (await readCampaign(page)).giocatore1.squadra[0].hp).toBe(6)
  saved = await readCampaign(page)
  expect(saved.giocatore1.inventario.potion).toBe(0)
  expect(saved.giocatore1.squadra[0].stato).toBeUndefined()
  expect(saved.giocatore1.squadra[0].livello).toBe(5)
  expect(saved.giocatore2).toEqual(playerTwoBefore)
  expect(saved.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator(sceneSelector)).toHaveAttribute('aria-busy', 'false')
  expect((await readCampaign(page)).giocatore1.squadra[0].hp).toBe(6)
  expect((await readCampaign(page)).giocatore1.inventario.potion).toBe(0)
  expect(errors).toEqual([])
})

test('the map editor assigns an Arkastore to a point and the authored access survives reload', async ({ page }) => {
  await seedCityCampaign(page)
  // Author a new shop through the editor, rather than relying on the prepared catalog.
  await page.evaluate(() => localStorage.setItem('arkamon-interactions-v1', JSON.stringify({ version: 0, state: { interactions: [] } })))
  await page.reload()
  await expect(page.locator(sceneSelector)).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await page.getByRole('button', { name: 'Interazioni', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Editor delle interazioni' })
  await editor.getByRole('combobox', { name: 'Pallino', exact: true }).selectOption('n56')
  await editor.getByLabel('Titolo', { exact: true }).fill('Arkastore configurato dalla regia')
  await editor.getByRole('combobox', { name: 'Attività', exact: true }).selectOption('shop')
  await expect(editor.getByRole('checkbox', { name: /^Ripetibile/ })).toBeChecked()
  await expect(editor.getByLabel('Monete da spendere', { exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Salva interazione', exact: true }).click()
  await expect(editor.getByRole('status')).toHaveText('Interazione salvata.')
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click()
  await page.reload()
  await expect(page.locator(sceneSelector)).toHaveAttribute('aria-busy', 'false')
  const before = await readCampaign(page)
  const dialog = await openConfiguredShop(page)
  expect(await readCampaign(page)).toEqual(before)
  await expect(dialog.getByRole('button', { name: 'Negozio', exact: true })).toHaveCount(0)
  await dialog.getByLabel('Quantità di Pozione', { exact: true }).fill('1')
  await dialog.getByRole('button', { name: 'Acquista carrello', exact: true }).click()
  await expect.poll(async () => (await readCampaign(page)).giocatore1.monete).toBe(200)
  expect((await readCampaign(page)).giocatore2).toEqual(before.giocatore2)
  await dialog.getByRole('button', { name: 'Riprendi il Viaggio', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Interazioni del punto', exact: true })).toBeHidden()
})

test('a battle item heals once, consumes the move and resumes at the opponent turn after reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('arkamon-save')) return
    const attacker = { istanzaId: 'battle-bag-one', specieId: 1, nome: 'Vyrath Borsa', livello: 5, xp: 0, hp: 3 }
    const opponent = { istanzaId: 'battle-bag-enemy', specieId: 13, nome: 'Wormaren Rivale', livello: 5, xp: 0, hp: 12 }
    const player = (id: 1 | 2) => ({ id, nome: `Borsa ${id}`, squadra: id === 1 ? [attacker] : [], deposito: {},
      cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 300,
      inventario: id === 1 ? { potion: 1 } : { masterball: 1 },
    })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: { Venezia: 'n56' }, posizioniLocali2: {}, audioMuted: true,
      scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'citta', payload: { luogo: 'Venezia' } },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: { tipo: 'NPC', allenatoreId: 202, pokemonA: attacker, pokemonB: opponent,
        squadraA: [attacker], squadraB: [opponent], hpMaxA: 12, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Venezia',
        log: ['Battaglia di verifica della borsa.'], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'player', openingComplete: true,
          outcome: null, evolutions: [], rivalMessages: [] },
      },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on',
    } }))
  })
  await page.goto('/')
  const battleScene = page.locator('[data-presented-scene="battaglia"]')
  await expect(battleScene).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('[data-battle-hp-side="player"]')).toHaveAttribute('data-battle-hp', '3')
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '12')
  await battleScene.getByRole('button', { name: 'Borsa', exact: true }).click()
  const bag = page.getByRole('dialog', { name: 'Borsa in battaglia' })
  await expect(bag).toBeVisible()
  const target = bag.getByRole('group', { name: 'Arkamon da curare', exact: true }).getByRole('button', { name: 'Vyrath Borsa Lv. 5 · 3/12 HP', exact: true })
  await expect(target).toHaveAttribute('aria-pressed', 'true')
  await target.click()
  await expect(target).toHaveAttribute('aria-pressed', 'true')
  await expect(bag.getByRole('status')).toContainText('Vyrath Borsa · 3 → 6 HP')
  const a11y = await new AxeBuilder({ page }).include('[data-game-dialog]').analyze()
  expect(a11y.violations).toEqual([])
  await test.info().attach('Borsa durante il turno di battaglia', { body: await page.screenshot(), contentType: 'image/png' })
  await bag.getByRole('button', { name: 'Usa Pozione', exact: true }).click()
  await expect(bag).toHaveCount(0)
  await expect(page.locator('[data-battle-hp-side="player"]')).toHaveAttribute('data-battle-hp', '6')
  await expect(battleScene.getByRole('button', { name: 'AVVERSARIO', exact: true })).toBeVisible()
  await expect(battleScene.getByRole('button', { name: 'Borsa', exact: true })).toBeDisabled()
  await expect.poll(async () => (await readCampaign(page)).battaglia.checkpoint.phase).toBe('opponent')
  const saved = await readCampaign(page)
  expect(saved.giocatore1.inventario.potion).toBe(0)
  expect(saved.battaglia.pokemonA.hp).toBe(6)
  expect(saved.battaglia.pokemonB.hp).toBe(12)
  expect(saved.battaglia.turnoCorrente).toBe('B')
  expect(saved.battaglia.checkpoint.actedThisRound).toEqual(['A'])
  expect(saved.battaglia.cronaca.events.filter((event: { kind: string }) => event.kind === 'heal')).toEqual([
    expect.objectContaining({ kind: 'heal', side: 'A', hpBefore: 3, hpAfter: 6, title: 'Pozione su Vyrath Borsa' }),
  ])
  await page.reload()
  await expect(battleScene).toHaveAttribute('aria-busy', 'false')
  await expect(battleScene.getByRole('button', { name: 'AVVERSARIO', exact: true })).toBeVisible()
  await expect(battleScene.getByRole('button', { name: 'Borsa', exact: true })).toBeDisabled()
  await expect(page.locator('[data-battle-hp-side="player"]')).toHaveAttribute('data-battle-hp', '6')
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '12')
  const resumed = await readCampaign(page)
  expect(resumed.giocatore1.inventario.potion).toBe(0)
  expect(resumed.battaglia.pokemonA.hp).toBe(6)
  expect(resumed.battaglia.pokemonB.hp).toBe(12)
  expect(resumed.battaglia.cronaca.events).toEqual(saved.battaglia.cronaca.events)
  await battleScene.getByRole('button', { name: /^Cronaca/ }).click()
  const chronicle = page.getByRole('dialog', { name: 'Cronaca della battaglia', exact: true })
  await expect(chronicle).toContainText('Pozione su Vyrath Borsa')
  await expect(chronicle).toContainText('HP: 3 → 6')
  await page.keyboard.press('Escape')
  await expect(chronicle).toHaveCount(0)
  // Do not press AVVERSARIO: the rival's untouched HP prove no attack or duplicate item happened on reload.
  expect((await readCampaign(page)).battaglia.pokemonB.hp).toBe(12)
  expect(errors).toEqual([])
})
