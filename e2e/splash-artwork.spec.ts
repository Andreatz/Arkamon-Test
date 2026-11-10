import { expect, test, type Locator } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { splashGeometry } from './helpers/splashGeometry'
const splashCatalog: { speciesId: number; src: string; focusBounds?: { left:number; top:number; right:number; bottom:number } }[] = JSON.parse(readFileSync(new URL('../ui-source/splash-artwork.generated.json', import.meta.url), 'utf8'))

const query = '/?uiStudioPreview=1&uiConceptFluid=1&uiConcept=aurora&screen='
const protectedKeys = ['arkamon-save', 'arkamon-preferences-v1', 'arkamon-interactions-v1', 'arkamon-automatic-backups-v1']
const protectedValue = 'splash-inspection-protected-campaign'
// Conservative bounds for the complete painted Darklaw in the centred V2 artwork.
// This is an artwork acceptance envelope, not a CSS override of the creature's position.
const darklawBounds = { left: .38, top: .265, right: .64, bottom: .805 }

async function finishArtwork(root: Locator) {
  await root.evaluate(async element => {
    await document.fonts.ready
    await Promise.all([...element.querySelectorAll('img')].map(image => image.decode()))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await expect.poll(() => root.locator('[data-creature-source]').evaluateAll(elements => elements.every(element => element.getAttribute('data-creature-loaded') === 'true')),
    { message: 'compact icons and any fallback portraits finish loading', timeout: 30_000 }).toBe(true)
}


async function expectFallback(root: Locator) {
  await expect(root).not.toHaveAttribute('data-reference-splash-ready', 'true')
  await expect(root.locator('.pu-splash-hero-presence')).toHaveCount(0)
  await expect.poll(() => root.evaluate(element => getComputedStyle(element, '::before').backgroundImage)).not.toContain('005-darklaw.webp')
}

for (const screen of ['squadra', 'arkadex'] as const) {
  test(`${screen}: centred Darklaw keeps its face and torso clear of the live interface`, async ({ page, isMobile }, info) => {
    const errors: string[] = [], imageFailures: { url: string; status?: number; failure?: string }[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => {
      if (response.request().resourceType() === 'image' && response.status() >= 400) imageFailures.push({ url: response.url(), status: response.status() })
    })
    page.on('requestfailed', request => {
      if (request.resourceType() === 'image') imageFailures.push({ url: request.url(), failure: request.failure()?.errorText })
    })
    await page.addInitScript(({ keys, value }) => keys.forEach(key => localStorage.setItem(key, value)), { keys: protectedKeys, value: protectedValue })
    await page.goto(query + screen)
    const root = page.locator('.pu-shell[data-ui-concept="aurora"]')
    await expect(root).toBeVisible({ timeout: 30_000 })
    const switchPlayer = async (player: 1 | 2) => {
      await root.getByRole('button', { name: player === 1 ? 'G1 · Melia' : 'G2 · Maggi', exact: true }).click()
      await expect(root).toHaveAttribute('data-player-ui-player', String(player))
    }
    if (screen === 'squadra') {
      // The shared fixture's G2 starts with Darklaw. Remember G2's real Felyss slot
      // before testing G1 -> G2, rather than assuming a different saved roster.
      await switchPlayer(2)
      await root.getByRole('button', { name: /Squadra, posto 2:/ }).click()
      await expect(root.locator('.pu-reference-team-stage .pu-hero')).toHaveAttribute('aria-label', 'Arkamon selezionato: Felyss')
      await switchPlayer(1)
      await root.getByRole('button', { name: /Squadra, posto 2:.*Darklaw/ }).click()
    } else {
      await root.getByRole('button', { name: /Numero 5: Darklaw/ }).click()
    }
    await expect(root).toHaveAttribute('data-reference-splash-species', '5', { timeout: 30_000 })
    await expect(root).toHaveAttribute('data-reference-splash-ready', 'true')
    await expect(root.getByRole('img', { name: 'Illustrazione di Darklaw', exact: true })).toHaveCount(1)
    await expect(root.getByRole('img', { name: 'Illustrazione di Darklaw', exact: true })).toBeVisible()
    await expect(root.locator(screen === 'squadra' ? '.pu-reference-team' : '.pu-dex-screen')).toHaveAttribute('data-splash-artwork', 'ready')
    const stage = root.locator(screen === 'squadra' ? '.pu-reference-team-stage' : '.pu-dex-hero')
    await expect(stage.locator('svg.pu-creature-art,.is-large > .pu-creature-art')).toHaveCount(0)
    await expect(stage.locator('.pu-live-team-portrait,.pu-species-animation')).toHaveCount(0)
    await expect(root.locator(`${screen === 'squadra' ? '.pu-reference-roster' : '.pu-dex-index'} img.pu-creature-compact[data-species-id="5"]`).first()).toBeVisible()
    const details = root.locator(screen === 'squadra' ? '.pu-reference-team-dossier' : '.pu-dex-detail')
    await expect(details.getByRole('heading', { name: 'Darklaw', exact: true })).toBeVisible()
    await expect(details).toContainText(screen === 'squadra' ? 'Punti vita' : 'HP massimi')
    if (screen === 'arkadex') await expect(root.getByRole('button', { name: 'Mostra animazione', exact: true })).toBeVisible()
    await finishArtwork(root)
    const metrics = await splashGeometry(root, screen, splashCatalog.find(artwork=>artwork.speciesId===5)?.focusBounds ?? darklawBounds)
    const destination = resolve('output/splash-art/ui')
    await mkdir(destination, { recursive: true })
    await page.screenshot({ path: resolve(destination, `${info.project.name}-${screen}.png`), animations: 'disabled' })
    await writeFile(resolve(destination, `${info.project.name}-${screen}.json`), `${JSON.stringify(metrics, null, 2)}\n`)
    await info.attach('splash-layout-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' })

    expect(metrics.image.width / metrics.image.height, 'clean splash retains its 16:9 canvas').toBeCloseTo(16 / 9, 2)
    expect(metrics.background.image).toContain('005-darklaw.webp')
    expect(metrics.background.size).toBe(isMobile ? 'contain' : 'cover')
    expect(metrics.background.transform).toBe('none')
    expect(metrics.background.filter).toBe('none')
    expect(metrics.background.mask).toBe('none')
    expect(metrics.background.duplicateContent).toBe('none')
    expect(metrics.paintedImage.x).toBeLessThanOrEqual(metrics.paint.x + 1)
    expect(metrics.paintedImage.y).toBeLessThanOrEqual(metrics.paint.y + 1)
    expect(metrics.paintedImage.right).toBeGreaterThanOrEqual(metrics.paint.x + metrics.paint.width - 1)
    expect(metrics.paintedImage.bottom).toBeGreaterThanOrEqual(metrics.paint.y + metrics.paint.height - 1)
    expect(metrics.background.opacity).toBe('1')
    expect(metrics.creature.x).toBeGreaterThanOrEqual(metrics.paint.x - 1)
    expect(metrics.creature.y).toBeGreaterThanOrEqual(metrics.paint.y - 1)
    expect(metrics.creature.right).toBeLessThanOrEqual(metrics.paint.x + metrics.paint.width + 1)
    expect(metrics.creature.bottom).toBeLessThanOrEqual(metrics.paint.y + metrics.paint.height + 1)
    for (const panel of metrics.panels) expect(panel.overlap.width <= 1 || panel.overlap.height <= 1,
      `${screen}: painted creature stays clear of ${panel.selector}; overlap ${panel.overlap.width.toFixed(1)}×${panel.overlap.height.toFixed(1)} px`).toBe(true)
    expect(metrics.layout.rootScrollWidth).toBeLessThanOrEqual(metrics.layout.rootClientWidth + 2)
    expect(metrics.layout.contentScrollWidth).toBeLessThanOrEqual(metrics.layout.contentClientWidth + 2)
    if (!isMobile) {
      expect(metrics.layout.contentScrollHeight).toBeLessThanOrEqual(metrics.layout.contentClientHeight + 2)
      expect(metrics.shell.bottom).toBeLessThanOrEqual(page.viewportSize()!.height + 2)
    }
    expect(metrics.information.length).toBeGreaterThan(3)
    expect(metrics.information.every(item => item.fontSize >= 10 && item.opacity > 0 && item.color !== 'rgba(0, 0, 0, 0)'), 'live information retains visible type at readable sizes').toBe(true)

    await switchPlayer(2)
    const secondSpecies = screen === 'squadra' ? 9 : 1
    const secondArtwork = splashCatalog.find(artwork => artwork.speciesId === secondSpecies)
    if (secondArtwork) {
      await expect(root).toHaveAttribute('data-reference-splash-species', String(secondSpecies))
      await expect(root).toHaveAttribute('data-reference-splash-ready', 'true')
      await expect(root.locator('[data-splash-source]')).toHaveAttribute('data-splash-source', secondArtwork.src)
      await expect.poll(() => root.evaluate(element => getComputedStyle(element.querySelector('.pu-splash-backdrop') ?? element, '::before').backgroundImage)).not.toContain('005-darklaw.webp')
    } else await expectFallback(root)
    if (screen === 'squadra') {
      if (!secondArtwork) await expect(root.locator('.pu-live-team-portrait svg.pu-creature-art[data-species-id="9"]')).toBeVisible()
    } else {
      if (!secondArtwork) await expect(root.locator('.pu-dex-hero svg.pu-creature-art[data-species-id="1"]')).toBeVisible()
      await root.getByRole('button', { name: /Numero 2: specie da scoprire/ }).click()
      await expectFallback(root)
      await expect(root.locator('.pu-dex-hero .pu-unknown-hero')).toBeVisible()
      await expect(root.locator('.pu-dex-detail')).toContainText('Specie da scoprire')
      await expect(root.locator('.pu-dex-hero [data-species-id="2"]')).toHaveCount(0)
    }
    for (const key of protectedKeys) expect(await page.evaluate(key => localStorage.getItem(key), key), key).toBe(protectedValue)
    expect(errors).toEqual([])
    expect(imageFailures).toEqual([])
  })

  test(`${screen}: an unavailable splash keeps the official portrait visible`, async ({ page }) => {
    await page.route('**/backgrounds/arkamon-splash/*.webp', route => route.abort())
    await page.goto(query + screen + '&splash=5')
    const root = page.locator('.pu-shell[data-ui-concept="aurora"]')
    await expect(root).toBeVisible({ timeout: 30_000 })
    const stage = root.locator(screen === 'squadra' ? '.pu-reference-team-stage' : '.pu-dex-hero')
    await expect(stage.locator('svg.pu-creature-art[data-species-id="5"]')).toBeVisible()
    await expectFallback(root)
  })
}
