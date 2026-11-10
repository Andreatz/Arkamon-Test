import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function campaignSnapshot(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/store/gameStore.ts', persistencePath = '/src/save/gamePersistence.ts'
    const { useGameStore } = await import(storePath)
    const { serializeGameState } = await import(persistencePath)
    return serializeGameState(useGameStore.getState())
  })
}

test('storage blocked before the first import keeps the title and failed operations unchanged', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage access blocked by test policy', 'SecurityError') },
    })
  })
  await page.goto('/')
  const title = page.locator('[data-presented-scene="titolo"]')
  await expect(title).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: 'Nuova Partita', exact: true })).toBeVisible()
  const before = await campaignSnapshot(page)
  expect(before.giocatore1.squadra).toEqual([])
  expect(before.giocatore2.squadra).toEqual([])

  await page.getByRole('button', { name: 'Nuova Partita', exact: true }).click()
  const failure = page.getByRole('dialog', { name: 'Salvataggio da completare', exact: true })
  await expect(failure).toBeVisible()
  await expect(failure.getByRole('alert')).toContainText('Il browser non ha salvato')
  await expect(title).toBeVisible()
  expect(await campaignSnapshot(page)).toEqual(before)
  await failure.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  await expect(failure).toBeVisible()
  expect(await campaignSnapshot(page)).toEqual(before)
  await failure.getByRole('button', { name: 'Annulla operazione', exact: true }).click()
  await expect(failure).toHaveCount(0)

  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const tools = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await tools.getByRole('button', { name: 'Apri Salvataggio', exact: true }).click()
  const exportBackup = tools.getByRole('button', { name: 'Scarica backup partita', exact: true })
  await expect(exportBackup).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await exportBackup.click()
  const download = await downloaded
  expect(await download.failure()).toBeNull()
  const downloadedFile = await download.path()
  expect(downloadedFile).not.toBeNull()
  const backup = JSON.parse(await readFile(downloadedFile!, 'utf8'))
  expect(backup.format).toBe('arkamon-campaign-backup')
  expect(backup.campaign.giocatore1).toEqual(before.giocatore1)
  expect(backup.campaign.giocatore2).toEqual(before.giocatore2)
  expect(backup.campaign.scenaCorrente).toEqual(before.scenaCorrente)
  await expect(tools.getByText('Backup della partita scaricato. Conservalo anche fuori da questo computer.', { exact: true })).toBeVisible()
  await tools.getByRole('button', { name: 'Riprendi il Viaggio', exact: true }).click()
  await expect(tools).toHaveCount(0)
  expect(await campaignSnapshot(page)).toEqual(before)

  const updated = await page.evaluate(async () => {
    const storePath = '/src/store/gameStore.ts'
    const { useGameStore } = await import(storePath)
    const state = useGameStore.getState()
    return state.aggiornaStato({ giocatore1: { ...state.giocatore1, monete: state.giocatore1.monete + 100 } })
  })
  expect(updated).toBe(false)
  await expect(failure).toBeVisible()
  expect(await campaignSnapshot(page)).toEqual(before)
  await failure.getByRole('button', { name: 'Annulla operazione', exact: true }).click()
  const restarted = await page.evaluate(async () => {
    const storePath = '/src/store/gameStore.ts'
    const { useGameStore } = await import(storePath)
    const state = useGameStore.getState()
    return state.eseguiTransazione(() => { state.reset(); state.vaiAScena('laboratorio') })
  })
  expect(restarted).toBe(false)
  await expect(failure).toBeVisible()
  await expect(title).toBeVisible()
  expect(await campaignSnapshot(page)).toEqual(before)
  expect(await page.evaluate(() => {
    try { void window.localStorage; return false } catch (error) { return error instanceof DOMException && error.name === 'SecurityError' }
  })).toBe(true)
  expect(errors).toEqual([])
})
