import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test.use({ reducedMotion: 'no-preference', video: 'on' })
test.setTimeout(160_000)

/**
 * A fresh browser context starts this test with a cold HTTP cache.
 * The second navigation in the same context reuses HTTP cache but resets the
 * JS image/Bitmap caches. We do NOT call it a warm decoded-image benchmark.
 */
async function seedFixture(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(() => {
    const attacker = { istanzaId: 'bench-1', specieId: 1, nome: 'Technical A', livello: 14, hp: 13, xp: 0 }
    const defender = { istanzaId: 'bench-2', specieId: 13, nome: 'Technical B', livello: 5, hp: 12, xp: 0 }
    const player = (id: 1 | 2) => ({
      id, nome: 'Technical ' + id, squadra: id === 1 ? [attacker] : [],
      deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [],
      monete: 0, inventario: { masterball: 0 }, caselleConsumate: [],
    })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1,
      rivaleStarterId: 9, posizione1: position, posizione2: position,
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
      scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'mappa-principale' },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: {
        tipo: 'Selvatico', pokemonA: attacker, pokemonB: defender,
        squadraA: [attacker], squadraB: [defender], hpMaxA: 25, hpMaxB: 12,
        turnoCorrente: 'A', luogoRitorno: 'mappa-principale',
        log: ['Fixed benchmark fixture'], evoluzioneInAttesa: null,
      },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      reducedMotion: 'off', animationSpeed: 'normal', graphicsMemory: 'auto',
      musicVolume: 0, effectsVolume: 0,
    } }))
  })
}

type Shot = {
  speciesId: number; moveId: number; view: string; choreography: string
  outcome: string; durationMs: number; nativePeakBytes: number; vfxPeakBytes: number
  nativeLoads: number; vfxPrepares: number
  frames: { count: number; p50Ms: number; p95Ms: number; estimatedMissed60HzFrames: number }
}
type Profile = { schemaVersion: number; shots: Shot[] }

async function enterAdmin(page: Page) {
  const admin = page.getByRole('button', { name: 'Admin', exact: true })
  if (await admin.count()) await admin.click()
  else await page.keyboard.press('Control+Shift+A')
  await page.getByRole('button', { name: 'Prestazioni', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Laboratorio prestazioni' })).toBeVisible()
}

async function benchmarkOne(page: Page, label: string): Promise<{ label: string; shot: Shot; report: Profile; resourceCount: number; visibleTransferBytes: number }> {
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await enterAdmin(page)
  await page.getByRole('button', { name: 'Avvia registrazione' }).click()
  await expect(page.locator('[data-profiler-status="recording"]')).toBeVisible()
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click()

  await page.getByRole('button', { name: 'Mossa Suprema', exact: true }).click()
  await page.getByRole('dialog', { name: 'Mossa Suprema', exact: true })
    .getByRole('button', { name: 'Soffio', exact: true }).click()
  await expect(page.locator('[data-dice-revealed="true"]')).toBeVisible({ timeout: 65_000 })

  await enterAdmin(page)
  await page.getByRole('button', { name: 'Termina', exact: true }).click()
  await expect(page.locator('[data-profiler-shot-count="1"]')).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Scarica JSON' }).click()
  const file = await pending
  const path = await file.path()
  expect(path).not.toBeNull()
  const report = JSON.parse(await readFile(path!, 'utf8')) as Profile
  expect(report.schemaVersion).toBe(2)
  expect(report.shots).toHaveLength(1)
  const shot = report.shots[0]
  expect(shot.speciesId).toBe(1)
  expect(shot.moveId).toBeGreaterThan(0)
  expect(shot.view).toBe('back')
  expect(shot.outcome).toBe('complete')
  expect(shot.frames.count).toBeGreaterThan(0)
  expect(shot.nativePeakBytes).toBeGreaterThanOrEqual(0)
  expect(shot.vfxPeakBytes).toBeGreaterThanOrEqual(0)

  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(entry => entry as PerformanceResourceTiming)
      .filter(entry => /sprites|vfx|assets|animation/i.test(entry.name))
      .map(entry => ({ transferSize: entry.transferSize })),
  )
  return {
    label, shot, report, resourceCount: resources.length,
    // Cross-origin entries without Timing-Allow-Origin may report zero.
    visibleTransferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
  }
}

test('same animation cold-context vs repeated navigation produces comparable anonymous shot reports', async ({ page }) => {
  await mkdir(resolve('output/rework-benchmark'), { recursive: true })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await seedFixture(page)
  const first = await benchmarkOne(page, 'fresh-browser-context')
  await page.screenshot({ path: resolve('output/rework-benchmark/first-profile.png'), animations: 'disabled' })
  // Reloads the full app and repeats the same deterministic battle from a
  // seeded save; HTTP cache is retained within the same browser context.
  const repeat = await benchmarkOne(page, 'same-context-repeat-navigation')
  await page.screenshot({ path: resolve('output/rework-benchmark/repeated-profile.png'), animations: 'disabled' })
  expect(repeat.shot.speciesId).toBe(first.shot.speciesId)
  expect(repeat.shot.moveId).toBe(first.shot.moveId)
  expect(repeat.shot.choreography).toBe(first.shot.choreography)
  expect(errors).toEqual([])
  const summary = {
    fixture: 'species-1-back-attack / fixed supreme move / species-13-target',
    cacheInterpretation: 'first: fresh context HTTP cache; repeat: same context HTTP cache; JS decoded cache recreated on navigation',
    comparable: true,
    first: { shot: first.shot, resourceCount: first.resourceCount, visibleTransferBytes: first.visibleTransferBytes },
    repeat: { shot: repeat.shot, resourceCount: repeat.resourceCount, visibleTransferBytes: repeat.visibleTransferBytes },
    changeP95Ms: Number((repeat.shot.frames.p95Ms - first.shot.frames.p95Ms).toFixed(2)),
    disclaimer: 'Runner variance and browser caching prevent claims of OBS FPS gain. Network timing for cross-origin assets can be opaque.',
  }
  await writeFile(resolve('output/rework-benchmark/cold-http-vs-repeat.json'), JSON.stringify(summary, null, 2) + '\n')
  await test.info().attach('Cold-context vs repeat HTTP cache', {
    body: Buffer.from(JSON.stringify(summary, null, 2)), contentType: 'application/json',
  })
})
