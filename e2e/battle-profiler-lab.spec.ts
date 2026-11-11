import { expect, test } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

test.use({ reducedMotion: 'no-preference' })
test.setTimeout(100_000)

test('Admin profiler records a real battle after panel closes and exports bounded anonymous metrics', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(() => {
    const attacker = { istanzaId: 'perf-attacker', specieId: 1, nome: 'Test', livello: 14, hp: 13, xp: 0 }
    const defender = { istanzaId: 'perf-defender', specieId: 13, nome: 'Test', livello: 5, hp: 12, xp: 0 }
    const player = (id: number) => ({
      id, nome: 'Utente test', squadra: id === 1 ? [attacker] : [],
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
        log: ['Test profiler'], evoluzioneInAttesa: null,
      },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      reducedMotion: 'off', animationSpeed: 'normal', graphicsMemory: 'auto',
      musicVolume: 0, effectsVolume: 0,
    } }))
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')

  await page.keyboard.press('Control+Shift+A')
  await expect(page.getByRole('button', { name: 'Prestazioni', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Prestazioni', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Laboratorio prestazioni' })).toBeVisible()
  await page.getByRole('button', { name: 'Avvia registrazione' }).click()
  await expect(page.locator('[data-profiler-status="recording"]')).toBeVisible()
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click()
  await expect(page.locator('#arkamon-admin-panel')).toHaveCount(0)

  await page.getByRole('button', { name: 'Mossa Suprema', exact: true }).click()
  await page.getByRole('dialog', { name: 'Mossa Suprema', exact: true })
    .getByRole('button', { name: 'Soffio', exact: true }).click()
  await expect(page.locator('[data-dice-revealed="true"]')).toBeVisible({ timeout: 65_000 })

  await page.keyboard.press('Control+Shift+A')
  await page.getByRole('button', { name: 'Prestazioni', exact: true }).click()
  await expect(page.locator('[data-profiler-status="recording"]')).toBeVisible()
  await page.getByRole('button', { name: 'Termina', exact: true }).click()
  await expect(page.locator('[data-profiler-status="stopped"]')).toBeVisible()
  await mkdir(resolve('output/rework-profiler'), { recursive: true })
  await page.screenshot({ path: resolve('output/rework-profiler/performance-lab.png'), animations: 'disabled' })
  await expect(page.getByRole('heading', { name: 'Benchmark per attacco' })).toBeVisible()
  await expect(page.locator('[data-profiler-shot-count]')).toHaveAttribute('data-profiler-shot-count', '1')

  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Scarica JSON' }).click()
  const download = await jsonDownload
  const file = await download.path()
  expect(file).not.toBeNull()
  const report = JSON.parse(await readFile(file!, 'utf8')) as {
    schemaVersion: number; metricSource: string; samples: { frames: { count: number }; nativeBytes: number; vfxBytes: number }[];
    events: { phase: string; cameraBeat: string }[];
    shots: { speciesId: number; moveId: number; view: string; outcome: string;
      frames: { count: number; p95Ms: number }; nativePeakBytes: number; vfxPeakBytes: number }[];
    sampledBattleOnly: boolean
  }
  expect(report.schemaVersion).toBe(2)
  expect(report.metricSource).toBe('requestAnimationFrame')
  expect(report.sampledBattleOnly).toBe(true)
  expect(report.samples.length).toBeGreaterThan(3)
  expect(report.samples.some(sample => sample.frames.count > 0)).toBe(true)
  expect(report.samples.every(sample => sample.nativeBytes >= 0 && sample.vfxBytes >= 0)).toBe(true)
  expect(report.events.map(event => event.phase)).toContain('impact')
  expect(report.events.map(event => event.phase)).toContain('visual-complete')
  expect(report.shots).toHaveLength(1)
  expect(report.shots[0].speciesId).toBe(1)
  expect(report.shots[0].moveId).toBeGreaterThan(0)
  expect(report.shots[0].view).toBe('back')
  expect(report.shots[0].outcome).toBe('complete')
  expect(report.shots[0].frames.count).toBeGreaterThan(0)
  expect(report.shots[0].nativePeakBytes).toBeGreaterThanOrEqual(0)
  const payload = JSON.stringify(report)
  expect(payload).not.toMatch(/Utente test|perf-attacker|perf-defender|assetUrl|arkamon-save/)
  expect(errors).toEqual([])

  const csvDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Scarica CSV' }).click()
  const csv = await csvDownload
  expect(csv.suggestedFilename()).toContain('.csv')
  const shotCsvDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Scarica attacchi CSV' }).click()
  const shotCsv = await shotCsvDownload
  expect(shotCsv.suggestedFilename()).toContain('attacks')
  expect(await readFile((await shotCsv.path())!, 'utf8')).toContain('speciesId,moveId')
  await page.getByRole('button', { name: 'Azzera' }).click()
  await expect(page.locator('[data-profiler-status="idle"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Scarica JSON' })).toBeDisabled()
})
