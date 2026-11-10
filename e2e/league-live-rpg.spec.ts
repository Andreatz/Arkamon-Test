import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { AllenatoreDef, PokemonSpecie } from '../src/types'

const ALLENATORI = JSON.parse(readFileSync(new URL('../src/data/allenatori.json', import.meta.url), 'utf8')) as AllenatoreDef[]
const POKEMON_BASE = JSON.parse(readFileSync(new URL('../src/data/pokemon.json', import.meta.url), 'utf8')) as PokemonSpecie[]

const gyms = ALLENATORI.filter((trainer) => trainer.tipo === 'Capopalestra').map((trainer) => trainer.id)
const roster = [4, 8, 12, 15, 18, 24]

async function seedLeague(page: import('@playwright/test').Page, options: { complete?: boolean; draft?: boolean; fullTeam?: boolean } = {}) {
  await page.addInitScript(({ gyms, roster, options, names }) => {
    if (localStorage.getItem('e2e-league-fixture')) return
    const team = (options.fullTeam ? roster : [4]).map((speciesId, index) => ({ istanzaId: `league-real-${index}`, specieId: speciesId,
      nome: names[speciesId] ?? `Arkamon ${speciesId}`, livello: 55, hp: index === 0 ? 4 : 7, xp: 0 }))
    const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Melia' : 'Maggi', squadra: id === 1 ? team : [{ ...team[0], istanzaId: 'league-real-two' }], deposito: {},
      cespugliVisitati: [], allenatoriSconfitti: gyms, monete: 0, inventario: { potion: 2, revive: 1 }, caselleConsumate: [] })
    const config = { version: 1, opponents: [1, 2, 3, 4].map((index) => ({ name: options.fullTeam ? `${index} · Avversario di verifica con nome lungo per la disposizione della schermata` : `Avversario di verifica ${index}`, team: [{ pokemonId: 13, livello: 5 }] })),
      champion: null, championEnabled: false, defeat: 'restart', betweenBattleItems: true }
    const empty = { runId: null, nextStage: 0, status: 'idle', attempt: 0, completedStages: [], stageCompleted: false }
    const completed = { runId: 'league-e2e-winner', nextStage: 4, status: 'completed', attempt: 1, completedStages: [0, 1, 2, 3], stageCompleted: true }
    const league = { version: 1, config: options.draft ? { ...config, opponents: config.opponents.map(() => ({ name: '', team: [] })), defeat: null, championEnabled: null } : config,
      players: { 1: options.complete ? completed : empty, 2: empty }, winner: options.complete ? { playerId: 1, name: 'Melia', team, completedAt: '2026-10-14T10:00:00.000Z', runId: completed.runId } : null }
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Roma' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1,
      league, battaglia: null, rivaleStarterId: 9, posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, scenaCorrente: { scena: 'lega' }, scenaPrecedente: null, audioMuted: true } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { reducedMotion: 'on', animationSpeed: 'fast', musicVolume: 0, effectsVolume: 0 } }))
    localStorage.setItem('e2e-league-fixture', 'seeded')
    Math.random = () => .99
  }, { gyms, roster, options, names: Object.fromEntries(POKEMON_BASE.map((pokemon) => [pokemon.id, pokemon.nome])) })
}

test('four real League battles use one map turn and the winner survives reload with residual HP', async ({ page }) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const errors: string[] = [], badRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => { if (response.status() >= 400 && response.url().includes('/ui/player-kit/')) badRequests.push(response.url()) })
  await seedLeague(page)
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="lega"]')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Entra nella Lega', exact: true }).click()
  for (let stage = 0; stage < 4; stage++) {
    const battle = page.locator('[data-presented-scene="battaglia"]')
    await expect(battle).toHaveAttribute('aria-busy', 'false')
    await expect(battle.locator('.battle-move-button').first()).toBeEnabled()
    await battle.locator('.battle-move-button').first().click()
    await expect(battle.getByRole('heading', { name: 'Vittoria!', exact: true })).toBeVisible({ timeout: 30_000 })
    await battle.getByRole('button', { name: 'Prosegui', exact: true }).click()
    await expect(page.locator('[data-presented-scene="lega"]')).toHaveAttribute('aria-busy', 'false')
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
    expect(saved.league.players[1].completedStages).toEqual(Array.from({ length: stage + 1 }, (_, index) => index))
    expect(saved.giocatoreAttivo).toBe(1)
    expect(saved.turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 0 })
    expect(saved.giocatore2.nome).toBe('Maggi')
    if (stage < 3) {
      expect(saved.league.winner).toBeNull()
      await page.reload()
      await expect(page.locator('[data-presented-scene="lega"]')).toHaveAttribute('aria-busy', 'false')
      await page.getByRole('button', { name: 'Affronta il prossimo incontro', exact: true }).click()
    }
  }
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(before.league.winner.playerId).toBe(1)
  expect(before.league.winner.team[0].hp).toBeLessThan(100)
  expect(before.league.winner.team[0].xp).toBe(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Campione della regione', exact: true })).toBeVisible()
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state)
  expect(after.league).toEqual(before.league)
  expect(after.giocatore1.squadra).toEqual(before.giocatore1.squadra)
  await page.screenshot({ path: test.info().outputPath('league-real-winner.png') })
  expect(errors).toEqual([])
  expect(badRequests).toEqual([])
})

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 360, height: 800 }]) {
  test(`League winner with six official fronts fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await seedLeague(page, { complete: true, fullTeam: true })
    await page.goto('/')
    await expect(page.locator('[data-presented-scene="lega"]')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('heading', { name: 'Campione della regione', exact: true })).toBeVisible()
    await expect(page.locator('[data-league-scene] [data-creature-loaded="true"]')).toHaveCount(6)
    const geometry = await page.evaluate(() => {
      const scene = document.querySelector('[data-league-scene]')!, footer = scene.querySelector('.league-footer')!, bounds = scene.getBoundingClientRect(), bottom = footer.getBoundingClientRect()
      const panels = Array.from(scene.querySelectorAll('.league-path,.league-team')).map((p) => ({ scroll: p.scrollHeight, client: p.clientHeight }))
      return { root: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }, bounds: { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right }, footer: { bottom: bottom.bottom }, panels }
    })
    expect(geometry.root.scrollWidth).toBeLessThanOrEqual(viewport.width + 1)
    expect(geometry.root.scrollHeight).toBeLessThanOrEqual(viewport.height + 1)
    expect(geometry.footer.bottom).toBeLessThanOrEqual(viewport.height + 1)
    if (viewport.width === 1920) for (const panel of geometry.panels) expect(panel.scroll).toBeLessThanOrEqual(panel.client + 1)
    await page.screenshot({ path: test.info().outputPath(`league-winner-${viewport.width}.png`) })
  })
}

test('unconfigured League is visibly unavailable without inventing a roster or winner', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seedLeague(page, { draft: true, fullTeam: true })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="lega"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByText('Lega da completare', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entra nella Lega', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.league.winner)).toBeNull()
  await page.screenshot({ path: test.info().outputPath('league-unconfigured.png') })
})
