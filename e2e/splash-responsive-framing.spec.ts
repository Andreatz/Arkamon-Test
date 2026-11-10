import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { splashGeometry, type SplashBounds } from './helpers/splashGeometry'

type Screen = 'squadra' | 'arkadex'
interface ReviewedSplash { speciesId: number; src: string; focusBounds?: SplashBounds; subjectBounds: SplashBounds }
const catalog: ReviewedSplash[] = JSON.parse(readFileSync(new URL('../ui-source/splash-artwork.generated.json', import.meta.url), 'utf8'))
const regressionIds = [4, 49, 60, 61, 69, 104, 108]

function artworkFor(id: number) {
  const artwork = catalog.find(entry => entry.speciesId === id)
  if (!artwork) throw new Error(`The responsive framing regression requires published artwork ${id}`)
  return artwork
}

async function framingSnapshot(root: Locator, screen: Screen, artwork: ReviewedSplash) {
  const geometry = await splashGeometry(root, screen, artwork.focusBounds ?? artwork.subjectBounds)
  const rawRegion = await root.getAttribute('data-splash-frame-region')
  const coordinates = (rawRegion ?? '').split(',').map(Number)
  const validRegion = coordinates.length === 4 && coordinates.every(Number.isFinite)
    && coordinates[2] > coordinates[0] && coordinates[3] > coordinates[1]
  const region = validRegion ? {
    left: geometry.paint.x + coordinates[0], top: geometry.paint.y + coordinates[1],
    right: geometry.paint.x + coordinates[2], bottom: geometry.paint.y + coordinates[3],
  } : geometry.background.presentation === 'card' ? { left: geometry.paint.x, top: geometry.paint.y, right: geometry.paint.x + geometry.paint.width, bottom: geometry.paint.y + geometry.paint.height } : null
  const focus = geometry.creature
  const focusInsideProtectedRegion = region !== null
    && focus.x >= region.left - 1 && focus.y >= region.top - 1
    && focus.right <= region.right + 1 && focus.bottom <= region.bottom + 1
  const overlaps = geometry.panels.filter(panel => panel.overlap.width > 1 && panel.overlap.height > 1)
  return { ...geometry, rawRegion, region, focusInsideProtectedRegion, overlaps }
}

async function expectResponsiveFrame(root: Locator, screen: Screen, artwork: ReviewedSplash) {
  await expect(root).toHaveAttribute('data-reference-splash-ready', 'true', { timeout: 30_000 })
  await expect(root).toHaveAttribute('data-reference-splash-species', String(artwork.speciesId))
  await expect(root).toHaveAttribute('data-splash-frame-ready', 'true')
  await root.evaluate(async element => {
    await document.fonts.ready
    await Promise.all([...element.querySelectorAll('img')].map(image => image.decode()))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  // A live resize may still have its previous framing for one animation frame.
  // Wait for the projected source-image focus to fit the newly measured region.
  await expect.poll(async () => {
    const snapshot = await framingSnapshot(root, screen, artwork)
    return snapshot.focusInsideProtectedRegion && snapshot.overlaps.length === 0
  }, { message: `Form ${artwork.speciesId}: face and torso remain clear inside the actual gallery iframe` }).toBe(true)
  const snapshot = await framingSnapshot(root, screen, artwork)
  expect(snapshot.region, 'the runtime exposes a valid protected region in canvas pixels').not.toBeNull()
  expect(snapshot.focusInsideProtectedRegion, 'painted face and torso fit within the region after its safety margin').toBe(true)
  expect(snapshot.overlaps, 'the actual roster, dossier, headings and controls do not cover the critical artwork').toEqual([])
  expect(snapshot.background.image).toContain(artwork.src)
  expect(snapshot.layout.rootScrollWidth).toBeLessThanOrEqual(snapshot.layout.rootClientWidth + 2)
  expect(snapshot.layout.contentScrollWidth).toBeLessThanOrEqual(snapshot.layout.contentClientWidth + 2)
  return snapshot
}

async function galleryPlacement(page: Page) {
  return page.locator('.reference-preview-stage.is-landscape').evaluate(stage => {
    const frame = stage.querySelector<HTMLIFrameElement>('iframe')!
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }
    }
    const lab = document.querySelector<HTMLElement>('.reference-preview-lab')!
    return {
      stage: box(stage), frame: box(frame),
      logicalViewport: { width: frame.contentWindow!.innerWidth, height: frame.contentWindow!.innerHeight },
      outerViewport: { width: window.innerWidth, height: window.innerHeight },
      outerLayout: {
        documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
        labScrollWidth: lab.scrollWidth, labClientWidth: lab.clientWidth,
        labScrollHeight: lab.scrollHeight, labClientHeight: lab.clientHeight,
      },
    }
  })
}

async function expectGalleryPlacement(page: Page, mobile = false) {
  if (mobile) {
    const placement = await galleryPlacement(page)
    expect(placement.logicalViewport.width).toBeLessThanOrEqual(900)
    expect(placement.frame.x).toBeGreaterThanOrEqual(-1)
    expect(placement.frame.right).toBeLessThanOrEqual(placement.outerViewport.width + 1)
    expect(placement.outerLayout.documentWidth).toBeLessThanOrEqual(placement.outerViewport.width + 2)
    return placement
  }
  // The outer ResizeObserver scales the complete preview after a viewport change;
  // it must never resize the game's logical canvas or crop its painting.
  await expect.poll(async () => {
    const { frame, stage, logicalViewport } = await galleryPlacement(page)
    return logicalViewport.width === 1920 && logicalViewport.height === 1080
      && frame.width > 0 && frame.height > 0
      && frame.x >= stage.x - 1 && frame.y >= stage.y - 1
      && frame.right <= stage.right + 1 && frame.bottom <= stage.bottom + 1
      && Math.abs(frame.width / frame.height - 16 / 9) < .001
  }, { message: 'the complete 1920×1080 preview fits its visible stage at 16:9' }).toBe(true)
  const placement = await galleryPlacement(page)
  expect(placement.logicalViewport).toEqual({ width: 1920, height: 1080 })
  expect(placement.frame.width / placement.frame.height).toBeCloseTo(16 / 9, 3)
  expect(placement.frame.x).toBeGreaterThanOrEqual(placement.stage.x - 1)
  expect(placement.frame.y).toBeGreaterThanOrEqual(placement.stage.y - 1)
  expect(placement.frame.right).toBeLessThanOrEqual(placement.stage.right + 1)
  expect(placement.frame.bottom).toBeLessThanOrEqual(placement.stage.bottom + 1)
  expect(placement.stage.x).toBeGreaterThanOrEqual(-1)
  expect(placement.stage.y).toBeGreaterThanOrEqual(-1)
  expect(placement.stage.right).toBeLessThanOrEqual(placement.outerViewport.width + 1)
  expect(placement.stage.bottom).toBeLessThanOrEqual(placement.outerViewport.height + 1)
  expect(placement.outerLayout.documentWidth).toBeLessThanOrEqual(placement.outerViewport.width + 2)
  expect(placement.outerLayout.documentHeight).toBeLessThanOrEqual(placement.outerViewport.height + 2)
  expect(placement.outerLayout.labScrollWidth).toBeLessThanOrEqual(placement.outerLayout.labClientWidth + 2)
  expect(placement.outerLayout.labScrollHeight).toBeLessThanOrEqual(placement.outerLayout.labClientHeight + 2)
  return placement
}

for (const screen of ['squadra', 'arkadex'] as const) {
  for (const id of regressionIds) {
    test(`${screen}: form ${id} keeps its face clear in the real reference gallery`, async ({ page, isMobile }, info) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const artwork = artworkFor(id)
      await page.goto(`/?uiReferences=1&screen=${screen}&splash=${id}`, { waitUntil: 'domcontentloaded' })
      const root = page.frameLocator('iframe').locator('.pu-shell[data-ui-concept="aurora"]')
      const snapshot = await expectResponsiveFrame(root, screen, artwork)
      const gallery = await expectGalleryPlacement(page, isMobile)
      if (isMobile) expect(snapshot.background.presentation).toBe('card')
      else {
        expect(snapshot.shell.width, 'the gallery keeps the complete fullscreen logical canvas').toBe(1920)
        expect(snapshot.shell.height).toBe(1080)
        expect(gallery.frame.height, 'gallery controls leave less physical space than the outer viewport').toBeLessThan(page.viewportSize()!.height - 100)
      }
      const directory = resolve('output/splash-art/responsive-ui', info.project.name)
      await mkdir(directory, { recursive: true })
      const stem = `gallery-${String(id).padStart(3, '0')}-${screen}`
      await page.screenshot({ path: resolve(directory, `${stem}.png`), animations: 'disabled' })
      await writeFile(resolve(directory, `${stem}.json`), JSON.stringify({ ...snapshot, gallery }, null, 2) + '\n')
      await info.attach('responsive-gallery-framing', { body: JSON.stringify({ ...snapshot, gallery }), contentType: 'application/json' })
      expect(errors).toEqual([])
    })
  }

  test(`${screen}: resizing the same gallery scales the complete preview and preserves its logical framing`, async ({ page }, info) => {
    const artwork = artworkFor(108)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/?uiReferences=1&screen=${screen}&splash=108`, { waitUntil: 'domcontentloaded' })
    const root = page.frameLocator('iframe').locator('.pu-shell[data-ui-concept="aurora"]')
    const records = []
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1200, height: 800 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport)
      const snapshot = await expectResponsiveFrame(root, screen, artwork)
      const gallery = await expectGalleryPlacement(page)
      records.push({ viewport, ...snapshot, gallery })
    }
    for (const record of records) {
      expect(record.shell.width).toBe(1920)
      expect(record.shell.height).toBe(1080)
      expect(record.rawRegion, 'outer resizing preserves the measured logical opening').toBe(records[0].rawRegion)
      expect(record.creature.x).toBeCloseTo(records[0].creature.x, 1)
      expect(record.creature.y).toBeCloseTo(records[0].creature.y, 1)
      expect(record.creature.width).toBeCloseTo(records[0].creature.width, 1)
      expect(record.creature.height).toBeCloseTo(records[0].creature.height, 1)
    }
    expect(records[1].gallery.frame.height, 'the complete preview gets physically smaller in the shorter stage').toBeLessThan(records[0].gallery.frame.height)
    expect(records[1].gallery.frame.width).toBeLessThan(records[0].gallery.frame.width)
    expect(records[3].gallery.frame.width).toBeCloseTo(records[0].gallery.frame.width, 1)
    expect(records[3].gallery.frame.height).toBeCloseTo(records[0].gallery.frame.height, 1)
    expect(records[3].gallery.frame.x).toBeCloseTo(records[0].gallery.frame.x, 1)
    expect(records[3].gallery.frame.y).toBeCloseTo(records[0].gallery.frame.y, 1)
    expect(records[3].creature.x).toBeCloseTo(records[0].creature.x, 1)
    expect(records[3].creature.y).toBeCloseTo(records[0].creature.y, 1)
    const directory = resolve('output/splash-art/responsive-ui', info.project.name)
    await mkdir(directory, { recursive: true })
    await writeFile(resolve(directory, `live-resize-${screen}.json`), JSON.stringify(records, null, 2) + '\n')
    await info.attach('live-gallery-resize', { body: JSON.stringify(records), contentType: 'application/json' })
  })
}
