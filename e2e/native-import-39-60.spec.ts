import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const importedSpecies = [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 56, 57, 58, 59, 60]
type Animation = 'idle' | 'attack' | 'hit' | 'victory' | 'ko'
interface Event { kind: string; animation: Animation; frame: number; time: number }
interface Harness {
  events: Event[]
  play: (animation: Animation) => void
  stats: () => { peakDecodedBytes: number; peakDecodes: number }
  close: () => void
}
declare global { interface Window { importedNative: Harness } }

for (const species of importedSpecies) test(`import ${species}: five native actions, source cues and held final KO`, async ({ page, isMobile }) => {
  // Desktop covers every clip; mobile exercises all three short-clip forms and the water flash.
  test.skip(isMobile && ![41, 47, 52, 57].includes(species), 'Representative mobile coverage; every form is covered on desktop.')
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
    window.importedNative = harness.mountNativePages(id, 'idle', 'low', false, 'fast') as Harness
  }, species)
  const sprite = page.locator('[data-sprite-renderer="paged-canvas"]')
  await expect(sprite).toBeVisible()
  await expect(sprite).toHaveAttribute('data-sprite-fps', '48')
  await expect.poll(() => sprite.getAttribute('data-sprite-frame').then(Number)).toBeGreaterThan(1)
  expect(await sprite.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 16) count++
    return count
  })).toBeGreaterThan(1000)

  for (const action of ['attack', 'hit', 'victory', 'ko'] as const) {
    await page.evaluate(next => window.importedNative.play(next), action)
    await expect.poll(() => page.evaluate(next => window.importedNative.events.filter(event => event.kind === 'complete' && event.animation === next).length, action)).toBe(1)
    const events = await page.evaluate(() => window.importedNative.events)
    expect(events.filter(event => event.kind === 'error')).toEqual([])
    const start = events.find(event => event.kind === 'start' && event.animation === action)!
    const complete = events.find(event => event.kind === 'complete' && event.animation === action)!
    const conversion = JSON.parse(readFileSync(resolve(`public/sprites/arkamon/${species}/front/${action}.metadata.json`), 'utf8'))
    const frameCount: number = conversion.sheet.frameCount
    expect(start).toBeDefined()
    expect(complete.time - start.time).toBeGreaterThanOrEqual((frameCount - 2) / 48 * 1000)
    if (action === 'attack' || action === 'hit') {
      const cue = action === 'attack' ? 'release' : 'reaction'
      const marker: number = action === 'attack' ? conversion.timing.releaseFrame : conversion.timing.reactionFrame
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
    expect(requests.some(url => url.includes(`/arkamon-paged/${species}/front/${action}/page-`))).toBe(true)
  }
  const stats = await page.evaluate(() => window.importedNative.stats())
  expect(stats.peakDecodedBytes).toBeLessThanOrEqual(32 * 1024 * 1024)
  expect(stats.peakDecodes).toBeLessThanOrEqual(2)
  expect(requests.some(url => new RegExp(`/sprites/arkamon/${species}/front/(idle|attack|hit|victory|ko)\\.webp(?:\\?|$)`).test(url))).toBe(false)
  await expect(page.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
  expect(errors).toEqual([])
  await page.evaluate(() => window.importedNative.close())
})

test.describe('native lab preview', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('mobile lab releases comparison memory while the native attack and reaction finish', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Exercises the automatic 32 MiB mobile budget.')
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/#arkamon-lab')
    await page.locator('#darklaw-preview-species').selectOption('52')
    const comparison = page.locator('[data-preview-card="animated"]')
    await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
    await page.locator('#arkamon-preview-target').selectOption('57')
    await page.getByRole('button', { name: 'Prova attacco con VFX', exact: true }).click()
    const stage = page.locator('[data-preview-sync-phase]')
    await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(0)
    await expect(stage.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(2)
    await expect(stage.locator('[data-arkamon-renderer="procedural"]')).toHaveCount(0)
    await expect(stage).toHaveAttribute('data-preview-sync-phase', 'complete', { timeout: 30_000 })
    const events: { event: string; atMs: number }[] = JSON.parse((await stage.getAttribute('data-preview-sync-events'))!)
    for (const event of ['attacker-ready', 'target-ready', 'release', 'impact', 'target-reaction', 'attacker-complete', 'target-complete', 'complete']) {
      expect(events.filter(entry => entry.event === event)).toHaveLength(1)
    }
    expect(events.find(entry => entry.event === 'target-reaction')!.atMs).toBeGreaterThanOrEqual(events.find(entry => entry.event === 'impact')!.atMs)
    await expect(stage.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(0)
    await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prova attacco con VFX', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Attacco', exact: true }).click()
    await expect(comparison.locator('[data-arkamon-active-animation="attack"] [data-sprite-renderer="paged-canvas"]')).toBeVisible()
    await expect(comparison.locator('[data-arkamon-active-animation="idle"] [data-sprite-renderer="paged-canvas"]')).toBeVisible()
    const stats = await page.evaluate(async () => (await import('/src/utils/spritePageCache.ts')).nativeSpritePageCache.stats())
    expect(stats.budgetBytes).toBe(32 * 1024 * 1024)
    expect(stats.peakDecodedBytes).toBeLessThanOrEqual(stats.budgetBytes)
    expect(errors).toEqual([])
  })

  test('mobile lab exits preparation and can retry when the native target and fallback image fail', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Companion regression for the mobile preview.')
    await page.route('**/arkamon-paged/57/front/hit/**', route => route.fulfill({ status: 404, body: '' }))
    await page.route('**/front_sprites/57.png', route => route.fulfill({ status: 404, body: '' }))
    await page.goto('/#arkamon-lab')
    await page.locator('#darklaw-preview-species').selectOption('52')
    await page.locator('#arkamon-preview-target').selectOption('57')
    // The loading poster must already have failed before the canvas fails, so
    // switching to the procedural fallback cannot accidentally reuse its old
    // error event. This makes the cached-image handover regression repeatable.
    await expect.poll(() => page.locator('[data-preview-sync-side="B"] img[src$="/front_sprites/57.png"]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 0)).toBe(true)
    const play = page.getByRole('button', { name: 'Prova attacco con VFX', exact: true })
    await play.click()
    await expect(page.locator('[data-preview-sync-phase]')).toHaveAttribute('data-preview-sync-phase', 'error')
    await expect(play).toBeEnabled()
    await expect(page.locator('[data-preview-card="animated"] [data-sprite-renderer="paged-canvas"]')).toBeVisible()
    await page.locator('#arkamon-preview-target').selectOption('53')
    await play.click()
    await expect(page.locator('[data-preview-sync-phase]')).toHaveAttribute('data-preview-sync-phase', 'complete', { timeout: 30_000 })
  })
})
