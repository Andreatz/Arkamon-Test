import { test, expect } from '@playwright/test'
import { seed } from './helpers'

test('compiled game opens all six management destinations without overflow or campaign changes', async ({ page }) => {
  await seed(page)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size)
    await page.getByRole('button', { name: 'Partita', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
    for (const destination of ['Squadra', 'Deposito', 'Arkadex', 'Analisi', 'Borsa', 'Menù Partita']) {
      await dialog.getByRole('button', { name: destination, exact: true }).click()
      await expect(dialog.locator('.pu-shell')).toBeVisible()
      await expect(dialog.locator('.pu-content').getByRole('status').filter({ hasText: 'Caricamento…' })).toHaveCount(0)
      expect(await dialog.locator('.pu-shell').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
      expect(await dialog.locator('.pu-content').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
    }
    await dialog.getByRole('button', { name: 'Riprendi il Viaggio', exact: true }).click()
  }
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  for (const key of ['giocatore1', 'giocatore2', 'giocatoreAttivo', 'turnoOverworld', 'battaglia']) expect(after[key]).toEqual(before[key])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  expect(errors).toEqual([])
})

test('compiled laboratory creates and restores a real new campaign', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, reducedMotion: 'on', animationSpeed: 'fast' } })))
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Nuova Partita', exact: true }).click()
  await page.getByLabel('Giocatore 1', { exact: true }).fill('Melia release')
  await page.getByLabel('Giocatore 2', { exact: true }).fill('Maggi release')
  await page.getByRole('button', { name: 'Continua', exact: true }).click()
  await page.getByRole('button', { name: /Vyrath/ }).first().click()
  await page.getByRole('button', { name: /Darklaw/ }).first().click()
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore2.squadra.length)).toBe(1)
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(after.giocatore1).toEqual(before.giocatore1); expect(after.giocatore2).toEqual(before.giocatore2)
})
