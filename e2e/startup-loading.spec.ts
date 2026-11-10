import { expect, test } from '@playwright/test'

test('the untouched title and player menu do not load editor catalogs or unused reduced-motion artwork', async ({ page }) => {
  const authoringRequests: string[] = [], diceRequests: string[] = []
  page.on('request', request => {
    const url = request.url()
    if (/\/(?:UiDesignRuntime\.tsx|assetCatalog\.ts|move-vfx-assignments\.json)(?:\?|$)/.test(url)) authoringRequests.push(url)
    if (/\/ui\/transitions\/arkamon-d6-(?:closed|open)\.webp/.test(url)) diceRequests.push(url)
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Nuova Partita', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Menù principale', exact: true })).toBeVisible()
  expect(authoringRequests).toEqual([])
  expect(diceRequests).toEqual([])
})

test('animated title commands preload transition artwork on navigation intent', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Hover intent belongs to a desktop pointer; touch preloads on pointer down.')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const diceRequests = new Set<string>()
  page.on('request', request => {
    if (/\/ui\/transitions\/arkamon-d6-(?:closed|open)\.webp/.test(request.url())) diceRequests.add(request.url())
  })
  await page.goto('/')
  const command = page.getByRole('button', { name: 'Nuova Partita', exact: true })
  await expect(command).toBeVisible()
  expect(diceRequests.size).toBe(0)
  await command.hover()
  await expect.poll(() => diceRequests.size).toBe(2)
  await expect(command).toBeEnabled()
})
