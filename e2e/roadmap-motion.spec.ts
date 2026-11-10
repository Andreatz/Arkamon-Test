import { test, expect, type Page } from '@playwright/test'

async function battleFixture(page: Page, speed = 'normal', reduced = 'off') {
  await page.addInitScript(({ speed, reduced }) => {
    if (localStorage.getItem('roadmap-motion-seeded')) return
    const team = [1,5,9,13,20,21].map((specieId, index) => ({ istanzaId: `motion-${index}`, specieId, nome: index === 0 ? 'Vyrath delle Costellazioni di Oriente' : `Compagno ${index}`, livello: 5, hp: index === 0 ? 5 : 10, xp: 0 }))
    const enemy = { istanzaId: 'motion-enemy', specieId: 13, nome: 'Wormaren rivale', livello: 5, hp: 12, xp: 0 }
    const player = (id: number) => ({ id, nome: id === 1 ? 'Melia' : 'Maggi', squadra: id === 1 ? team : [], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 0, inventario: { potion: 2, 'super-potion': 2, revive: 1, antidote: 2, 'paralysis-heal': 2, awakening: 2, masterball: 1 } })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9, posizione1: position, posizione2: position,
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true, scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'mappa-principale' },
      battaglia: { tipo: 'Selvatico', pokemonA: team[0], pokemonB: enemy, squadraA: team, squadraB: [enemy], hpMaxA: 12, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Venezia', log: ['Il risultato resta leggibile fino al comando successivo.'], evoluzioneInAttesa: null,
        seeded: { algorithm: 'arkamon-counter-v1', seed: 'MOTION-QA', cursor: 0 }, checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'player', openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] } } } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { animationSpeed: speed, reducedMotion: reduced, musicVolume: 0, effectsVolume: 0 } }))
    localStorage.setItem('roadmap-motion-seeded', '1')
  }, { speed, reduced })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
}

for (const height of [1080,945,900]) test(`battle bag is bounded and paginated at 1920x${height}`, async ({ page, isMobile }) => {
  test.skip(isMobile)
  await page.setViewportSize({ width: 1920, height })
  await battleFixture(page, 'fast', 'on')
  await page.getByRole('button', { name: 'Borsa', exact: true }).click()
  const bag = page.getByRole('dialog', { name: 'Borsa in battaglia', exact: true })
  await expect(bag).toBeVisible()
  await expect(bag.locator('.battle-bag-items>button')).toHaveCount(4)
  const targetRows = bag.getByRole('group', { name: 'Arkamon da curare' }).getByRole('button')
  await expect(targetRows).toHaveCount(6)
  const geometry = await bag.evaluate(element => {
    const root = element.getBoundingClientRect()
    const clipped = [...element.querySelectorAll('button, h2, .battle-bag-preview')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.top < root.top || r.bottom > root.bottom || r.left < root.left || r.right > root.right) }).map(el => el.textContent)
    const body = element.children[1] as HTMLElement
    return { bottom: root.bottom, right: root.right, clipped, scrolling: body.scrollHeight > body.clientHeight + 1 }
  })
  expect(geometry.bottom).toBeLessThanOrEqual(height)
  expect(geometry.right).toBeLessThanOrEqual(1920)
  expect(geometry.clipped).toEqual([])
  expect(geometry.scrolling).toBe(false)
  await bag.getByRole('button', { name: '→', exact: true }).click()
  await expect(bag.locator('.battle-bag-items>button')).toHaveCount(3)
  await bag.getByRole('button', { name: '←', exact: true }).click()
  await expect(bag.getByRole('button', { name: 'Usa Pozione', exact: true })).toBeEnabled()
  await test.info().attach(`Borsa battaglia 1920x${height}`, { body: await page.screenshot({ path: `output/implementation-2026-10-19/battle-bag-${height}.png` }), contentType: 'image/png' })
  await bag.getByRole('button', { name: 'Chiudi', exact: true }).click()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(stored.giocatore1.inventario.potion).toBe(2)
  expect(stored.battaglia.pokemonA.hp).toBe(5)
})

test('the world owns motion and effects while HP, commands and messages remain outside it', async ({ page, isMobile }) => {
  test.skip(isMobile)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await battleFixture(page)
  const world = page.locator('[data-battle-world]')
  await expect(world.locator('[data-arkamon-animation]')).toHaveCount(2)
  await expect(world.locator('[data-battle-hp-side]')).toHaveCount(0)
  await expect(world.locator('[data-battle-turn-status]')).toHaveCount(0)
  await expect(world.locator('.battle-move-button')).toHaveCount(0)
  const message = page.getByText('Il risultato resta leggibile fino al comando successivo.', { exact: true })
  await expect(message).toBeVisible()
  await page.waitForTimeout(2400)
  await expect(message).toBeVisible()
})

test('source-frame review paints the original last frame and retains all seven pending reviews', async ({ page, isMobile }) => {
  test.skip(isMobile)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/#arkamon-lab')
  await page.getByRole('combobox', { name: 'Arkamon', exact: true }).selectOption('17')
  await page.getByRole('combobox', { name: 'Sfondo', exact: true }).selectOption('light')
  await page.getByRole('button', { name: 'Ultimo fotogramma', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Fotogramma sorgente 96 di 96' })).toBeVisible()
  await expect(page.locator('[data-preview-card="animated"] [data-sprite-renderer="paged-canvas"]')).toHaveAttribute('data-sprite-frame', '95')
  await expect(page.locator('[data-preview-card="animated"] [data-sprite-renderer="paged-canvas"]')).toHaveAttribute('data-sprite-paused', 'true')
  await page.getByRole('button', { name: '← Fotogramma', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Fotogramma sorgente 95 di 96' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Esito della tua revisione' })).toHaveValue('pending')
})

test('normal, fast and reduced presentation preserve the same seeded dice, HP and event order', async ({ browser, isMobile }) => {
  test.skip(isMobile)
  test.setTimeout(90_000)
  const outcomes: unknown[] = []
  for (const [speed, reduced] of [['normal','off'], ['fast','off'], ['fast','on']]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'no-preference' })
    try {
      const page = await context.newPage()
      await battleFixture(page, speed, reduced)
      await page.locator('.battle-move-button').filter({ has: page.locator('[data-admin-layout-text-key="move-0-name"]') }).first().click()
      await expect.poll(async () => page.evaluate(() => {
        const battle = JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia
        return battle.cronaca?.events.some((event: { kind: string; side: string }) => event.kind === 'attack' && event.side === 'A')
      }), { timeout: 45_000 }).toBe(true)
      await expect(page.locator('[data-dice-revealed]')).toHaveCount(0)
      const outcome = await page.evaluate(() => {
        const battle = JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia
        const attack = battle.cronaca.events.find((event: { kind: string; side: string }) => event.kind === 'attack' && event.side === 'A')
        return { dice: attack.dice, damage: attack.damage, hpA: battle.pokemonA.hp, hpB: battle.pokemonB.hp, kinds: battle.cronaca.events.map((event: { kind: string }) => event.kind), cursor: battle.seeded.cursor }
      })
      outcomes.push(outcome)
    } finally { await context.close() }
  }
  expect(outcomes[1]).toEqual(outcomes[0])
  expect(outcomes[2]).toEqual(outcomes[0])
})
