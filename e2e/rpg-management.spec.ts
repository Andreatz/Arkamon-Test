import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })
test.skip(({ isMobile }) => isMobile, 'Desktop management geometry; phone consultation has separate coverage.')
const read = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)

async function seed(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('arkamon-save')) return
    const creature = (id: string, specieId: number, livello: number, hp: number) => ({ istanzaId: id, specieId, nome: id, livello, hp, xp: 0 })
    const one = { id: 1, nome: 'Melia', squadra: [{ ...creature('Vyrath squadra', 1, 20, 3), stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }, creature('Felyss squadra', 9, 25, 0)],
      deposito: { '1:1': creature('Darklaw riserva', 5, 26, 3), '2:35': creature('Darklaw lontano', 5, 22, 7) },
      cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 500, inventario: { potion: 2, masterball: 1 } }
    const two = { id: 2, nome: 'Maggi', squadra: [creature('Vyrath Maggi', 1, 20, 20)], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 300, inventario: {} }
    const position = (luogo: string) => ({ mappaId: 'mappa-principale', luogo, x: 0, y: 0, direzione: 'S' })
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: one, giocatore2: two, giocatoreAttivo: 1,
      rivaleStarterId: 5, battaglia: null, posizione1: position('Venezia'), posizione2: position('Torino'),
      posizioniLocali1: {}, posizioniLocali2: {}, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null, audioMuted: true,
      arkadex: { seen1: [1, 5, 9], caught1: [1, 5, 9], seen2: [1], caught2: [1] },
      matchLog: { version: 1, nextSequence: 1, events: [] }, interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null } } }))
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  return page.getByRole('dialog', { name: 'La tua partita', exact: true })
}

test('filters retain box coordinates and a blocked swap previews the cap without moving any creature', async ({ page }) => {
  const dialog = await seed(page)
  const before = await read(page)
  await dialog.getByRole('button', { name: 'Deposito', exact: true }).click()
  await dialog.getByLabel('Nome o numero', { exact: true }).fill('darklaw')
  await expect(dialog.getByRole('button', { name: /^Box 1, posto/ })).toHaveCount(35)
  await expect(dialog.locator('.pu-deposit-filter-result')).toContainText('1 risultati in questo box · 2 in tutto il deposito')
  await expect(dialog.getByRole('button', { name: 'Box 1, posto 1: Darklaw riserva, livello 26', exact: true })).toHaveAttribute('data-filter-match', 'true')
  await dialog.getByRole('button', { name: 'Prossimo box con risultati', exact: true }).click()
  await expect(dialog.getByLabel('Scegli box del deposito', { exact: true })).toHaveValue('2')
  await expect(dialog.getByRole('button', { name: 'Box 2, posto 35: Darklaw lontano, livello 22', exact: true })).toHaveAttribute('data-filter-match', 'true')
  await dialog.getByLabel('Scegli box del deposito', { exact: true }).selectOption('1')
  await dialog.getByRole('button', { name: 'Azzera filtri', exact: true }).click()
  await dialog.getByRole('button', { name: 'Sposta o scambia', exact: true }).click()
  const target = dialog.getByRole('button', { name: 'Squadra, posto 2: Felyss squadra, livello 25', exact: true })
  await target.focus()
  await expect(dialog.locator('.pu-swap-preview')).toContainText('Lv. 20–26 · Δ 6 / 5')
  await expect(dialog.locator('.pu-swap-preview')).toContainText('Scambio bloccato')
  const screenshot = test.info().outputPath('deposito-rpg-cap-preview.png')
  await page.screenshot({ path: screenshot })
  await test.info().attach('deposito-rpg-cap-preview', { path: screenshot, contentType: 'image/png' })
  await target.click()
  const after = await read(page)
  expect(after.giocatore1).toEqual(before.giocatore1)
  expect(after.giocatore2).toEqual(before.giocatore2)
})

test('bag previews exact healing and keeps status until the explicitly requested item is used', async ({ page }) => {
  const dialog = await seed(page)
  const before = await read(page)
  await dialog.getByRole('button', { name: 'Borsa', exact: true }).click()
  const preview = dialog.getByLabel('Anteprima su Vyrath squadra', { exact: true })
  await expect(preview.getByRole('progressbar', { name: 'HP di Vyrath squadra: 3 su 34', exact: true })).toBeVisible()
  await expect(preview.getByRole('progressbar', { name: 'HP di Vyrath squadra: 12 su 34', exact: true })).toBeVisible()
  await expect(preview).toContainText('+9 HP · Paralizzato')
  expect((await read(page)).giocatore1).toEqual(before.giocatore1)
  const screenshot = test.info().outputPath('borsa-rpg-healing-preview.png')
  await page.screenshot({ path: screenshot })
  await test.info().attach('borsa-rpg-healing-preview', { path: screenshot, contentType: 'image/png' })
  await dialog.getByRole('button', { name: 'Usa Pozione', exact: true }).click()
  const after = await read(page)
  expect(after.giocatore1.squadra[0].hp).toBe(12)
  expect(after.giocatore1.squadra[0].stato).toEqual(before.giocatore1.squadra[0].stato)
  expect(after.giocatore1.inventario.potion).toBe(1)
  expect(after.giocatore2).toEqual(before.giocatore2)
})
