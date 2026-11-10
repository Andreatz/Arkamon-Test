import { expect, test, type Page } from '@playwright/test'

const bundle = (name: string) => Buffer.from(JSON.stringify({ format: 'arkamon-campaign-configuration', version: 1, name,
  catalog: { version: 1, interactions: [] }, league: null }))

async function openConfiguration(page: Page) {
  await page.addInitScript(() => {
    const player = (id: 1 | 2) => ({ id, nome: `DEMO G${id}`, squadra: [], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 123, inventario: {} })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1,
      battaglia: null, posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      scenaCorrente: { scena: 'laboratorio' }, scenaPrecedente: null, audioMuted: true } }))
    const original = File.prototype.text
    const controls: Record<string, { resolve: () => void; reject: () => void; finished: boolean }> = {}
    Object.assign(window, { pendingConfigurationFiles: controls })
    File.prototype.text = function () {
      if (!this.name.startsWith('slow-')) return original.call(this)
      return new Promise<void>((resolve, reject) => { controls[this.name] = { resolve, reject: () => reject(new Error('Delayed read failed')), finished: false } })
        .then(() => original.call(this)).finally(() => { controls[this.name].finished = true })
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Partita', exact: true }).press('Control+Shift+a')
  const panel = page.getByRole('region', { name: 'Modalità Admin', exact: true })
  await expect(panel).toBeVisible()
  await panel.getByRole('navigation', { name: 'Sezioni Admin' }).getByRole('button', { name: 'Regia', exact: true }).click()
  return panel.getByRole('region', { name: 'Regia e preparazione della sessione', exact: true })
}

async function finishRead(page: Page, fail = false) {
  await page.evaluate(fail => {
    const controls = (window as unknown as { pendingConfigurationFiles: Record<string, { resolve: () => void; reject: () => void }> }).pendingConfigurationFiles
    const pending = controls['slow-first.json']
    if (fail) pending.reject(); else pending.resolve()
  }, fail)
  await page.waitForFunction(() => (window as unknown as { pendingConfigurationFiles: Record<string, { finished: boolean }> }).pendingConfigurationFiles['slow-first.json'].finished)
  // File.text() and React may settle after the page.evaluate command returns.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

test('the latest configuration file wins when an older read finishes later', async ({ page }) => {
  const panel = await openConfiguration(page), input = panel.getByLabel('Importa configurazione campagna', { exact: true })
  const campaign = await page.evaluate(() => localStorage.getItem('arkamon-save'))
  await input.setInputFiles({ name: 'slow-first.json', mimeType: 'application/json', buffer: bundle('Pacchetto vecchio') })
  await input.setInputFiles({ name: 'latest.json', mimeType: 'application/json', buffer: bundle('Pacchetto corrente') })
  const preview = panel.getByLabel('Anteprima configurazione campagna', { exact: true })
  await expect(preview).toContainText('Pacchetto corrente')
  await finishRead(page)
  await expect(preview).toContainText('Pacchetto corrente')
  await expect(preview).not.toContainText('Pacchetto vecchio')
  expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(campaign)
})

test('cancellation cannot be undone by an older pending configuration read', async ({ page }) => {
  const panel = await openConfiguration(page), input = panel.getByLabel('Importa configurazione campagna', { exact: true })
  await input.setInputFiles({ name: 'slow-first.json', mimeType: 'application/json', buffer: bundle('Pacchetto vecchio') })
  await input.setInputFiles({ name: 'latest.json', mimeType: 'application/json', buffer: bundle('Pacchetto corrente') })
  await expect(panel.getByLabel('Anteprima configurazione campagna', { exact: true })).toContainText('Pacchetto corrente')
  await panel.getByRole('button', { name: 'Annulla importazione', exact: true }).click()
  await finishRead(page)
  await expect(panel.getByLabel('Anteprima configurazione campagna', { exact: true })).toHaveCount(0)
  await expect(panel.getByRole('status').filter({ hasText: 'Anteprima annullata' })).toBeVisible()
})

test('an obsolete failed file read does not replace the current configuration status', async ({ page }) => {
  const panel = await openConfiguration(page), input = panel.getByLabel('Importa configurazione campagna', { exact: true })
  await input.setInputFiles({ name: 'slow-first.json', mimeType: 'application/json', buffer: bundle('Pacchetto vecchio') })
  await input.setInputFiles({ name: 'latest.json', mimeType: 'application/json', buffer: bundle('Pacchetto corrente') })
  await expect(panel.getByLabel('Anteprima configurazione campagna', { exact: true })).toContainText('Pacchetto corrente')
  await finishRead(page, true)
  await expect(panel.getByRole('status').filter({ hasText: 'Anteprima pronta' })).toBeVisible()
  await expect(panel.getByText('Non è stato possibile leggere il file. Nessuna modifica applicata.', { exact: true })).toHaveCount(0)
})

test('the application still opens when browser storage access is denied before bootstrap', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new DOMException('Storage getter denied', 'SecurityError') } })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Nuova Partita', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Partita', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
