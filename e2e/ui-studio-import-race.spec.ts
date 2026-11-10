import { expect, test, type Page } from '@playwright/test'

async function beginDelayedImport(page: Page, size: number) {
  await page.evaluate(async size => {
    const modelPath = '/src/ui-studio/designModel.ts'
    const { createDefaultDesign } = await import(modelPath)
    const layout = createDefaultDesign(); layout.typography.body.size = size
    const text = JSON.stringify(layout), file = new File([text], 'delayed-layout.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: () => new Promise(resolve => { (window as unknown as { finishStudioImport: () => void }).finishStudioImport = () => resolve(text) }) })
    const transfer = new DataTransfer(); transfer.items.add(file)
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Importa layout JSON"]')!
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))
  }, size)
  await expect(page.getByRole('button', { name: 'Importa', exact: true })).toBeDisabled()
}
async function finishDelayedImport(page: Page) {
  await page.evaluate(async () => {
    (window as unknown as { finishStudioImport: () => void }).finishStudioImport()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
}
async function draftSize(page: Page) {
  return page.evaluate(async () => { const modulePath = '/src/ui-studio/studioStore.ts'; return (await import(modulePath)).useUiStudioStore.getState().draft.typography.body.size ?? null })
}

test('discard cancels an in-flight import and permits a subsequent import without resurrecting the old draft', async ({ page }) => {
  await page.goto('/#ui-studio')
  const discard = page.getByRole('button', { name: 'Scarta', exact: true })
  await expect(discard).toBeVisible()
  const before = await draftSize(page)
  await beginDelayedImport(page, 47)
  await discard.click()
  await expect(page.getByRole('button', { name: 'Importa', exact: true })).toBeEnabled()
  expect(await draftSize(page)).toBe(before)
  const data = await page.evaluate(async () => { const modulePath = '/src/ui-studio/designModel.ts'; const layout = (await import(modulePath)).createDefaultDesign(); layout.typography.body.size = 31; return JSON.stringify(layout) })
  await page.getByLabel('Importa layout JSON', { exact: true }).setInputFiles({ name: 'new-layout.json', mimeType: 'application/json', buffer: Buffer.from(data) })
  await expect.poll(() => draftSize(page)).toBe(31)
  await finishDelayedImport(page)
  expect(await draftSize(page)).toBe(31)
})

test('closing Studio invalidates an import before it can change the global draft', async ({ page }) => {
  await page.goto('/#ui-studio')
  await expect(page.getByRole('button', { name: 'Scarta', exact: true })).toBeVisible()
  const before = await draftSize(page)
  await beginDelayedImport(page, 47)
  await page.getByRole('button', { name: 'Esci', exact: true }).click()
  await expect(page.locator('#ui-studio')).toHaveCount(0)
  await finishDelayedImport(page)
  expect(await draftSize(page)).toBe(before)
})

test('a newer typography edit wins over a pending import', async ({ page }) => {
  await page.goto('/#ui-studio')
  await expect(page.getByRole('button', { name: 'Scarta', exact: true })).toBeVisible()
  await beginDelayedImport(page, 47)
  await page.getByRole('tab', { name: 'Font', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Dimensione', exact: true }).first().fill('33')
  await expect.poll(() => draftSize(page)).toBe(33)
  await finishDelayedImport(page)
  expect(await draftSize(page)).toBe(33)
  await expect(page.getByRole('button', { name: 'Importa', exact: true })).toBeEnabled()
})
