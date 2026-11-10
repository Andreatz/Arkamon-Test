import { test, expect } from '@playwright/test'

test('a real private phone command resumes and executes exactly once in the actual Arkamon battle', async ({ page, browser, request }, info) => {
  const serviceUrl = process.env.ARKAMON_GUEST_E2E_SERVICE
  test.skip(!serviceUrl, 'Requires the isolated local Arkanight service, never the live database')
  const created = await request.post(`${serviceUrl}/api/arkamon-votes`, { headers: { Origin: serviceUrl! }, data: { password: 'local-browser-test-only' } })
  expect(created.status()).toBe(201)
  const session = await created.json()
  const phoneContext = await browser.newContext({ viewport: { width: 393, height: 851 } })
  const phone = await phoneContext.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await phone.goto(session.joinUrls.boss)
    await expect(phone.getByRole('status').filter({ hasText: 'Collegato' })).toBeVisible()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.addInitScript(({ session, serviceUrl }) => {
      if (localStorage.getItem('private-guest-fixture')) return
      const actor = { istanzaId: 'guest-target', specieId: 5, nome: 'Darklaw Melia', livello: 5, hp: 12, xp: 0 }
      const enemy = { istanzaId: 'guest-vyrath', specieId: 1, nome: 'Vyrath ospite', livello: 5, hp: 8, xp: 0, stato: { tipo: 'Avvelenato', turniRimanenti: -1, turniTrascorsi: 1 } }
      const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Melia' : 'Maggi', squadra: id === 1 ? [actor] : [], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], monete: 0, inventario: {}, caselleConsumate: [] })
      const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Percorso_1' }
      const battleId = 'e2e-private-guest'
      const roundRequest = { turnKey: `${battleId}:B:1:${enemy.istanzaId}`, channel: 'boss', durationSeconds: 120,
        trainer: { name: 'Rivale PvP', kind: 'PVP' }, pokemon: { instanceId: enemy.istanzaId, speciesId: 1, name: enemy.nome, level: 5 },
        options: [{ index: 0, moveId: 1, name: 'Soffio', type: 'Normale', description: '1d6 + 1' }, { index: 1, moveId: 111, name: 'Brezza Profumata', type: 'Erba', description: '1d6 + 1' }], fallbackIndex: 0 }
      localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
        giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
        posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 0 },
        posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true, scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'percorso', payload: { luogo: 'Percorso_1' } },
        interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
        battaglia: { tipo: 'PVP', pokemonA: actor, pokemonB: enemy, squadraA: [actor], squadraB: [enemy], hpMaxA: 12, hpMaxB: 12, turnoCorrente: 'B', luogoRitorno: 'Percorso_1', log: [], evoluzioneInAttesa: null,
          checkpoint: { version: 1, initialPriority: 'B', actedThisRound: [], phase: 'audience', openingComplete: true, outcome: null, evolutions: [], rivalMessages: ['Veleno già risolto per questo turno.'], audienceBattleId: battleId, opponentTurnNumber: 1, audiencePending: { sessionId: session.sessionId, request: roundRequest } } },
      } }))
      localStorage.setItem('arkamon-audience-v1', JSON.stringify({ version: 1, enabled: false, guestEnabled: true, durationSeconds: 15, serviceUrl,
        session: { serviceUrl, sessionId: session.sessionId, hostToken: session.hostToken, expiresAt: session.expiresAt, joinUrls: session.joinUrls, guestProtocol: 'private-guest-v1' } }))
      localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
      localStorage.setItem('private-guest-fixture', 'seeded')
    }, { session, serviceUrl })
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Comando dell’ospite', exact: true })
    await expect(dialog).toContainText('In attesa del comando privato dell’ospite.')
    await expect(dialog.getByRole('img')).toHaveCount(0)
    await page.reload()
    await expect(dialog).toContainText('In attesa del comando privato dell’ospite.')
    await expect(phone.getByRole('button', { name: /Soffio/ })).toBeEnabled()
    await page.screenshot({ path: info.outputPath('private-guest-battle-1920.png') })
    await phone.getByRole('button', { name: /Soffio/ }).click()
    await expect(phone.getByText('Comando confermato: Soffio.', { exact: true })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia.checkpoint.phase)).toBe('pass-player')
    const settled = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
    const attacks = settled.cronaca.events.filter((event: { kind: string; side?: string }) => event.kind === 'attack' && event.side === 'B')
    expect(attacks).toHaveLength(1)
    expect(attacks[0].supreme).toBe(false)
    expect(settled.pokemonA.hp).toBe(12 - attacks[0].damage)
    expect(settled.pokemonB).toMatchObject({ hp: 8, stato: { tipo: 'Avvelenato', turniTrascorsi: 1 } })
    expect(settled.cronaca.events.filter((event: { kind: string }) => event.kind === 'audience')).toHaveLength(1)
    await page.reload()
    await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
    const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
    expect(resumed.pokemonA).toEqual(settled.pokemonA)
    expect(resumed.pokemonB).toEqual(settled.pokemonB)
    expect(resumed.cronaca.events).toEqual(settled.cronaca.events)
    expect(errors).toEqual([])
  } finally { await phoneContext.close() }
})
