import { expect, test, type Page } from '@playwright/test'

async function endedBattle(page: Page, reverse = false) {
  await page.addInitScript(reverse => {
    if (localStorage.getItem('battle-conclusion-fixture')) return
    const high = { istanzaId: 'higher-first', specieId: 20, nome: 'Darklaw', livello: 10, hp: 0, xp: 0 }
    const low = { istanzaId: 'lower-second', specieId: 1, nome: 'Vyrath', livello: 5, hp: 12, xp: 0 }
    const finalHigh = { ...high, livello: 11, hp: 11 }, finalLow = { ...low, livello: 6, hp: 0 }
    const squad = reverse ? [low, high] : [high, low], final = reverse ? [finalLow, finalHigh] : [finalHigh, finalLow]
    const enemy = { ...low, istanzaId: 'enemy', hp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: `Conclusione ${id}`, squadra: id === 1 ? squad : [], deposito: {},
      cespugliVisitati: [], allenatoriSconfitti: [], monete: 0, inventario: { revive: 0 }, caselleConsumate: [] })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Pordenone' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 0 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
      scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'mappa-principale' },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: { tipo: 'NPC', allenatoreId: 202, pokemonA: finalHigh, pokemonB: enemy, squadraA: final, squadraB: [enemy],
        hpMaxA: 22, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Percorso_1', log: [], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended', openingComplete: true,
          outcome: 'vittoria', evolutions: [], rivalMessages: [] } },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, reducedMotion: 'on', animationSpeed: 'fast' } }))
    localStorage.setItem('battle-conclusion-fixture', 'ready')
  }, reverse)
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia?.cronaca?.events.some((event: { kind: string }) => event.kind === 'outcome'))).toBe(true)
}
const snapshot = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)

for (const reverse of [false, true]) test(`Prosegui preserves the valid final roster and rewards after reload, reversed=${reverse}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await endedBattle(page, reverse)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  const before = await snapshot(page)
  const expected = before.battaglia.squadraA
  expect(expected.map((p: { livello: number }) => p.livello)).toEqual(reverse ? [6, 11] : [11, 6])
  await page.getByRole('button', { name: 'Prosegui', exact: true }).click()
  await expect.poll(async () => (await snapshot(page)).battaglia).toBeNull()
  const after = await snapshot(page)
  expect(after.giocatore1.squadra).toEqual(expected)
  expect(after.giocatore1.monete).toBe(200)
  expect(after.giocatore1.allenatoriSconfitti).toContain(202)
  expect(after.giocatore1.inventario.revive).toBe(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Percorso 1', exact: true })).toBeVisible(); expect((await snapshot(page)).scenaCorrente).toEqual({ scena: 'percorso', payload: { luogo: 'Percorso_1' } })
  const restored = await snapshot(page)
  expect(restored.giocatore1).toEqual(after.giocatore1)
  expect(restored.battaglia).toBeNull()
  expect(errors).toEqual([])
})

test('a failed Prosegui write keeps roster, result and rewards together until the real retry succeeds', async ({ page }) => {
  await endedBattle(page)
  const before = await snapshot(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    const global = window as typeof window & { restoreBattleConclusionStorage?: () => void }
    global.restoreBattleConclusionStorage = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function(key, value) {
      if (key === 'arkamon-save') throw new DOMException('Audit quota fixture', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Prosegui', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Riprova salvataggio', exact: true })).toBeVisible()
  expect(await snapshot(page)).toEqual(before)
  await page.evaluate(() => (window as typeof window & { restoreBattleConclusionStorage?: () => void }).restoreBattleConclusionStorage?.())
  await page.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click()
  await expect.poll(async () => (await snapshot(page)).battaglia).toBeNull()
  const after = await snapshot(page)
  expect(after.giocatore1.squadra).toEqual(before.battaglia.squadraA)
  expect(after.giocatore1.monete).toBe(200)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Percorso 1', exact: true })).toBeVisible(); expect((await snapshot(page)).scenaCorrente).toEqual({ scena: 'percorso', payload: { luogo: 'Percorso_1' } })
  expect((await snapshot(page)).giocatore1).toEqual(after.giocatore1)
})
