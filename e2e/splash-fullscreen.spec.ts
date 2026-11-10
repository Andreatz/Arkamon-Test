import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { splashGeometry, type SplashBounds } from './helpers/splashGeometry'

const catalog: { speciesId: number; focusBounds?: SplashBounds; subjectBounds: SplashBounds }[] = JSON.parse(readFileSync(new URL('../ui-source/splash-artwork.generated.json', import.meta.url), 'utf8'))

for (const screen of ['squadra', 'arkadex'] as const) {
  test(`${screen}: one sharp painting covers the complete desktop canvas and survives resize`, async ({ page }) => {
    const errors: string[] = []
    // This case explicitly exercises desktop geometry, including when the
    // project supplies a phone device. The companion below checks the phone card.
    const requestedViewport = page.viewportSize()!
    const initialViewport = requestedViewport.width >= 901 ? requestedViewport : { width: 1366, height: 768 }
    await page.setViewportSize(initialViewport)
    page.on('pageerror', error => errors.push(error.message))
    for (const id of [36, 41, 97]) {
      const artwork = catalog.find(entry => entry.speciesId === id)!
      await page.goto(`/?uiStudioPreview=1&uiConceptFluid=1&uiConcept=aurora&screen=${screen}&splash=${id}`, { waitUntil: 'domcontentloaded' })
      const root = page.locator('.pu-shell[data-ui-concept="aurora"]')
      await expect(root).toHaveAttribute('data-reference-splash-species', String(id), { timeout: 30_000 })
      for (const viewport of [initialViewport, { width: 1600, height: 700 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport)
        await expect(root).toHaveAttribute('data-splash-frame-ready', 'true')
        await expect(root).toHaveAttribute('data-splash-frame-mode', 'cover')
        await root.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
        const geometry = await splashGeometry(root, screen, artwork.focusBounds ?? artwork.subjectBounds)
        expect(geometry.background.size).toBe('cover')
        expect(geometry.background.transform).toBe('none')
        expect(geometry.background.filter).toBe('none')
        expect(geometry.background.mask).toBe('none')
        expect(geometry.background.duplicateContent).toBe('none')
        expect(geometry.background.duplicateImage).toBe('none')
        expect(geometry.paint.x).toBeCloseTo(geometry.shell.x, 0)
        expect(geometry.paint.y).toBeCloseTo(geometry.shell.y, 0)
        expect(geometry.paint.width).toBeCloseTo(geometry.shell.width, 0)
        expect(geometry.paint.height).toBeCloseTo(geometry.shell.height, 0)
        expect(geometry.paintedImage.x).toBeLessThanOrEqual(geometry.paint.x + 1)
        expect(geometry.paintedImage.y).toBeLessThanOrEqual(geometry.paint.y + 1)
        expect(geometry.paintedImage.right).toBeGreaterThanOrEqual(geometry.paint.x + geometry.paint.width - 1)
        expect(geometry.paintedImage.bottom).toBeGreaterThanOrEqual(geometry.paint.y + geometry.paint.height - 1)
        expect(geometry.paintedImage.width / geometry.paintedImage.height).toBeCloseTo(16 / 9)
        if (viewport.width / viewport.height === 16 / 9) {
          expect(geometry.paintedImage.width).toBeCloseTo(geometry.paint.width, 0)
          expect(geometry.paintedImage.height).toBeCloseTo(geometry.paint.height, 0)
        }
        expect(geometry.layout.rootScrollWidth).toBeLessThanOrEqual(geometry.layout.rootClientWidth + 2)
        expect(geometry.layout.contentScrollHeight).toBeLessThanOrEqual(geometry.layout.contentClientHeight + 2)
      }
    }
    expect(errors).toEqual([])
  })

  test(`${screen}: mobile keeps a complete sharp 16:9 illustration separate from the readable panels`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/?uiStudioPreview=1&uiConceptFluid=1&uiConcept=aurora&screen=${screen}&splash=41`, { waitUntil: 'domcontentloaded' })
    const root = page.locator('.pu-shell[data-ui-concept="aurora"]')
    await expect(root).toHaveAttribute('data-reference-splash-species', '41', { timeout: 30_000 })
    await expect(root.locator('.pu-splash-backdrop')).toBeHidden()
    const illustration = root.locator('.pu-splash-hero-presence')
    await expect(illustration).toBeVisible()
    const metrics = await illustration.evaluate(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
      return { width: rect.width, height: rect.height, backgroundSize: style.backgroundSize, filter: style.filter, transform: style.transform }
    })
    expect(metrics.width / metrics.height).toBeCloseTo(16 / 9)
    expect(metrics.backgroundSize).toBe('contain')
    expect(metrics.filter).toBe('none')
    expect(metrics.transform).toBe('none')
  })
}
