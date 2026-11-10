import { expect, test } from '@playwright/test'
import { seed } from '../e2e-release/helpers'

test('desktop output keeps every management screen usable under its actual CSP and rejects injected scripts', async ({ page }) => {
  await seed(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const events: { directive: string; blocked: string }[] = []
    Object.assign(window, { desktopPolicyEvents: events })
    document.addEventListener('securitypolicyviolation', event => events.push({ directive: event.effectiveDirective, blocked: event.blockedURI }))
  })
  await page.goto('./')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  const before = await page.evaluate(() => localStorage.getItem('arkamon-save'))
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  for (const destination of ['Squadra', 'Deposito', 'Arkadex', 'Analisi', 'Borsa', 'Menù Partita']) {
    await dialog.getByRole('button', { name: destination, exact: true }).click()
    await expect(dialog.locator('.pu-content').getByRole('status').filter({ hasText: 'Caricamento…' })).toHaveCount(0)
    expect(await dialog.locator('.pu-content').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
  }
  const frames = dialog.locator('.ref-menu-card-frame')
  await expect(frames).toHaveCount(9)
  await expect.poll(() => frames.evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(before)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { desktopPolicyEvents: unknown[] }).desktopPolicyEvents)).toEqual([])
  await page.screenshot({ path: 'output/structural-2026-10-26/desktop-menu.png' })

  await page.route('https://blocked.example.invalid/**', route => route.abort())
  await page.evaluate(() => {
    const inline = document.createElement('script')
    inline.textContent = 'window.unauthorizedDesktopScript = true'
    document.body.append(inline)
    const remote = document.createElement('script')
    remote.src = 'https://blocked.example.invalid/injected.js'
    document.body.append(remote)
  })
  await expect.poll(() => page.evaluate(() => (window as unknown as { desktopPolicyEvents: { blocked: string }[] }).desktopPolicyEvents.map(event => event.blocked))).toEqual(expect.arrayContaining(['inline', 'https://blocked.example.invalid/injected.js']))
  expect(await page.evaluate(() => (window as unknown as { unauthorizedDesktopScript?: boolean }).unauthorizedDesktopScript)).toBeUndefined()
})

test('desktop CSP keeps the Studio iframe, artwork replacement and applied design working after reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./#ui-studio')
  await expect(page.locator('.uis-layer').first()).toBeVisible()
  await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('menu')
  const preview = page.frameLocator('.uis-canvas iframe')
  const frame = preview.locator('[data-ui-id="service.register"] .ref-menu-card-frame')
  await expect(frame).toHaveAttribute('src', /\/panel-modular\.webp$/)
  await page.getByLabel('Cerca elemento', { exact: true }).fill('Apri Registro')
  await page.locator('.uis-layer').filter({ has: page.locator('strong', { hasText: /^Apri Registro$/ }) }).click()
  await page.getByRole('button', { name: 'Scegli asset', exact: true }).click()
  const library = page.getByRole('dialog', { name: 'Scegli asset', exact: true })
  await library.getByLabel('Categoria asset', { exact: true }).selectOption({ label: 'UI PNG fornita' })
  await library.getByLabel('Cerca asset', { exact: true }).fill('info panel')
  await library.getByRole('button', { name: 'info panel UI PNG fornita', exact: true }).click()
  await expect(frame).toHaveAttribute('src', /\/info-panel\.webp$/)
  await page.getByRole('button', { name: 'Applica al gioco', exact: true }).click()
  await page.getByRole('button', { name: 'Esci', exact: true }).click()
  for (let round = 0; round < 2; round++) {
    if (round) await page.reload()
    await page.getByRole('button', { name: 'Partita', exact: true }).click()
    await expect(page.locator('[data-ui-id="service.register"] .ref-menu-card-frame')).toHaveAttribute('src', /\/info-panel\.webp$/)
  }
  expect(errors).toEqual([])
})
