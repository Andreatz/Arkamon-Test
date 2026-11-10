import { expect, test } from '@playwright/test'

test('a route wild encounter retains reserves through a poison KO, reload, capture and return', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('legacy-wild-roster-fixture')) return
    const lead = { istanzaId: 'legacy-lead', specieId: 1, nome: 'Vyrath audit', livello: 50, hp: 1, xp: 0,
      stato: { tipo: 'Avvelenato', turniRimanenti: -1 } }
    // A healthy reserve keeps this roster regression independent of random
    // enemy damage. Actual encounters and dice still use the real game RNG.
    const reserve = { istanzaId: 'legacy-reserve', specieId: 8, nome: 'Darklaw riserva', livello: 50, hp: 50, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: `Audit G${id}`, squadra: id === 1 ? [lead, reserve] : [{ ...reserve, istanzaId: 'legacy-player2' }],
      deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 300, inventario: { masterball: 1 } })
    const position = { mappaId: 'mappa-principale', luogo: 'Percorso_1', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, battaglia: null, rivaleStarterId: 9,
      posizione1: position, posizione2: position, posizioniLocali1: {}, posizioniLocali2: {},
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, scenaCorrente: { scena: 'percorso', payload: { luogo: 'Percorso_1' } },
      scenaPrecedente: { scena: 'mappa-principale' }, audioMuted: true,
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
    localStorage.setItem('legacy-wild-roster-fixture', 'ready')
  })
  const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Percorso 1', exact: true })).toBeVisible()
  // Exercise the real legacy encounter constructor through the explicit GM shortcut.
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .filter(name => new URL(name).pathname === '/src/store/adminStore.ts').at(-1) ?? '/src/store/adminStore.ts'
    const { useAdminStore } = await import(path)
    useAdminStore.setState({ enabled: true })
    window.dispatchEvent(new CustomEvent('arkamon:gm-activities'))
  })
  await page.getByRole('button', { name: 'Cespuglio A', exact: true }).click()
  const attack = page.getByRole('button', { name: /Soffio/ }).first()
  await expect(attack).toBeVisible()
  expect((await snapshot()).battaglia.squadraA).toHaveLength(2)
  await attack.click()
  await expect(page.getByRole('heading', { name: 'Scegli un Pokemon', exact: true })).toBeVisible()
  const checkpoint = await snapshot()
  expect(checkpoint.battaglia.checkpoint).toMatchObject({ phase: 'switch', outcome: null })
  expect(checkpoint.battaglia.squadraA[1]).toMatchObject({ istanzaId: 'legacy-reserve', hp: 50 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Scegli un Pokemon', exact: true })).toBeVisible()
  expect((await snapshot()).battaglia.squadraA).toEqual(checkpoint.battaglia.squadraA)
  await page.getByRole('button').filter({ hasText: 'Darklaw riserva' }).click()
  const masterball = page.getByRole('button', { name: /Masterball x1/ })
  const canCapture = async () => await masterball.count() > 0 && await masterball.isEnabled()
  for (let action = 0; action < 3; action++) {
    const opponent = page.getByRole('button', { name: 'AVVERSARIO', exact: true })
    await expect.poll(async () => await canCapture() || await opponent.isVisible()).toBe(true)
    if (await canCapture()) break
    await opponent.click()
    // Paralysis can legitimately give the enemy the next round's first turn.
    await expect(opponent).toHaveCount(0)
  }
  await expect(masterball).toBeEnabled()
  await masterball.click()
  await page.getByRole('button', { name: 'Prosegui', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Percorso 1', exact: true })).toBeVisible()
  const final = await snapshot()
  expect(final.battaglia).toBeNull()
  // The low-level wild capture correctly goes to storage under the team cap.
  expect([...final.giocatore1.squadra, ...Object.values(final.giocatore1.deposito)]).toHaveLength(3)
  expect(final.giocatore1.squadra.some((pokemon: { istanzaId: string; hp: number }) => pokemon.istanzaId === 'legacy-reserve' && pokemon.hp > 0)).toBe(true)
  expect(final.giocatore2).toEqual(checkpoint.giocatore2)
  expect(errors).toEqual([])
})
