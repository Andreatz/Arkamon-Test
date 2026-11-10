import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const CAMPAIGN_KEY = 'arkamon-save'
const ACTIVE_CHALLENGE_KEY = 'arkamon-active-challenge-v1'
const COLLECTION_KEY = 'arkamon-challenges-v1'

interface RevealedAttack {
  kind: string
  side?: string
  title: string
  dice?: number[]
  diceSum?: number
  damage?: number
  hpBefore?: number
  hpAfter?: number
}

interface ChallengeBattleSave {
  seeded: { algorithm: string; seed: string; cursor: number }
  pokemonA: { hp: number; specieId: number; istanzaId: string }
  pokemonB: { hp: number; specieId: number; istanzaId: string }
  squadraA: { hp: number; specieId: number; istanzaId: string }[]
  squadraB: { hp: number; specieId: number; istanzaId: string }[]
  checkpoint: { phase: string; openingComplete: boolean; outcome: string | null }
  cronaca: { events: RevealedAttack[] }
}

async function openCampaignFixture(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('e2e-challenge-fixture')) return
    const one = { istanzaId: 'seed-campaign-one', specieId: 1, nome: 'Vyrath campagna', livello: 5, hp: 7, xp: 3, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }
    const two = { istanzaId: 'seed-campaign-two', specieId: 5, nome: 'Darklaw campagna', livello: 5, hp: 9, xp: 2 }
    const player = (id: 1 | 2) => ({ id, nome: `Campagna ${id}`, squadra: id === 1 ? [one] : [two], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], monete: id === 1 ? 735 : 490, inventario: { masterball: id }, caselleConsumate: [] })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: { Venezia: 'n56' }, posizioniLocali2: {}, audioMuted: true, battaglia: null,
      scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: { scena: 'laboratorio' },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on' } }))
    localStorage.setItem('e2e-challenge-fixture', 'seeded')
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  // A normal game setting writes the recovered fixture in the current save schema,
  // so the exact pre-launch snapshot includes the newly added campaign fields.
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await settings.getByRole('button', { name: 'Apri Impostazioni', exact: true }).click()
  await settings.getByRole('checkbox', { name: 'Audio attivo', exact: true }).check()
  await settings.getByRole('checkbox', { name: 'Audio attivo', exact: true }).uncheck()
  await page.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)
}

async function tools(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  if (!await dialog.getByRole('region', { name: 'Sfide a seed e Fanta-Team Builder', exact: true }).isVisible()) {
    await dialog.getByRole('button', { name: 'Apri Sfide', exact: true }).click()
  }
  await expect(dialog.getByRole('region', { name: 'Sfide a seed e Fanta-Team Builder', exact: true })).toBeVisible()
  return dialog
}

async function battleSave(page: Page): Promise<ChallengeBattleSave | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw).state.battaglia : null
  }, ACTIVE_CHALLENGE_KEY)
}

async function generateAndLaunch(page: Page) {
  const dialog = await tools(page)
  await dialog.getByLabel('Seed della sfida', { exact: true }).fill('ROME-42')
  await dialog.getByRole('button', { name: 'Genera sfida', exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Squadra del giocatore', exact: true }).getByRole('listitem')).toHaveCount(6)
  await expect(dialog.getByRole('region', { name: 'Squadra avversaria', exact: true }).getByRole('listitem')).toHaveCount(6)
  await dialog.getByRole('button', { name: 'Avvia sfida', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('complementary', { name: 'Sfida in corso', exact: true })).toContainText('ROME-42')
  if ((page.viewportSize()?.width ?? 0) > 1000) {
    const geometry = await page.evaluate(() => {
      const banner = document.querySelector('[data-challenge-context]')!.getBoundingClientRect()
      const turn = document.querySelector('[data-battle-turn-status]')!.getBoundingClientRect()
      return { overlaps: banner.left < turn.right && banner.right > turn.left && banner.top < turn.bottom && banner.bottom > turn.top }
    })
    expect(geometry.overlaps).toBe(false)
  }
  const started = await battleSave(page)
  expect(started?.squadraA).toHaveLength(6)
  expect(started?.squadraB).toHaveLength(6)
}

/** Drives the real opening and one real attack, regardless of which side wins the coin. */
async function revealFirstAttack(page: Page): Promise<ChallengeBattleSave> {
  const scene = page.locator('[data-presented-scene="battaglia"]')
  const opening = page.getByRole('dialog', { name: 'Stesso livello: decide la moneta', exact: true })
  await expect(opening).toBeVisible()
  await opening.getByRole('button', { name: 'Continua', exact: true }).click()
  await expect(opening).toHaveCount(0)
  await expect.poll(async () => {
    const opponent = scene.getByRole('button', { name: 'AVVERSARIO', exact: true })
    if (await opponent.isVisible() && await opponent.isEnabled()) return 'opponent'
    const move = scene.getByRole('button').filter({ has: page.locator('[data-admin-layout-text-key="move-0-name"]') }).first()
    if (await move.isVisible() && await move.isEnabled()) return 'move'
    return ''
  }).not.toBe('')
  // Read the controls again after the readiness assertion rather than relying on polling side effects.
  const opponent = scene.getByRole('button', { name: 'AVVERSARIO', exact: true })
  if (await opponent.isVisible() && await opponent.isEnabled()) await opponent.click()
  else await scene.getByRole('button').filter({ has: page.locator('[data-admin-layout-text-key="move-0-name"]') }).first().click()
  await expect.poll(async () => {
    const saved = await battleSave(page)
    return Boolean(saved?.cronaca?.events.some((event) => event.kind === 'attack' && (event.dice?.length ?? 0) > 0))
  }, { timeout: 30_000 }).toBe(true)
  await expect(page.locator('[data-dice-revealed]')).toHaveCount(0)
  const settled = (await battleSave(page))!
  expect(settled.seeded.cursor).toBeGreaterThan(0)
  expect(settled.checkpoint.openingComplete).toBe(true)
  return settled
}

async function exitToCampaign(page: Page) {
  const banner = page.getByRole('complementary', { name: 'Sfida in corso', exact: true })
  await banner.getByRole('button').click()
  const details = page.getByRole('dialog', { name: /^(Sfida a seed|Fanta-Team)$/ })
  await details.getByRole('button', { name: 'Torna alla campagna', exact: true }).click()
  await details.getByRole('button', { name: 'Conferma uscita', exact: true }).click()
  await expect(banner).toHaveCount(0)
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
}

test('a poison KO rewards the challenge rival without exceeding its team level cap or healing it', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await openCampaignFixture(page)
  const campaign = await page.evaluate((key) => localStorage.getItem(key), CAMPAIGN_KEY)
  await generateAndLaunch(page)
  // Restore a reachable checkpoint: the rival has reached the cap while the
  // player's final living member is about to fall to its poison tick.
  await page.evaluate((key) => {
    const envelope = JSON.parse(localStorage.getItem(key)!)
    const battle = envelope.state.battaglia
    battle.pokemonA = { ...battle.pokemonA, hp: 1, stato: { tipo: 'Avvelenato', turniRimanenti: -1, turniAttivi: 0 } }
    battle.squadraA = battle.squadraA.map((entry: { istanzaId: string }) => entry.istanzaId === battle.pokemonA.istanzaId ? battle.pokemonA : { ...entry, hp: 0 })
    battle.pokemonB = { ...battle.pokemonB, livello: 25, hp: 3, xp: 0 }
    battle.squadraB = battle.squadraB.map((entry: { istanzaId: string }) => entry.istanzaId === battle.pokemonB.istanzaId ? battle.pokemonB : entry)
    envelope.state.giocatore1.squadra = battle.squadraA
    battle.turnoCorrente = 'A'
    battle.checkpoint = { version: 1, phase: 'player', initialPriority: 'A', actedThisRound: [], openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] }
    localStorage.setItem(key, JSON.stringify(envelope))
  }, ACTIVE_CHALLENGE_KEY)
  await page.reload()
  const scene = page.locator('[data-presented-scene="battaglia"]')
  await expect(scene).toHaveAttribute('aria-busy', 'false')
  await scene.getByRole('button').filter({ has: page.locator('[data-admin-layout-text-key="move-0-name"]') }).first().click()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  const ended = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.battaglia, ACTIVE_CHALLENGE_KEY)
  expect(ended.pokemonA.hp).toBe(0)
  expect(ended.pokemonB).toMatchObject({ livello: 25, hp: 3, xp: 0 })
  expect(ended.squadraB.slice(1).every((entry: { livello: number }) => entry.livello === 20)).toBe(true)
  expect(ended.checkpoint.outcome).toBe('sconfitta')
  expect(await page.evaluate((key) => localStorage.getItem(key), CAMPAIGN_KEY)).toBe(campaign)
  await page.reload()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.battaglia.pokemonB, ACTIVE_CHALLENGE_KEY)).toMatchObject({ livello: 25, hp: 3, xp: 0 })
  expect(errors).toEqual([])
})

test('seed challenge preserves the campaign, resumes its settled dice cursor and repeats the same first attack', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await openCampaignFixture(page)
  const before = await page.evaluate((key) => localStorage.getItem(key), CAMPAIGN_KEY)
  const campaign = JSON.parse(before!).state
  await generateAndLaunch(page)
  expect(await page.evaluate((key) => localStorage.getItem(key), CAMPAIGN_KEY)).toBe(before)
  const first = await revealFirstAttack(page)
  const attack = first.cronaca.events.find((event) => event.kind === 'attack')!
  expect(attack.dice?.every((die) => Number.isInteger(die) && die >= 1 && die <= 6)).toBe(true)
  expect(attack.diceSum).toBe(attack.dice!.reduce((sum, die) => sum + die, 0))
  expect(await page.evaluate((key) => localStorage.getItem(key), CAMPAIGN_KEY)).toBe(before)
  await page.reload()
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  const resumed = (await battleSave(page))!
  expect(resumed.seeded).toEqual(first.seeded)
  expect(resumed.pokemonA).toEqual(first.pokemonA)
  expect(resumed.pokemonB).toEqual(first.pokemonB)
  expect(resumed.cronaca.events).toEqual(first.cronaca.events)
  await exitToCampaign(page)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, CAMPAIGN_KEY)).toEqual(campaign)
  expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_CHALLENGE_KEY)).toBeNull()
  await generateAndLaunch(page)
  const repeated = await revealFirstAttack(page)
  const secondAttack = repeated.cronaca.events.find((event) => event.kind === 'attack')!
  expect(secondAttack.dice).toEqual(attack.dice)
  expect(secondAttack.diceSum).toBe(attack.diceSum)
  expect(secondAttack.damage).toBe(attack.damage)
  expect(secondAttack.side).toBe(attack.side)
  expect(repeated.seeded).toEqual(first.seeded)
  await exitToCampaign(page)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, CAMPAIGN_KEY)).toEqual(campaign)
  expect(errors).toEqual([])
})

test('Fanta builder persists six budgeted slots, rejects invalid sharing and imports the same full-HP configuration', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await openCampaignFixture(page)
  let dialog = await tools(page)
  await dialog.getByRole('button', { name: 'Fanta-Team Builder', exact: true }).click()
  await dialog.getByLabel('Seed della sfida', { exact: true }).fill('FANTA-ROMA')
  await dialog.getByRole('button', { name: 'Squadra suggerita dal seed', exact: true }).click()
  const chosen = dialog.getByRole('region', { name: 'Squadra Fanta scelta', exact: true })
  await expect(chosen.getByRole('listitem')).toHaveCount(6)
  const removedName = (await chosen.getByRole('button', { name: /^Rimuovi / }).first().getAttribute('aria-label'))!.replace(/^Rimuovi /, '')
  await dialog.getByRole('button', { name: 'Catalogo Arkamon', exact: true }).click()
  const catalog = dialog.getByRole('region', { name: 'Catalogo Fanta-Team', exact: true })
  expect(await catalog.getByRole('button', { name: /^Aggiungi / }).evaluateAll((buttons) => buttons.every((button) => (button as HTMLButtonElement).disabled))).toBe(true)
  await dialog.getByRole('button', { name: 'La tua squadra', exact: true }).click()
  await chosen.getByRole('button', { name: /^Rimuovi / }).first().click()
  await expect(chosen.getByRole('listitem')).toHaveCount(5)
  await expect(dialog.getByRole('button', { name: 'Prepara Fanta-Team', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Catalogo Arkamon', exact: true }).click()
  await dialog.getByLabel('Cerca Arkamon', { exact: true }).fill(removedName.replace(/ \d+$/, ''))
  await catalog.getByRole('button', { name: `Aggiungi ${removedName}`, exact: true }).click()
  await dialog.getByRole('button', { name: 'Prepara Fanta-Team', exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Squadra del giocatore', exact: true }).getByRole('listitem')).toHaveCount(6)
  await dialog.getByRole('button', { name: 'Crea codice da condividere', exact: true }).click()
  const code = await dialog.getByLabel('Codice della sfida', { exact: true }).inputValue()
  const shared = JSON.parse(code)
  expect(shared).toMatchObject({ format: 'arkamon-challenge', version: 2, rulesVersion: 2, mode: 'fanta', seed: 'FANTA-ROMA' })
  expect(shared.speciesIds).toHaveLength(6)
  expect(new Set(shared.speciesIds).size).toBe(6)
  expect(shared.hp).toBeUndefined()
  expect(shared.cursor).toBeUndefined()
  const draftBeforeInvalid = await page.evaluate((key) => localStorage.getItem(key), COLLECTION_KEY)
  await dialog.getByLabel('Codice della sfida', { exact: true }).fill(JSON.stringify({ ...shared, speciesIds: [1, 1, 1, 1, 1, 1] }))
  await dialog.getByRole('button', { name: 'Importa configurazione', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('una sola volta')
  expect(await page.evaluate((key) => localStorage.getItem(key), COLLECTION_KEY)).toBe(draftBeforeInvalid)
  await dialog.getByLabel('Codice della sfida', { exact: true }).fill(code)
  await dialog.getByRole('button', { name: 'Importa configurazione', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Configurazione importata')
  const a11y = await new AxeBuilder({ page }).include('[data-game-dialog]').analyze()
  expect(a11y.violations).toEqual([])
  await test.info().attach('Fanta-Team pronto e condivisione', { body: await page.screenshot(), contentType: 'image/png' })
  await page.keyboard.press('Escape'); await page.reload()
  dialog = await tools(page)
  await expect(dialog.getByLabel('Seed della sfida', { exact: true })).toHaveValue('FANTA-ROMA')
  await expect(dialog.getByRole('button', { name: 'Fanta-Team Builder', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('region', { name: 'Squadra Fanta scelta', exact: true }).getByRole('listitem')).toHaveCount(6)
  await dialog.getByRole('button', { name: 'Prepara Fanta-Team', exact: true }).click()
  await dialog.getByRole('button', { name: 'Crea codice da condividere', exact: true }).click()
  expect(JSON.parse(await dialog.getByLabel('Codice della sfida', { exact: true }).inputValue())).toEqual(shared)
  expect(errors).toEqual([])
})

test('a restored concluded challenge records one result and returns to its preserved campaign', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await openCampaignFixture(page)
  const campaign = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, CAMPAIGN_KEY)
  await generateAndLaunch(page)
  // This is a recovery/settlement fixture, not a claim that all six KOs were played through.
  // Keep the real runtime envelope and session; change only the already-settled battle outcome.
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!)
    const battle = saved.state.battaglia
    const battleId = battle.cronaca?.battleId ?? saved.state.challengeContext.attemptId
    battle.checkpoint = { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended', openingComplete: true,
      outcome: 'vittoria', evolutions: [], rivalMessages: [] }
    battle.squadraB = battle.squadraB.map((pokemon: Record<string, unknown>) => ({ ...pokemon, hp: 0 }))
    battle.pokemonB = { ...battle.pokemonB, hp: 0 }
    battle.turnoCorrente = 'A'
    battle.cronaca = { version: 1, battleId, nextSequence: 2, omittedEvents: 0,
      events: [{ id: `${battleId}:finished`, kind: 'outcome', side: 'A', title: 'Sfida conclusa ripristinata', messages: ['Vittoria già consolidata.'] }] }
    localStorage.setItem(key, JSON.stringify(saved))
  }, ACTIVE_CHALLENGE_KEY)
  await page.reload()
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Prosegui', exact: true }).click()
  await expect(page.locator('[data-presented-scene="mappa-principale"]')).toHaveAttribute('aria-busy', 'false')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, CAMPAIGN_KEY)).toEqual(campaign)
  const results = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.results, COLLECTION_KEY)
  expect(results).toHaveLength(1)
  expect(results[0]).toMatchObject({ seed: 'ROME-42', mode: 'seed', outcome: 'vittoria', turns: 0 })
  expect(results[0].team).toHaveLength(6)
  await page.reload()
  const dialog = await tools(page)
  await dialog.getByRole('navigation', { name: 'Pagine delle sfide', exact: true }).getByRole('button', { name: 'Risultati', exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Risultati delle sfide', exact: true }).getByRole('listitem')).toHaveCount(1)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.results, COLLECTION_KEY)).toEqual(results)
  expect(errors).toEqual([])
})
