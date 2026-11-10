import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

// Use the actual animation and dice reveal clock so an early KO is observable.
test.use({ reducedMotion: 'no-preference' })

async function openBattleFixture(page: Page) {
  await page.addInitScript(() => {
    // A persisted fixture uses the normal application recovery path. A reload
    // must retain the resulting save rather than silently re-seed the match.
    if (localStorage.getItem('e2e-chronicle-fixture')) return
    const attacker = { istanzaId: 'chronicle-a', specieId: 1, nome: 'Vyrath Audit', livello: 14, hp: 1, xp: 0 }
    const defender = { istanzaId: 'chronicle-b', specieId: 13, nome: 'Wormaren Audit', livello: 5, hp: 1, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: `Cronaca ${id}`, squadra: id === 1 ? [attacker] : [], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], monete: 0, inventario: {}, caselleConsumate: [] })
    const position = { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Venezia' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
      scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'mappa-principale' },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
      battaglia: { tipo: 'Selvatico', pokemonA: attacker, pokemonB: defender, squadraA: [attacker], squadraB: [defender], hpMaxA: 25, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'mappa-principale', log: ['Incontro di verifica della cronaca.'], evoluzioneInAttesa: null },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, animationSpeed: 'normal', reducedMotion: 'off' } }))
    localStorage.setItem('e2e-chronicle-fixture', 'seeded')
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '1')
}

test('Suprema reveals KO after dice, preserves XP/recoil order on reload and archives its recorded replay', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openBattleFixture(page)

  await page.evaluate(() => {
    const probe = { revealed: false, beforeDiceSamples: 0, violations: [] as string[] }
    const observe = () => {
      if (document.querySelector('[data-dice-revealed="true"]')) probe.revealed = true
      if (probe.revealed) return
      probe.beforeDiceSamples += 1
      if (document.querySelector('[data-arkamon-animation="ko"]')) probe.violations.push('KO visibile prima dei dadi')
      if (document.querySelector('[data-battle-hp-side="enemy"]')?.getAttribute('data-battle-hp') !== '1') probe.violations.push('HP cambiati prima dei dadi')
      if (document.querySelector('[data-dice-revealed="false"]')?.textContent?.includes('Danno finale')) probe.violations.push('Danno finale prima del risultato')
    }
    const observer = new MutationObserver(observe)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    observe()
    ;(window as typeof window & { chronicleProbe: typeof probe }).chronicleProbe = probe
  })

  await page.getByRole('button', { name: 'Mossa Suprema', exact: true }).click()
  const supreme = page.getByRole('dialog', { name: 'Mossa Suprema', exact: true })
  await supreme.getByRole('button', { name: 'Soffio', exact: true }).click()
  await expect(page.locator('[data-dice-revealed="false"]')).toBeVisible()
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '1')
  await expect(page.locator('[data-arkamon-animation="ko"]')).toHaveCount(0)
  await expect(page.locator('[data-dice-revealed="true"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  const probe = await page.evaluate(() => (window as typeof window & { chronicleProbe: { revealed: boolean; beforeDiceSamples: number; violations: string[] } }).chronicleProbe)
  expect(probe.revealed).toBe(true)
  expect(probe.beforeDiceSamples).toBeGreaterThan(0)
  expect(probe.violations).toEqual([])

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  expect(saved.checkpoint.outcome).toBe('vittoria')
  expect(saved.pokemonA).toMatchObject({ livello: 15, hp: 0, xp: 0 })
  expect(saved.pokemonB.hp).toBe(0)
  const events = saved.cronaca.events as { id: string; kind: string; dice?: number[]; diceSum?: number; winnerSide?: string; levelBefore?: number; levelAfter?: number }[]
  expect(events.filter((event) => event.kind !== 'opening').map((event) => event.kind)).toEqual(['attack', 'ko', 'xp', 'recoil', 'ko', 'winner', 'outcome'])
  const attack = events.find((event) => event.kind === 'attack')!
  expect(attack.dice).toHaveLength(2)
  expect(attack.dice!.every((value) => Number.isInteger(value) && value >= 1 && value <= 6)).toBe(true)
  expect(attack.diceSum).toBe(attack.dice!.reduce((sum, value) => sum + value, 0))
  expect(events.find((event) => event.kind === 'xp')).toMatchObject({ levelBefore: 14, levelAfter: 15 })
  expect(events.find((event) => event.kind === 'winner')).toMatchObject({ winnerSide: 'A' })
  expect(new Set(events.map((event) => event.id)).size).toBe(events.length)

  await page.reload()
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: 'Prosegui', exact: true })).toBeVisible()
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  expect(resumed.cronaca.events).toEqual(saved.cronaca.events)
  expect(resumed.pokemonA).toEqual(saved.pokemonA)
  expect(resumed.checkpoint.evolutions).toEqual(saved.checkpoint.evolutions)
  const archive = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-battle-archive-v1')!).state.matches)
  expect(archive).toHaveLength(1)
  expect(archive[0].chronicle.events).toEqual(saved.cronaca.events)

  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const tools = page.getByRole('dialog', { name: 'La tua partita' })
  await tools.getByRole('button', { name: 'Apri Registro', exact: true }).click()
  await tools.getByRole('navigation', { name: 'Archivi del registro', exact: true }).getByRole('button', { name: 'Cronache delle battaglie', exact: true }).click()
  await tools.getByRole('button', { name: 'Rivedi cronaca e dadi', exact: true }).click()
  const replay = page.getByRole('dialog', { name: 'Cronaca della battaglia', exact: true })
  await expect(replay).toBeVisible()
  await replay.getByRole('button', { name: /Vyrath Audit usa Soffio/ }).click()
  await expect(replay).toContainText(`Dadi reali: ${attack.dice!.join(' + ')} = ${attack.diceSum}`)
  const a11y = await new AxeBuilder({ page }).include('[data-battle-log-dialog]').analyze()
  expect(a11y.violations).toEqual([])
  await test.info().attach('Replay della Suprema', { body: await page.screenshot(), contentType: 'image/png' })
  await page.keyboard.press('Escape')
  await expect(replay).toHaveCount(0)
  await expect(tools).toBeVisible()
  await expect(tools.getByRole('button', { name: 'Rivedi cronaca e dadi', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(tools).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia.cronaca.events)).toEqual(saved.cronaca.events)
  expect(errors).toEqual([])
})

test('restoring a different battle in the same scene replaces local HP, checkpoint and chronicle without stale writes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openBattleFixture(page)
  await expect(page.locator('[data-battle-hp-side="player"]')).toHaveAttribute('data-battle-hp', '1')
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const tools = page.getByRole('dialog', { name: 'La tua partita' })
  await tools.getByRole('button', { name: 'Apri Salvataggio', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await tools.getByRole('button', { name: 'Scarica backup partita', exact: true }).click()
  const backup = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'))
  const replacement = { istanzaId: 'restored-a', specieId: 5, nome: 'Darklaw Ripristinato', livello: 12, hp: 7, xp: 0 }
  const replacementEnemy = { istanzaId: 'restored-b', specieId: 13, nome: 'Wormaren Ripristinato', livello: 5, hp: 9, xp: 0 }
  const restoredChronicle = {
    version: 1, battleId: 'restored-battle', nextSequence: 3, omittedEvents: 0,
    events: [
      { id: 'restored-battle:opening', kind: 'opening', title: 'Cronaca ripristinata', messages: ['Questa cronaca appartiene alla partita importata.'] },
      { id: 'restored-battle:2:status', kind: 'status', side: 'A', title: 'Risultato già rivelato nel backup', messages: ['Gli HP residui importati sono 7.'], dice: [6], diceSum: 6, hpBefore: 7, hpAfter: 7 },
    ],
  }
  const restoredCheckpoint = {
    version: 1, initialPriority: 'A', actedThisRound: ['B'], phase: 'player', openingComplete: true,
    outcome: null, evolutions: [], rivalMessages: [],
  }
  backup.campaign.giocatore1.squadra = [replacement]
  backup.campaign.battaglia = {
    ...backup.campaign.battaglia, pokemonA: replacement, pokemonB: replacementEnemy,
    squadraA: [replacement], squadraB: [replacementEnemy], turnoCorrente: 'A',
    log: ['Checkpoint della partita ripristinata.'], cronaca: restoredChronicle, checkpoint: restoredCheckpoint,
  }
  await tools.getByLabel('Importa backup partita').setInputFiles({ name: 'battle-restore.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(tools.getByLabel('Anteprima ripristino')).toBeVisible()
  await tools.getByRole('checkbox', { name: /Confermo la sostituzione/ }).check()
  await tools.getByRole('button', { name: 'Ripristina questa partita', exact: true }).click()
  await expect(tools.getByRole('status')).toContainText('Partita ripristinata')
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await page.keyboard.press('Escape')
  await expect(tools).toHaveCount(0)
  await expect(page.locator('[data-battle-hp-side="player"]')).toContainText('Darklaw Ripristinato')
  await expect(page.locator('[data-battle-hp-side="player"]')).toHaveAttribute('data-battle-hp', '7')
  await expect(page.locator('[data-battle-hp-side="enemy"]')).toHaveAttribute('data-battle-hp', '9')
  await expect(page.getByRole('button', { name: 'Cronaca · 2', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Cronaca · 2', exact: true }).click()
  const replay = page.getByRole('dialog', { name: 'Cronaca della battaglia', exact: true })
  await expect(replay).toContainText('Dadi reali: 6 = 6')
  await expect(replay).not.toContainText('Incontro di verifica della cronaca.')
  await page.keyboard.press('Escape')
  await expect(replay).toHaveCount(0)
  const beforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  expect(beforeReload.pokemonA).toEqual(replacement)
  expect(beforeReload.pokemonB).toEqual(replacementEnemy)
  expect(beforeReload.cronaca).toEqual(restoredChronicle)
  expect(beforeReload.checkpoint).toMatchObject(restoredCheckpoint)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1.squadra)).toEqual([replacement])
  await page.reload()
  await expect(page.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('[data-battle-hp-side="player"]')).toHaveAttribute('data-battle-hp', '7')
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!).state.battaglia)
  expect(afterReload.pokemonA).toEqual(replacement)
  expect(afterReload.cronaca).toEqual(restoredChronicle)
  expect(afterReload.checkpoint).toMatchObject(restoredCheckpoint)
  expect(errors).toEqual([])
})
