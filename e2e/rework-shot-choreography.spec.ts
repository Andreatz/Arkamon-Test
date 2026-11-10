import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test.use({ reducedMotion: 'no-preference', video: 'on' })
test.setTimeout(110_000)

type Sample = {
  phase: string
  beat: string
  choreography: string
  zoom: number
  hp: string | null
  elapsedMs: number
}
const SHOTS = [
  { speciesId: 2, moveName: 'Assalto', choreography: 'physical' },
  { speciesId: 1, moveName: 'Soffio', choreography: 'projectile' },
  { speciesId: 42, moveName: 'Polverone', choreography: 'area' },
  { speciesId: 63, moveName: 'Lana magica', choreography: 'support' },
] as const

async function openBattle(page: Page, speciesId: number) {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(id => {
    const attacker = { istanzaId: 'film-attacker', specieId: id, nome: 'Camera Audit', livello: 14, hp: 25, xp: 0 }
    const defender = { istanzaId: 'film-defender', specieId: 13, nome: 'Wormaren', livello: 5, hp: 12, xp: 0 }
    const player = (number: 1 | 2) => ({
      id: number, nome: 'Regia ' + number,
      squadra: number === 1 ? [attacker] : [],
      deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [],
      monete: 0, inventario: {}, caselleConsumate: [],
    })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position,
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, posizioniLocali1: {}, posizioniLocali2: {},
      audioMuted: true, scenaCorrente: { scena: 'battaglia' },
      scenaPrecedente: { scena: 'mappa-principale' },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: {
        tipo: 'Selvatico', pokemonA: attacker, pokemonB: defender,
        squadraA: [attacker], squadraB: [defender], hpMaxA: 25, hpMaxB: 12,
        turnoCorrente: 'A', luogoRitorno: 'mappa-principale',
        log: ['Prova di regia specifica per tipologia di mossa.'], evoluzioneInAttesa: null,
      },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      animationSpeed: 'normal', reducedMotion: 'off', musicVolume: 0, effectsVolume: 0,
    } }))
  }, speciesId)
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '12')
}

async function observe(page: Page) {
  await page.evaluate(() => {
    type Item = { phase: string; beat: string; choreography: string; zoom: number; hp: string | null; elapsedMs: number }
    const samples: Item[] = []
    const impacts: { id: string; kind: string; elapsedMs: number }[] = []
    const seenImpacts = new Set<string>()
    const clock = performance.now()
    let previous = ''
    let lastFrame = 0
    const frameTimes: number[] = []
    const memorySnapshots: { ms: number; vfxBytes: number; nativeBytes: number; pagedDrawers: number; memorySamples: number }[] = []
    let lastMemorySnapshot = Number.NEGATIVE_INFINITY
    let collecting = true
    const tick = (now: number) => {
      if (!collecting) return
      if (lastFrame) frameTimes.push(Math.round((now - lastFrame) * 100) / 100)
      lastFrame = now
      if (now - lastMemorySnapshot >= 500) {
        lastMemorySnapshot = now
        const stage = document.querySelector('[data-battle-decoded-vfx-bytes]')
        const paged = [...document.querySelectorAll('[data-sprite-renderer="paged-canvas"]')]
        memorySnapshots.push({
          ms: Math.round(now - clock),
          vfxBytes: Number(stage?.getAttribute('data-battle-decoded-vfx-bytes') ?? 0),
          nativeBytes: Number(stage?.getAttribute('data-battle-decoded-native-bytes') ?? 0),
          pagedDrawers: paged.length,
          memorySamples: paged.reduce((sum, sprite) => sum + Number(sprite.getAttribute('data-sprite-memory-samples') ?? 0), 0),
        })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    const sample = () => {
      for (const element of document.querySelectorAll('[data-battle-impact-cue]')) {
        const id = element.getAttribute('data-battle-impact-cue') ?? ''
        if (seenImpacts.has(id)) continue
        seenImpacts.add(id)
        impacts.push({
          id, kind: element.getAttribute('data-battle-impact-kind') ?? '',
          elapsedMs: Math.round(performance.now() - clock),
        })
      }
      const stage = document.querySelector('[data-battle-director-phase]')
      const camera = document.querySelector('[data-battle-camera]')
      if (!stage || !camera) return
      const phase = stage.getAttribute('data-battle-director-phase') ?? ''
      const beat = camera.getAttribute('data-battle-camera-beat') ?? ''
      const choreography = camera.getAttribute('data-battle-camera-choreography') ?? ''
      const zoom = Number(camera.getAttribute('data-battle-camera-zoom'))
      const fingerprint = phase + ':' + beat + ':' + choreography + ':' + zoom
      if (fingerprint === previous) return
      previous = fingerprint
      samples.push({
        phase, beat, choreography, zoom,
        hp: document.querySelector('[data-battle-hp-side="enemy"]')?.getAttribute('data-battle-hp') ?? null,
        elapsedMs: Math.round(performance.now() - clock),
      })
    }
    const observer = new MutationObserver(sample)
    observer.observe(document.body, {
      subtree: true, attributes: true, childList: true,
      attributeFilter: ['data-battle-director-phase', 'data-battle-camera-beat',
        'data-battle-camera-choreography', 'data-battle-camera-zoom'],
    })
    sample()
    ;(window as typeof window & {
      __shotProbe?: { samples: Item[]; impacts: typeof impacts; finish: () => { frameTimes: number[]; memorySnapshots: typeof memorySnapshots; vfxBytes: string | null; nativeBytes: string | null } }
    }).__shotProbe = {
      samples, impacts,
      finish: () => {
        collecting = false
        observer.disconnect()
        const stage = document.querySelector('[data-battle-decoded-vfx-bytes]')
        return {
          frameTimes, memorySnapshots,
          vfxBytes: stage?.getAttribute('data-battle-decoded-vfx-bytes') ?? null,
          nativeBytes: stage?.getAttribute('data-battle-decoded-native-bytes') ?? null,
        }
      },
    }
  })
}

for (const shot of SHOTS) {
  test('shot choreography ' + shot.choreography + ' — ' + shot.moveName, async ({ page }) => {
    await mkdir(resolve('output/rework-shot-v2'), { recursive: true })
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await openBattle(page, shot.speciesId)
    await observe(page)

    const camera = page.locator('[data-battle-camera]')
    expect(await camera.locator('[data-battle-hp-side]').count()).toBe(0)
    expect(await camera.locator('.battle-move-button').count()).toBe(0)
    await page.screenshot({
      path: resolve('output/rework-shot-v2/' + shot.choreography + '-before.png'),
      animations: 'disabled',
    })

    const button = page.locator('.battle-move-button').filter({ hasText: shot.moveName }).first()
    await expect(button).toBeVisible()
    await button.click()
    await expect(page.locator('[data-dice-revealed="true"]')).toBeVisible({ timeout: 75_000 })
    await expect(camera).toHaveAttribute('data-battle-camera-beat', 'neutral')
    const results = await page.evaluate(() => {
      const probe = (window as typeof window & { __shotProbe?: {
        samples: Sample[]
        impacts: { id: string; kind: string; elapsedMs: number }[]
        finish: () => { frameTimes: number[]; memorySnapshots: { ms: number; vfxBytes: number; nativeBytes: number; pagedDrawers: number; memorySamples: number }[]; vfxBytes: string | null; nativeBytes: string | null }
      } }).__shotProbe!
      return { samples: probe.samples, impacts: probe.impacts, ...probe.finish() }
    })
    const phases = results.samples.map(item => item.phase)
    const cameraBeats = results.samples.map(item => item.beat)
    expect(results.samples.some(item => item.choreography === shot.choreography)).toBe(true)
    expect(phases).toContain('released')
    expect(phases).toContain('impact')
    expect(phases).toContain('visual-complete')
    expect(results.impacts, 'one impact must be emitted by the VFX cue').toHaveLength(1)
    expect(results.impacts[0].kind).toBe(shot.choreography)
    expect(cameraBeats).toContain('anticipation')
    expect(cameraBeats).toContain('travel')
    expect(cameraBeats).toContain('impact')
    expect(results.samples.filter(item => item.phase === 'impact').every(item => item.hp === '12')).toBe(true)
    expect(results.memorySnapshots.length).toBeGreaterThan(0)
    expect(pageErrors).toEqual([])
    await page.screenshot({
      path: resolve('output/rework-shot-v2/' + shot.choreography + '-after.png'),
      animations: 'disabled',
    })
    const sorted = results.frameTimes.filter(n => n > 0).sort((a,b) => a - b)
    const report = {
      speciesId: shot.speciesId, move: shot.moveName, choreography: shot.choreography,
      timings: results.samples,
      impacts: results.impacts,
      frames: { samples: sorted.length, p50Ms: sorted[Math.floor(sorted.length * .5)] ?? null,
        p95Ms: sorted[Math.floor(sorted.length * .95)] ?? null },
      decoded: { vfxBytes: results.vfxBytes, nativeBytes: results.nativeBytes },
      memorySnapshots: results.memorySnapshots,
    }
    // Playwright attachment paths are not necessarily retained in CI artifacts:
    // persist a standalone machine-readable file beside each video/screenshot.
    await writeFile(
      resolve('output/rework-shot-v2/' + shot.choreography + '-telemetry.json'),
      JSON.stringify(report, null, 2) + '\n',
    )
    await test.info().attach('Shot telemetry ' + shot.choreography, {
      body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json',
    })
  })
}
