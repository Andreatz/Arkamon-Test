import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { writeFile } from 'node:fs/promises'
import type { AudienceRound, AudienceRoundRequest } from '../src/audience/types'

test('deposit discards legacy EXP; swaps and cross-box moves survive reload with residual HP, status and separate inventories', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('e2e-deposit-fixture')) return
    const vyrath = { istanzaId: 'deposit-vyrath', specieId: 1, nome: 'Vyrath deposito', livello: 5, hp: 7, xp: 2, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }
    const darklaw = { istanzaId: 'deposit-darklaw', specieId: 5, nome: 'Darklaw deposito', livello: 5, hp: 9, xp: 1 }
    const felyss = { istanzaId: 'deposit-felyss', specieId: 9, nome: 'Felyss deposito', livello: 5, hp: 3, xp: 0 }
    const secondPlayer = { ...felyss, istanzaId: 'deposit-player-two', nome: 'Felyss Due', hp: 5 }
    const player = (id: 1 | 2) => ({ id, nome: `Deposito ${id}`, squadra: id === 1 ? [vyrath, darklaw] : [secondPlayer], deposito: id === 1 ? { '1:1': felyss } : {}, cespugliVisitati: [], allenatoriSconfitti: [], monete: 0, inventario: { masterball: 1 }, caselleConsumate: [] })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true, battaglia: null,
      scenaCorrente: { scena: 'deposito' }, scenaPrecedente: { scena: 'mappa-principale' },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
    } }))
    localStorage.setItem('e2e-deposit-fixture', 'seeded')
  })
  await page.goto('/')
  const scene = page.locator('[data-presented-scene="deposito"]')
  await expect(scene).toHaveAttribute('aria-busy', 'false')
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)

  // Swap two occupied slots through the same controls used by the player.
  await scene.getByRole('button', { name: 'Squadra, posto 1: Vyrath deposito, livello 5', exact: true }).click()
  await scene.getByRole('button', { name: 'Sposta o scambia', exact: true }).click()
  await scene.getByRole('button', { name: 'Box 1, posto 1: Felyss deposito, livello 5', exact: true }).click()
  await expect(scene.getByRole('button', { name: 'Squadra, posto 1: Felyss deposito, livello 5', exact: true })).toBeVisible()
  await expect(scene.getByRole('button', { name: 'Box 1, posto 1: Vyrath deposito, livello 5', exact: true })).toBeVisible()

  // A selection remains usable when moving to another box; the squad compacts.
  await scene.getByRole('button', { name: 'Squadra, posto 2: Darklaw deposito, livello 5', exact: true }).click()
  await scene.getByRole('button', { name: 'Sposta o scambia', exact: true }).click()
  await scene.getByRole('button', { name: 'Vai al box 2', exact: true }).click()
  await scene.getByRole('button', { name: 'Box 2, posto 35: vuoto', exact: true }).click()
  await expect(scene.getByRole('button', { name: 'Squadra, posto 2: vuoto', exact: true })).toBeVisible()
  const moved = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(moved.giocatore1.squadra).toEqual([initial.giocatore1.deposito['1:1']])
  expect(moved.giocatore1.deposito['1:1']).toEqual({ ...initial.giocatore1.squadra[0], xp: 0 })
  expect(moved.giocatore1.deposito['2:35']).toEqual({ ...initial.giocatore1.squadra[1], xp: 0 })
  expect(moved.giocatore2).toEqual(initial.giocatore2)
  expect(moved.turnoOverworld).toEqual(initial.turnoOverworld)
  const ids = [...moved.giocatore1.squadra, ...Object.values(moved.giocatore1.deposito)] as { istanzaId: string; xp: number; livello: number }[]
  expect(new Set(ids.map((pokemon) => pokemon.istanzaId)).size).toBe(3)
  expect(ids.every((pokemon) => pokemon.xp === 0 && pokemon.livello === 5)).toBe(true)

  await page.reload()
  await expect(scene).toHaveAttribute('aria-busy', 'false')
  await expect(scene.getByRole('button', { name: 'Box 1, posto 1: Vyrath deposito, livello 5', exact: true })).toBeVisible()
  await scene.getByRole('button', { name: 'Vai al box 2', exact: true }).click()
  await expect(scene.getByRole('button', { name: 'Box 2, posto 35: Darklaw deposito, livello 5', exact: true })).toBeVisible()
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(resumed.giocatore1).toEqual(moved.giocatore1)
  expect(resumed.giocatore2).toEqual(moved.giocatore2)
  expect(errors).toEqual([])
})

test('an NPC ballot resumes its same saved turn after reload and applies the mocked majority once without another poison tick', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const serviceUrl = 'https://vota.example'
  const sessionId = '12345678-1234-1234-1234-123456789abc'
  const battleId = 'e2e-resumed-ballot'
  const turnKey = `${battleId}:B:1:ballot-vyrath`
  const joinUrls = {
    npc: `${serviceUrl}/giochi/arkamon/vota/${sessionId}#canale=npc&invito=${'b'.repeat(64)}`,
    boss: `${serviceUrl}/giochi/arkamon/vota/${sessionId}#canale=boss&invito=${'c'.repeat(64)}`,
  }
  const request: AudienceRoundRequest = {
    turnKey, channel: 'npc', durationSeconds: 60,
    trainer: { name: 'Allenatore di verifica', kind: 'NPC' },
    pokemon: { instanceId: 'ballot-vyrath', speciesId: 1, name: 'Vyrath rivale', level: 5 },
    options: [
      { index: 0, moveId: 1, name: 'Soffio', type: 'Normale', description: '1d6 + 1' },
      { index: 1, moveId: 111, name: 'Brezza Profumata', type: 'Erba', description: '1d6 + 1' },
    ], fallbackIndex: 0,
  }
  // Mock only the HTTP contract. The battle, recovery, dice, status and rendering use the real app.
  let round: AudienceRound | null = null
  let createdRounds = 0
  let closes = 0
  let releaseOpening!: () => void
  const openingResponse = new Promise<void>(resolve => { releaseOpening = resolve })
  let releaseClosing!: () => void
  const closingResponse = new Promise<void>(resolve => { releaseClosing = resolve })
  const openedTurnKeys: string[] = []
  await page.route(`${serviceUrl}/api/arkamon-votes/**`, async (route) => {
    const call = route.request()
    const path = new URL(call.url()).pathname
    if (call.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, OPTIONS' } }); return }
    if (call.method() === 'POST' && path.endsWith('/round')) {
      const posted = call.postDataJSON() as AudienceRoundRequest
      openedTurnKeys.push(posted.turnKey)
      expect(posted).toEqual(request)
      if (!round) {
        const now = Date.now()
        round = { id: 'e2e-round-001', turnKey: posted.turnKey, channel: posted.channel, status: 'open', openedAt: now, deadlineAt: now + 60_000, closedAt: null,
          trainer: posted.trainer, pokemon: posted.pokemon, options: posted.options, counts: [7, 2, 0], winnerIndex: null, resolution: null }
        createdRounds += 1
      }
      if (openedTurnKeys.length === 1) await openingResponse
    } else if (call.method() === 'POST' && path.endsWith('/host')) {
      const control = call.postDataJSON() as { action: string; roundId: string }
      expect(control.action).toBe('close')
      expect(control.roundId).toBe(round?.id)
      closes += 1
      await closingResponse
      round = { ...round!, status: 'closed', closedAt: Date.now(), winnerIndex: 0, resolution: 'majority' }
    } else expect(call.method()).toBe('GET')
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      sessionId, serverNow: Date.now(), expiresAt: Date.now() + 3_600_000, joinUrls, participants: { npc: 9, boss: 0 }, round,
    }) })
  })
  await page.addInitScript(({ request, sessionId, serviceUrl, joinUrls, battleId }) => {
    if (localStorage.getItem('e2e-ballot-fixture')) return
    const attacker = { istanzaId: 'ballot-darklaw', specieId: 5, nome: 'Darklaw giocatore', livello: 5, hp: 12, xp: 0 }
    const defender = { istanzaId: 'ballot-vyrath', specieId: 1, nome: 'Vyrath rivale', livello: 5, hp: 8, xp: 0, stato: { tipo: 'Avvelenato', turniRimanenti: -1, turniTrascorsi: 1 } }
    const player = (id: 1 | 2) => ({ id, nome: `Pubblico ${id}`, squadra: id === 1 ? [attacker] : [], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], monete: 0, inventario: {}, caselleConsumate: [] })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Percorso_1' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
      scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'percorso', payload: { luogo: 'Percorso_1' } },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: { tipo: 'NPC', pokemonA: attacker, pokemonB: defender, squadraA: [attacker], squadraB: [defender], hpMaxA: 12, hpMaxB: 12, turnoCorrente: 'B', luogoRitorno: 'Percorso_1', log: ['Il turno del rivale attende il pubblico.'], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'B', actedThisRound: [], phase: 'audience', openingComplete: true, outcome: null, evolutions: [], rivalMessages: ['Veleno già risolto per questo turno.'], audienceBattleId: battleId, opponentTurnNumber: 1, audiencePending: { sessionId, request } },
      },
    } }))
    localStorage.setItem('arkamon-audience-v1', JSON.stringify({ version: 1, enabled: true, durationSeconds: 60, serviceUrl,
      session: { serviceUrl, sessionId, hostToken: 'a'.repeat(64), expiresAt: Date.now() + 3_600_000, joinUrls } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
    localStorage.setItem('e2e-ballot-fixture', 'seeded')
  }, { request, sessionId, serviceUrl, joinUrls, battleId })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  let ballot = page.getByRole('dialog', { name: 'Votazione del pubblico', exact: true })
  await expect(ballot).toBeFocused()
  await expect(ballot.getByRole('button', { name: 'Chiudi votazione', exact: true })).toBeDisabled()
  await page.keyboard.press('Tab')
  await expect(ballot.getByRole('button', { name: 'Continua senza votazione', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(ballot.getByRole('button', { name: 'Continua senza votazione', exact: true })).toBeFocused()
  releaseOpening()
  await expect(ballot.getByRole('button', { name: 'Chiudi votazione', exact: true })).toBeEnabled()
  await expect(ballot).toContainText('Pubblico NPC')
  await expect(ballot.getByRole('img', { name: 'Inquadra per votare dal telefono', exact: true })).toBeVisible()
  await expect(ballot.getByRole('status').filter({ hasText: '9 voti ricevuti' })).toHaveText('9 voti ricevuti')
  const firstSave = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  expect(firstSave.checkpoint.audiencePending.request.turnKey).toBe(turnKey)
  expect(firstSave.pokemonB).toMatchObject({ hp: 8, stato: { tipo: 'Avvelenato', turniTrascorsi: 1 } })
  const beforeReload = openedTurnKeys.length

  await page.reload()
  ballot = page.getByRole('dialog', { name: 'Votazione del pubblico', exact: true })
  await expect(ballot.getByRole('button', { name: 'Chiudi votazione', exact: true })).toBeEnabled()
  expect(openedTurnKeys.length).toBeGreaterThan(beforeReload)
  expect(new Set(openedTurnKeys)).toEqual(new Set([turnKey]))
  expect(createdRounds).toBe(1)
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  expect(resumed.pokemonA).toEqual(firstSave.pokemonA)
  expect(resumed.pokemonB).toEqual(firstSave.pokemonB)
  await ballot.getByRole('button', { name: 'Chiudi votazione', exact: true }).click()
  const closingButton = ballot.getByRole('button', { name: 'Chiusura in corso…', exact: true })
  await expect(closingButton).toBeDisabled()
  await expect(ballot).toBeFocused()
  await expect(ballot.getByRole('status')).toHaveText('Chiusura della votazione…')
  expect(closes).toBe(1)
  releaseClosing()
  await expect(ballot).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia.checkpoint.phase)).toBe('player')
  const settled = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  const events = settled.cronaca.events as { kind: string; side?: string; title: string; messages: string[]; dice?: number[]; diceSum?: number; increment?: number; damage?: number; supreme?: boolean }[]
  const attacks = events.filter((event) => event.kind === 'attack' && event.side === 'B')
  expect(attacks).toHaveLength(1)
  expect(attacks[0].title).toBe('Vyrath rivale usa Soffio')
  expect(attacks[0].dice).toHaveLength(1)
  expect(attacks[0].damage).toBe(attacks[0].diceSum! + attacks[0].increment!)
  expect(attacks[0].supreme).toBe(false)
  expect(events.filter((event) => event.kind === 'audience')).toHaveLength(1)
  expect(events.find((event) => event.kind === 'audience')!.messages.join(' ')).toContain('Soffio (7 voti)')
  expect(settled.pokemonA.hp).toBe(12 - attacks[0].damage!)
  expect(settled.pokemonB).toMatchObject({ hp: 8, stato: { tipo: 'Avvelenato', turniTrascorsi: 1 } })
  expect(closes).toBe(1)

  // A second reload after settlement cannot reopen or execute the ballot again.
  const settledOpenCount = openedTurnKeys.length
  await page.reload()
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('dialog', { name: 'Votazione del pubblico', exact: true })).toHaveCount(0)
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  expect(after.pokemonA).toEqual(settled.pokemonA)
  expect(after.pokemonB).toEqual(settled.pokemonB)
  expect(after.cronaca.events).toEqual(settled.cronaca.events)
  expect(openedTurnKeys.length).toBe(settledOpenCount)
  expect(errors).toEqual([])
})

test('healing moves show their real effect in team, analysis and Arkadex without changing the campaign', async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(() => {
    const creature = { istanzaId: 'healing-facts', specieId: 95, nome: 'Beestrix', livello: 10, hp: 3, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: `Giocatore ${id}`, squadra: id === 1 ? [creature] : [], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], monete: 0, inventario: {}, caselleConsumate: [] })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true, battaglia: null,
      scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null,
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
    } }))
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  for (const screen of ['Squadra', 'Analisi', 'Arkadex']) {
    await dialog.getByRole('button', { name: screen, exact: true }).click()
    if (screen === 'Squadra') await dialog.getByRole('tab', { name: 'Mosse', exact: true }).click()
    else await dialog.getByRole('button', { name: 'Mosse', exact: true }).click()
    const move = dialog.locator('.pu-move').filter({ hasText: 'Assorbilinfa' })
    await expect(move.locator('.pu-dice')).toHaveText('Cura 25%')
    await expect(move.locator('.pu-dice')).toHaveAttribute('aria-label', 'Cura 25% degli HP massimi e rimuove veleno e paralisi')
    await expect(move).not.toContainText(/\d+d6/)
    const geometry = await move.evaluate(element => ({ width: element.scrollWidth, viewport: element.clientWidth }))
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport + 1)
    const accessibility = await new AxeBuilder({ page }).include('.player-ui-dialog').analyze()
    expect(accessibility.violations).toEqual([])
    if (!isMobile) {
      const readability = await dialog.locator('.pu-content').evaluate(element => Array.from(element.querySelectorAll<HTMLElement>('.pu-move strong,.pu-dice,.pu-health>span,.pu-note,.pu-status-pill'))
        .filter(node => node.getClientRects().length > 0).map(node => ({ text: node.innerText, fontSize: getComputedStyle(node).fontSize, streamedAt960: parseFloat(getComputedStyle(node).fontSize) / 2, streamedAt360: parseFloat(getComputedStyle(node).fontSize) * 360 / 1920 })))
      const readabilityPath = test.info().outputPath(`readability-${screen.toLowerCase()}.json`)
      await writeFile(readabilityPath, JSON.stringify(readability, null, 2))
      await test.info().attach(`${screen} leggibilità trasmissione`, { path: readabilityPath, contentType: 'application/json' })
    }
    const screenshotPath = test.info().outputPath(`cura-${screen.toLowerCase()}.png`)
    await page.screenshot({ path: screenshotPath })
    await test.info().attach(`${screen} cura effettiva`, { path: screenshotPath, contentType: 'image/png' })
  }
  await page.keyboard.press('Escape')
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(after.giocatore1).toEqual(before.giocatore1)
  expect(after.giocatore2).toEqual(before.giocatore2)
  expect(after.turnoOverworld).toEqual(before.turnoOverworld)
})
