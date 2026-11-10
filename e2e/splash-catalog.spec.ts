import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { splashGeometry, type SplashBounds } from './helpers/splashGeometry'

interface ReviewedSplash { speciesId: number; src: string; label: string; subjectBounds: SplashBounds; focusBounds?: SplashBounds; compositionPolicy?: string }
const catalog: ReviewedSplash[] = JSON.parse(readFileSync(new URL('../ui-source/splash-artwork.generated.json', import.meta.url), 'utf8'))
const catalogSha256 = createHash('sha256').update(readFileSync(new URL('../ui-source/splash-artwork.generated.json', import.meta.url))).digest('hex')
const filter=process.env.SPLASH_QA_IDS?.trim()
const requested = filter ? filter.split(',').map(Number) : undefined
const selected = requested ? catalog.filter(artwork => requested.includes(artwork.speciesId)) : catalog

test('all reviewed forms keep their critical artwork clear of the actual interface', async ({ page, isMobile }, info) => {
  test.setTimeout(15 * 60_000)
  const directory = resolve('output/splash-art/catalog-ui', info.project.name)
  await mkdir(directory, { recursive: true })
  const records: unknown[] = [], issues: { speciesId: number; screen: string; reason: string }[] = []
  const errors: string[] = []
  expect(selected.length, 'at least one published form must be checked').toBeGreaterThan(0)
  page.on('pageerror', error => errors.push(error.message))
  for (const artwork of selected) for (const screen of ['squadra', 'arkadex'] as const) {
    await page.goto('/?uiStudioPreview=1&uiConceptFluid=1&uiConcept=aurora&screen=' + screen + '&splash=' + artwork.speciesId)
    const root = page.locator('.pu-shell[data-ui-concept="aurora"]')
    await expect(root).toHaveAttribute('data-reference-splash-species', String(artwork.speciesId), { timeout: 30_000 })
    await expect(root).toHaveAttribute('data-reference-splash-ready', 'true')
    await expect(root).toHaveAttribute('data-splash-frame-ready', 'true')
    await expect(root.locator('[data-splash-source]')).toHaveAttribute('data-splash-source', artwork.src)
    await root.evaluate(async element => {
      await document.fonts.ready
      await Promise.all([...element.querySelectorAll('img')].map(image => image.decode()))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    const metrics = await splashGeometry(root, screen, artwork.focusBounds ?? artwork.subjectBounds)
    const add = (reason: string) => issues.push({ speciesId: artwork.speciesId, screen, reason })
    if (metrics.image.width !== 1920 || metrics.image.height !== 1080) add('export is not 1920x1080')
    if (metrics.background.size !== (isMobile ? 'contain' : 'cover') || metrics.background.transform !== 'none') add('artwork is not one proportional painting on its actual canvas')
    if (metrics.background.filter !== 'none' || metrics.background.mask !== 'none' || metrics.background.duplicateContent !== 'none') add('blur, edge mask or duplicate painting is present')
    if (metrics.paintedImage.x > metrics.paint.x + 1 || metrics.paintedImage.y > metrics.paint.y + 1 || metrics.paintedImage.right < metrics.paint.x + metrics.paint.width - 1 || metrics.paintedImage.bottom < metrics.paint.y + metrics.paint.height - 1) add('painting leaves an uncovered canvas edge')
    if (metrics.layout.rootScrollWidth > metrics.layout.rootClientWidth + 2 || metrics.layout.contentScrollWidth > metrics.layout.contentClientWidth + 2) add('horizontal overflow')
    if (!isMobile && metrics.layout.contentScrollHeight > metrics.layout.contentClientHeight + 2) add('desktop content requires vertical scrolling')
    if (!isMobile && metrics.shell.bottom > page.viewportSize()!.height + 2) add('dialog exceeds viewport')
    for (const panel of metrics.panels) if (panel.overlap.width > 1 && panel.overlap.height > 1) add('silhouette overlaps ' + panel.selector + ': ' + panel.overlap.width.toFixed(1) + 'x' + panel.overlap.height.toFixed(1) + 'px')
    const painted = metrics.creature
    if (painted.x < metrics.paint.x - 1 || painted.y < metrics.paint.y - 1 || painted.right > metrics.paint.x + metrics.paint.width + 1 || painted.bottom > metrics.paint.y + metrics.paint.height + 1) add('silhouette leaves the visible canvas')
    records.push({ speciesId: artwork.speciesId, screen, checkedRegion: artwork.focusBounds ? 'face-and-torso' : 'whole-silhouette', ...metrics })
    if (info.project.name === 'compact' || [1, 5, 9, 13, 20, 43, 110].includes(artwork.speciesId)) {
      await page.screenshot({ path: resolve(directory, String(artwork.speciesId).padStart(3, '0') + '-' + screen + '.png'), animations: 'disabled' })
    }
  }
  const report = { date: new Date().toISOString(), framingPolicy: 'fullscreen-cover-source-v3', catalogSha256, project: info.project.name, viewport: page.viewportSize(), catalogIds: selected.map(artwork => artwork.speciesId), inspectedScreens: records.length, issues, errors, records }
  await writeFile(resolve(directory, 'measurements.json'), JSON.stringify(report, null, 2) + '\n')
  await info.attach('all-splash-interface-measurements', { body: JSON.stringify(report), contentType: 'application/json' })
  expect(issues, 'each critical artwork region stays between panels and captions').toEqual([])
  expect(errors).toEqual([])
  expect(records.length).toBe(selected.length * 2)
})
