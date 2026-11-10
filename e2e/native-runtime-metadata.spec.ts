import { expect, test } from '@playwright/test'

test.use({ reducedMotion: 'no-preference' })

test('compact metadata keeps native attack and reaction without requesting provenance or a full atlas', async ({ page }) => {
  const requests: string[] = [], errors: string[] = []
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#arkamon-lab')
  await page.locator('#darklaw-preview-species').selectOption('52')
  await expect(page.locator('[data-preview-card="animated"] [data-sprite-renderer="paged-canvas"]')).toBeVisible()
  await page.locator('#arkamon-preview-target').selectOption('57')
  await page.getByRole('button', { name: 'Prova attacco con VFX', exact: true }).click()
  const stage = page.locator('[data-preview-sync-phase]')
  await expect(stage.locator('[data-sprite-renderer="paged-canvas"]')).toHaveCount(2)
  await expect(stage.locator('[data-arkamon-renderer="procedural"]')).toHaveCount(0)
  await expect(stage).toHaveAttribute('data-preview-sync-phase', 'complete', { timeout: 30_000 })
  const events: { event: string; atMs: number }[] = JSON.parse((await stage.getAttribute('data-preview-sync-events'))!)
  for (const event of ['attacker-ready', 'target-ready', 'release', 'impact', 'target-reaction', 'attacker-complete', 'target-complete', 'complete']) {
    expect(events.filter(entry => entry.event === event), event).toHaveLength(1)
  }
  expect(events.find(entry => entry.event === 'target-reaction')!.atMs).toBeGreaterThanOrEqual(events.find(entry => entry.event === 'impact')!.atMs)
  expect(requests.some(path => /\/sprites\/arkamon\/\d+\/(front|back)\/(idle|attack|hit|ko|victory)\.webp$/.test(path))).toBe(false)
  expect(requests.some(path => path.includes('/data/arkamon-paged.json'))).toBe(false)
  expect(requests.some(path => path.includes('/sprites/arkamon-paged/52/front/attack/page-'))).toBe(true)
  expect(requests.some(path => path.includes('/sprites/arkamon-paged/57/front/hit/page-'))).toBe(true)
  expect(errors).toEqual([])
  await test.info().attach('Native page requests after compact metadata', { body: JSON.stringify(requests.filter(path => path.includes('arkamon')), null, 2), contentType: 'application/json' })
})
