import { expect, test, type Page } from '@playwright/test'

async function projectDraft(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/presentation/presentationProject.ts'
    const { usePresentationProject } = await import(modulePath)
    return JSON.stringify(usePresentationProject.getState().draft)
  })
}

test('closing Studio cancels a pending visual project import without writing a new persistent draft', async ({ page }) => {
  await page.goto('/#ui-studio'); await page.getByRole('tab', { name: 'Progetto', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Progetto visivo', exact: true })
  await expect(panel).toBeVisible()
  const before = { draft: await projectDraft(page), stored: await page.evaluate(() => localStorage.getItem('arkamon-presentation-project-v1')) }
  const text = await page.evaluate(async () => {
    const modulePath = '/src/presentation/presentationProject.ts'
    const { capturePresentationProject, exportPresentationProject } = await import(modulePath)
    return exportPresentationProject(await capturePresentationProject('Progetto da importazione lenta'))
  })
  await page.evaluate(text => {
    const file = new File([text], 'delayed-project.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: () => new Promise(resolve => {
      (window as unknown as { finishVisualProjectImport: () => void }).finishVisualProjectImport = () => resolve(text)
    }) })
    const transfer = new DataTransfer(); transfer.items.add(file)
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Importa progetto visivo JSON"]')!
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))
  }, text)
  await expect(panel.getByRole('button', { name: 'Importa pacchetto', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Esci', exact: true }).click()
  await expect(page.locator('#ui-studio')).toHaveCount(0)
  await page.evaluate(async () => {
    (window as unknown as { finishVisualProjectImport: () => void }).finishVisualProjectImport()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  expect(await projectDraft(page)).toBe(before.draft)
  expect(await page.evaluate(() => localStorage.getItem('arkamon-presentation-project-v1'))).toBe(before.stored)
  // Reopening must allow an ordinary new import; cancellation is scoped to the
  // closed component, not a permanent block on the global project store.
  await page.evaluate(() => { window.location.hash = 'ui-studio' }); await page.getByRole('tab', { name: 'Progetto', exact: true }).click()
  await expect(panel).toBeVisible()
  await panel.getByLabel('Importa progetto visivo JSON').setInputFiles({ name: 'current-project.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect(panel.getByRole('status')).toContainText('Pacchetto importato nella bozza')
  expect(JSON.parse((await projectDraft(page))!).name).toBe('Progetto da importazione lenta')
})
