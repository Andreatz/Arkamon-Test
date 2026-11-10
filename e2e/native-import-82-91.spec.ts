import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const importedSpecies = Array.from({ length: 10 }, (_, index) => index + 82)
const mobileSpecies = [82, 85, 88, 91]
type Animation = 'idle' | 'attack' | 'hit' | 'victory' | 'ko'
interface NativeEvent { kind: string; animation: Animation; frame: number; time: number }
interface ImportHarness {
  events: NativeEvent[]
  play: (animation: Animation) => void
  stats: () => { peakDecodedBytes: number; peakDecodes: number }
  close: () => void
}
declare global { interface Window { nativeImport82To91: ImportHarness } }

for (const species of importedSpecies) test(`import ${species}: five native actions, source cues and held final KO`, async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile && !mobileSpecies.includes(species), 'Four representative mobile forms; desktop covers all ten supplied sets.')
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
    window.nativeImport82To91 = harness.mountNativePages(id, 'idle', 'low', false, 'fast') as ImportHarness
  }, species)
  const sprite = page.locator('[data-sprite-renderer="paged-canvas"]')
  await expect(sprite).toBeVisible()
  // The harness intentionally doubles native 24 FPS for the isolated checks;
  // the real laboratory scenarios below keep normal native playback speed.
  await expect(sprite).toHaveAttribute('data-sprite-fps', '48')
  await expect.poll(() => sprite.getAttribute('data-sprite-frame').then(Number)).toBeGreaterThan(1)
  expect(await sprite.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 3; index < rgba.length; index += 4) if (rgba[index] > 16) count++
    return count
  })).toBeGreaterThan(1000)
  expect(requests.some(url => url.includes(`/arkamon-paged/${species}/front/idle/page-`))).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('native-idle.png') })

  for (const action of ['attack', 'hit', 'victory', 'ko'] as const) {
    await page.evaluate(next => window.nativeImport82To91.play(next), action)
    await expect.poll(() => page.evaluate(next => window.nativeImport82To91.events.filter(event => event.kind === 'complete' && event.animation === next).length, action)).toBe(1)
    const events = await page.evaluate(() => window.nativeImport82To91.events)
    expect(events.filter(event => event.kind === 'error')).toEqual([])
    const start = events.find(event => event.kind === 'start' && event.animation === action)!
    const complete = events.find(event => event.kind === 'complete' && event.animation === action)!
    const conversion = JSON.parse(readFileSync(resolve(`public/sprites/arkamon/${species}/front/${action}.metadata.json`), 'utf8'))
    const frameCount: number = conversion.sheet.frameCount
    expect(frameCount).toBe(species === 83 && action === 'ko' ? 95 : 96)
    expect(conversion.sheet.fps).toBe(24)
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
    const stats = await page.evaluate(() => window.nativeImport82To91.stats())
    expect(stats.peakDecodedBytes).toBeLessThanOrEqual(32 * 1024 * 1024)
    expect(stats.peakDecodes).toBeLessThanOrEqual(2)
  }
  expect(requests.some(url => new RegExp(`/sprites/arkamon/${species}/front/(idle|attack|hit|victory|ko)\\.webp(?:\\?|$)`).test(url))).toBe(false)
  await expect(page.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
  expect(errors).toEqual([])
  await page.evaluate(() => window.nativeImport82To91.close())
})

test.describe('new native laboratory integration', () => {
  test.use({ reducedMotion: 'no-preference' })

  for (const [attacker, target] of [[82, 91], [85, 88]]) {
    test(`laboratory ${attacker} versus ${target}: native cues, comparison lifecycle and cache budget`, async ({ page }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('requestfailed', request => {
        if (request.url().includes('/arkamon-paged/')) errors.push(`${request.url()}: ${request.failure()?.errorText}`)
      })
      page.on('response', response => {
        if (response.url().includes('/arkamon-paged/') && response.status() >= 400) errors.push(`${response.url()}: HTTP ${response.status()}`)
      })
      await page.goto('/#arkamon-lab')
      await page.locator('#darklaw-preview-species').selectOption(String(attacker))
      const comparison = page.locator('[data-preview-card="animated"]')
      await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
      await page.locator('#arkamon-preview-target').selectOption(String(target))
      await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toHaveAttribute('data-sprite-fps', '24')
      await page.screenshot({ path: testInfo.outputPath('native-laboratory.png'), fullPage: true })
      const play = page.getByRole('button', { name: 'Prova attacco con VFX', exact: true })
      await play.click()
      const stage = page.locator('[data-preview-sync-phase]')
      await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(0)
      await expect(stage.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(2)
      for (const nativeSprite of await stage.locator('[data-sprite-renderer="paged-canvas"]').all()) {
        await expect(nativeSprite).toHaveAttribute('data-sprite-fps', '24')
      }
      await expect(stage.locator('[data-arkamon-renderer="procedural"]')).toHaveCount(0)
      await expect(stage).toHaveAttribute('data-preview-sync-phase', 'complete', { timeout: 30_000 })
      const events: { event: string; atMs: number }[] = JSON.parse((await stage.getAttribute('data-preview-sync-events'))!)
      for (const name of ['attacker-ready', 'target-ready', 'release', 'impact', 'target-reaction', 'attacker-complete', 'target-complete', 'complete']) {
        expect(events.filter(entry => entry.event === name)).toHaveLength(1)
      }
      expect(events.find(entry => entry.event === 'target-reaction')!.atMs).toBeGreaterThanOrEqual(events.find(entry => entry.event === 'impact')!.atMs)
      await expect(stage.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(0)
      await expect(comparison.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
      await expect(play).toBeEnabled()
      const stats = await page.evaluate(async () => (await import('/src/utils/spritePageCache.ts')).nativeSpritePageCache.stats())
      expect(stats.peakDecodedBytes).toBeLessThanOrEqual(stats.budgetBytes)
      expect(errors).toEqual([])
    })
  }
})
