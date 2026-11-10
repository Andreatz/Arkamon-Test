import { expect, test, type Page } from '@playwright/test'

async function mount(page: Page, species = 13, animation = 'attack', reduced = false) {
  await page.goto('/')
  await page.evaluate(async ({ species, animation, reduced }) => {
    const harness = await import('/e2e/native-pages-harness.tsx')
    ;(window as unknown as { nativePages: unknown }).nativePages = harness.mountNativePages(species, animation, 'low', reduced)
  }, { species, animation, reduced })
}
async function events(page: Page) {
  return page.evaluate(() => (window as unknown as { nativePages: { events: { kind: string; animation: string; frame: number; time: number }[] } }).nativePages.events)
}
const nonTransparent = (page: Page) => page.locator('[data-sprite-renderer="paged-canvas"] canvas').evaluate(element => {
  const canvas = element as HTMLCanvasElement
  const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  let count = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 16) count++
  return count
})

test('native pages cross source boundaries with the original cue and bounded decoded memory', async ({ page }) => {
  const errors: string[] = [], requests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(request.url()))
  await mount(page)
  await expect(page.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
  await expect.poll(() => events(page).then(entries => entries.filter(entry => entry.kind === 'complete' && entry.animation === 'attack').length)).toBe(1)
  const recorded = await events(page)
  expect(recorded.filter(entry => entry.kind === 'release' && entry.animation === 'attack')).toHaveLength(1)
  const attackStart = recorded.find(entry => entry.kind === 'start' && entry.animation === 'attack')!
  const release = recorded.find(entry => entry.kind === 'release' && entry.animation === 'attack')!
  expect(release.frame).toBeGreaterThanOrEqual(48)
  expect(release.time - attackStart.time).toBeGreaterThanOrEqual(1900)
  const stats = await page.evaluate(() => (window as unknown as { nativePages: { stats: () => { peakDecodedBytes: number; peakDecodes: number } } }).nativePages.stats())
  expect(stats.peakDecodedBytes).toBeLessThanOrEqual(32 * 1024 * 1024)
  expect(stats.peakDecodes).toBeLessThanOrEqual(2)
  expect(requests.some(url => /\/sprites\/arkamon\/13\/front\/(attack|idle)\.webp(?:\?|$)/.test(url))).toBe(false)
  expect(requests.filter(url => url.includes('/arkamon-paged/13/front/attack/page-')).length).toBeGreaterThan(1)
  expect(errors).toEqual([])
})

test('a delayed native page keeps the preceding frame visible and resumes the same action', async ({ page }) => {
  let release!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  await page.route('**/arkamon-paged/13/front/attack/page-01.webp', async route => { await blocked; await route.continue() })
  await mount(page)
  const player = page.locator('[data-sprite-renderer="paged-canvas"]')
  await expect.poll(() => player.getAttribute('data-sprite-frame').then(Number)).toBe(11)
  const before = await nonTransparent(page)
  expect(before).toBeGreaterThan(1000)
  await page.waitForTimeout(500)
  expect(await player.getAttribute('data-sprite-frame')).toBe('11')
  expect(await nonTransparent(page)).toBe(before)
  expect((await events(page)).some(entry => entry.kind === 'complete')).toBe(false)
  release()
  await expect.poll(() => player.getAttribute('data-sprite-frame').then(Number)).toBeGreaterThanOrEqual(12)
  await expect.poll(() => events(page).then(entries => entries.filter(entry => entry.kind === 'complete' && entry.animation === 'attack').length)).toBe(1)
})

test('reduced motion loads only the final KO page and keeps the transparent last pose', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await mount(page, 1, 'ko', true)
  await expect(page.locator('[data-sprite-renderer="paged-canvas"]')).toHaveAttribute('data-sprite-frame', '95')
  await expect(page.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
  const requested = requests.filter(url => url.includes('/arkamon-paged/1/front/ko/page-'))
  expect(requested).toHaveLength(1)
  expect(requested[0]).toContain('page-11.webp')
  expect(await nonTransparent(page)).toBe(0)
})

test('two native creatures share the low-memory budget without starving the attack page', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const harness = await import('/e2e/native-pages-harness.tsx')
    ;(window as unknown as { nativePages: unknown }).nativePages = harness.mountNativePair()
  })
  const attacker = page.getByRole('img', { name: 'Pair attacker', exact: true })
  const idle = page.getByRole('img', { name: 'Pair idle', exact: true })
  await expect(attacker.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
  await expect(idle.locator('[data-sprite-renderer="paged-canvas"]')).toBeVisible()
  await expect.poll(() => events(page).then(entries => entries.filter(entry => entry.kind === 'complete' && entry.animation === 'attack').length)).toBe(1)
  expect((await events(page)).filter(entry => entry.kind === 'release' && entry.animation === 'attack')).toHaveLength(1)
  const stats = await page.evaluate(() => (window as unknown as { nativePages: { stats: () => { peakDecodedBytes: number; peakDecodes: number; leasedPages: number } } }).nativePages.stats())
  expect(stats.peakDecodedBytes).toBeLessThanOrEqual(32 * 1024 * 1024)
  expect(stats.peakDecodes).toBeLessThanOrEqual(2)
  expect(stats.leasedPages).toBeLessThanOrEqual(2)
  for (const creature of [attacker, idle]) {
    await expect(creature.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
    expect(await creature.locator('canvas').evaluate(element => {
      const canvas = element as HTMLCanvasElement, rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 16) count++
      return count
    })).toBeGreaterThan(1000)
  }
  expect(errors).toEqual([])
})

test('memory controls update the shared budget while a fast native attack keeps its source cue', async ({ page, isMobile }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const harness = await import('/e2e/native-pages-harness.tsx')
    ;(window as unknown as { nativePages: unknown }).nativePages = harness.mountNativePages(13, 'attack', 'full', false, 'fast', true)
  })
  const player = page.locator('[data-sprite-renderer="paged-canvas"]')
  await expect(player).toHaveAttribute('data-sprite-fps', '48')
  const memory = page.getByLabel('Memoria delle animazioni')
  const budget = () => page.evaluate(() => (window as unknown as { nativePages: { stats: () => { budgetBytes: number } } }).nativePages.stats().budgetBytes)
  await expect(memory).toHaveValue('full')
  await expect.poll(budget).toBe(64 * 1024 * 1024)
  await memory.selectOption('low')
  await expect.poll(budget).toBe(32 * 1024 * 1024)
  await memory.selectOption('auto')
  await expect.poll(budget).toBe((isMobile ? 32 : 64) * 1024 * 1024)
  await expect(player).toHaveAttribute('data-sprite-fps', '48')
  await expect.poll(() => events(page).then(entries => entries.filter(entry => entry.kind === 'complete' && entry.animation === 'attack').length)).toBe(1)
  const recorded = await events(page)
  const releases = recorded.filter(entry => entry.kind === 'release' && entry.animation === 'attack')
  expect(releases).toHaveLength(1)
  expect(releases[0].frame).toBeGreaterThanOrEqual(48)
  const started = recorded.find(entry => entry.kind === 'start' && entry.animation === 'attack')!
  expect(releases[0].time - started.time).toBeGreaterThanOrEqual(950)
  await expect(page.locator('[data-arkamon-first-frame-fallback]')).toHaveCount(0)
})
