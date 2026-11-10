import { test, expect, type Page } from '@playwright/test'

async function seedMap(page: Page) {
  await page.addInitScript(() => {
    const pokemon = { istanzaId: 'rpg-map-a', specieId: 1, nome: 'Vyrath', livello: 10, hp: 19, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Melia' : 'Maggi', squadra: [{ ...pokemon, istanzaId: `rpg-map-${id}` }], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 0, inventario: {} })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, posizioniLocali1: {}, posizioniLocali2: {},
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, audioMuted: true,
      scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null, battaglia: null,
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { reducedMotion: 'off', musicVolume: 0, effectsVolume: 0 } }))
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
}

test('map previews a real road and queues two rapid movements around its bends without spending extra actions', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop map movement proof; phone controls remain covered by existing flows.')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedMap(page)
  const destination = page.getByRole('button', { name: 'Pordenone, 1 movimento', exact: true })
  await destination.focus()
  const preview = page.locator('[data-main-map-road-preview="Pordenone"]')
  await expect(preview).toBeVisible()
  const path = await preview.locator('path').getAttribute('d')
  const points = [...path!.matchAll(/[ML] ([\d.]+) ([\d.]+)/g)].map((item) => ({ x: Number(item[1]), y: Number(item[2]) }))
  expect(points.length).toBeGreaterThan(1)
  await page.evaluate(() => {
    const samples: { x: number; y: number }[] = []
    const started = performance.now()
    const collect = () => {
      const avatar = document.querySelector<HTMLElement>('[data-main-map-player="1"]')!
      samples.push({ x: parseFloat(avatar.style.left), y: parseFloat(avatar.style.top) })
      if (performance.now() - started < 4700) requestAnimationFrame(collect)
    }
    ;(window as typeof window & { rpgMapSamples: typeof samples }).rpgMapSamples = samples
    requestAnimationFrame(collect)
  })
  await destination.click()
  const beforeConfirmation = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(beforeConfirmation.posizione1.luogo).toBe('Venezia')
  expect(beforeConfirmation.turnoOverworld.azioniRimaste).toBe(2)
  await page.getByRole('button', { name: 'Conferma movimento', exact: true }).click()
  // The second command arrives before the first journey completes.
  await page.getByRole('button', { name: 'Venezia, 1 movimento', exact: true }).click()
  await page.getByRole('button', { name: 'Conferma movimento', exact: true }).click()
  await expect.poll(async () => page.locator('[data-main-map-player="1"]').evaluate((element) => parseFloat((element as HTMLElement).style.left))).toBeCloseTo(points[0].x, 1)
  await page.waitForTimeout(4800)
  const samples = await page.evaluate(() => (window as typeof window & { rpgMapSamples: { x: number; y: number }[] }).rpgMapSamples)
  const distanceToRoad = (point: { x: number; y: number }) => Math.min(...points.slice(1).map((end, index) => {
    const start = points[index], dx = end.x - start.x, dy = end.y - start.y
    const fraction = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy)
  }))
  expect(samples.length).toBeGreaterThan(20)
  expect(samples.some((point) => Math.hypot(point.x - points.at(-1)!.x, point.y - points.at(-1)!.y) < .1)).toBe(true)
  expect(Math.max(...samples.map(distanceToRoad))).toBeLessThan(.12)
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(state.posizione1.luogo).toBe('Venezia')
  expect(state.turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 0 })
  expect(state.posizione2.luogo).toBe('Venezia')
  await test.info().attach('Map movement proof 1920x1080', { body: await page.screenshot(), contentType: 'image/png' })
})

test('local map focus previews one movement without exposing node numbers on the map', async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1920, height: 1080 })
  await seedMap(page)
  await page.getByRole('button', { name: 'Apri mappa di Venezia', exact: true }).click()
  await expect(page.locator('[data-local-map-root="Venezia"]')).toBeVisible()
  const reachable = page.locator('[data-local-map-node][data-reachable="true"]').first()
  await reachable.focus()
  await expect(page.locator('[data-local-road-preview]')).toHaveCount(1)
  await expect(page.getByText('Movimento · 1 azione', { exact: true })).toBeVisible()
  const labels = await page.locator('[data-local-map-node]').allTextContents()
  expect(labels.every((label) => label.trim() === '')).toBe(true)
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(state.turnoOverworld.azioniRimaste).toBe(2)
})

for (const height of [1080, 945, 900]) test(`default map HUD is one bar and legend rows stay separate at 1920x${height}`, async ({ page, isMobile }) => {
  test.skip(isMobile)
  await page.setViewportSize({ width: 1920, height })
  await seedMap(page)
  await expect(page.locator('[data-world-rpg-map]')).toHaveAttribute('data-combined-hud', 'true')
  const geometry = await page.evaluate(() => {
    const header = document.querySelector('.world-map-unified-hud')!.getBoundingClientRect()
    const windows = [...document.querySelectorAll('.world-map-status-window')].map(el => el.getBoundingClientRect())
    const legend = document.querySelector('.world-map-legend')!.getBoundingClientRect()
    const rows = [...document.querySelectorAll('.world-map-legend .arka-layout-content')].map(el => el.getBoundingClientRect())
    return { stageWidth: document.querySelector('[data-world-rpg-map]')!.getBoundingClientRect().width, header: { top: header.top, bottom: header.bottom, width: header.width }, windows: windows.map(r => ({ top: r.top, bottom: r.bottom })), legend: { top: legend.top, bottom: legend.bottom }, rows: rows.map(r => ({ top: r.top, bottom: r.bottom })) }
  })
  expect(geometry.header.width / geometry.stageWidth).toBeCloseTo(.945, 2)
  expect(geometry.windows).toHaveLength(4)
  for (const item of geometry.windows) { expect(item.top).toBeGreaterThanOrEqual(geometry.header.top - 1); expect(item.bottom).toBeLessThanOrEqual(geometry.header.bottom + 1) }
  for (let index = 1; index < geometry.rows.length; index++) expect(geometry.rows[index].top).toBeGreaterThanOrEqual(geometry.rows[index - 1].bottom - 1)
  expect(geometry.rows[0].top).toBeGreaterThanOrEqual(geometry.legend.top)
  expect(geometry.rows.at(-1)!.bottom).toBeLessThanOrEqual(geometry.legend.bottom + 1)
  await page.screenshot({ path: `output/implementation-2026-10-19/world-map-${height}.png` })
})
