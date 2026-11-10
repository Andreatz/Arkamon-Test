import { expect, test, type Page } from '@playwright/test'

async function openFixture(page: Page, battle = false, enemyHP = 4, poisoned = false) {
  await page.addInitScript(({ battle, enemyHP, poisoned }) => {
    if (localStorage.getItem('audit-fixture')) return
    const a = { istanzaId: 'audit-a', specieId: 1, nome: 'Vyrath Audit', livello: 10, hp: 19, xp: 0,
      ...(poisoned ? { stato: { tipo: 'Avvelenato', turniRimanenti: -1, turniTrascorsi: 0 } } : {}) }
    const b = { istanzaId: 'audit-b', specieId: 13, nome: 'Wormaren Audit', livello: 5, hp: enemyHP, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: `Audit ${id}`, squadra: [id === 1 ? a : { ...a, istanzaId: 'audit-g2', nome: 'Vyrath Due', stato: undefined }], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 1000, inventario: { masterball: 1 } })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, posizioniLocali1: {}, posizioniLocali2: {},
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, audioMuted: true,
      scenaCorrente: { scena: battle ? 'battaglia' : 'mappa-principale' }, scenaPrecedente: { scena: 'mappa-principale' },
      battaglia: battle ? { tipo: 'Selvatico', pokemonA: a, pokemonB: b, squadraA: [a], squadraB: [b], hpMaxA: 19, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'mappa-principale', log: [], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'player', openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] } } : null,
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      musicVolume: 0, effectsVolume: 0, animationSpeed: 'normal', reducedMotion: battle ? 'on' : 'off',
    } }))
    localStorage.setItem('audit-fixture', 'seeded')
  }, { battle, enemyHP, poisoned })
  await page.goto('/')
}

test('the match menu keeps its keyboard navigation during a map transition', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-12T12:00:01Z'))
  await openFixture(page)
  await page.getByRole('button', { name: 'Apri mappa di Venezia', exact: true }).click()
  await expect(page.locator('[data-scene-transition]')).toBeVisible()
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await expect(dialog).toBeVisible()
  await page.clock.runFor(100)
  await expect(dialog.getByRole('button', { name: 'Riprendi il Viaggio', exact: true })).toBeVisible()
  const first = await page.evaluate(() => document.activeElement?.textContent)
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.textContent)).not.toBe(first)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-scene-transition]')).toBeVisible()
  await page.clock.runFor(3000)
  await expect(page.locator('[data-presented-scene="citta:Venezia"]')).toHaveAttribute('aria-busy', 'false')
})

test('a slow native page keeps a visible creature until its first painted frame', async ({ page }) => {
  let release!: () => void
  const loading = new Promise<void>(resolve => { release = resolve })
  await page.route('**/sprites/arkamon-paged/13/front/idle/page-00.webp', async route => {
    await loading
    await route.continue()
  })
  await openFixture(page, true)
  const enemy = page.getByRole('img', { name: 'Wormaren Audit', exact: true })
  const fallback = enemy.locator('[data-arkamon-first-frame-fallback]')
  await expect(fallback).toBeVisible()
  await expect.poll(() => fallback.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true)
  expect(await fallback.getAttribute('src')).toContain('/sprites/front_sprites/13.png')
  const canvas = enemy.locator('canvas')
  await expect(canvas).toBeVisible()
  release()
  await expect(fallback).toHaveCount(0)
  const nonTransparent = await canvas.evaluate(element => {
    const image = (element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, element.width, element.height)
    let visible = 0
    for (let index = 3; index < image.data.length; index += 4) if (image.data[index] > 16) visible++
    return visible
  })
  expect(nonTransparent).toBeGreaterThan(1000)
  await test.info().attach('Native creature after slow atlas load', { body: await page.screenshot(), contentType: 'image/png' })
})

test('a rejected capture save consumes nothing and retries the same action once', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openFixture(page, true, 4, true)
  const masterball = page.getByRole('button', { name: 'Masterball x1', exact: true })
  await expect(masterball).toBeEnabled()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    ;(window as unknown as { restoreAuditStorage: () => void }).restoreAuditStorage = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function (key, value) {
      if (key === 'arkamon-save' && JSON.parse(value).state.giocatore1.squadra.length > 1) throw new DOMException('Audit quota fixture', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  await masterball.click()
  await expect(page.getByText('Cattura in attesa di salvataggio', { exact: true })).toBeVisible()
  await expect(page.getByText(/Cattura non salvata/)).toBeVisible()
  const unchanged = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(unchanged.giocatore1).toEqual(before.giocatore1)
  expect(unchanged.arkadex).toEqual(before.arkadex)
  expect(unchanged.matchLog).toEqual(before.matchLog)
  expect(unchanged.battaglia.checkpoint.outcome).toBeNull()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Borsa', exact: true })).toBeDisabled()
  const retry = page.getByRole('button', { name: 'Riprova salvataggio cattura', exact: true })
  await retry.click()
  await expect(retry).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1)).toEqual(before.giocatore1)
  await page.evaluate(() => (window as unknown as { restoreAuditStorage: () => void }).restoreAuditStorage())
  await retry.click()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  const captured = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(captured.giocatore1.squadra.filter((entry: { istanzaId: string }) => entry.istanzaId === 'audit-b')).toHaveLength(1)
  expect(captured.giocatore1.inventario.masterball).toBe(0)
  expect(captured.matchLog.events.filter((entry: { kind: string }) => entry.kind === 'capture')).toHaveLength(1)
  expect(captured.battaglia.cronaca.events.filter((entry: { kind: string }) => entry.kind === 'capture')).toHaveLength(1)
  expect(captured.battaglia.pokemonA).toMatchObject({ hp: 18, stato: { tipo: 'Avvelenato', turniTrascorsi: 1 } })
  expect(captured.battaglia.squadraA[0]).toEqual(captured.battaglia.pokemonA)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1)).toEqual(captured.giocatore1)
  await page.getByRole('button', { name: 'Prosegui', exact: true }).click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1.squadra[0].hp)).toBe(18)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore2)).toEqual(before.giocatore2)
  expect(errors).toEqual([])
})

for (const both of [false, true]) {
  test(`a campaign with ${both ? 'both teams' : 'one team'} in storage still resumes and confirms a reset`, async ({ page }) => {
    await openFixture(page)
    await page.evaluate(({ both }) => {
      const save = JSON.parse(localStorage.getItem('arkamon-save')!)
      for (const key of both ? ['giocatore1', 'giocatore2'] : ['giocatore1']) {
        save.state[key].deposito = { '1:1': save.state[key].squadra[0] }
        save.state[key].squadra = []
      }
      save.state.scenaCorrente = { scena: 'titolo' }
      localStorage.setItem('arkamon-save', JSON.stringify(save))
    }, { both })
    await page.reload()
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
    const resume = page.getByRole('button', { name: 'Continua', exact: true })
    await expect(resume).toBeVisible()
    let confirmations = 0
    page.on('dialog', async dialog => { confirmations++; await dialog.dismiss() })
    await page.getByRole('button', { name: 'Nuova Partita', exact: true }).click()
    expect(confirmations).toBe(1)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)).toEqual(before)
    await resume.click()
    await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('button', { name: 'Apri mappa di Venezia', exact: true })).toBeVisible()
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
    expect(after.giocatore1).toEqual(before.giocatore1)
    expect(after.giocatore2).toEqual(before.giocatore2)
    expect(after.rivaleStarterId).toBe(before.rivaleStarterId)
  })
}

test('a full deposit blocks an out-of-range capture before consuming a Masterball', async ({ page }) => {
  await openFixture(page, true)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('arkamon-save')!)
    save.state.giocatore1.squadra[0].livello = 11
    save.state.battaglia.pokemonA.livello = 11
    save.state.battaglia.squadraA[0].livello = 11
    for (let box = 1; box <= 30; box++) for (let slot = 1; slot <= 35; slot++) {
      save.state.giocatore1.deposito[`${box}:${slot}`] = { ...save.state.giocatore1.squadra[0], istanzaId: `full-${box}-${slot}` }
    }
    localStorage.setItem('arkamon-save', JSON.stringify(save))
  })
  await page.reload()
  const masterball = page.getByRole('button', { name: 'Masterball x1', exact: true })
  await expect(masterball).toBeEnabled()
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  await masterball.click()
  await expect(page.getByText(/Nessun posto disponibile per questo Arkamon/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Riprova salvataggio cattura', exact: true })).toBeHidden()
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(after.giocatore1).toEqual(before.giocatore1)
  expect(after.battaglia.cronaca.events.filter((entry: { kind: string }) => entry.kind === 'capture')).toHaveLength(0)
  expect(after.battaglia.checkpoint.outcome).toBeNull()
})
