import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const importedSpecies = [111, 112, 113, 114, 115, 116]
type Animation = 'idle' | 'attack' | 'hit' | 'victory' | 'ko'
interface NativeEvent { kind: string; animation: Animation; frame: number; time: number }
interface ImportHarness {
  events: NativeEvent[]
  play: (animation: Animation) => void
  stats: () => { peakDecodedBytes: number; peakDecodes: number }
  close: () => void
}
declare global { interface Window { nativeImport111To116: ImportHarness } }

interface SourceMetadata {
  source: { decodedFrameCount: number; fps: number }
  sampling: { allSourceFramesPreserved: boolean; sourceFrameIndices: number[] }
  sheet: { frameCount: number; fps: number }
  timing: { releaseFrame: number; reactionFrame: number }
}
function sourceMetadata(species: number, action: Animation): SourceMetadata {
  return JSON.parse(readFileSync(resolve(`public/sprites/arkamon/${species}/front/${action}.metadata.json`), 'utf8'))
}

for (const species of importedSpecies) test(`import ${species}: all five supplied actions, native cues and held final KO`, async ({ page }, testInfo) => {
  const errors: string[] = [], requests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => {
    if (request.url().includes('/arkamon-paged/')) errors.push(`${request.url()}: ${request.failure()?.errorText}`)
  })
  page.on('response', response => {
    if (response.url().includes('/arkamon-paged/') && response.status() >= 400) errors.push(`${response.url()}: HTTP ${response.status()}`)
  })
  page.on('request', request => requests.push(request.url()))
  await page.goto('/')
  await page.evaluate(async id => {
    const harness = await import('/e2e/native-pages-harness.tsx')
    window.nativeImport111To116 = harness.mountNativePages(id, 'idle', 'low', false, 'fast') as ImportHarness
  }, species)
  const sprite = page.locator('[data-sprite-renderer="paged-canvas"]')
  const idle = sourceMetadata(species, 'idle')
  await expect(sprite).toBeVisible()
  // The isolated harness doubles the native rate; the actual lab below retains 24 FPS.
  await expect(sprite).toHaveAttribute('data-sprite-fps', '48')
  await expect(sprite).toHaveAttribute('data-sprite-frame-count', String(idle.source.decodedFrameCount))
  await expect.poll(() => sprite.getAttribute('data-sprite-frame').then(Number)).toBeGreaterThan(1)
  expect(await sprite.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 3; index < rgba.length; index += 4) if (rgba[index] > 16) count++
    return count
  })).toBeGreaterThan(1000)
  await page.screenshot({ path: testInfo.outputPath('native-idle.png') })

  const paged = JSON.parse(readFileSync(resolve('src/data/arkamon-paged.json'), 'utf8')) as {
    clips: Record<string, { pages: { src: string; firstFrame: number }[] }>
  }
  const checkAllPagesRequested = async (action: Animation) => {
    const pages = paged.clips[`/sprites/arkamon/${species}/front/${action}.webp`].pages
    await expect.poll(() => pages.every(part => requests.some(url => new URL(url).pathname === part.src))).toBe(true)
  }
  await checkAllPagesRequested('idle')

  for (const action of ['attack', 'hit', 'victory', 'ko'] as const) {
    const conversion = sourceMetadata(species, action)
    const frameCount = conversion.sheet.frameCount
    expect(frameCount).toBe(conversion.source.decodedFrameCount)
    expect([94, 95]).toContain(frameCount)
    expect(conversion.sheet.fps).toBe(conversion.source.fps)
    expect(conversion.sampling.allSourceFramesPreserved).toBe(true)
    expect(conversion.sampling.sourceFrameIndices).toEqual(Array.from({ length: frameCount }, (_, index) => index))
    await page.evaluate(next => window.nativeImport111To116.play(next), action)
    await expect.poll(() => page.evaluate(next => window.nativeImport111To116.events.filter(event => event.kind === 'complete' && event.animation === next).length, action)).toBe(1)
    const events = await page.evaluate(() => window.nativeImport111To116.events)
    expect(events.filter(event => event.kind === 'error')).toEqual([])
    const start = events.find(event => event.kind === 'start' && event.animation === action)!
    const complete = events.find(event => event.kind === 'complete' && event.animation === action)!
    expect(start).toBeDefined()
    expect(complete.time - start.time).toBeGreaterThanOrEqual((frameCount - 2) / 48 * 1000)
    if (action === 'attack' || action === 'hit') {
      const cue = action === 'attack' ? 'release' : 'reaction'
      const marker = action === 'attack' ? conversion.timing.releaseFrame : conversion.timing.reactionFrame
      const emitted = events.filter(event => event.kind === cue && event.animation === action)
      expect(emitted).toHaveLength(1)
      expect(emitted[0].frame).toBeGreaterThanOrEqual(marker)
      expect(emitted[0].time - start.time).toBeGreaterThanOrEqual((marker - 1) / 48 * 1000)
    }
    if (action === 'ko') {
      await expect(sprite).toHaveAttribute('data-sprite-frame', String(frameCount - 1))
      await page.waitForTimeout(250)
      await expect(sprite).toHaveAttribute('data-sprite-frame', String(frameCount - 1))
    }
    await checkAllPagesRequested(action)
    const stats = await page.evaluate(() => window.nativeImport111To116.stats())
    expect(stats.peakDecodedBytes).toBeLessThanOrEqual(32 * 1024 * 1024)
    expect(stats.peakDecodes).toBeLessThanOrEqual(2)
  }
  expect(requests.some(url => new RegExp(`/sprites/arkamon/${species}/front/(idle|attack|hit|victory|ko)\\.webp(?:\\?|$)`).test(url))).toBe(false)
  await expect(page.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
  expect(errors).toEqual([])
  await page.evaluate(() => window.nativeImport111To116.close())
})

test.describe('pending Arkamon graphic catalog in the actual laboratory', () => {
  test.use({ reducedMotion: 'no-preference' })

  for (const species of importedSpecies) test(`laboratory ${species}: native preview without invented battle data`, async ({ page }, testInfo) => {
    const errors: string[] = [], missingBackRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (request.url().includes(`/back_sprites/${species}.png`)) missingBackRequests.push(request.url())
    })
    await page.goto('/#arkamon-lab')
    await page.locator('#darklaw-preview-species').selectOption(String(species))
    const lab = page.locator('[data-darklaw-lab]')
    await expect(lab).toHaveAttribute('data-asset-status', 'pending-game-data')
    await expect(lab).toHaveAttribute('data-preview-available', 'true')
    await expect(page.locator('[data-asset-pending]')).toContainText('Nome, mosse e attributi da definire')
    const reference = page.locator('[data-preview-card="static"] img')
    await expect(reference).toHaveAttribute('src', new RegExp(`/sprites/front_sprites/${species}\\.png$`))
    await expect.poll(() => reference.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true)
    await reference.evaluate(element => (element as HTMLImageElement).decode())
    await expect(page.locator('#arkamon-preview-move')).toHaveCount(0)
    await expect(page.locator('#arkamon-preview-target')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Prova attacco con VFX', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retro', exact: true })).toBeDisabled()
    expect(await page.evaluate(async id => (await import('/src/data/index.ts')).getPokemon(id), species)).toBeUndefined()
    const comparison = page.locator('[data-preview-card="animated"]')
    const sprite = comparison.locator('[data-sprite-renderer="paged-canvas"]')
    await expect(sprite).toBeVisible()
    await expect(sprite).toHaveAttribute('data-sprite-fps', '24')
    await page.screenshot({ path: testInfo.outputPath('pending-native-laboratory.png'), fullPage: true })
    await page.locator('.darklaw-lab__comparison').screenshot({ path: testInfo.outputPath('pending-native-comparison.png') })
    // Scrubbing uses the real source frame count and verifies that the UI can
    // inspect the final frame, rather than a padded 96th frame.
    await page.getByRole('button', { name: 'KO', exact: true }).click()
    const ko = sourceMetadata(species, 'ko')
    await expect(sprite).toHaveAttribute('data-sprite-frame-count', String(ko.source.decodedFrameCount))
    await page.getByRole('button', { name: 'Ultimo fotogramma', exact: true }).click()
    // Review mode deliberately paints one paused frame; its source index and
    // the UI's original-frame range retain the unmodified clip identity.
    await expect(sprite).toHaveAttribute('data-sprite-frame-count', '1')
    await expect(sprite).toHaveAttribute('data-sprite-paused', 'true')
    await expect(sprite).toHaveAttribute('data-sprite-frame', String(ko.source.decodedFrameCount - 1))
    await expect(page.getByRole('slider', { name: 'Fotogramma sorgente', exact: true })).toHaveAttribute('max', String(ko.source.decodedFrameCount - 1))
    await page.getByRole('button', { name: 'Attesa', exact: true }).click()
    await expect(comparison).toHaveAttribute('data-preview-animation', 'idle')
    expect(missingBackRequests).toEqual([])
    expect(errors).toEqual([])
  })

  for (const species of [205, 184, 206]) test(`sprite-only ${species}: original portrait and explicit missing data/video`, async ({ page }, testInfo) => {
    const errors: string[] = [], unavailableRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (request.url().includes(`/back_sprites/${species}.png`) || request.url().includes(`/arkamon-paged/${species}/`)) unavailableRequests.push(request.url())
    })
    await page.goto('/#arkamon-lab')
    await page.locator('#darklaw-preview-species').selectOption(String(species))
    const lab = page.locator('[data-darklaw-lab]')
    await expect(lab).toHaveAttribute('data-asset-status', 'pending-game-data')
    await expect(lab).toHaveAttribute('data-preview-available', 'false')
    await expect(page.locator('[data-asset-pending]')).toContainText('Nome, mosse e attributi da definire')
    await expect(page.getByText('Nessun video disponibile', { exact: false }).first()).toBeVisible()
    const portraits = page.locator('[data-asset-portrait]')
    await expect(portraits).toHaveCount(2)
    for (const portrait of await portraits.all()) {
      await expect(portrait).toHaveAttribute('data-asset-image-state', 'ready')
      await expect(portrait).toBeVisible()
      await expect(portrait.locator('image')).toHaveAttribute('href', new RegExp(`/sprites/front_sprites/${species}\\.png$`))
    }
    await expect(lab.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Prova la sequenza', exact: true })).toHaveCount(0)
    await expect(page.locator('#arkamon-preview-move')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retro', exact: true })).toBeDisabled()
    expect(await page.evaluate(async id => (await import('/src/data/index.ts')).getPokemon(id), species)).toBeUndefined()
    await page.screenshot({ path: testInfo.outputPath('pending-static-laboratory.png'), fullPage: true })
    await page.locator('.darklaw-lab__comparison').screenshot({ path: testInfo.outputPath('pending-static-comparison.png') })
    expect(unavailableRequests).toEqual([])
    expect(errors).toEqual([])
  })

  test('a missing pending portrait reports its error and retries the original PNG successfully', async ({ page }, testInfo) => {
    const errors: string[] = []
    let unavailable = true, failedRequests = 0
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/sprites/front_sprites/205.png', async route => {
      if (!unavailable) return route.continue()
      failedRequests++
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Deliberately unavailable pending portrait' })
    })
    await page.goto('/#arkamon-lab')
    await page.locator('#darklaw-preview-species').selectOption('205')
    const portraits = page.locator('[data-asset-portrait]')
    await expect(portraits).toHaveCount(2)
    for (const portrait of await portraits.all()) {
      await expect(portrait).toHaveAttribute('data-asset-image-state', 'error')
      await expect(portrait.locator('image')).toHaveCount(0)
    }
    await expect(page.getByRole('button', { name: 'Riprova sprite', exact: true })).toHaveCount(2)
    await expect(page.getByText('Lo sprite non è stato caricato.', { exact: false }).first()).toBeVisible()
    expect(failedRequests).toBeGreaterThan(0)
    await page.locator('.darklaw-lab__comparison').screenshot({ path: testInfo.outputPath('pending-portrait-load-error.png') })

    unavailable = false
    for (const card of ['static', 'animated']) {
      const panel = page.locator(`[data-preview-card="${card}"]`)
      await panel.getByRole('button', { name: 'Riprova sprite', exact: true }).click()
      await expect(panel.locator('[data-asset-portrait]')).toHaveAttribute('data-asset-image-state', 'ready')
      await expect(panel.locator('[data-asset-portrait] image')).toHaveAttribute('href', /\/sprites\/front_sprites\/205\.png$/)
    }
    await expect(page.getByRole('button', { name: 'Riprova sprite', exact: true })).toHaveCount(0)
    await expect(page.getByText('Lo sprite non è stato caricato.', { exact: false })).toHaveCount(0)
    await page.locator('.darklaw-lab__comparison').screenshot({ path: testInfo.outputPath('pending-portrait-retry-ready.png') })
    expect(errors).toEqual([])
  })

  test('filters actual supplied IDs without filling the gaps or changing the playable catalog', async ({ page }) => {
    await page.goto('/#arkamon-lab')
    const select = page.locator('#darklaw-preview-species')
    await expect(select.locator('option')).toHaveCount(200)
    const suppliedIds = await select.locator('option').evaluateAll(options => options.map(option => Number((option as HTMLOptionElement).value)))
    const gameplayAvailability = await page.evaluate(async ids => {
      const { getPokemon } = await import('/src/data/index.ts')
      return ids.map(id => ({ id, playable: getPokemon(id) !== undefined }))
    }, suppliedIds)
    expect(gameplayAvailability.filter(entry => entry.playable).map(entry => entry.id)).toEqual(Array.from({ length: 110 }, (_, index) => index + 1))
    expect(gameplayAvailability.filter(entry => !entry.playable)).toHaveLength(90)
    expect(gameplayAvailability.filter(entry => !entry.playable).every(entry => entry.id > 110)).toBe(true)
    await expect(select.locator('option[value="133"]')).toHaveCount(1)
    await expect(select.locator('option[value="179"]')).toHaveCount(0)
    await page.locator('#darklaw-preview-filter').selectOption('pending-game-data')
    await expect(select.locator('option')).toHaveCount(90)
    await expect(select.locator('option[value="1"]')).toHaveCount(0)
    await expect(select.locator('option[value="206"]')).toHaveCount(1)
    await page.locator('#darklaw-preview-filter').selectOption('animated')
    await expect(select.locator('option')).toHaveCount(156)
    await expect(select.locator('option[value="206"]')).toHaveCount(0)
    await expect(select.locator('option[value="116"]')).toHaveCount(1)
    await expect(select.locator('option[value="139"]')).toHaveCount(1)
    await expect(select.locator('option[value="132"]')).toHaveCount(1)
    await expect(select.locator('option[value="133"]')).toHaveCount(1)
    await expect(select.locator('option[value="146"]')).toHaveCount(1)
    await page.locator('#darklaw-preview-filter').selectOption('all')
    await expect(select.locator('option')).toHaveCount(200)
  })
})
