import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

test.use({ reducedMotion: 'no-preference', video: 'on' })
test.setTimeout(90_000)

/** A normal recovery-path battle; no saved real campaign data is accessed. */
async function openCinematicFixture(page: Page, reducedMotion: 'off' | 'on') {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(reduced => {
    if (localStorage.getItem('e2e-cinema-fixture')) return
    const attacker = { istanzaId: 'cinema-attacker', specieId: 1, nome: 'Vyrath Cinema', livello: 14, hp: 13, xp: 0 }
    const defender = { istanzaId: 'cinema-defender', specieId: 13, nome: 'Wormaren Cinema', livello: 5, hp: 12, xp: 0 }
    const player = (id: 1 | 2) => ({
      id, nome: 'Cinema ' + id, squadra: id === 1 ? [attacker] : [],
      deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], monete: 0,
      inventario: { masterball: 0 }, caselleConsumate: [],
    })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position,
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
      scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'mappa-principale' },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: {
        tipo: 'Selvatico', pokemonA: attacker, pokemonB: defender,
        squadraA: [attacker], squadraB: [defender], hpMaxA: 25, hpMaxB: 12,
        turnoCorrente: 'A', luogoRitorno: 'mappa-principale',
        log: ['Prova cinematografica della battaglia.'], evoluzioneInAttesa: null,
      },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      musicVolume: 0, effectsVolume: 0, animationSpeed: 'normal', reducedMotion: reduced,
    } }))
    localStorage.setItem('e2e-cinema-fixture', 'seeded')
  }, reducedMotion)
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('[data-battle-camera]')).toHaveAttribute('data-battle-camera-beat', 'neutral')
  await expect(page.locator('[data-battle-camera]')).toHaveAttribute('data-battle-camera-zoom', '1')
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '12')
}

async function installPhaseProbe(page: Page) {
  await page.evaluate(() => {
    type Sample = { phase: string; beat: string; intensity: string; zoom: number; hp: string | null; timestamp: number }
    const samples: Sample[] = []
    let previous = ''
    const sample = () => {
      const stage = document.querySelector('[data-battle-director-phase]')
      const camera = document.querySelector('[data-battle-camera]')
      if (!stage || !camera) return
      const phase = stage.getAttribute('data-battle-director-phase') ?? ''
      const beat = camera.getAttribute('data-battle-camera-beat') ?? ''
      const zoom = Number(camera.getAttribute('data-battle-camera-zoom'))
      const fingerprint = phase + ':' + beat + ':' + zoom
      if (fingerprint === previous) return
      previous = fingerprint
      samples.push({
        phase, beat,
        intensity: camera.getAttribute('data-battle-camera-intensity') ?? '',
        zoom,
        hp: document.querySelector('[data-battle-hp-side="enemy"]')?.getAttribute('data-battle-hp') ?? null,
        timestamp: Math.round(performance.now()),
      })
    }
    const observer = new MutationObserver(sample)
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: [
      'data-battle-director-phase', 'data-battle-camera-beat', 'data-battle-camera-zoom',
    ] })
    sample()
    ;(window as typeof window & { cinematicProbe: { samples: Sample[] } }).cinematicProbe = { samples }
  })
}

for (const reduced of ['off', 'on'] as const) {
  test('cinematic camera respects ' + (reduced === 'on' ? 'reduced motion' : 'attack, travel and impact timing') + ' without touching HUD or dice', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await mkdir(resolve('output/rework-cinema'), { recursive: true })
    await openCinematicFixture(page, reduced)
    await installPhaseProbe(page)

    const camera = page.locator('[data-battle-camera]')
    const world = page.locator('[data-battle-world]')
    expect(await world.count()).toBe(1)
    expect(await camera.locator('[data-battle-hp-side]').count()).toBe(0)
    expect(await camera.locator('.battle-move-button').count()).toBe(0)
    await page.screenshot({ path: resolve('output/rework-cinema/arena-before-' + reduced + '.png'), animations: 'disabled' })

    await page.getByRole('button', { name: 'Mossa Suprema', exact: true }).click()
    await page.getByRole('dialog', { name: 'Mossa Suprema', exact: true })
      .getByRole('button', { name: 'Soffio', exact: true }).click()

    await expect(page.locator('[data-dice-revealed="true"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-battle-camera]')).toHaveAttribute('data-battle-camera-beat', 'neutral')
    await expect(page.locator('[data-battle-camera]')).toHaveAttribute('data-battle-camera-zoom', '1')
    await page.screenshot({ path: resolve('output/rework-cinema/arena-after-' + reduced + '.png'), animations: 'disabled' })

    const samples = await page.evaluate(() => (window as typeof window & {
      cinematicProbe: { samples: { phase: string; beat: string; intensity: string; zoom: number; hp: string | null; timestamp: number }[] }
    }).cinematicProbe.samples)
    const phases = samples.map(sample => sample.phase)
    const beats = samples.map(sample => sample.beat)
    expect(phases).toContain('released')
    expect(phases).toContain('impact')
    expect(phases).toContain('visual-complete')
    if (reduced === 'off') {
      expect(beats).toContain('anticipation')
      expect(beats).toContain('travel')
      expect(beats).toContain('impact')
      expect(samples.some(sample => sample.zoom > 1 && sample.zoom <= 1.07)).toBe(true)
      expect(samples.filter(sample => sample.beat === 'impact').every(sample => sample.hp === '12')).toBe(true)
    } else {
      expect(samples.every(sample => sample.beat === 'neutral' && sample.zoom === 1)).toBe(true)
    }
    expect(errors).toEqual([])
    await test.info().attach('Camera timeline ' + reduced, {
      body: Buffer.from(JSON.stringify(samples, null, 2)), contentType: 'application/json',
    })
  })
}
