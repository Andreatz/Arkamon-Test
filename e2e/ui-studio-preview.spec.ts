import { expect, test, type Page } from '@playwright/test'
import { UI_STUDIO_SCREENS, UI_STUDIO_SCREEN_VIEWS, type UiDesignDocument, type UiScreenSnapshot } from '../src/ui-studio/types'

async function launchStudio(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(() => {
    if (new URLSearchParams(location.search).has('uiStudioPreview')) return
    const creature = { istanzaId: 'studio-protected-campaign', specieId: 1, nome: 'Compagno da preservare', livello: 5, hp: 7, xp: 0 }
    const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Campagna Melia' : 'Campagna Maggi', squadra: [creature], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 731, inventario: { potion: 2 } })
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, posizione1: { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }, posizione2: { mappaId: 'mappa-principale', luogo: 'Pordenone', x: 0, y: 0, direzione: 'S' }, scenaCorrente: { scena: 'titolo' }, scenaPrecedente: null, battaglia: null, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true, rivaleStarterId: 9 } }))
    localStorage.setItem('arkamon-automatic-backups-v1', 'preserved-automatic-backups')
    localStorage.setItem('arkamon-active-challenge-v1', 'preserved-active-challenge')
    const target = window as typeof window & { studioMessages: unknown[] }
    target.studioMessages = []
    window.addEventListener('message', event => { if (event.origin === location.origin && event.data?.source === 'arkamon-ui-preview') target.studioMessages.push(event.data) })
  })
  await page.goto('/#ui-studio')
  await expect(page.getByLabel('Schermata da modificare', { exact: true })).toBeVisible()
  await expect(page.locator('.uis-layers .uis-layer')).not.toHaveCount(0)
}
async function lastSnapshot(page: Page, screen: string): Promise<UiScreenSnapshot | null> {
  return page.evaluate(screenId => {
    const target = window as typeof window & { studioMessages: { type: string; snapshot?: UiScreenSnapshot }[] }
    return [...target.studioMessages].reverse().find(message => message.type === 'snapshot' && message.snapshot?.screenId === screenId)?.snapshot ?? null
  }, screen)
}
async function sendDesign(page: Page, design: UiDesignDocument) {
  await page.evaluate(document => {
    const iframe = window.document.querySelector('iframe')!
    iframe.contentWindow!.postMessage({ source: 'arkamon-ui-studio', type: 'design', design: document }, location.origin)
  }, design)
}
async function protectedStorage(page: Page) {
  return page.evaluate(() => Object.fromEntries(['arkamon-save', 'arkamon-automatic-backups-v1', 'arkamon-active-challenge-v1'].map(key => [key, localStorage.getItem(key)])))
}

test.describe('isolated real-screen UI Studio preview', () => {
  test.skip(({ isMobile }) => isMobile, 'The desktop design canvas is fixed at 1920 × 1080.')
  test('all current real screens register editable elements without writing the campaign or its backups', async ({ page }) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await launchStudio(page)
    const before = await protectedStorage(page)
    const preview = page.frameLocator('iframe')
    await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('titolo')
    for (const [screen] of UI_STUDIO_SCREENS) {
      await page.getByLabel('Schermata da modificare', { exact: true }).selectOption(screen)
      await expect(preview.locator('[data-ui-studio-preview-screen]')).toHaveAttribute('data-ui-studio-preview-screen', screen)
      await expect.poll(async () => (await lastSnapshot(page, screen))?.elements.length ?? 0, { message: `${screen} must register its actual controls` }).toBeGreaterThan(3)
      const snapshot = (await lastSnapshot(page, screen))!
      expect(snapshot.width, `${screen} width`).toBe(1920)
      expect(snapshot.height, `${screen} height`).toBe(1080)
      expect(new Set(snapshot.elements.map(element => element.id)).size, `${screen} stable unique IDs`).toBe(snapshot.elements.length)
      for (const element of snapshot.elements) for (const value of Object.values(element.rect)) expect(Number.isFinite(value), `${screen}/${element.id} coordinates`).toBe(true)
      if (screen === 'squadra') await expect(preview.locator('.pu-team-slot')).toHaveCount(6)
      if (screen === 'deposito') await expect(preview.locator('.pu-box-grid>.pu-box-slot')).toHaveCount(35)
      if (screen === 'citta' || screen === 'percorso') await expect(preview.locator('.local-map-scene')).toBeVisible()
      expect(await protectedStorage(page), `${screen} must leave all protected storage unchanged`).toEqual(before)
    }
    expect(errors).toEqual([])
  })
  test('geometry, typography, artwork and backgrounds use real root coordinates and remain reversible', async ({ page }) => {
    await launchStudio(page)
    const before = await protectedStorage(page)
    const preview = page.frameLocator('iframe')
    await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('titolo')
    await expect.poll(async () => (await lastSnapshot(page, 'titolo'))?.elements.some(element => element.id === 'logo')).toBe(true)
    const command = (await lastSnapshot(page, 'titolo'))!.elements.find(element => element.kind === 'button')!
    const defaultDesign: UiDesignDocument = { version: 1, typography: { body: { family: 'norwester' }, heading: { family: 'norwester' }, button: { family: 'norwester' } }, screens: {}, media: [] }
    const design: UiDesignDocument = { ...defaultDesign, screens: { titolo: { background: { asset: '/backgrounds/venezia.png', fit: 'cover', opacity: .65, color: '#123456' }, elements: { logo: { rect: { x: 25, y: 10, w: 50, h: 15 }, opacity: .8 }, [command.id]: { rect: { x: 35, y: 65, w: 30, h: 9 }, asset: '/ui/player-kit/button-default.svg', fit: 'contain', text: 'Comando dimostrativo', font: { family: 'system', size: 28, color: '#ffcc00' } } }, layers: [{ id: 'demo-label', kind: 'text', label: 'Testo esempio', rect: { x: 5, y: 85, w: 30, h: 5 }, text: 'Layout di esempio', font: { family: 'norwester', size: 24 } }] } } }
    await sendDesign(page, design)
    const logo = preview.locator('[data-ui-id="logo"]')
    await expect(logo).toHaveCSS('opacity', '0.8')
    await expect.poll(async () => {
      const item = (await lastSnapshot(page, 'titolo'))?.elements.find(element => element.id === 'logo')
      return item ? Math.round(item.rect.x * 100) / 100 : -1
    }).toBe(25)
    await expect(preview.locator(`[data-ui-id="${command.id}"]`)).toContainText('Comando dimostrativo')
    await expect(preview.locator(`[data-ui-id="${command.id}"]`)).toHaveCSS('font-size', '28px')
    await expect(preview.locator('[data-ui-runtime-owned="background"]')).toHaveCSS('opacity', '0.65')
    await expect(preview.locator('[data-ui-id="demo-label"]')).toHaveText('Layout di esempio')
    await preview.locator(`[data-ui-id="${command.id}"]`).click({ force: true })
    await expect(preview.locator('[data-ui-studio-preview-screen]')).toHaveAttribute('data-ui-studio-preview-screen', 'titolo')
    expect(await protectedStorage(page)).toEqual(before)
    await sendDesign(page, defaultDesign)
    await expect(logo).toHaveCSS('opacity', '1')
    await expect(preview.locator('[data-ui-id="demo-label"]')).toHaveCount(0)
    await expect(preview.locator(`[data-ui-id="${command.id}"]`)).not.toContainText('Comando dimostrativo')
    expect(await protectedStorage(page)).toEqual(before)
  })
  test('structural IDs and original sprite/text restoration survive a real React species update', async ({ page }) => {
    await launchStudio(page)
    const before = await protectedStorage(page)
    await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('analisi')
    const preview = page.frameLocator('iframe')
    const name = preview.locator('.pu-hero-caption h2')
    const art = preview.locator('.pu-hero .pu-creature-art')
    await expect(name).toHaveAttribute('data-ui-id', /.+/)
    await expect(art).toHaveAttribute('data-ui-id', /.+/)
    const nameId = (await name.getAttribute('data-ui-id'))!, artId = (await art.getAttribute('data-ui-id'))!
    const defaultDesign: UiDesignDocument = { version: 1, typography: { body: { family: 'norwester' }, heading: { family: 'norwester' }, button: { family: 'norwester' } }, screens: {}, media: [] }
    await sendDesign(page, { ...defaultDesign, screens: { analisi: { elements: { [nameId]: { text: 'Nome scenico' }, [artId]: { asset: '/ui/reference-png/search-icon.webp', fit: 'contain' } }, layers: [] } } })
    await expect(name).toHaveText('Nome scenico')
    await expect(art.locator('image')).toHaveAttribute('href', /search-icon\.webp$/)
    const frame = page.frames().find(frame => frame.url().includes('uiStudioPreview=1'))!
    await frame.evaluate(async () => {
      const resources = performance.getEntriesByType('resource').map(entry => entry.name).filter(url => /\/src\/store\/gameStore\.ts(?:\?|$)/.test(url))
      const path = resources[resources.length - 1] || '/src/store/gameStore.ts'
      const { useGameStore } = await import(path)
      const state = useGameStore.getState()
      useGameStore.setState({ giocatore1: { ...state.giocatore1, nome: 'Nome giocatore aggiornato', squadra: [{ ...state.giocatore1.squadra[0], specieId: 5, nome: 'Compagno aggiornato da React', hp: 4 }, ...state.giocatore1.squadra.slice(1)] } })
    })
    await expect(preview.locator('.pu-player-switch')).toContainText('Nome giocatore aggiornato')
    await expect(name).toHaveText('Nome scenico')
    await expect(art.locator('image')).toHaveAttribute('href', /search-icon\.webp$/)
    await expect(name).toHaveAttribute('data-ui-id', nameId)
    await expect(art).toHaveAttribute('data-ui-id', artId)
    await sendDesign(page, defaultDesign)
    await expect(name).toHaveText('Compagno aggiornato da React')
    await expect(art.locator('image')).toHaveAttribute('href', /front_sprites\/5\.png$/)
    expect(await protectedStorage(page)).toEqual(before)
  })
  test('named internal views render real analysis and Arkadex tabs and inherit only their base design', async ({ page }) => {
    await launchStudio(page)
    const before = await protectedStorage(page)
    const preview = page.frameLocator('iframe')
    const design: UiDesignDocument = { version: 1, typography: { body: { family: 'norwester' }, heading: { family: 'norwester' }, button: { family: 'norwester' } }, screens: {
      analisi: { elements: { detail: { opacity: .9 } }, layers: [] },
      'analisi:mosse': { elements: { detail: { opacity: .7 } }, layers: [] },
      battaglia: { elements: {}, layers: [{ id: 'inherited-caption', kind: 'text', label: 'Nota ereditaria', rect: { x: 5, y: 5, w: 30, h: 5 }, text: 'Nota di base' }] },
      'battaglia:dice': { elements: { 'dice.panel': { rect: { x: 20, y: 35, w: 45, h: 40 } }, 'inherited-caption': { text: 'Nota dei dadi', rect: { x: 10, y: 10, w: 30, h: 5 } } }, layers: [] },
      'battaglia:bag': { elements: { 'battle-bag.dialog': { rect: { x: 15, y: 10, w: 60, h: 80 } } }, layers: [] },
    }, media: [] }
    await sendDesign(page, design)
    for (const [screen, selector, value] of [['analisi:mosse', '.pu-analysis-screen', 'mosse'], ['analisi:status', '.pu-analysis-screen', 'status'], ['arkadex:moves', '.pu-dex-screen', 'moves'], ['arkadex:evolution', '.pu-dex-screen', 'evolution']] as const) {
      await page.evaluate(key => window.document.querySelector('iframe')!.contentWindow!.postMessage({ source: 'arkamon-ui-studio', type: 'screen', screen: key }, location.origin), screen)
      await expect(preview.locator(selector)).toHaveAttribute('data-ui-view', value)
      await expect.poll(async () => (await lastSnapshot(page, screen))?.elements.length ?? 0).toBeGreaterThan(10)
      if (screen === 'analisi:mosse') await expect(preview.locator('.pu-detail-panel').first()).toHaveCSS('opacity', '0.7')
      if (screen === 'analisi:status') await expect(preview.locator('.pu-detail-panel').first()).toHaveCSS('opacity', '0.9')
      expect(await protectedStorage(page)).toEqual(before)
    }
    await page.evaluate(() => window.document.querySelector('iframe')!.contentWindow!.postMessage({ source: 'arkamon-ui-studio', type: 'screen', screen: 'battaglia:dice' }, location.origin))
    await expect(preview.locator('.battle-dice-panel')).toBeVisible()
    await expect(preview.locator('.battle-die')).toHaveCount(3)
    await expect(preview.locator('[data-dice-revealed]')).toHaveAttribute('data-dice-revealed', 'true')
    await expect(preview.locator('[data-ui-id="inherited-caption"]')).toHaveText('Nota dei dadi')
    await expect.poll(async () => (await lastSnapshot(page, 'battaglia:dice'))?.elements.find(element => element.id === 'dice.panel')?.rect.w ?? 0).toBeGreaterThan(10)
    await expect.poll(async () => Math.round((await lastSnapshot(page, 'battaglia:dice'))?.elements.find(element => element.id === 'dice.panel')?.rect.x ?? -1)).toBe(20)
    await page.evaluate(() => window.document.querySelector('iframe')!.contentWindow!.postMessage({ source: 'arkamon-ui-studio', type: 'screen', screen: 'battaglia:bag' }, location.origin))
    await expect(preview.getByRole('dialog', { name: 'Borsa in battaglia', exact: true })).toBeVisible()
    await expect.poll(async () => (await lastSnapshot(page, 'battaglia:bag'))?.elements.some(element => element.id === 'battle-bag.dialog')).toBe(true)
    await expect.poll(async () => Math.round((await lastSnapshot(page, 'battaglia:bag'))?.elements.find(element => element.id === 'battle-bag.dialog')?.rect.x ?? -1)).toBe(15)
    const bagSnapshot = (await lastSnapshot(page, 'battaglia:bag'))!
    expect([bagSnapshot.width, bagSnapshot.height]).toEqual([1920, 1080])
    await expect(preview.locator('[data-ui-id="inherited-caption"]')).toHaveText('Nota di base')
    expect(await protectedStorage(page)).toEqual(before)
  })
  test('every city and route has an independent real map preview, including the isolated secret location', async ({ page }) => {
    test.setTimeout(120_000)
    await launchStudio(page)
    const before = await protectedStorage(page)
    const preview = page.frameLocator('iframe')
    for (const base of ['citta', 'percorso']) for (const [view] of UI_STUDIO_SCREEN_VIEWS[base]) {
      if (view === 'default') continue
      const screen = `${base}:${view}`
      await page.evaluate(key => window.document.querySelector('iframe')!.contentWindow!.postMessage({ source: 'arkamon-ui-studio', type: 'screen', screen: key }, location.origin), screen)
      await expect(preview.locator('.local-map-scene')).toHaveAttribute('aria-label', `Esplorazione ${view.replace(/_/g, ' ')}`)
      await expect.poll(async () => (await lastSnapshot(page, screen))?.elements.length ?? 0).toBeGreaterThan(4)
      const snapshot = (await lastSnapshot(page, screen))!
      expect([snapshot.width, snapshot.height]).toEqual([1920, 1080])
      expect(await protectedStorage(page)).toEqual(before)
    }
  })
})
