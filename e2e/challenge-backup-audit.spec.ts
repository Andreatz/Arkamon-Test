import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('emergency download during a seed challenge exports the conserved campaign', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('arkamon-save')) return
    const player = (id: 1 | 2) => ({ id, nome: `Campagna originale ${id}`, squadra: [{
      istanzaId: `backup-campaign-${id}`, specieId: id === 1 ? 1 : 5, nome: 'Compagno originale', livello: 7, hp: 3, xp: 0,
      stato: { tipo: 'Paralizzato', turniRimanenti: -1 },
    }], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: id * 321, inventario: { masterball: id } })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9, battaglia: null,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null, posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      musicVolume: 0, effectsVolume: 0, reducedMotion: 'on', animationSpeed: 'fast',
    } }))
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  const before = await page.evaluate(() => localStorage.getItem('arkamon-save'))
  const campaign = JSON.parse(before!).state
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await dialog.getByRole('button', { name: 'Apri Sfide', exact: true }).click()
  await dialog.getByLabel('Seed della sfida', { exact: true }).fill('BACKUP-LIVE')
  await dialog.getByRole('button', { name: 'Genera sfida', exact: true }).click()
  await dialog.getByRole('button', { name: 'Avvia sfida', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const opening = page.getByRole('dialog', { name: 'Stesso livello: decide la moneta', exact: true })
  await opening.getByRole('button', { name: 'Continua', exact: true }).click()
  await expect(opening).toHaveCount(0)
  const challengeBefore = await page.evaluate(() => localStorage.getItem('arkamon-active-challenge-v1'))
  expect(JSON.parse(challengeBefore!).state.giocatore1.squadra).toHaveLength(6)
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  await dialog.getByRole('button', { name: 'Menù Partita', exact: true }).click()
  await dialog.getByRole('button', { name: 'Apri Impostazioni', exact: true }).click()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'arkamon-active-challenge-v1') throw new DOMException('Quota exceeded', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  // The rejected durable write deliberately leaves this setting unchanged.
  await dialog.getByRole('checkbox', { name: 'Audio attivo', exact: true }).click()
  const failedSave = page.getByRole('dialog', { name: 'Salvataggio da completare', exact: true })
  await expect(failedSave).toBeVisible()
  await expect(failedSave).toContainText('Il download conserva la campagna dei due giocatori')
  const downloading = page.waitForEvent('download')
  await failedSave.getByRole('button', { name: 'Scarica progressi conservati', exact: true }).click()
  const downloaded = await downloading
  expect(downloaded.suggestedFilename()).toMatch(/^Arkamon-partita-.*\.json$/)
  const file = JSON.parse(await readFile((await downloaded.path())!, 'utf8'))
  expect(file.campaign.giocatore1).toMatchObject(campaign.giocatore1)
  expect(file.campaign.giocatore2).toMatchObject(campaign.giocatore2)
  expect(file.campaign.giocatore1.squadra).toHaveLength(1)
  expect(file.campaign.giocatore2.squadra).toHaveLength(1)
  expect(file.campaign.battaglia).toBeNull()
  expect(file.campaign.scenaCorrente).toEqual({ scena: 'mappa-principale' })
  expect(file.campaign).not.toHaveProperty('challengeContext')
  expect(file.campaign).not.toHaveProperty('hostToken')
  expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('arkamon-active-challenge-v1'))).toBe(challengeBefore)
  expect(errors).toEqual([])
})
