import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const importedSpecies = [117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 134, 139]
// Independently decoded source counts, retained outside generated metadata.
const nativeSourceCounts = JSON.parse(readFileSync(resolve('src/components/arkamon/__tests__/fixtures/native-import-2026-11-04.json'), 'utf8')) as Record<number, Record<Animation, number>>
type Animation = 'idle' | 'attack' | 'hit' | 'victory' | 'ko'
interface NativeEvent { kind: string; animation: Animation; frame: number; time: number }
interface ImportHarness {
  events: NativeEvent[]
  play: (animation: Animation) => void
  stats: () => { peakDecodedBytes: number; peakDecodes: number }
  close: () => void
}
declare global { interface Window { nativeImportNovember4: ImportHarness } }

interface SourceMetadata {
  source: { decodedFrameCount: number; fps: number }
  sampling: { allSourceFramesPreserved: boolean; sourceFrameIndices: number[] }
  sheet: { frameCount: number; fps: number }
  timing: { releaseFrame: number; reactionFrame: number }
  transform: { sharedTransform: { scaleReference?: string; idleBodyHeightOutputPixels: number;
    reference: { bodyHeightFraction: number }; viewport: { height: number } } }
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
    window.nativeImportNovember4 = harness.mountNativePages(id, 'idle', 'low', false, 'fast') as ImportHarness
  }, species)
  const sprite = page.locator('[data-sprite-renderer="paged-canvas"]')
  const idle = sourceMetadata(species, 'idle')
  await expect(sprite).toBeVisible()
  // The isolated harness doubles the native rate; the actual lab below retains 24 FPS.
  await expect(sprite).toHaveAttribute('data-sprite-fps', '48')
  expect(idle.source.decodedFrameCount).toBe(nativeSourceCounts[species].idle)
  await expect(sprite).toHaveAttribute('data-sprite-frame-count', String(nativeSourceCounts[species].idle))
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
    expect(frameCount).toBe(nativeSourceCounts[species][action])
    expect(conversion.sheet.fps).toBe(conversion.source.fps)
    expect(conversion.sampling.allSourceFramesPreserved).toBe(true)
    expect(conversion.sampling.sourceFrameIndices).toEqual(Array.from({ length: frameCount }, (_, index) => index))
    await page.evaluate(next => window.nativeImportNovember4.play(next), action)
    await expect.poll(() => page.evaluate(next => window.nativeImportNovember4.events.filter(event => event.kind === 'complete' && event.animation === next).length, action)).toBe(1)
    const events = await page.evaluate(() => window.nativeImportNovember4.events)
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
    const stats = await page.evaluate(() => window.nativeImportNovember4.stats())
    expect(stats.peakDecodedBytes).toBeLessThanOrEqual(32 * 1024 * 1024)
    expect(stats.peakDecodes).toBeLessThanOrEqual(2)
  }
  expect(requests.some(url => new RegExp(`/sprites/arkamon/${species}/front/(idle|attack|hit|victory|ko)\\.webp(?:\\?|$)`).test(url))).toBe(false)
  await expect(page.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
  expect(errors).toEqual([])
  await page.evaluate(() => window.nativeImportNovember4.close())
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
    if ([118, 119, 122, 123, 124, 128, 129, 130, 131].includes(species)) {
      const normalization = sourceMetadata(species, 'idle').transform.sharedTransform
      expect(normalization.scaleReference).toBe('Initial opaque body; all native motion and effects retained in canvas padding.')
      expect(normalization.idleBodyHeightOutputPixels).toBeGreaterThanOrEqual(
        normalization.viewport.height * normalization.reference.bodyHeightFraction * .95)
    }
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

})
