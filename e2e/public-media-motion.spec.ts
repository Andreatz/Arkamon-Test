import { expect, test } from '@playwright/test'
import { createPublicRelay } from '../scripts/public-relay.mjs'

test('Tab respects the selected roving grid item and stays inside the real game dialog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  const items = dialog.locator('.ref-menu-grid [data-rpg-item]')
  await expect(items).toHaveCount(9)
  await expect(items.nth(1)).toHaveAttribute('tabindex', '-1')
  await items.first().focus()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => ({
    insideDialog: !!document.activeElement?.closest('[role="dialog"]'),
    insideMenuGrid: !!document.activeElement?.closest('.ref-menu-grid'),
    tabIndex: (document.activeElement as HTMLElement)?.tabIndex,
  }))).toEqual({ insideDialog: true, insideMenuGrid: false, tabIndex: 0 })
  await page.keyboard.press('Shift+Tab')
  await expect(items.first()).toBeFocused()
})

test('separate public profile receives only selected images and the console playback policy, including reconnect', async ({ browser, baseURL, isMobile }) => {
  test.skip(isMobile, 'Two independent desktop Browser Source profiles use the same transport on every viewport.')
  test.setTimeout(120_000)
  const origin = new URL(baseURL!).origin
  let relay = createPublicRelay({ origin, port: 0 })
  const address = await relay.listen()
  const publisher = new URL(baseURL!), viewer = new URL(baseURL!)
  publisher.hash = new URLSearchParams({ publicRelay: new URL(address).host, publish: relay.publishToken }).toString()
  viewer.searchParams.set('view', 'broadcast')
  viewer.hash = new URLSearchParams({ publicRelay: new URL(address).host, viewer: relay.viewerToken }).toString()
  const consoleContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'no-preference' })
  const viewerContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'no-preference' })
  const errors: string[] = []
  try {
    const console = await consoleContext.newPage(), obs = await viewerContext.newPage()
    for (const page of [console, obs]) page.on('pageerror', error => errors.push(error.message))
    await console.addInitScript(() => {
      const first = { istanzaId: 'public-images-a', specieId: 1, nome: 'Vyrath pubblico', livello: 5, hp: 10, xp: 0 }
      const enemy = { ...first, istanzaId: 'public-images-b', specieId: 13, nome: 'Wormaren pubblico', hp: 12 }
      const player = (id: number) => ({ id, nome: id === 1 ? 'Melia pubblica' : 'Maggi pubblica', squadra: id === 1 ? [first] : [], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 0, inventario: { potion: 2 } })
      const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
      localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
        posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
        scenaCorrente: { scena: 'battaglia' }, scenaPrecedente: { scena: 'mappa-principale' },
        battaglia: { tipo: 'Selvatico', pokemonA: first, pokemonB: enemy, squadraA: [first], squadraB: [enemy], hpMaxA: 12, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null,
          checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'player', openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] } },
      } }))
      localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { animationSpeed: 'fast', reducedMotion: 'off', musicVolume: 0, effectsVolume: 0 } }))
    })
    await obs.addInitScript(() => {
      if (!localStorage.getItem('arkamon-preferences-v1')) localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { animationSpeed: 'normal', reducedMotion: 'off', musicVolume: 0, effectsVolume: 0 } }))
    })
    await console.goto(publisher.href)
    await expect(console.locator('[data-presented-scene="battaglia"]')).toHaveAttribute('aria-busy', 'false')
    await console.evaluate(async () => {
      const { importUiMedia } = await import('/src/ui-studio/mediaStorage.ts')
      const { createDefaultDesign } = await import('/src/ui-studio/designModel.ts')
      const { useAdminStore } = await import('/src/store/adminStore.ts')
      const art = (label: string, color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="130"><rect width="600" height="130" fill="${color}"/><text x="20" y="60" fill="white">${label}</text></svg>`
      const frame = await importUiMedia(new File([art('PUBLIC FRAME', '#4c004c')], 'public-frame.svg'))
      const background = await importUiMedia(new File([art('PUBLIC BACKGROUND', '#003c47')], 'public-background.svg'))
      const hidden = await importUiMedia(new File([art('PRIVATE UNSELECTED', '#ff0000')], 'private-library.svg'))
      const design = createDefaultDesign(); design.media = [frame, background, hidden]
      design.screens.battaglia = { elements: { 'layout.hp-nemico': { asset: frame.source, fit: 'fill' }, 'layout.hp-giocatore': { asset: frame.source, fit: 'fill' } }, background: { asset: background.source, fit: 'cover' }, layers: [] }
      if (!useAdminStore.getState().updateDesign(design)) throw new Error('Unable to apply test artwork')
    })
    let failedFirstImage = false
    await obs.route(`${address}/media/*`, async route => {
      if (!failedFirstImage) { failedFirstImage = true; await route.fulfill({ status: 503, body: 'Temporary image failure' }) }
      else await route.continue()
    })
    await obs.goto(viewer.href)
    const publicView = obs.locator('[data-broadcast-view]')
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'true')
    const picture = () => obs.locator('[data-battle-hp-side="enemy"]').evaluate(element => getComputedStyle(element).backgroundImage)
    await expect.poll(picture).toContain('blob:')
    await expect(publicView).toHaveAttribute('data-broadcast-media-errors', '0')
    expect(failedFirstImage).toBe(true)
    const svgText = () => obs.evaluate(async () => {
      const element = document.querySelector('[data-battle-hp-side="enemy"]')
      const value = element && getComputedStyle(element).backgroundImage
      const url = value && /^url\("(blob:[^"]+)"\)$/.exec(value)?.[1]
      return url ? fetch(url).then(response => response.text()).catch(() => '') : ''
    })
    expect(await svgText()).toContain('PUBLIC FRAME')
    const originalFrameUrl = /^url\("(blob:[^"]+)"\)$/.exec(await picture())![1]
    expect(await publicView.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('blob:')
    const native = '[data-sprite-renderer="paged-canvas"][data-sprite-src*="/13/front/idle.webp"]'
    await expect(console.locator(native)).toHaveAttribute('data-sprite-fps', '48')
    await expect(obs.locator(native)).toHaveAttribute('data-sprite-fps', '48')
    const preferences = await obs.evaluate(() => localStorage.getItem('arkamon-preferences-v1'))
    await console.evaluate(async () => (await import('/src/settings/gamePreferences.ts')).useGamePreferences.getState().setPreferences({ animationSpeed: 'normal' }))
    await expect(console.locator(native)).toHaveAttribute('data-sprite-fps', '24')
    await expect(obs.locator(native)).toHaveAttribute('data-sprite-fps', '24')
    await obs.evaluate(async () => {
      const channel = new BroadcastChannel('arkamon-public-presentation-v1')
      channel.postMessage({ kind: 'snapshot', snapshot: { version: 1, scene: 'titolo', players: [{ name: 'LOCAL SESSION' }, { name: 'OTHER' }], battle: null } })
      await new Promise(resolve => setTimeout(resolve, 100)); channel.close()
    })
    await expect(obs.locator('[data-battle-hp-side="enemy"]')).toBeVisible()
    await expect(publicView).not.toContainText('LOCAL SESSION')
    await console.evaluate(async () => {
      const { importUiMedia } = await import('/src/ui-studio/mediaStorage.ts')
      const { useAdminStore } = await import('/src/store/adminStore.ts')
      const frame = await importUiMedia(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="600" height="130"><rect width="600" height="130" fill="blue"/><text x="20" y="60">REPLACEMENT FRAME</text></svg>'], 'replacement.svg'))
      const design = structuredClone(useAdminStore.getState().theme.design!)
      design.media.push(frame)
      design.screens.battaglia.elements['layout.hp-nemico'].asset = frame.source
      design.screens.battaglia.elements['layout.hp-giocatore'].asset = frame.source
      if (!useAdminStore.getState().updateDesign(design)) throw new Error('Unable to replace test artwork')
    })
    await expect.poll(svgText).toContain('REPLACEMENT FRAME')
    expect(await obs.evaluate(url => fetch(url).then(() => true).catch(() => false), originalFrameUrl), 'replaced Blob URLs release their owned memory').toBe(false)
    const restart = { origin, port: Number(new URL(address).port), publishToken: relay.publishToken, viewerToken: relay.viewerToken }
    await relay.close()
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'false', { timeout: 12_000 })
    relay = createPublicRelay(restart); await relay.listen()
    await obs.reload()
    await expect(publicView).toHaveAttribute('data-broadcast-connected', 'true')
    await expect.poll(svgText).toContain('REPLACEMENT FRAME')
    await expect(publicView).toHaveAttribute('data-broadcast-media-errors', '0')
    await expect(obs.getByRole('button')).toHaveCount(0)
    expect(await obs.evaluate(() => localStorage.getItem('arkamon-save'))).toBeNull()
    expect(await obs.evaluate(() => localStorage.getItem('arkamon-preferences-v1'))).toBe(preferences)
    expect(await obs.evaluate(async () => (await indexedDB.databases()).map(database => database.name))).not.toContain('arkamon-ui-media')
    await obs.screenshot({ path: test.info().outputPath('public-images-and-motion.png') })
    expect(errors).toEqual([])
  } finally { await consoleContext.close(); await viewerContext.close(); await relay.close() }
})
