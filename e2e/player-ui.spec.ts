import { expect, test, type Page } from '@playwright/test'

async function seedTwoPlayers(page: Page) {
  await page.addInitScript(() => {
    const pokemon = (player: 1 | 2) => ({ istanzaId: `ui-player-${player}`, specieId: player === 1 ? 1 : 5,
      nome: player === 1 ? 'Vyrath di Ada' : 'Darklaw di Bruno', livello: 5, hp: player === 1 ? 7 : 9, xp: player === 1 ? 3 : 2 })
    const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Ada' : 'Bruno', squadra: [pokemon(id)], deposito: {},
      cespugliVisitati: [], allenatoriSconfitti: [], monete: id === 1 ? 735 : 490, inventario: { potion: id }, caselleConsumate: [] })
    const position = (luogo: string) => ({ mappaId: 'mappa-principale', luogo, x: 0, y: 0, direzione: 'S' })
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position('Milano'), posizione2: position('Torino'), turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null,
      audioMuted: true, battaglia: null, arkadex: { seen1: [1], caught1: [1], seen2: [5], caught2: [5] },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
  })
}

test('the real player tools open from the title without an invented team and restore keyboard focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Partita', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen', 'partita')
  await expect(dialog).toContainText('Scegli il tuo starter per iniziare il viaggio.')
  await expect(dialog.locator('.ref-trainer-team')).toBeVisible()
  await expect(dialog.locator('.ref-trainer-team .pu-creature-portrait')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Squadra', exact: true }).click()
  await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen', 'squadra')
  await expect(dialog).toContainText(/starter|laboratorio/i)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('browsing G2 and all six menu screens preserves turn, HP, position and campaign save', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seedTwoPlayers(page)
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  const before = await page.evaluate(() => localStorage.getItem('arkamon-save'))
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await dialog.getByRole('button', { name: 'G2 · Bruno', exact: true }).click()
  await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-player', '2')
  await expect(dialog.locator('.pu-currency')).toContainText('490')
  await expect(dialog.locator('.pu-header-meta')).toContainText('Torino')
  await expect(dialog.getByRole('button', { name: 'Negozio', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Apri Negozio', exact: true })).toHaveCount(0)
  for (const [label, screen] of [['Squadra', 'squadra'], ['Deposito', 'deposito'], ['Arkadex', 'arkadex'], ['Analisi', 'analisi'], ['Borsa', 'borsa'], ['Menù Partita', 'partita']] as const) {
    await dialog.getByRole('button', { name: label, exact: true }).click()
    await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen', screen)
    await expect(dialog.locator('.pu-content').getByRole('status').filter({ hasText: 'Caricamento…' })).toHaveCount(0)
    if (screen === 'squadra') await expect(dialog.locator('.pu-content')).toContainText('Darklaw di Bruno')
  }
  await expect(dialog.locator('.ref-trainer-team [title="Darklaw di Bruno"]')).toBeVisible()
  await expect(dialog.locator('.pu-footer')).toContainText('Turno di G1')
  await expect(dialog.locator('.pu-footer')).not.toContainText('azioni disponibili')
  expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(before)
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(save.giocatoreAttivo).toBe(1)
  expect(save.turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
  expect(save.giocatore1.squadra[0].hp).toBe(7)
  expect(save.giocatore2.squadra[0].hp).toBe(9)
  expect(save.posizione1.luogo).toBe('Milano')
  expect(save.posizione2.luogo).toBe('Torino')
  const artwork = dialog.locator('img[src*="/ui/reference-png/"]')
  expect(await artwork.count()).toBeGreaterThan(0)
  const invalidArtwork = await artwork.evaluateAll(images => images.filter(image => !(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth).length)
  expect(invalidArtwork).toBe(0)
  expect(errors).toEqual([])
})
