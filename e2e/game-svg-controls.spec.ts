import { expect, test, type Locator, type Page } from '@playwright/test'
import { MENU_SVG_ARTWORK_ENABLED } from '../src/player-ui/uiAppearancePolicy'

test.use({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'no-preference' })
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== 'chromium', 'Verifica delle schermate desktop a 1920×1080.')
})

type SvgResponses = Map<string, number>

/** A separate Playwright context owns the save; navigation uses the actual game controls. */
async function openFixture(page: Page, scene: 'titolo' | 'mappa-principale' | 'battaglia', place = 'Venezia') {
  const svgResponses: SvgResponses = new Map()
  page.on('response', response => {
    const url = new URL(response.url())
    if ((url.pathname.includes('/ui/player-kit/') || url.pathname.includes('/ui/studio/runtime/')) && url.pathname.endsWith('.svg')) {
      svgResponses.set(url.pathname, response.status())
    }
  })
  await page.addInitScript(({ scene, place }) => {
    if (localStorage.getItem('e2e-svg-controls-fixture')) return
    const attacker = { istanzaId: 'svg-controls-a', specieId: 1, nome: 'Vyrath SVG', livello: 14, hp: 25, xp: 0 }
    const defender = { istanzaId: 'svg-controls-b', specieId: 13, nome: 'Wormaren SVG', livello: 5, hp: 1, xp: 0 }
    const companion = { istanzaId: 'svg-controls-g2', specieId: 5, nome: 'Darklaw SVG', livello: 14, hp: 25, xp: 0 }
    const player = (id: 1 | 2) => ({
      id, nome: `Giocatore SVG ${id}`, squadra: [id === 1 ? attacker : companion], deposito: {},
      cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 1000,
      inventario: { masterball: 3 },
    })
    const position = (luogo: string) => ({ mappaId: 'mappa-principale', luogo, x: 0, y: 0, direzione: 'S' })
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position(place), posizione2: position('Pordenone'),
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
      scenaCorrente: { scena: scene }, scenaPrecedente: { scena: 'mappa-principale' },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: scene === 'battaglia' ? {
        tipo: 'Selvatico', pokemonA: attacker, pokemonB: defender,
        squadraA: [attacker], squadraB: [defender], hpMaxA: 25, hpMaxB: 12,
        turnoCorrente: 'A', luogoRitorno: 'mappa-principale', log: ['Verifica dei comandi SVG.'], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'player', openingComplete: true,
          outcome: null, evolutions: [], rivalMessages: [] },
      } : null,
    } }))
    // Keep the real reveal sequence and its full two-second result window.
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      musicVolume: 0, effectsVolume: 0, animationSpeed: 'normal', reducedMotion: 'off',
    } }))
    localStorage.setItem('e2e-svg-controls-fixture', 'seeded')
  }, { scene, place })
  await page.goto('/')
  await expect(page.locator(`[data-presented-scene="${scene}"]`)).toHaveAttribute('aria-busy', 'false')
  await page.evaluate(async () => {
    await document.fonts.ready
    await document.fonts.load('400 18px "Arkamon Norwester"')
  })
  const fonts = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    loaded: Array.from(document.fonts).filter(face => face.status === 'loaded').map(face => face.family.replace(/["']/g, '')),
  }))
  expect(fonts.body).toContain('Arkamon Norwester')
  expect(fonts.loaded).toContain('Arkamon Norwester')
  expect(fonts.loaded).not.toEqual(expect.arrayContaining(['Oxanium']))
  expect(fonts.loaded).not.toEqual(expect.arrayContaining(['Sora']))
  return svgResponses
}

/** Checks current CSS commands or enabled authored SVG frames, keeping action and geometry coverage. */
async function assertCommandButton(button: Locator, responses: SvgResponses, tone: 'default' | 'primary' = 'default', disabled = false) {
  await expect(button).toBeVisible()
  await expect(button).toHaveAttribute('data-game-button', tone)
  if (disabled) await expect(button).toBeDisabled()
  else await expect(button).toBeEnabled()
  const id = tone === 'primary' ? 'selected' : 'command'
  const proof = await button.evaluate(element => {
    const frame = element.querySelector<HTMLElement>('.game-button-frame,.rpg-frame')
    const frameStyle = frame ? getComputedStyle(frame) : null, style = getComputedStyle(element), bound = element.getBoundingClientRect()
    const frameBound = frame?.getBoundingClientRect() ?? bound
    return { tag: element.tagName, label: element.textContent?.trim(), hasFrame: !!frame, background: style.backgroundColor, backgroundImage: style.backgroundImage, borderWidth: style.borderTopWidth, source: frameStyle?.borderImageSource,
      slice: frameStyle?.borderImageSlice, repeat: frameStyle?.borderImageRepeat, font: style.fontFamily, localMap: !!element.closest('.local-map-scene'),
      decorative: frame?.getAttribute('aria-hidden'), disabled: (element as HTMLButtonElement).disabled,
      bound: { left: bound.left, top: bound.top, right: bound.right, bottom: bound.bottom, width: bound.width, height: bound.height },
      frameBound: { left: frameBound.left, top: frameBound.top, right: frameBound.right, bottom: frameBound.bottom },
      viewport: { width: innerWidth, height: innerHeight },
    }
  })
  expect(proof.tag).toBe('BUTTON')
  expect(proof.label).toBeTruthy()
  expect(proof.hasFrame).toBe(MENU_SVG_ARTWORK_ENABLED)
  if (MENU_SVG_ARTWORK_ENABLED) {
    expect(proof.decorative).toBe('true')
    expect(proof.source).toContain(`/ui/studio/runtime/${id}.svg`)
    expect(proof.slice).toContain('70 160')
    expect(proof.slice).toContain('fill')
    expect(proof.repeat).toBe('stretch')
  } else {
    await expect(button).toHaveAttribute('data-menu-artwork', 'css')
    expect(proof.background !== 'rgba(0, 0, 0, 0)' || proof.backgroundImage !== 'none', 'A solid or gradient surface visibly paints the control').toBe(true)
    expect(parseFloat(proof.borderWidth)).toBeGreaterThan(0)
  }
  expect(proof.font).toContain(proof.localMap ? 'Georgia' : 'Arkamon Norwester')
  expect(proof.disabled).toBe(disabled)
  expect(proof.bound.width).toBeGreaterThan(0)
  expect(proof.bound.height).toBeGreaterThan(0)
  expect(proof.bound.left).toBeGreaterThanOrEqual(-2)
  expect(proof.bound.top).toBeGreaterThanOrEqual(-2)
  expect(proof.bound.right).toBeLessThanOrEqual(proof.viewport.width + 2)
  expect(proof.bound.bottom).toBeLessThanOrEqual(proof.viewport.height + 2)
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(proof.bound[edge] - proof.frameBound[edge])).toBeLessThanOrEqual(2)
  }
  if (MENU_SVG_ARTWORK_ENABLED) await expect.poll(() => [...responses.entries()].find(([path]) => path.endsWith(`/ui/studio/runtime/${id}.svg`))?.[1]).toBe(200)
  return proof
}

async function capture(page: Page, name: string) {
  expect(page.viewportSize()).toEqual({ width: 1920, height: 1080 })
  await test.info().attach(name, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' })
}

test('titolo: comandi visibili e Continua conducono alla mappa della partita salvata', async ({ page }) => {
  const responses = await openFixture(page, 'titolo')
  await assertCommandButton(page.getByRole('button', { name: 'Nuova Partita', exact: true }), responses, 'primary')
  const resume = page.getByRole('button', { name: 'Continua', exact: true })
  await assertCommandButton(resume, responses)
  await capture(page, 'Titolo · 1920×1080')
  await resume.click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: 'Apri mappa di Venezia', exact: true })).toBeVisible()
})

test('mappa principale e Venezia: i comandi correnti accompagnano la navigazione e le attività', async ({ page }) => {
  const responses = await openFixture(page, 'mappa-principale')
  const enter = page.getByRole('button', { name: 'Apri mappa di Venezia', exact: true })
  await assertCommandButton(enter, responses, 'primary')
  const tools = page.getByRole('button', { name: 'Partita', exact: true })
  await assertCommandButton(tools, responses)
  const toolsBounds = await tools.boundingBox()
  expect(toolsBounds!.width).toBeGreaterThanOrEqual(64)
  expect(toolsBounds!.height).toBeGreaterThanOrEqual(32)
  for (const name of ['Passa turno', 'Deposito', 'Titolo']) {
    await assertCommandButton(page.getByRole('button', { name, exact: true }), responses)
  }
  await capture(page, 'Mappa principale · 1920×1080')
  await enter.click()
  await expect(page.locator('[data-presented-scene="citta:Venezia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('group', { name: 'Mappa di Venezia', exact: true })).toBeVisible()
  await assertCommandButton(page.getByRole('button', { name: '← Mappa principale', exact: true }), responses)
  await assertCommandButton(page.getByRole('button', { name: 'Passa turno', exact: true }), responses, 'primary')
  await expect(page.getByRole('button', { name: 'Attività', exact: true })).toHaveCount(0)
  await capture(page, 'Mappa di Venezia · 1920×1080')
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await page.getByRole('button', { name: 'Scorciatoie del Game Master', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Scorciatoie del Game Master', exact: true })
  await expect(dialog).toBeVisible()
  await assertCommandButton(dialog.getByRole('button', { name: /Centro Pokémon/ }), responses)
  const close = dialog.getByRole('button', { name: 'Chiudi attività', exact: true })
  await assertCommandButton(close, responses)
  await close.click()
  await expect(dialog).toBeHidden()
})

test('Percorso 1: le cornici restano integre e i movimenti esauriti disabilitano i comandi', async ({ page }) => {
  const responses = await openFixture(page, 'mappa-principale', 'Percorso_1')
  const enter = page.getByRole('button', { name: 'Apri mappa di Percorso 1', exact: true })
  await assertCommandButton(enter, responses, 'primary')
  await enter.click()
  await expect(page.locator('[data-presented-scene="percorso:Percorso_1"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('group', { name: 'Mappa di Percorso 1', exact: true })).toBeVisible()
  const neighbours = page.getByRole('navigation', { name: 'Punti raggiungibili', exact: true })
  const firstMove = neighbours.getByRole('button').first()
  await assertCommandButton(firstMove, responses)
  await assertCommandButton(page.getByRole('button', { name: 'Passa turno', exact: true }), responses, 'primary')
  await capture(page, 'Mappa del Percorso 1 · 1920×1080')
  await firstMove.click()
  await expect(page.locator('.local-map-budget')).toHaveText('1 azione')
  await neighbours.getByRole('button').first().click()
  await expect(page.locator('.local-map-budget')).toHaveText('0 azioni')
  const available = neighbours.getByRole('button')
  expect(await available.count()).toBeGreaterThan(0)
  for (const button of await available.all()) await assertCommandButton(button, responses, 'default', true)
  await expect(page.locator('[data-local-map-node][data-reachable="true"]')).toHaveCount(0)
  await page.getByRole('button', { name: '← Mappa principale', exact: true }).click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
})

test('battaglia: asset originali delle mosse, stato del lancio SVG e fondo dei dadi al 55%', async ({ page }) => {
  test.setTimeout(90_000)
  const responses = await openFixture(page, 'battaglia')
  const move = page.getByRole('button').filter({ has: page.getByText('Soffio', { exact: true }) })
  await expect(move).toBeEnabled()
  expect(await move.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('/ui/move_button.png')
  expect(await move.evaluate(element => getComputedStyle(element).fontFamily)).toContain('Arkamon Norwester')
  // Record the real transient result before slower artwork inspection and PNG
  // encoding; those operations can finish after the battle removes the overlay.
  await page.evaluate(() => {
    const evidence: { at: number; damage: string }[] = []
    Object.assign(window, { svgDiceRevealEvidence: evidence })
    const observer = new MutationObserver(() => {
      const result = document.querySelector('[data-dice-revealed="true"]')
      if (result && !evidence.length) evidence.push({ at: performance.now(), damage: result.textContent ?? '' })
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true })
  })
  for (const control of [move,
    page.getByRole('button', { name: 'Mossa Suprema', exact: true }),
    page.getByRole('button', { name: 'Cattura', exact: true }),
    page.getByRole('button', { name: /^Masterball x/ }),
    page.getByRole('button', { name: 'Borsa', exact: true }),
    page.getByRole('button', { name: /^Cronaca ·/ }),
  ]) {
    await expect(control).toBeVisible()
    expect(await control.getAttribute('data-game-button')).toBeNull()
  }
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '1')
  await move.click()
  const panel = page.locator('.battle-dice-panel')
  await expect(panel).toBeVisible()
  const turnStatus = page.locator('[data-battle-turn-status]')
  await expect(turnStatus).toHaveAttribute('role', 'status')
  await expect(turnStatus).toContainText('Lancio dei dadi...')
  const statusFrame = turnStatus.locator('[data-kit="button-primary"]')
  await expect(statusFrame).toHaveAttribute('aria-hidden', 'true')
  expect(await statusFrame.evaluate(element => getComputedStyle(element).borderImageSource)).toContain('/ui/player-kit/button-primary.svg')
  await expect.poll(() => [...responses].some(([url, code]) => url.endsWith('/button-primary.svg') && code === 200)).toBe(true)
  await expect.poll(() => panel.evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1)
  const proof = await panel.evaluate(element => {
    const style = getComputedStyle(element), colour = style.backgroundColor
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
    const context = canvas.getContext('2d')!
    context.fillStyle = colour; context.fillRect(0, 0, 1, 1)
    const alpha = context.getImageData(0, 0, 1, 1).data[3] / 255
    return { background: colour, alpha, backdrop: style.backdropFilter, opacity: style.opacity,
      captionOpacity: Array.from(element.querySelectorAll('p,h3')).map(caption => Number(getComputedStyle(caption).opacity)),
      hp: document.querySelector('[data-battle-hp-side="enemy"]')?.getAttribute('data-battle-hp'),
    }
  })
  expect(proof.background).not.toBe('transparent')
  expect(proof.alpha).toBeCloseTo(.55, 2)
  expect(proof.backdrop).toBe('none')
  expect(proof.opacity).toBe('1')
  expect(proof.captionOpacity.length).toBeGreaterThanOrEqual(3)
  expect(proof.captionOpacity.every(opacity => opacity === 1)).toBe(true)
  expect(proof.hp).toBe('1')
  await expect(move).toBeDisabled()
  await test.info().attach('Stili effettivi del pannello dadi', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' })
  await expect.poll(() => page.evaluate(() => (window as unknown as { svgDiceRevealEvidence: { damage: string }[] }).svgDiceRevealEvidence)).toEqual([
    expect.objectContaining({ damage: expect.stringContaining('Danno finale:') }),
  ])
  await capture(page, 'Battaglia · pannello dadi trasparente · 1920×1080')
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '0', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible({ timeout: 30_000 })
  expect(await page.getByRole('button', { name: 'Prosegui', exact: true }).getAttribute('data-game-button')).toBeNull()
})
