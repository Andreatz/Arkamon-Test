import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

test.use({ reducedMotion: 'no-preference' })
test.setTimeout(90_000)

async function openAetherBattle(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('e2e-aether-fixture')) return
    const a = { istanzaId: 'aether-player', specieId: 1, nome: 'Vyrath', livello: 14, hp: 25, xp: 0 }
    const b = { istanzaId: 'aether-rival', specieId: 13, nome: 'Wormaren', livello: 5, hp: 12, xp: 0 }
    const player = (id: 1 | 2) => ({
      id, nome: 'Aether test', squadra: id === 1 ? [a] : [],
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
        tipo: 'Selvatico', pokemonA: a, pokemonB: b, squadraA: [a], squadraB: [b],
        hpMaxA: 25, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'mappa-principale',
        log: ['Preparati a combattere!'], evoluzioneInAttesa: null,
      },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      reducedMotion: 'off', animationSpeed: 'normal', graphicsMemory: 'auto',
      musicVolume: 0, effectsVolume: 0,
    } }))
    localStorage.setItem('e2e-aether-fixture', 'seeded')
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.battle-stage[data-battle-ui="aether"][data-battle-art="arcana"]')).toBeVisible()
}

test('new premium HUD is legible and aligned on desktop and compact 16:9 stages', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await mkdir(resolve('output/rework-aether'), { recursive: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await openAetherBattle(page)
  const hp = page.locator('[data-battle-hp-side="enemy"]')
  await expect(hp).toHaveAttribute('data-battle-hp', '12')
  await expect(hp.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '12')
  await expect(page.locator('.battle-v5-move').first()).toBeVisible()
  await expect(page.locator('.battle-v5-supreme')).toHaveAttribute('aria-label', 'Mossa Suprema')
  await expect(page.locator('.battle-aether-atmosphere')).toHaveCount(1)
  await expect(page.locator('.battle-aether-letterbox')).toHaveCount(1)
  await expect(page.locator('.battle-arcana-glyph')).toHaveCount(1)

  const appearance = await page.evaluate(() => {
    const hp = document.querySelector('.battle-v5-hp')!
    const move = document.querySelector('.battle-v5-move')!
    const narrative = document.querySelector('.battle-v5-dialogue')
    return {
      hpFill: hp.querySelector('[data-battle-hp-fill]') !== null,
      hpBackground: getComputedStyle(hp).backgroundImage,
      moveBackground: getComputedStyle(move).backgroundImage,
      moveAccent: getComputedStyle(move).getPropertyValue('--move-accent').trim(),
      narrative: narrative ? getComputedStyle(narrative).backgroundImage : null,
    }
  })
  expect(appearance.hpFill).toBe(true)
  expect(appearance.hpBackground).toContain('/ui/arcana/hp-')
  expect(appearance.moveBackground).toContain('/ui/arcana/move-card.svg')
  expect(appearance.narrative).toContain('/ui/arcana/chronicle.svg')
  expect(appearance.moveAccent).toMatch(/^#[0-9a-fA-F]{6}$/)
  // SVG corners remain truly transparent; enamel is intentionally opaque inside.
  const vectorAssets = await page.evaluate(async () => {
    const names = ['hp-ally', 'hp-rival', 'move-card', 'chronicle', 'supreme', 'command', 'title-panel', 'battle-glyph']
    return Promise.all(names.map(async name => {
      const image = new Image()
      image.src = '/ui/arcana/' + name + '.svg'
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 120
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0, 120, 120)
      const corner = context.getImageData(0, 0, 1, 1).data[3]
      const center = context.getImageData(60, 60, 1, 1).data[3]
      return { name, corner, center }
    }))
  })
  expect(vectorAssets).toHaveLength(8)
  for (const asset of vectorAssets) {
    expect(asset.corner, asset.name + ' should have transparent unpainted corners').toBe(0)
    expect(asset.center, asset.name + ' should have an illustrated center').toBeGreaterThan(60)
  }
  await page.screenshot({ path: resolve('output/rework-aether/battle-desktop.png'), animations: 'disabled' })

  await page.setViewportSize({ width: 640, height: 360 })
  await expect(page.locator('.battle-v5-move').first()).toBeVisible()
  const compact = await page.locator('.battle-stage').evaluate(stage => ({
    overflow: stage.scrollWidth - stage.clientWidth,
    hpWidth: stage.querySelector('.battle-v5-hp')!.getBoundingClientRect().width,
    moveWidth: stage.querySelector('.battle-v5-move')!.getBoundingClientRect().width,
  }))
  expect(compact.overflow).toBeLessThanOrEqual(2)
  expect(compact.hpWidth).toBeGreaterThan(70)
  expect(compact.moveWidth).toBeGreaterThan(40)
  const trayBounds = await page.evaluate(() => {
    const stage = document.querySelector('.battle-stage')!.getBoundingClientRect()
    const capture = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.trim() === 'Cattura')!
    const buttonBounds = capture.getBoundingClientRect()
    const move = document.querySelector('.battle-v5-move')!.getBoundingClientRect()
    const name = document.querySelector('.battle-v5-move__name')!
    const range = document.createRange()
    range.selectNodeContents(name)
    return { captureBottom: buttonBounds.bottom, stageBottom: stage.bottom,
      nameTop: range.getBoundingClientRect().top, cardTop: move.top }
  })
  expect(trayBounds.captureBottom).toBeLessThanOrEqual(trayBounds.stageBottom - 1)
  expect(trayBounds.nameTop).toBeGreaterThanOrEqual(trayBounds.cardTop + 2)
  await page.screenshot({ path: resolve('output/rework-aether/battle-compact.png'), animations: 'disabled' })
  expect(errors).toEqual([])
})

test('reduced-motion keeps battle controls and hides decorative entrances', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await openAetherBattle(page)
  const state = await page.locator('.battle-v5-hp').first().evaluate(node => ({
    entrance: getComputedStyle(node).animationName,
    readable: !!node.querySelector('[data-ui-hp-value]')?.textContent?.trim(),
  }))
  expect(state.entrance).toBe('none')
  expect(state.readable).toBe(true)
  await expect(page.locator('.battle-arcana-glyph')).toHaveCSS('transition-duration', '0s')
  await expect(page.locator('.battle-v5-supreme')).toBeEnabled()
})
