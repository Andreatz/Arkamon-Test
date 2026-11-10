import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const browser = await chromium.launch({ headless: true })
const origin = process.env.UI_EXAMPLES_URL || 'http://127.0.0.1:3000'
const out = path.resolve(process.env.UI_EXAMPLES_OUTPUT || 'output/ui-asset-examples')
await fs.mkdir(out, { recursive: true })
const errors = [], results = []
try {
  for (const viewport of [{ width: 1440, height: 1250, name: 'desktop' }, { width: 1280, height: 900, name: 'compact' }, { width: 390, height: 844, name: 'mobile' }, { width: 320, height: 844, name: 'small' }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(origin).origin) errors.push(`${response.status()} ${response.url()}`) })
    await page.goto(new URL('?uiStudioPreview=1&assetExamples=1', origin).href)
    await page.getByRole('heading', { name: 'Gli asset al loro posto' }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    for (const [id, label] of [['borsa', 'Borsa'], ['squadra', 'Squadra'], ['laboratorio', 'Laboratorio'], ['controlli', 'Comandi e opzioni']]) {
      await page.getByRole('navigation', { name: 'Esempio da visualizzare' }).getByRole('button', { name: label, exact: true }).click()
      await page.locator(`.ua-product-${id}`).waitFor()
      await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))) })
      if (id === 'borsa') {
        await page.getByRole('button', { name: 'Superpozione: 4 disponibili', exact: true }).click()
        if (await page.locator('.ua-item-detail h3').textContent() !== 'Superpozione') throw new Error('Item selection failed')
        await page.getByRole('button', { name: 'Cattura', exact: true }).click()
        if (await page.locator('.ua-inventory-cell button').count() !== 1) throw new Error('Item category failed')
        if (await page.locator('.ua-item-detail h3').textContent() !== 'Masterball') throw new Error('Filtered item details failed')
        await page.getByRole('button', { name: 'Tutti', exact: true }).click()
        await page.getByRole('button', { name: 'Pozione: 8 disponibili', exact: true }).click()
      }
      if (id === 'squadra') {
        await page.getByRole('button', { name: 'Successivo', exact: true }).click()
        if (await page.locator('.ua-hero-preview h3').textContent() === 'Vyrath') throw new Error('Squad selection failed')
        await page.getByRole('button', { name: 'Seleziona Vyrath', exact: true }).click()
      }
      if (id === 'laboratorio') {
        await page.getByRole('button', { name: 'Seleziona Darklaw', exact: true }).click()
        if (!(await page.locator('.ua-lab-choice').textContent()).includes('Darklaw')) throw new Error('Lab choice failed')
      }
      if (id === 'controlli') {
        const audio = page.getByRole('button', { name: 'Audio dimostrativo' })
        await audio.click()
        if (await audio.getAttribute('aria-pressed') !== 'false') throw new Error('Audio toggle failed')
        await audio.click()
        await page.getByRole('button', { name: 'Aumenta quantità demo' }).click()
        if (await page.locator('.ua-quantity-display output').textContent() !== '4') throw new Error('Quantity failed')
        await page.getByRole('button', { name: 'Riduci quantità demo' }).click()
        await page.getByRole('button', { name: 'Pagina demo successiva' }).click()
        if (await page.locator('.ua-pager output').textContent() !== '2 / 3') throw new Error('Pager failed')
        await page.getByRole('button', { name: 'Chiudi esempio' }).click()
        await page.getByRole('button', { name: 'Riapri esempio' }).click()
      }
      for (const classic of [false, true]) {
        await page.getByRole('button', { name: classic ? 'Tre famiglie' : 'Asset dedicati', exact: true }).click()
        const broken = await page.locator('.ua-product img').evaluateAll(images => images.filter(img => !img.complete || !img.naturalWidth).map(img => img.src))
        const geometry = await page.locator('.ua-examples').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }))
        if (broken.length) throw new Error(`Broken images: ${JSON.stringify(broken)}`)
        if (geometry.scrollWidth > geometry.width + 1) throw new Error(`Horizontal overflow: ${JSON.stringify(geometry)}`)
        if (id === 'borsa') {
          const offsets = await page.evaluate(() => {
            const center = element => {
              const rect = element.getBoundingClientRect()
              return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
            }
            const mobile = getComputedStyle(document.querySelector('.ua-mobile-items')).display !== 'none'
            const frames = [...document.querySelectorAll(mobile ? '.ua-mobile-item-art' : '.ua-inventory-cell')]
            return frames.filter(frame => frame.getBoundingClientRect().width > 0).flatMap(frame => {
              const icon = frame.querySelector('img:not(.ua-surface):not(.ua-slot-selection)')
              if (!icon) return []
              const slot = center(frame), item = center(icon)
              return [{ x: item.x - slot.x, y: item.y - slot.y }]
            })
          })
          if (offsets.length !== 7 || offsets.some(offset => Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1)) {
            throw new Error('Inventory icons are not centered: ' + JSON.stringify(offsets))
          }
        }
        const product = page.locator('.ua-product')
        const box = await product.boundingBox()
        // Capture the complete scrollable example at the same width. Its layout
        // depends on width, not height; actual viewport/scroll checks run above.
        await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, Math.ceil(box.height + 400)) })
        await product.screenshot({ path: path.join(out, `${viewport.name}-${id}-${classic ? 'classic' : 'dedicated'}.png`) })
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        results.push({ viewport: viewport.name, example: id, style: classic ? 'classic' : 'dedicated', broken, geometry })
      }
      await page.getByRole('button', { name: 'Asset dedicati', exact: true }).click()
    }
    await context.close()
  }
  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`)
  await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify({ results, errors, interactions: ['item selection', 'item category', 'centered inventory icons', 'squad selection', 'starter choice', 'audio toggle', 'quantity', 'pagination', 'close/reopen'] }, null, 2))
  console.log(JSON.stringify({ checks: results.length, errors, output: out }))
} finally {
  await browser.close()
}
