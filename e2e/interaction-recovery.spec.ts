import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const interaction = (id: string, nodeId: string) => ({ id, mapId: 'Venezia', nodeId, title: id, dialogue: 'DEMO', scope: 'player', enabled: true, repeatable: false,
  requirements: { gymIds: [], minLevel: 0, minCoins: 0, items: {}, completedInteractions: [] }, cost: { coins: 0, items: {} }, reward: { coins: 0, items: {} }, action: { kind: 'dialogue' } })
const valid = interaction('preserved-entry', 'n56')
const raw = JSON.stringify({ state: { interactions: [valid, interaction('damaged-entry', 'missing-node')] }, version: 0 })
async function admin(page: Page) {
  const panel = page.getByRole('region', { name: 'Modalità Admin', exact: true })
  const trigger = page.getByRole('button', { name: 'Admin', exact: true })
  await expect(trigger).toBeVisible()
  // The persisted open panel may still be loading its lazy component on reload.
  if (!await panel.isVisible() && await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  await expect(panel).toBeVisible()
  return panel
}
async function downloadedText(page: Page, action: () => Promise<void>) {
  const pending = page.waitForEvent('download'); await action()
  const download = await pending
  expect(await download.failure()).toBeNull()
  return readFile((await download.path())!, 'utf8')
}

test('a damaged catalog is visible, preserved and recoverable only through an explicit validated replacement', async ({ page }) => {
  await page.addInitScript(raw => {
    if (!localStorage.getItem('audit-interaction-recovery-fixture')) {
      localStorage.setItem('arkamon-interactions-v1', raw)
      localStorage.setItem('audit-interaction-recovery-fixture', 'ready')
    }
  }, raw)
  await page.goto('/')
  const originalCampaign = await page.evaluate(() => localStorage.getItem('arkamon-save'))
  let panel = await admin(page)
  await expect(panel.getByText(/Catalogo salvato da recuperare/)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Esporta configurazione', exact: true })).toBeDisabled()
  await panel.getByRole('button', { name: 'Chiudi', exact: true }).click()

  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const tools = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await tools.getByRole('button', { name: 'Apri Salvataggio', exact: true }).click()
  await expect(tools.getByRole('alert')).toContainText('omette quel catalogo')
  const backupText = await downloadedText(page, () => tools.getByRole('button', { name: 'Scarica backup partita', exact: true }).click())
  const backup = JSON.parse(backupText)
  expect(backup.format).toBe('arkamon-campaign-backup')
  expect(backup.interactionCatalog).toBeUndefined()
  expect(backup.campaign.giocatore1).toMatchObject({ id: 1, squadra: [], deposito: {} })
  expect(await downloadedText(page, () => tools.getByRole('button', { name: 'Scarica originale da recuperare', exact: true }).click())).toBe(raw)
  expect(await page.evaluate(() => localStorage.getItem('arkamon-interactions-v1'))).toBe(raw)
  await tools.getByRole('button', { name: 'Riprendi il Viaggio', exact: true }).click()

  panel = await admin(page)
  await panel.getByRole('navigation', { name: 'Sezioni Admin' }).getByRole('button', { name: 'Interazioni', exact: true }).click()
  const editor = panel.getByRole('region', { name: 'Editor delle interazioni', exact: true })
  await expect(editor.getByRole('alert', { name: 'Recupero catalogo interazioni' })).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Salva interazione', exact: true })).toBeDisabled()
  expect(await downloadedText(page, () => editor.getByRole('button', { name: 'Scarica originale da recuperare', exact: true }).click())).toBe(raw)
  await editor.getByText('Importa / esporta e Tiled', { exact: true }).click()
  await editor.getByLabel('Configurazione delle interazioni', { exact: true }).fill(JSON.stringify({ version: 1, interactions: [valid] }))
  const replace = editor.getByRole('button', { name: 'Sostituisci archivio da recuperare', exact: true })
  await expect(replace).toBeDisabled()
  await editor.getByRole('checkbox', { name: 'Ho conservato l’originale e autorizzo la sostituzione con il catalogo JSON qui sopra.', exact: true }).check()
  await replace.click()
  await expect(editor.getByRole('status')).toHaveText('Catalogo recuperato e salvato.')
  await expect(editor.getByRole('alert', { name: 'Recupero catalogo interazioni' })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'Salva interazione', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-interactions-v1')!).state.interactions)).toEqual([valid])
  expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(originalCampaign)

  await page.reload()
  panel = await admin(page)
  await expect(panel.getByText(/Catalogo salvato da recuperare/)).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Esporta configurazione', exact: true })).toBeEnabled()
})
