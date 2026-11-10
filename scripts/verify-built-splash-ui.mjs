import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { splashGeometry } from '../e2e/helpers/splashGeometry.ts'

const origin = process.env.SPLASH_PREVIEW_URL ?? 'http://127.0.0.1:3055/Arkamon-Beta/'
const catalogFile = 'ui-source/splash-artwork.generated.json'
const catalogBytes = await fs.readFile(catalogFile)
const catalog = JSON.parse(catalogBytes)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const catalogSha256 = hash(catalogBytes)
const ids = process.env.SPLASH_ALL_FORMS === '1'
  ? catalog.map(artwork => artwork.speciesId)
  : [4, 21, 22, 36, 37, 38, 41, 48, 49, 60, 61, 69, 82, 83, 88, 94, 97, 109, 110]
const viewports = [{ width: 1366, height: 768 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }]
const directory = path.resolve('output/splash-art/built-ui')
await fs.mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true }), results = [], issues = [], renderIssues = []
const started = new Date().toISOString()
try {
  await Promise.all(viewports.map(async viewport => {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' })
    page.on('pageerror', error => issues.push(error.message))
    await page.addInitScript(() => localStorage.setItem('arkamon-save', 'protected-built-splash-inspection'))
    for (const id of ids) for (const screen of ['squadra', 'arkadex']) {
      try {
        const artwork = catalog.find(entry => entry.speciesId === id)
        if (!artwork) throw new Error('Selected form is missing from the reviewed catalog')
        await page.goto(`${origin}?uiStudioPreview=1&uiConceptFluid=1&uiConcept=aurora&screen=${screen}&splash=${id}`, { waitUntil: 'domcontentloaded' })
        const root = page.locator(`.pu-shell[data-reference-splash-ready="true"][data-reference-splash-species="${id}"]`)
        await root.waitFor({ timeout: 30_000 })
        await root.filter({ has: page.locator('[data-splash-source]') }).waitFor()
        await page.waitForFunction(() => document.querySelector('.pu-shell')?.getAttribute('data-splash-frame-ready') === 'true')
        await root.evaluate(async element => {
          await document.fonts.ready
          await Promise.all([...element.querySelectorAll('img')].map(image => image.decode()))
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        })
        const metrics = await splashGeometry(root, screen, artwork.focusBounds ?? artwork.subjectBounds)
        const region = (await root.getAttribute('data-splash-frame-region') ?? '').split(',').map(Number), focus = metrics.creature
        const inside = region.length === 4 && region.every(Number.isFinite)
          && focus.x >= metrics.paint.x + region[0] - 1 && focus.y >= metrics.paint.y + region[1] - 1
          && focus.right <= metrics.paint.x + region[2] + 1 && focus.bottom <= metrics.paint.y + region[3] + 1
        if (!inside) issues.push(`${viewport.width}/${id}/${screen}: focus leaves the protected opening`)
        if (metrics.panels.some(panel => panel.overlap.width > 1 && panel.overlap.height > 1)) issues.push(`${viewport.width}/${id}/${screen}: critical region overlaps UI`)
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
        if (mode !== 'cover' || Object.entries(fullCanvas).some(([key, value]) => key !== 'mode' && value !== true)) renderIssues.push({ viewport, id, screen, fullCanvas, background: metrics.background })
        if ((await root.getAttribute('data-splash-focus-clear') === 'true') !== inside) issues.push(`${viewport.width}/${id}/${screen}: runtime and measured focus clearance disagree`)
        if (metrics.layout.rootScrollWidth > metrics.layout.rootClientWidth + 2 || metrics.layout.contentScrollWidth > metrics.layout.contentClientWidth + 2 || metrics.layout.contentScrollHeight > metrics.layout.contentClientHeight + 2) issues.push(`${viewport.width}/${id}/${screen}: overflow`)
        if (!metrics.source.endsWith(artwork.src)) issues.push(`${viewport.width}/${id}/${screen}: built artwork URL differs from reviewed source`)
        if (await page.evaluate(() => localStorage.getItem('arkamon-save')) !== 'protected-built-splash-inspection') issues.push(`${viewport.width}/${id}/${screen}: preview changed protected campaign storage`)
        const screenshot = `${viewport.width}-${String(id).padStart(3, '0')}-${screen}.png`
        await page.screenshot({ path: path.join(directory, screenshot), animations: 'disabled' })
        results.push({ viewport, id, screen, screenshot, inside, region, fullCanvas, ...metrics })
        if (results.length % 66 === 0) console.log(JSON.stringify({ checked: results.length, issues: issues.length, renderIssues: renderIssues.length }))
      } catch (error) {
        issues.push(`${viewport.width}/${id}/${screen}: ${String(error)}`)
      }
    }
    await page.close()
    console.log(JSON.stringify({ viewport, inspectedScreens: results.length, issues: issues.length, renderIssues: renderIssues.length }))
  }))
} finally { await browser.close() }
if (hash(await fs.readFile(catalogFile)) !== catalogSha256) issues.push('Catalog changed during the built UI audit')
if (results.length !== ids.length * viewports.length * 2) issues.push('Incomplete built UI audit')
const report = { date: new Date().toISOString(), started, origin, framingPolicy: 'cover-only-v2', scope: process.env.SPLASH_ALL_FORMS === '1' ? 'all-published-forms' : 'selected-forms', catalogSha256, catalogIds: ids, viewports, inspectedScreens: results.length, issues, renderIssues, results }
await fs.writeFile(path.join(directory, 'measurements.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ inspectedScreens: results.length, issues, renderIssues: renderIssues.length, result: 'output/splash-art/built-ui/measurements.json' }))
if (issues.length || renderIssues.length) process.exitCode = 1
