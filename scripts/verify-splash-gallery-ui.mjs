import { chromium, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { splashGeometry } from '../e2e/helpers/splashGeometry.ts'

// Exercise the real reference gallery iframe, whose opening is smaller than fullscreen.
const catalogFile = 'ui-source/splash-artwork.generated.json'
const catalogBytes = await fs.readFile(catalogFile)
const catalog = JSON.parse(catalogBytes)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const catalogSha256AtStart = hash(catalogBytes)
const origin = process.env.SPLASH_GALLERY_URL ?? 'http://127.0.0.1:3054/'
const directory = 'output/splash-art/responsive-ui/audit-compact'
const resultFile = 'output/splash-art/gallery-autofit-audit.json'
const selected = new Set([4, 22, 36, 37, 38, 41, 42, 48, 49, 60, 61, 69, 82, 83, 88, 94, 97, 109, 110])
await fs.mkdir(directory, { recursive: true })
const jobs = catalog.flatMap(art => ['squadra', 'arkadex'].map(screen => ({ art, screen })))
const viewport = { width: 1366, height: 768 }
const records = [], faceIssues = [], layoutIssues = [], renderIssues = [], errors = []
const started = new Date().toISOString()
const browser = await chromium.launch({ headless: true })
let cursor = 0
try {
  await Promise.all(Array.from({ length: 3 }, async () => {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem('arkamon-save', 'protected-splash-gallery-inspection'))
    while (cursor < jobs.length) {
      const { art, screen } = jobs[cursor++]
      const id = art.speciesId
      try {
        await page.goto(`${origin}?uiReferences=1&screen=${screen}&splash=${id}`, { waitUntil: 'domcontentloaded' })
        const root = page.frameLocator('iframe').locator('.pu-shell[data-ui-concept="aurora"]')
        await expect(root).toHaveAttribute('data-reference-splash-species', String(id), { timeout: 30000 })
        await expect(root).toHaveAttribute('data-splash-frame-ready', 'true', { timeout: 30000 })
        await root.evaluate(async element => {
          await document.fonts.ready
          await Promise.all([...element.querySelectorAll('img')].map(image => image.decode()))
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        })
        const metrics = await splashGeometry(root, screen, art.focusBounds ?? art.subjectBounds)
        const region = (await root.getAttribute('data-splash-frame-region') ?? '').split(',').map(Number)
        const focus = metrics.creature
        const inside = region.length === 4 && region.every(Number.isFinite)
          && focus.x >= metrics.paint.x + region[0] - 1 && focus.y >= metrics.paint.y + region[1] - 1
          && focus.right <= metrics.paint.x + region[2] + 1 && focus.bottom <= metrics.paint.y + region[3] + 1
        const hits = metrics.panels.filter(panel => panel.overlap.width > 1 && panel.overlap.height > 1)
        if (!inside || hits.length) faceIssues.push({ id, screen, inside, region, focus, hits })
        const mode = await root.getAttribute('data-splash-frame-mode')
        const fullCanvas = {
          mode,
          cover: metrics.background.size === 'cover',
          untransformed: metrics.background.transform === 'none',
          unfiltered: metrics.background.filter === 'none',
          unmasked: metrics.background.mask === 'none',
          singlePainting: ['none', 'normal'].includes(metrics.background.duplicateContent) && metrics.background.duplicateImage === 'none',
          fillsShell: Math.abs(metrics.paint.x - metrics.shell.x) <= 1 && Math.abs(metrics.paint.y - metrics.shell.y) <= 1
            && Math.abs(metrics.paint.width - metrics.shell.width) <= 1 && Math.abs(metrics.paint.height - metrics.shell.height) <= 1,
          coversCanvas: metrics.paintedImage.x <= metrics.paint.x + 1 && metrics.paintedImage.y <= metrics.paint.y + 1
            && metrics.paintedImage.right >= metrics.paint.x + metrics.paint.width - 1 && metrics.paintedImage.bottom >= metrics.paint.y + metrics.paint.height - 1,
        }
        if (mode !== 'cover' || Object.entries(fullCanvas).some(([key, value]) => key !== 'mode' && value !== true)) renderIssues.push({ id, screen, fullCanvas, background: metrics.background })
        if ((await root.getAttribute('data-splash-focus-clear') === 'true') !== inside) errors.push(`${id}/${screen}: runtime and measured focus clearance disagree`)
        const overflow = {
          shellHorizontal: metrics.layout.rootScrollWidth > metrics.layout.rootClientWidth + 2,
          contentHorizontal: metrics.layout.contentScrollWidth > metrics.layout.contentClientWidth + 2,
          contentVertical: metrics.layout.contentScrollHeight > metrics.layout.contentClientHeight + 2,
        }
        if (Object.values(overflow).some(Boolean)) layoutIssues.push({ id, screen, overflow, layout: metrics.layout })
        if (!metrics.source.endsWith(art.src)) errors.push(`${id}/${screen}: artwork URL differs from catalog`)
        if (await page.evaluate(() => localStorage.getItem('arkamon-save')) !== 'protected-splash-gallery-inspection') errors.push(`${id}/${screen}: gallery changed campaign storage`)
        records.push({ id, speciesId: id, screen, inside, region, hits: hits.map(hit => hit.selector), overflow, fullCanvas, ...metrics })
        if (selected.has(id) || !inside || hits.length || renderIssues.some(issue => issue.id === id && issue.screen === screen)) await page.screenshot({ path: `${directory}/gallery-${String(id).padStart(3, '0')}-${screen}.png`, animations: 'disabled' })
      } catch (error) {
        errors.push(`${id}/${screen}: ${String(error)}`)
      }
      if ((records.length + errors.length) % 36 === 0) console.log(JSON.stringify({ checked: records.length, faceIssues: faceIssues.length, layoutIssues: layoutIssues.length, renderIssues: renderIssues.length, errors: errors.length }))
    }
    await page.close()
  }))
} finally {
  await browser.close()
}
records.sort((a, b) => a.id - b.id || a.screen.localeCompare(b.screen))
const date = new Date().toISOString(), catalogSha256 = hash(await fs.readFile(catalogFile))
if (catalogSha256 !== catalogSha256AtStart) errors.push('Catalog changed during the audit; rerun against a stable catalog')
if (records.length !== jobs.length) errors.push(`Inspected ${records.length}/${jobs.length} screens`)
const report = { date, started, completed: date, framingPolicy: 'cover-only-v2', catalogSha256, catalogSha256AtStart, origin, viewport, catalogIds: catalog.map(art => art.speciesId), availableForms: catalog.length, inspectedScreens: records.length, checked: records.length, faceIssues, layoutIssues, renderIssues, errors, records }
await fs.writeFile(resultFile, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ checked: records.length, faceIssues: faceIssues.length, layoutIssues: layoutIssues.length, renderIssues: renderIssues.length, errors, catalogSha256, resultFile }))
if (faceIssues.length || layoutIssues.length || renderIssues.length || errors.length) process.exitCode = 1
