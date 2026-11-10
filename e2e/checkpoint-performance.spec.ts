import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const OUTPUT = path.resolve('output/implementation-2026-10-19')
const PRIMARY = 'arkamon-save', RECOVERY = 'arkamon-automatic-backups-v1'
interface StorageMeasure { key: string; startedAt: number; finishedAt: number; durationMs: number; characters: number; click: number | null }
interface ClickMeasure { index: number; startedAt: number; finishedAt: number; durationMs: number }
interface BrowserMeasures { storage: StorageMeasure[]; clicks: ClickMeasure[] }
interface Sample { clickHandlerMs: number; primaryStorageMs: number; primaryCharacters: number; recoveryStorageMs: number; recoveryCharacters: number; recoveryAfterHandlerMs: number }
const results: { label: string; creatures: number; samples: Sample[]; summary: Record<string, { median: number; p95: number }> }[] = []
const summarize = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)] }
}
const measures = (page: Page) => page.evaluate(() => (window as unknown as { checkpointMeasurements: BrowserMeasures }).checkpointMeasurements)
const state = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)

test.afterAll(async () => {
  if (!results.length) return
  await mkdir(OUTPUT, { recursive: true })
  await writeFile(path.join(OUTPUT, 'checkpoint-browser-current.json'), JSON.stringify({
    measuredAt: new Date().toISOString(), browser: 'Chromium', viewport: { width: 1920, height: 1080 }, samplesPerCampaign: 5,
    method: 'Real Passa turno clicks after valid fixture hydration. Storage.prototype.setItem timing measures only each synchronous storage call. Capturing-to-bubbling window click timing includes the actual synchronous React handler and its work; it excludes Playwright transport and deferred recovery serialization. Recovery writes are measured separately after the handler. No historical browser baseline, FPS, rendering or performance threshold is asserted.',
    results,
  }, null, 2))
})

for (const scenario of [{ label: 'piccola', deposits: 0 }, { label: 'media', deposits: 100 }, { label: 'massima', deposits: 1050 }]) {
  test(`browser checkpoint timings with ${scenario.label} campaign (${12 + scenario.deposits * 2} creatures)`, async ({ page, browserName, isMobile }) => {
    test.skip(isMobile || browserName !== 'chromium', 'Checkpoint CPU/storage observation is a Chromium desktop proof, not a phone performance claim.')
    await page.setViewportSize({ width: 1920, height: 1080 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ deposits }) => {
      if (localStorage.getItem('checkpoint-performance-fixture')) return
      const creature = (player: number, index: number) => ({ istanzaId: `checkpoint-${player}-${index}`, specieId: player === 1 ? 1 : 5,
        nome: `Compagno ${player} del viaggio ${index}`, livello: 20, hp: 3, xp: 0, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
      const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Melia · checkpoint' : 'Maggi · checkpoint',
        squadra: Array.from({ length: 6 }, (_, index) => creature(id, index)),
        deposito: Object.fromEntries(Array.from({ length: deposits }, (_, index) => [`${Math.floor(index / 35) + 1}:${index % 35 + 1}`, creature(id, index + 6)])),
        cespugliVisitati: ['Percorso_1:A'], allenatoriSconfitti: [], caselleConsumate: [], monete: id * 125,
        inventario: { potion: 2, masterball: 1 } })
      const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
      localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
        giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, battaglia: null, rivaleStarterId: 9,
        posizione1: position, posizione2: position, posizioniLocali1: {}, posizioniLocali2: {},
        scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, audioMuted: true,
      } }))
      localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { reducedMotion: 'on', animationSpeed: 'fast', musicVolume: 0, effectsVolume: 0 } }))
      localStorage.setItem('checkpoint-performance-fixture', 'ready')
    }, { deposits: scenario.deposits })
    await page.goto('/')
    await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('button', { name: 'Passa turno', exact: true })).toBeEnabled()
    const baseline = await state(page)
    expect(baseline.giocatore1.squadra).toHaveLength(6)
    expect(Object.keys(baseline.giocatore1.deposito)).toHaveLength(scenario.deposits)
    expect(Object.keys(baseline.giocatore2.deposito)).toHaveLength(scenario.deposits)
    expect(await page.evaluate(() => localStorage.getItem('arkamon-automatic-backups-v1'))).toBeNull()

    // Test-only observation installed after hydration: fixture seeding and startup
    // writes cannot be mistaken for an action or a deferred recovery write.
    await page.evaluate(({ primary, recovery }) => {
      const samples: BrowserMeasures = { storage: [], clicks: [] }
      let active: ClickMeasure | null = null
      Object.assign(window, { checkpointMeasurements: samples })
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        const startedAt = performance.now()
        try { return original.call(this, key, value) }
        finally {
          if (key === primary || key === recovery) {
            const finishedAt = performance.now()
            samples.storage.push({ key, startedAt, finishedAt, durationMs: finishedAt - startedAt, characters: value.length, click: active?.index ?? null })
          }
        }
      }
      window.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target.closest('button') : null
        if (target?.textContent?.trim() !== 'Passa turno') return
        active = { index: samples.clicks.length, startedAt: performance.now(), finishedAt: Number.NaN, durationMs: Number.NaN }
        samples.clicks.push(active)
      }, true)
      window.addEventListener('click', () => {
        if (!active) return
        active.finishedAt = performance.now(); active.durationMs = active.finishedAt - active.startedAt; active = null
      })
    }, { primary: PRIMARY, recovery: RECOVERY })

    const samples: Sample[] = []
    for (let index = 0; index < 5; index++) {
      const before = await state(page)
      await page.getByRole('button', { name: 'Passa turno', exact: true }).click()
      const after = await state(page)
      expect(after.giocatoreAttivo).toBe(before.giocatoreAttivo === 1 ? 2 : 1)
      expect(after.turnoOverworld).toEqual({ giocatoreAttivo: after.giocatoreAttivo, azioniRimaste: 2 })
      expect(after.giocatore1).toEqual(baseline.giocatore1)
      expect(after.giocatore2).toEqual(baseline.giocatore2)
      expect(after.posizione1).toEqual(baseline.posizione1)
      expect(after.posizione2).toEqual(baseline.posizione2)
      const immediate = await measures(page)
      const clicked = immediate.clicks[index]
      expect(clicked).toBeDefined()
      expect(Number.isFinite(clicked.durationMs)).toBe(true)
      const primary = immediate.storage.filter(entry => entry.key === PRIMARY && entry.click === index)
      expect(primary).toHaveLength(1)
      expect(primary[0].startedAt).toBeGreaterThanOrEqual(clicked.startedAt)
      expect(primary[0].finishedAt).toBeLessThanOrEqual(clicked.finishedAt)
      expect(immediate.storage.filter(entry => entry.key === RECOVERY && entry.click === index)).toHaveLength(0)
      await expect.poll(async () => (await measures(page)).storage.filter(entry => entry.key === RECOVERY).length).toBe(index + 1)
      const recovery = (await measures(page)).storage.filter(entry => entry.key === RECOVERY)[index]
      expect(recovery.click).toBeNull()
      expect(recovery.startedAt).toBeGreaterThanOrEqual(clicked.finishedAt)
      const copies = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-automatic-backups-v1')!).copies)
      expect(copies.length).toBeLessThanOrEqual(2)
      const previous = JSON.parse(copies[0].backup).campaign
      expect(previous.giocatoreAttivo).toBe(before.giocatoreAttivo)
      expect(previous.giocatore1).toEqual(before.giocatore1)
      expect(previous.giocatore2).toEqual(before.giocatore2)
      samples.push({ clickHandlerMs: clicked.durationMs, primaryStorageMs: primary[0].durationMs, primaryCharacters: primary[0].characters,
        recoveryStorageMs: recovery.durationMs, recoveryCharacters: recovery.characters, recoveryAfterHandlerMs: recovery.startedAt - clicked.finishedAt })
    }
    expect(errors).toEqual([])
    const finalMeasures = await measures(page)
    expect(finalMeasures.clicks).toHaveLength(5)
    expect(finalMeasures.storage.filter(entry => entry.key === PRIMARY)).toHaveLength(5)
    expect(finalMeasures.storage.filter(entry => entry.key === RECOVERY)).toHaveLength(5)
    for (const sample of samples) for (const value of Object.values(sample)) expect(Number.isFinite(value) && value >= 0).toBe(true)
    const summary = Object.fromEntries((['clickHandlerMs', 'primaryStorageMs', 'recoveryStorageMs', 'recoveryAfterHandlerMs'] as const).map(key => [key, summarize(samples.map(sample => sample[key]))]))
    const report = { label: scenario.label, creatures: 12 + scenario.deposits * 2, samples, summary }
    results.push(report)
    await test.info().attach(`checkpoint-${scenario.label}-timings`, { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json' })
    console.log(`CHECKPOINT ${scenario.label}: ${JSON.stringify(summary)}`)
  })
}
