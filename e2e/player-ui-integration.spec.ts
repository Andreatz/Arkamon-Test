import { expect, test, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openConfiguredShop, seedConfiguredShop } from './helpers/configuredShop'
import type { BattleChronicle, PokemonIstanza } from '../src/types'

const SAVE_KEY = 'arkamon-save'
interface SavedPlayer {
  id: 1 | 2
  nome: string
  squadra: PokemonIstanza[]
  deposito: Record<string, PokemonIstanza>
  monete: number
  inventario: Record<string, number>
}
interface CampaignSnapshot {
  giocatore1: SavedPlayer
  giocatore2: SavedPlayer
  giocatoreAttivo: 1 | 2
  turnoOverworld: { giocatoreAttivo: 1 | 2; azioniRimaste: number }
  posizione1: { luogo: string }
  posizione2: { luogo: string }
}

/** A valid portable campaign starts the test; every mutation then uses the production UI. */
async function seedCampaign(page: Page, location: 'map' | 'city' | 'route' | 'deposit' = 'map') {
  await seedConfiguredShop(page)
  await page.addInitScript(({ key, location }) => {
    // Reloads must read the result of the real persisted action, rather than reseeding it.
    if (localStorage.getItem(key)) return
    const first = { istanzaId: 'integration-g1-first', specieId: 1, nome: 'Vyrath di Arianna', livello: 10, hp: 3, xp: 0, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }
    const teammate = { istanzaId: 'integration-g1-second', specieId: 5, nome: 'Darklaw compagno', livello: 5, hp: 6, xp: 0 }
    const reserve = { istanzaId: 'integration-g1-reserve', specieId: 9, nome: 'Felyss in riserva', livello: 7, hp: 2, xp: 0, stato: { tipo: 'Avvelenato', turniRimanenti: -1, turniTrascorsi: 2 } }
    const outsideCap = { istanzaId: 'integration-g1-outside-cap', specieId: 13, nome: 'Wormaren fuori fascia', livello: 20, hp: 4, xp: 0 }
    const foreign = { istanzaId: 'integration-g2-first', specieId: 5, nome: 'Darklaw di Bruno', livello: 6, hp: 9, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Arianna' : 'Bruno', squadra: id === 1 ? [first, teammate] : [foreign],
      deposito: id === 1 ? { '1:1': reserve, '1:2': outsideCap } : {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [],
      monete: id === 1 ? 700 : 125, inventario: id === 1 ? { potion: 2, 'paralysis-heal': 1 } : { potion: 1 },
    })
    const position = (luogo: string) => ({ mappaId: 'mappa-principale', luogo, x: 0, y: 0, direzione: 'S' })
    const place = location === 'city' || location === 'deposit' ? 'Venezia' : location === 'route' ? 'Percorso_1' : 'Milano'
    localStorage.setItem(key, JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9, battaglia: null,
      posizione1: position(place), posizione2: position('Torino'), turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: location === 'city' ? { Venezia: 'n56' } : {}, posizioniLocali2: {},
      scenaCorrente: location === 'deposit' ? { scena: 'deposito' } : location === 'city' ? { scena: 'citta', payload: { luogo: 'Venezia' } } : { scena: 'mappa-principale' },
      scenaPrecedente: location === 'deposit' ? { scena: 'citta', payload: { luogo: 'Venezia' } } : location === 'city' ? { scena: 'mappa-principale' } : null, audioMuted: true,
      arkadex: { seen1: [1, 5, 9, 13], caught1: [1, 5, 9, 13], seen2: [5], caught2: [5] },
      interactionProgress: { completed1: [], completed2: [], completedShared: [], log1: [], log2: [], pendingBattle: null },
    } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      musicVolume: 0, effectsVolume: 0, animationSpeed: 'fast', reducedMotion: 'on',
    } }))
  }, { key: SAVE_KEY, location })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
}

async function campaign(page: Page): Promise<CampaignSnapshot> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, SAVE_KEY)
}

async function openTools(page: Page, screen: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await dialog.getByRole('button', { name: screen, exact: true }).click()
  await expect(dialog.locator('.pu-shell')).toBeVisible({ timeout: 30000 })
  await expect(dialog.locator('.pu-content').getByRole('status').filter({ hasText: 'Caricamento…' })).toHaveCount(0)
  return dialog
}

async function expectProvidedArtwork(root: Locator) {
  const artwork = root.locator('img[data-provided-asset][data-package-asset][src*="/ui/reference-png/"]')
  expect(await artwork.count(), 'provided artwork is mounted as real images in the game').toBeGreaterThan(0)
  await expect.poll(() => root.locator('img').evaluateAll((images: HTMLImageElement[]) => images
    .filter(image => image.hasAttribute('data-provided-asset') || /\.svg$/i.test(new URL(image.currentSrc || image.src).pathname) || /\/ui\/(?:reference-assets|reference-png)\//.test(new URL(image.currentSrc || image.src).pathname))
    .map(image => ({
      source: new URL(image.currentSrc || image.src).pathname,
      complete: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
      fit: getComputedStyle(image).objectFit,
      packaged: !image.hasAttribute('data-provided-asset') || !!image.getAttribute('data-package-asset'),
    }))
    .filter(image => ! /\/ui\/reference-png\/[a-z0-9][a-z0-9_-]*\.webp$/i.test(image.source) || !image.complete || image.fit !== 'contain' || !image.packaged)),
  { message: 'provided PNG package artwork loads completely and preserves its proportions', timeout: 30000 }).toEqual([])
  await expect(root.locator('[data-provided-svg]'), 'Aurora does not retain vector crop dependencies').toHaveCount(0)
  await expect(root.locator('svg:not(.pu-creature-art)'), 'menu decoration uses the supplied PNG package').toHaveCount(0)
  const inlineAtlases = await root.locator('svg').evaluateAll(elements => elements
    .filter(element => element.querySelectorAll('path').length > 1000)
    .map(element => ({ className: element.getAttribute('class'), paths: element.querySelectorAll('path').length })))
  expect(inlineAtlases, 'dense source atlases stay outside the live DOM').toEqual([])
}

test.beforeEach(async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 1000 })
})

test('all six Aurora menu screens fit the viewport with supplied PNG controls, compact icons and official full-body artwork', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const legacyArtwork: string[] = []
  page.on('request', request => {
    if (request.resourceType() === 'image' && /\/ui\/(?:studio|player-kit|reference-assets)(?:\/|$)/i.test(new URL(request.url()).pathname)) legacyArtwork.push(request.url())
  })
  await seedCampaign(page)
  const dialog = await openTools(page, 'Squadra')
  for (const [name, id] of [['Squadra', 'squadra'], ['Deposito', 'deposito'], ['Arkadex', 'arkadex'], ['Analisi', 'analisi'], ['Borsa', 'borsa'], ['Menù Partita', 'partita']] as const) {
    await dialog.getByRole('button', { name, exact: true }).click()
    const shell = dialog.locator('.pu-shell')
    await expect(shell).toHaveAttribute('data-player-ui-screen', id)
    await expect(shell).toHaveAttribute('data-ui-concept', 'aurora')
    await expect(dialog.locator('.pu-content').getByRole('status').filter({ hasText: 'Caricamento…' })).toHaveCount(0)
    await expectProvidedArtwork(shell)
    // Approval concerns the running game: a separate Studio gallery cannot satisfy it.
    const portraits = shell.locator('.pu-creature-art')
    expect(await portraits.count(), `${name}: creature portraits`).toBeGreaterThan(0)
    await expect.poll(() => portraits.evaluateAll(elements => elements.every(element => element.getAttribute('data-creature-loaded') === 'true')),
      { message: `${name}: compact and full-body artwork decode`, timeout: 30000 }).toBe(true)
    const creatureArtwork = await portraits.evaluateAll(elements => elements.map(element => ({
      compact: element instanceof HTMLImageElement,
      speciesId: Number(element.getAttribute('data-species-id')),
      source: element.getAttribute('data-creature-source'),
      image: element instanceof HTMLImageElement ? new URL(element.currentSrc || element.src).pathname : element.querySelector('image')?.getAttribute('href'),
      framing: element.getAttribute('preserveAspectRatio'),
      fit: getComputedStyle(element).objectFit,
      decoded: element instanceof HTMLImageElement ? element.complete && element.naturalWidth > 0 && element.naturalHeight > 0 : true,
      replacesHero: element instanceof HTMLImageElement && !!element.closest('.is-large'),
    })))
    for (const portrait of creatureArtwork) {
      expect(portrait.speciesId).toBeGreaterThanOrEqual(1)
      expect(portrait.speciesId).toBeLessThanOrEqual(110)
      const expected = portrait.compact ? `/ui/reference-png/portrait-${String(portrait.speciesId).padStart(3, '0')}.webp` : `/sprites/front_sprites/${portrait.speciesId}.png`
      expect(portrait.source).toBe(expected)
      expect(portrait.image).toContain(portrait.source!)
      if (portrait.compact) {
        expect(portrait.fit).toBe('contain')
        expect(portrait.decoded).toBe(true)
        expect(portrait.replacesHero).toBe(false)
      } else expect(portrait.framing).toBe('xMidYMid meet')
    }
    if (['squadra', 'deposito', 'arkadex', 'partita'].includes(id)) expect(await shell.locator('img.pu-creature-art').count(), `${name}: supplied compact creature PNGs`).toBeGreaterThan(0)
    if (['squadra', 'arkadex'].includes(id)) await expect(shell.locator('.is-large > svg.pu-creature-art,.pu-splash-hero-presence').first(), `${name}: full-body hero or decoded splash`).toBeVisible()
    if (['deposito', 'analisi'].includes(id)) expect(await shell.locator('.is-large > svg.pu-creature-art').count(), `${name}: official full-body hero`).toBeGreaterThan(0)
    expect(new URL(page.url()).searchParams.has('uiStudioPreview')).toBe(false)
    await dialog.evaluate(async (element) => Promise.all(Array.from(element.querySelectorAll('img')).map(image => image.decode().catch(() => null))))
    const geometry = await dialog.evaluate((element) => {
      const shell = element.querySelector('.pu-shell') as HTMLElement
      const content = element.querySelector('.pu-content') as HTMLElement
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, shell: shell.scrollWidth,
        shellWidth: shell.clientWidth, content: content.scrollWidth, contentWidth: content.clientWidth,
        brokenImages: Array.from(element.querySelectorAll<HTMLImageElement>('img')).filter(image => !image.complete || !image.naturalWidth || !image.naturalHeight).map(image => image.src) }
    })
    expect(geometry.document, `${name}: document horizontal overflow`).toBeLessThanOrEqual(geometry.viewport + 2)
    expect(geometry.shell, `${name}: tools horizontal overflow`).toBeLessThanOrEqual(geometry.shellWidth + 2)
    expect(geometry.content, `${name}: screen horizontal overflow`).toBeLessThanOrEqual(geometry.contentWidth + 2)
    expect(geometry.brokenImages, `${name}: missing image artwork`).toEqual([])
    const accessibility = await new AxeBuilder({ page }).include('.player-ui-dialog').analyze()
    expect(accessibility.violations, `${name}: accessibility violations`).toEqual([])
    await test.info().attach(`Integrated ${id} at ${geometry.viewport}px`, { body: await page.screenshot(), contentType: 'image/png' })
  }
  expect(errors).toEqual([])
  expect(legacyArtwork, 'Aurora does not request the suspended legacy SVG families').toEqual([])
})

test('the city shop opens the integrated window and the direct deposit respects Escape without changing the campaign', async ({ page }) => {
  await seedCampaign(page, 'deposit')
  const before = await campaign(page)
  await expect(page.locator('.pu-scene-host .pu-shell')).toHaveAttribute('data-player-ui-screen', 'deposito')
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'La tua partita' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'La tua partita' })).toHaveCount(0)
  await expect(page.locator('.pu-scene-host')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('data-presented-scene', 'citta:Venezia')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  const dialog = await openConfiguredShop(page)
  await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen', 'negozio')
  await expectProvidedArtwork(dialog.locator('.pu-shell'))
  await expect(dialog.getByRole('region', { name: 'Arkastore di Venezia' })).toBeVisible()
  const after = await campaign(page)
  expect(after.giocatore1).toEqual(before.giocatore1)
  expect(after.giocatore2).toEqual(before.giocatore2)
  expect(after.turnoOverworld).toEqual(before.turnoOverworld)
})

test('Escape closes an archived replay above the direct deposit without closing the scene or altering saved data', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // The same valid replay shape used by the battle-chronicle restore scenario enters through persistence.
  const chronicle: BattleChronicle = {
    version: 1, battleId: 'deposit-replay', nextSequence: 3, omittedEvents: 0,
    events: [
      { id: 'deposit-replay:opening', kind: 'opening', title: 'Cronaca conservata', messages: ['Questa cronaca appartiene a una battaglia conclusa.'] },
      { id: 'deposit-replay:2:status', kind: 'status', side: 'A', title: 'Risultato già rivelato', messages: ['Gli HP residui registrati sono 7.'], dice: [6], diceSum: 6, hpBefore: 7, hpAfter: 7 },
    ],
  }
  await page.addInitScript((savedChronicle) => {
    if (localStorage.getItem('arkamon-battle-archive-v1')) return
    localStorage.setItem('arkamon-battle-archive-v1', JSON.stringify({ version: 1, state: { version: 1, matches: [{
      id: savedChronicle.battleId, title: 'Battaglia conservata a Venezia', completedAt: '2026-10-11T10:00:00.000Z',
      playerId: 1, outcome: 'vittoria', location: 'Venezia', battleType: 'Selvatico', chronicle: savedChronicle,
    }] } }))
  }, chronicle)
  await seedCampaign(page, 'deposit')
  const before = await campaign(page)
  const beforeArchive = await page.evaluate(() => localStorage.getItem('arkamon-battle-archive-v1'))
  const scene = page.locator('.pu-scene-host')
  await scene.getByRole('button', { name: 'Menù Partita', exact: true }).click()
  await scene.getByRole('button', { name: 'Apri Registro', exact: true }).click()
  await scene.getByRole('navigation', { name: 'Archivi del registro', exact: true }).getByRole('button', { name: 'Cronache delle battaglie', exact: true }).click()
  const review = scene.getByRole('button', { name: 'Rivedi cronaca e dadi', exact: true })
  await review.click()
  const replay = page.getByRole('dialog', { name: 'Cronaca della battaglia', exact: true })
  await expect(replay).toBeVisible()
  await expect(replay).toContainText('Dadi reali: 6 = 6')

  await page.keyboard.press('Escape')
  await expect(replay).toHaveCount(0)
  await expect(scene).toBeVisible()
  await expect(review).toBeFocused()
  expect(await campaign(page)).toEqual(before)
  expect(await page.evaluate(() => localStorage.getItem('arkamon-battle-archive-v1'))).toBe(beforeArchive)

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('data-presented-scene', 'citta:Venezia')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  const after = await campaign(page)
  expect(after.giocatore1).toEqual(before.giocatore1)
  expect(after.giocatore2).toEqual(before.giocatore2)
  expect(after.turnoOverworld).toEqual(before.turnoOverworld)
  expect(errors).toEqual([])
})

test('deposit swaps persist exact owned instances and reject a team-cap violation without healing', async ({ page }) => {
  await seedCampaign(page)
  const initial = await campaign(page)
  const dialog = await openTools(page, 'Deposito')
  await expect(dialog.getByRole('button', { name: /^Box 1, posto \d+:/ })).toHaveCount(35)
  await expect(dialog.getByRole('button', { name: /^Squadra, posto \d+:/ })).toHaveCount(6)
  await dialog.getByRole('button', { name: 'Box 1, posto 1: Felyss in riserva, livello 7', exact: true }).click()
  await dialog.getByRole('button', { name: 'Sposta o scambia', exact: true }).click()
  await dialog.getByRole('button', { name: 'Squadra, posto 2: Darklaw compagno, livello 5', exact: true }).click()
  await expect.poll(async () => (await campaign(page)).giocatore1.squadra[1]?.istanzaId).toBe('integration-g1-reserve')
  const swapped = await campaign(page)
  expect(swapped.giocatore1.squadra[1]).toEqual(initial.giocatore1.deposito['1:1'])
  expect(swapped.giocatore1.deposito['1:1']).toEqual(initial.giocatore1.squadra[1])
  expect(swapped.giocatore2).toEqual(initial.giocatore2)
  expect(swapped.turnoOverworld).toEqual(initial.turnoOverworld)

  await dialog.getByRole('button', { name: 'Analizza Arkamon', exact: true }).click()
  await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen', 'analisi')
  await expect(dialog.getByLabel('Arkamon da analizzare')).toHaveValue('integration-g1-reserve')
  await expect(dialog.getByRole('region', { name: 'Arkamon selezionato: Felyss in riserva' })).toBeVisible()
  await expect(dialog.locator('.pu-content')).toContainText('Avvelenato')

  await dialog.getByRole('button', { name: 'Deposito', exact: true }).click()
  await dialog.getByRole('button', { name: 'Box 1, posto 2: Wormaren fuori fascia, livello 20', exact: true }).click()
  await dialog.getByRole('button', { name: 'Sposta o scambia', exact: true }).click()
  await dialog.getByRole('button', { name: 'Squadra, posto 2: Felyss in riserva, livello 7', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('al massimo 5 livelli')
  expect((await campaign(page)).giocatore1).toEqual(swapped.giocatore1)
  await page.getByRole('button', { name: 'Ho capito', exact: true }).click()
  await page.reload()
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  expect((await campaign(page)).giocatore1).toEqual(swapped.giocatore1)
  expect((await campaign(page)).giocatore2).toEqual(initial.giocatore2)
  const resumed = await openTools(page, 'Deposito')
  await resumed.getByRole('button', { name: 'G2 · Bruno', exact: true }).click()
  await expect(resumed.getByRole('button', { name: 'Sposta o scambia', exact: true })).toBeDisabled()
})

test('moving a reserve to team slot six selects its compact destination and preserves the exact specimen', async ({ page }) => {
  await seedCampaign(page)
  const initial = await campaign(page)
  const dialog = await openTools(page, 'Deposito')
  await dialog.getByRole('button', { name: 'Box 1, posto 1: Felyss in riserva, livello 7', exact: true }).click()
  await dialog.getByRole('button', { name: 'Sposta o scambia', exact: true }).click()
  await dialog.getByRole('button', { name: 'Squadra, posto 6: vuoto', exact: true }).click()

  await expect.poll(async () => (await campaign(page)).giocatore1.squadra[2]?.istanzaId).toBe('integration-g1-reserve')
  const moved = await campaign(page)
  expect(moved.giocatore1.squadra).toHaveLength(3)
  expect(moved.giocatore1.squadra[2]).toEqual(initial.giocatore1.deposito['1:1'])
  expect(moved.giocatore1.deposito['1:1']).toBeUndefined()
  expect(moved.giocatore2).toEqual(initial.giocatore2)
  expect(moved.turnoOverworld).toEqual(initial.turnoOverworld)
  await expect(dialog.getByRole('button', { name: 'Squadra, posto 3: Felyss in riserva, livello 7', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Squadra, posto 6: vuoto', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(dialog.locator('.pu-deposit-detail')).toContainText('Arkamon spostato. Livello, HP e status sono conservati.')
  await expect(dialog.getByRole('region', { name: 'Arkamon selezionato: Felyss in riserva', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Analizza Arkamon', exact: true }).click()
  await expect(dialog.getByLabel('Arkamon da analizzare')).toHaveValue('integration-g1-reserve')
  await expect(dialog.locator('.pu-content')).toContainText('Avvelenato')

  await page.reload()
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  expect((await campaign(page)).giocatore1).toEqual(moved.giocatore1)
  expect((await campaign(page)).giocatore2).toEqual(initial.giocatore2)
})

test('the integrated bag cures paralysis once, preserves HP and persists the spent item and turn', async ({ page }) => {
  await seedCampaign(page)
  const before = await campaign(page)
  const dialog = await openTools(page, 'Borsa')
  const bag = dialog.getByRole('region', { name: 'Borsa degli oggetti', exact: true })
  await expect(bag.getByLabel('Arkamon da curare')).toHaveValue('integration-g1-first')
  await bag.getByLabel('Arkamon da curare').selectOption('integration-g1-second')
  await bag.getByRole('button', { name: 'Pozione: 2 disponibili', exact: true }).click()
  await bag.getByRole('button', { name: 'Antiparalisi: 1 disponibili', exact: true }).click()
  await expect(bag.getByLabel('Arkamon da curare')).toHaveValue('integration-g1-second')
  await expect(bag.getByRole('button', { name: /^Usa / })).toHaveCount(1)
  await expect(bag.getByRole('button', { name: 'Usa Antiparalisi', exact: true })).toBeDisabled()
  expect((await campaign(page)).giocatore1).toEqual(before.giocatore1)
  await bag.getByLabel('Arkamon da curare').selectOption('integration-g1-first')
  await bag.getByRole('button', { name: 'Usa Antiparalisi', exact: true }).click()
  await expect.poll(async () => (await campaign(page)).giocatore1.inventario['paralysis-heal']).toBe(0)
  const after = await campaign(page)
  expect(after.giocatore1.squadra[0]).toMatchObject({ istanzaId: 'integration-g1-first', hp: 3, livello: 10, xp: 0 })
  expect(after.giocatore1.squadra[0].stato).toBeUndefined()
  expect(after.giocatore1.inventario.potion).toBe(2)
  expect(after.giocatore1.monete).toBe(before.giocatore1.monete)
  expect(after.giocatore2).toEqual(before.giocatore2)
  expect(after.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
  await expect(bag.getByLabel('Arkamon da curare')).toHaveValue('integration-g1-first')
  await expect(bag.getByRole('button', { name: 'Antiparalisi: 1 disponibili', exact: true })).toHaveCount(0)
  await expect(bag.getByRole('button', { name: /^Usa / })).toHaveCount(1)
  await expect(bag.getByRole('button', { name: 'Usa Pozione', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  expect((await campaign(page)).giocatore1).toEqual(after.giocatore1)
  const resumed = await openTools(page, 'Borsa')
  await expect(resumed.getByRole('button', { name: 'Usa Pozione', exact: true })).toBeDisabled()
})

test('the integrated city checkout charges the real cart once without healing or changing G2', async ({ page }) => {
  await seedCampaign(page, 'city')
  const before = await campaign(page)
  const dialog = await openConfiguredShop(page)
  const shop = dialog.getByRole('region', { name: 'Arkastore di Venezia', exact: true })
  await shop.getByLabel('Quantità di Pozione', { exact: true }).fill('1')
  await shop.getByRole('button', { name: 'Seleziona Antiparalisi', exact: true }).click()
  await shop.getByLabel('Quantità di Antiparalisi', { exact: true }).fill('1')
  await expect(shop).toContainText('Carrello: 2 oggetti · 180 ₳')
  await shop.getByRole('button', { name: 'Acquista carrello', exact: true }).click()
  await expect.poll(async () => (await campaign(page)).giocatore1.monete).toBe(520)
  const after = await campaign(page)
  expect(after.giocatore1.inventario).toMatchObject({ potion: 3, 'paralysis-heal': 2 })
  expect(after.giocatore1.squadra).toEqual(before.giocatore1.squadra)
  expect(after.giocatore2).toEqual(before.giocatore2)
  expect(after.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
  await expect(shop.getByLabel('Quantità di Antiparalisi', { exact: true })).toBeDisabled()
  await expect(shop.getByRole('button', { name: 'Acquista carrello', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  expect((await campaign(page)).giocatore1).toEqual(after.giocatore1)
})

test('the route menu has no shop entry and rejects an incomplete shop request without changing resources', async ({ page }) => {
  await seedCampaign(page, 'route')
  const before = await campaign(page)
  const dialog = await openTools(page, 'Menù Partita')
  await expect(dialog.getByRole('button', { name: 'Negozio', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Apri Negozio', exact: true })).toHaveCount(0)
  await expect(dialog.locator('.pu-menu-tile')).toHaveCount(9)
  await expect(dialog.getByRole('button', { name: 'Riprendi il Viaggio', exact: true })).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: /^(Chiudi|Riprendi)$/ })).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('arkamon:open-player-ui', { detail: { screen: 'negozio', playerId: 1 } })))
  await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen', 'partita')
  expect(await campaign(page)).toEqual(before)
  const presentedScene = await page.locator('[data-presented-scene]').getAttribute('data-presented-scene')
  await dialog.getByRole('button', { name: 'Apri Mappa', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('data-presented-scene', presentedScene!)
  expect(await campaign(page)).toEqual(before)
})

test('six match utilities use their main cards, role-based typography and a single journey resume command', async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1920, height: 1080 })
  await seedCampaign(page)
  const before = await campaign(page)
  const dialog = await openTools(page, 'Menù Partita')
  const utilities = [
    ['Registro', 'register', 'Registro della partita'],
    ['Salvataggio', 'backup', 'Backup della partita'],
    ['Impostazioni', 'settings', 'Impostazioni del gioco'],
    ['Gara', 'race', 'Situazione della gara'],
    ['Ripresa', 'recap', 'Ripresa della sessione'],
    ['Sfide', 'challenges', 'Sfide a seed e Fanta-Team Builder'],
  ] as const
  await expect(dialog.locator('.pu-menu-tile')).toHaveCount(9)
  const mainCards = dialog.locator('.ref-menu-grid')
  await expect(mainCards).toHaveAttribute('aria-label', 'Destinazioni del menù principale')
  for (const label of ['Squadra', 'Arkadex', 'Borsa', 'Deposito', 'Mappa', 'Diario', 'Registro', 'Salvataggio', 'Impostazioni']) {
    await expect(mainCards.getByRole('button', { name: `Apri ${label}`, exact: true })).toHaveCount(1)
  }
  await page.evaluate(() => document.fonts.ready)
  const fonts = await dialog.evaluate(element => ({
    button: getComputedStyle(element.querySelector('.pu-menu-tile')!).fontFamily,
    title: getComputedStyle(element.querySelector('.pu-shell h1')!).fontFamily,
    text: getComputedStyle(element.querySelector('.pu-shell')!).fontFamily,
    bodyRole: getComputedStyle(element.querySelector('.pu-shell')!).getPropertyValue('--ui-body-font').trim(),
    displayRole: getComputedStyle(element.querySelector('.pu-shell')!).getPropertyValue('--ui-display-font').trim(),
    loaded: document.fonts.check('16px Georgia'),
  }))
  const normalizeFont = (value: string) => value.replace(/["']/g, '').replace(/\s*,\s*/g, ',').toLowerCase()
  expect(fonts.bodyRole).toMatch(/^Georgia,/)
  expect(fonts.displayRole).toMatch(/^Georgia,/)
  const primaryFont = (value: string) => normalizeFont(value).split(',')[0]
  expect(primaryFont(fonts.button)).toBe(primaryFont(fonts.bodyRole))
  expect(primaryFont(fonts.title)).toBe(primaryFont(fonts.displayRole))
  expect(primaryFont(fonts.text)).toBe(primaryFont(fonts.bodyRole))
  expect(fonts.loaded).toBe(true)
  const screenshot = await page.screenshot({ path: test.info().outputPath(isMobile ? 'menu-phone.png' : 'menu-1920x1080.png') })
  await test.info().attach('Menù Aurora con nove destinazioni e tipografia serif', { body: screenshot, contentType: 'image/png' })
  for (const [label, id, region] of utilities) {
    await dialog.getByRole('button', { name: `Apri ${label}`, exact: true }).click()
    await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen', id)
    await expect(dialog.getByRole('region', { name: region, exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Riprendi il Viaggio', exact: true })).toHaveCount(1)
    await expect(dialog.getByRole('button', { name: /^(Chiudi|Riprendi)$/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Menù Partita', exact: true }).click()
  }
  for (const screen of ['Deposito', 'Analisi']) {
    await dialog.getByRole('button', { name: screen, exact: true }).click()
    await expect(dialog.locator('.pu-content').getByRole('status').filter({ hasText: 'Caricamento…' })).toHaveCount(0)
    await expect(dialog.locator('.pu-content')).not.toContainText(/\bXP\b|Esperienza/)
  }
  await dialog.getByRole('button', { name: 'Riprendi il Viaggio', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Partita', exact: true })).toBeFocused()
  expect(await campaign(page)).toEqual(before)
})
