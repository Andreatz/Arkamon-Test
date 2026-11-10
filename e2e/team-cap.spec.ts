import { test, expect } from '@playwright/test'

test('team level cap discards KO experience through reload and team changes, and rejects an invalid deposit swap', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('e2e-team-cap')) return
    const a = { istanzaId: 'cap-a', specieId: 1, nome: 'Vyrath al cap', livello: 10, hp: 12, xp: 0 }
    const mate = { istanzaId: 'cap-mate', specieId: 5, nome: 'Darklaw compagno', livello: 5, hp: 6, xp: 0 }
    const boxed = { istanzaId: 'cap-box', specieId: 9, nome: 'Felyss fuori fascia', livello: 20, hp: 3, xp: 2 }
    const enemy = { istanzaId: 'cap-enemy', specieId: 13, nome: 'Wormaren avversario', livello: 5, hp: 1, xp: 0 }
    const player = (id: number) => ({ id, nome: `Cap ${id}`, squadra: id === 1 ? [a, mate] : [], deposito: id === 1 ? { '1:1': boxed } : {},
      monete: 200, inventario: { masterball: 1 }, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [] })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, posizioniLocali1: {}, posizioniLocali2: {},
      scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'mappa-principale' }, audioMuted: true, rivaleStarterId: 9,
      battaglia: { tipo: 'NPC', pokemonA: a, pokemonB: enemy, squadraA: [a, mate], squadraB: [enemy], hpMaxA: 19, hpMaxB: 12,
        turnoCorrente: 'A', luogoRitorno: 'mappa-principale', log: ['Verifica della fascia di squadra.'], evoluzioneInAttesa: null,
        checkpoint: { version: 1, phase: 'player', initialPriority: 'A', actedThisRound: [], openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] } },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
    localStorage.setItem('e2e-team-cap', 'seeded')
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: /^Soffio\b/ }).click()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  const ended = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  expect(ended.pokemonA).toMatchObject({ livello: 10, xp: 0, hp: 12 })
  expect(ended.squadraA[1]).toMatchObject({ livello: 5, hp: 6 })
  const reward = ended.cronaca.events.find((event: { kind: string }) => event.kind === 'xp')
  expect(reward).toMatchObject({ title: 'Vyrath al cap: EXP non accumulata', levelBefore: 10, levelAfter: 10 })
  expect(reward.messages.join(' ')).toContain('Cap di squadra raggiunto')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia.pokemonA))
    .toMatchObject({ livello: 10, xp: 0, hp: 12 })
  await page.getByRole('button', { name: 'Prosegui', exact: true }).click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Deposito', exact: true }).click()
  await expect(page.locator('[data-presented-scene="deposito"]')).toHaveAttribute('aria-busy', 'false')
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1)
  await page.getByRole('button', { name: 'Box 1, posto 1: Felyss fuori fascia, livello 20', exact: true }).click()
  await page.getByRole('button', { name: 'Sposta o scambia', exact: true }).click()
  await page.getByRole('button', { name: 'Squadra, posto 2: Darklaw compagno, livello 5', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('al massimo 5 livelli')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1)).toEqual(before)
  await page.getByRole('button', { name: 'Ho capito', exact: true }).click()
  await page.reload()
  await expect(page.locator('[data-presented-scene="deposito"]')).toHaveAttribute('aria-busy', 'false')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1)).toEqual(before)

  // Relax the cap using actual deposit controls. The discarded KO reward must
  // not produce a delayed level when the weakest teammate leaves the squad.
  await page.getByRole('button', { name: 'Squadra, posto 2: Darklaw compagno, livello 5', exact: true }).click()
  await page.getByRole('button', { name: 'Sposta o scambia', exact: true }).click()
  await page.getByRole('button', { name: 'Box 1, posto 2: vuoto', exact: true }).click()
  const relaxed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1)
  expect(relaxed.squadra).toEqual([{ ...before.squadra[0], livello: 10, xp: 0, hp: 12 }])
  expect(relaxed.deposito['1:2']).toEqual(before.squadra[1])
  expect(relaxed.deposito['1:1']).toMatchObject({ livello: 20, xp: 0, hp: 3 })
  expect(relaxed.inventario).toEqual(before.inventario)
  expect(relaxed.monete).toBe(before.monete)
  await page.reload()
  await expect(page.locator('[data-presented-scene="deposito"]')).toHaveAttribute('aria-busy', 'false')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1)).toEqual(relaxed)
  expect(errors).toEqual([])
})
