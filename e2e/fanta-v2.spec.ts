import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const golden = JSON.parse(readFileSync(new URL('../src/challenges/__fixtures__/classicSessionsV1.json', import.meta.url), 'utf8')) as {
  sessions: { seed: string; id: string; team: number[]; enemy: number[] }[]
}

async function openCampaign(page: Page, legacyResult = false) {
  const classic = golden.sessions.find((session) => session.seed === 'Italia')!
  await page.addInitScript(({ classic, legacyResult }) => {
    if (localStorage.getItem('fanta-v2-fixture')) return
    const player = (id: 1 | 2) => ({ id, nome: `Campagna ${id}`, squadra: [{ istanzaId: `campaign-${id}`, specieId: id === 1 ? 1 : 5,
      nome: `Compagno ${id}`, livello: 5, hp: 7, xp: 0 }], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [],
      monete: id * 200, inventario: { masterball: id } })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: player(1), giocatore2: player(2),
      giocatoreAttivo: 1, rivaleStarterId: 9, posizione1: position, posizione2: position, posizioniLocali1: {}, posizioniLocali2: {},
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null, audioMuted: true, battaglia: null } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { reducedMotion: 'on', animationSpeed: 'fast', musicVolume: 0, effectsVolume: 0 } }))
    if (legacyResult) localStorage.setItem('arkamon-challenges-v1', JSON.stringify({ version: 1, state: { version: 1,
      draft: { version: 1, mode: 'seed', seed: 'Italia', speciesIds: [] },
      results: [{ id: 'classic-attempt', sessionId: classic.id, mode: 'seed', seed: 'Italia', team: classic.team,
        outcome: 'vittoria', turns: 9, remainingHp: 30, completedAt: '2026-10-10T12:00:00Z' }] } }))
    localStorage.setItem('fanta-v2-fixture', 'ready')
  }, { classic, legacyResult })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
}

async function challenges(page: Page) {
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await dialog.getByRole('button', { name: 'Apri Sfide', exact: true }).click()
  return dialog
}

test('updated prices and classic sharing coexist, persist and launch an isolated v2 challenge', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await openCampaign(page)
  const campaign = await page.evaluate(() => localStorage.getItem('arkamon-save'))
  const dialog = await challenges(page)
  await expect(dialog.getByLabel('Regole della sfida')).toHaveValue('2')
  await dialog.getByRole('button', { name: 'Condividi o importa', exact: true }).click()
  const ids = [53, 95, 1, 5, 9, 13]
  await dialog.getByLabel('Codice della sfida').fill(JSON.stringify({ format: 'arkamon-challenge', version: 1, rulesVersion: 1, mode: 'fanta', seed: 'Legacy-Leafrex', speciesIds: ids }))
  await dialog.getByRole('button', { name: 'Importa configurazione', exact: true }).click()
  await dialog.getByRole('button', { name: 'Configurazione', exact: true }).click()
  await expect(dialog.getByLabel('Regole della sfida')).toHaveValue('1')
  const chosen = dialog.getByRole('region', { name: 'Squadra Fanta scelta', exact: true })
  await expect(chosen.getByRole('listitem').filter({ hasText: 'Leafrex #53' })).toContainText('21 crediti')
  await expect(chosen.getByRole('listitem').filter({ hasText: 'Beestrix #95' })).toContainText('15 crediti')
  await dialog.getByLabel('Regole della sfida').selectOption('2')
  await expect(chosen.getByRole('listitem').filter({ hasText: 'Leafrex #53' })).toContainText('19 crediti')
  await expect(chosen.getByRole('listitem').filter({ hasText: 'Beestrix #95' })).toContainText('12 crediti')
  await dialog.getByRole('button', { name: 'Prepara Fanta-Team', exact: true }).click()
  await dialog.getByRole('button', { name: 'Crea codice da condividere', exact: true }).click()
  const code = JSON.parse(await dialog.getByLabel('Codice della sfida').inputValue())
  expect(code).toMatchObject({ version: 2, rulesVersion: 2, speciesIds: ids })
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await test.info().attach('Fanta v2 a 1920px', { body: await page.screenshot(), contentType: 'image/png' })
  await page.reload()
  const reloaded = await challenges(page)
  await expect(reloaded.getByLabel('Regole della sfida')).toHaveValue('2')
  await expect(reloaded.getByRole('region', { name: 'Squadra Fanta scelta', exact: true }).getByRole('listitem')).toHaveCount(6)
  await reloaded.getByRole('button', { name: 'Prepara Fanta-Team', exact: true }).click()
  await reloaded.getByRole('button', { name: 'Avvia sfida', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Sfida in corso', exact: true })).toContainText('Fanta-Team')
  const started = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-active-challenge-v1')!).state)
  expect(started.challengeContext.session).toMatchObject({ version: 2, rulesVersion: 2 })
  expect(started.challengeContext.session.team.map((pokemon: { specieId: number }) => pokemon.specieId)).toEqual(ids)
  expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(campaign)
  await page.reload()
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-active-challenge-v1')!).state)
  expect(resumed.battaglia.seeded).toEqual(started.battaglia.seeded)
  expect(resumed.challengeContext.session.rulesVersion).toBe(2)
  const opening = page.getByRole('dialog', { name: 'Stesso livello: decide la moneta', exact: true })
  // All Fanta creatures are level 20: the coin opening is mandatory, including
  // when the battle's lazy module appears after the first reload response.
  await expect(opening).toBeVisible()
  await opening.getByRole('button', { name: 'Continua', exact: true }).click()
  await expect(opening).toBeHidden()
  const banner = page.getByRole('complementary', { name: 'Sfida in corso', exact: true })
  await banner.getByRole('button').click()
  const details = page.getByRole('dialog', { name: /^(Sfida a seed|Fanta-Team)$/ })
  await details.getByRole('button', { name: 'Torna alla campagna', exact: true }).click()
  await details.getByRole('button', { name: 'Conferma uscita', exact: true }).click()
  await expect(banner).toHaveCount(0)
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  const original = JSON.parse(campaign!).state
  expect(restored.giocatore1).toEqual(original.giocatore1)
  expect(restored.giocatore2).toEqual(original.giocatore2)
  expect(errors).toEqual([])
})

test('legacy results retry classic teams and never enter updated rankings', async ({ page }) => {
  await openCampaign(page, true)
  const dialog = await challenges(page)
  await expect(dialog.getByLabel('Regole della sfida')).toHaveValue('1')
  await dialog.getByRole('navigation', { name: 'Pagine delle sfide', exact: true }).getByRole('button', { name: 'Risultati', exact: true }).click()
  await dialog.getByRole('button', { name: 'Riprova questo seed', exact: true }).click()
  await dialog.getByRole('button', { name: 'Classifica', exact: true }).click()
  const ranking = dialog.getByRole('region', { name: 'Classifica di questa sfida', exact: true })
  await expect(ranking.getByRole('listitem')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Squadre e avvio', exact: true }).click()
  await dialog.getByRole('button', { name: 'Crea codice da condividere', exact: true }).click()
  expect(JSON.parse(await dialog.getByLabel('Codice della sfida').inputValue())).toMatchObject({ version: 1, rulesVersion: 1, seed: 'Italia' })
  await dialog.getByRole('button', { name: 'Configurazione', exact: true }).click()
  await dialog.getByLabel('Regole della sfida').selectOption('2')
  await dialog.getByRole('button', { name: 'Genera sfida', exact: true }).click()
  await dialog.getByRole('button', { name: 'Classifica', exact: true }).click()
  await expect(ranking.getByRole('listitem')).toHaveCount(0)
  await dialog.getByRole('navigation', { name: 'Pagine delle sfide', exact: true }).getByRole('button', { name: 'Risultati', exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Risultati delle sfide', exact: true })).toContainText('Regole classiche · v1')
  await dialog.getByRole('button', { name: 'Squadre e avvio', exact: true }).click()
  await dialog.getByRole('button', { name: 'Crea codice da condividere', exact: true }).click()
  expect(JSON.parse(await dialog.getByLabel('Codice della sfida').inputValue())).toMatchObject({ version: 2, rulesVersion: 2, seed: 'Italia' })
})
