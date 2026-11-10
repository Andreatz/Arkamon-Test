import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const importedSpecies = Array.from({ length: 19 }, (_, index) => index + 92)
// Fire, leafy wings, branching foliage, feathered/broad silhouettes, dark
// particles and each legendary shape are exercised in the mobile renderer.
const mobileSpecies = [92, 95, 98, 100, 102, 104, 106, 107, 108, 109, 110]
type Animation = 'idle' | 'attack' | 'hit' | 'victory' | 'ko'
interface NativeEvent { kind: string; animation: Animation; frame: number; time: number }
interface ImportHarness {
  events: NativeEvent[]
  play: (animation: Animation) => void
  stats: () => { peakDecodedBytes: number; peakDecodes: number }
  close: () => void
}
declare global { interface Window { nativeImport92To110: ImportHarness } }

interface SourceMetadata {
  source: { decodedFrameCount: number; fps: number }
  sampling: { allSourceFramesPreserved: boolean; sourceFrameIndices: number[] }
  sheet: { frameCount: number; fps: number }
  timing: { releaseFrame: number; reactionFrame: number }
}
function sourceMetadata(species: number, action: Animation): SourceMetadata {
  return JSON.parse(readFileSync(resolve(`public/sprites/arkamon/${species}/front/${action}.metadata.json`), 'utf8'))
}

for (const species of importedSpecies) test(`import ${species}: five native actions, every source frame, cues and held final KO`, async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile && !mobileSpecies.includes(species), 'Eleven representative mobile forms; desktop covers all nineteen supplied sets.')
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
    window.nativeImport92To110 = harness.mountNativePages(id, 'idle', 'low', false, 'fast') as ImportHarness
  }, species)
  const sprite = page.locator('[data-sprite-renderer="paged-canvas"]')
  const idle = sourceMetadata(species, 'idle')
  await expect(sprite).toBeVisible()
  // The isolated harness doubles the supplied native FPS. Laboratory scenarios
  // below exercise the actual 24 FPS playback and synchronized VFX lifecycle.
  await expect(sprite).toHaveAttribute('data-sprite-fps', String(idle.sheet.fps * 2))
  await expect(sprite).toHaveAttribute('data-sprite-frame-count', String(idle.sheet.frameCount))
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
  // Crossing the final idle page prevents a valid opening frame from concealing
  // a missing later idle page. The four one-shots must complete in full below.
  await checkAllPagesRequested('idle')

  for (const action of ['attack', 'hit', 'victory', 'ko'] as const) {
    const conversion = sourceMetadata(species, action)
    const frameCount = conversion.sheet.frameCount, playbackFps = conversion.sheet.fps * 2
    expect(frameCount).toBe(conversion.source.decodedFrameCount)
    expect(conversion.sheet.fps).toBe(conversion.source.fps)
    expect(conversion.sampling.allSourceFramesPreserved).toBe(true)
    expect(conversion.sampling.sourceFrameIndices).toEqual(Array.from({ length: frameCount }, (_, index) => index))
    await page.evaluate(next => window.nativeImport92To110.play(next), action)
    await expect.poll(() => page.evaluate(next => window.nativeImport92To110.events.filter(event => event.kind === 'complete' && event.animation === next).length, action)).toBe(1)
    const events = await page.evaluate(() => window.nativeImport92To110.events)
    expect(events.filter(event => event.kind === 'error')).toEqual([])
    const start = events.find(event => event.kind === 'start' && event.animation === action)!
    const complete = events.find(event => event.kind === 'complete' && event.animation === action)!
    expect(start).toBeDefined()
    expect(complete.time - start.time).toBeGreaterThanOrEqual((frameCount - 2) / playbackFps * 1000)
    if (action === 'attack' || action === 'hit') {
      const cue = action === 'attack' ? 'release' : 'reaction'
      const marker = action === 'attack' ? conversion.timing.releaseFrame : conversion.timing.reactionFrame
      const emitted = events.filter(event => event.kind === cue && event.animation === action)
      expect(emitted).toHaveLength(1)
      expect(emitted[0].frame).toBeGreaterThanOrEqual(marker)
      expect(emitted[0].time - start.time).toBeGreaterThanOrEqual((marker - 1) / playbackFps * 1000)
    }
    if (action === 'ko') {
      await expect(sprite).toHaveAttribute('data-sprite-frame', String(frameCount - 1))
      await page.waitForTimeout(250)
      await expect(sprite).toHaveAttribute('data-sprite-frame', String(frameCount - 1))
    }
    await checkAllPagesRequested(action)
    const stats = await page.evaluate(() => window.nativeImport92To110.stats())
    expect(stats.peakDecodedBytes).toBeLessThanOrEqual(32 * 1024 * 1024)
    expect(stats.peakDecodes).toBeLessThanOrEqual(2)
  }
  expect(requests.some(url => new RegExp(`/sprites/arkamon/${species}/front/(idle|attack|hit|victory|ko)\\.webp(?:\\?|$)`).test(url))).toBe(false)
  await expect(page.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
  expect(errors).toEqual([])
  await page.evaluate(() => window.nativeImport92To110.close())
})

test.describe('complete native legendary laboratory integration', () => {
  test.use({ reducedMotion: 'no-preference' })

  for (const [attacker, target] of [[107, 110], [108, 109]]) {
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
