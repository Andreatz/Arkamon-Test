import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function seed(context: BrowserContext, names = false, recent = false) {
  await context.addInitScript(({ names, recent }) => {
    if (localStorage.getItem('roadmap-fixture')) return
    const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Melia iniziale' : 'Maggi', squadra: names ? [] : [{
      istanzaId: `roadmap-${id}`, specieId: id === 1 ? 1 : 5, nome: id === 1 ? 'Vyrath' : 'Darklaw', livello: 10, hp: 8, xp: 0,
    }], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: id === 1 ? 700 : 125, inventario: { potion: 2, masterball: 1 } })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
      giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, battaglia: null, rivaleStarterId: 9,
      posizione1: position, posizione2: position, posizioniLocali1: { Venezia: 'n56' }, posizioniLocali2: { Venezia: 'n56' },
      scenaCorrente: { scena: names ? 'laboratorio' : 'mappa-principale' }, scenaPrecedente: null,
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, audioMuted: true,
      ...(recent ? { matchLog: { version: 1, nextSequence: 7, events: Array.from({length:6}, (_, i) => ({id:`recent-${i}`, sequence:i+1, at:Date.UTC(2026,9,18,12,i), kind:'move', playerId: i%2 ? 2 : 1, title:`Spostamento ${i+1}`, message:'Movimento registrato lungo il percorso di Venezia, con consumo di una singola azione e conservazione della squadra.', place:'Venezia'})) } } : {}),
    } }))
    localStorage.setItem('arkamon-interactions-v1', JSON.stringify({ version: 0, state: { interactions: [{
      id: 'roadmap-shop', mapId: 'Venezia', nodeId: 'n56', title: 'Arkastore originale', dialogue: 'NARRATIVE_PRIVATE_CANARY',
      scope: 'player', enabled: true, repeatable: true,
      requirements: { gymIds: [], minLevel: 0, minCoins: 0, items: {}, completedInteractions: [] },
      cost: { coins: 0, items: {} }, reward: { coins: 0, items: {} }, action: { kind: 'shop' },
    }] } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, reducedMotion: 'on', animationSpeed: 'fast' } }))
    localStorage.setItem('roadmap-fixture', 'ready')
  }, { names, recent })
}
const checkpoint = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-save')!))
const mode = (page: Page) => page.evaluate(async () => {
  const path = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => new URL(name).pathname === '/src/session/sessionOwnership.ts').at(-1)!
  return (await import(path)).getSessionOwnership().mode as string
})
async function ownerReady(page: Page) {
  await expect.poll(() => mode(page)).toBe('owner')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
}
async function admin(page: Page) {
  const panel = page.getByRole('region', { name: 'Modalità Admin', exact: true })
  if (!await panel.isVisible()) await page.getByRole('button', { name: 'Partita', exact: true }).press('Control+Shift+a')
  await expect(panel).toBeVisible()
  await panel.getByRole('navigation', { name: 'Sezioni Admin' }).getByRole('button', { name: 'Regia', exact: true }).click()
  await expect(panel.getByRole('region', { name: 'Regia e preparazione della sessione', exact: true })).toBeVisible()
  return panel
}

test('only one tab writes; closing it transfers the latest checkpoint before commands are enabled', async ({ page, context }) => {
  await seed(context, true)
  await page.goto('/'); await ownerReady(page)
  const secondary = await context.newPage()
  await secondary.goto('/')
  await expect.poll(() => mode(secondary)).toBe('readonly')
  await expect(secondary.locator('[data-broadcast-view]')).toBeVisible()
  await expect(secondary.locator('[data-presented-scene]')).toHaveCount(0)
  await expect(secondary.getByRole('button', { name: 'Continua', exact: true })).toHaveCount(0)
  await page.getByLabel('Giocatore 1', { exact: true }).fill('Melia aggiornata')
  await page.getByLabel('Giocatore 2', { exact: true }).fill('Maggi aggiornata')
  await page.getByRole('button', { name: 'Continua', exact: true }).click()
  await expect.poll(async () => (await checkpoint(page)).state.giocatore1.nome).toBe('Melia aggiornata')
  const saved = await checkpoint(page)
  expect(saved.arkamonSession.revision).toBeGreaterThan(0)
  // Adversarial integration calls must fail even without the UI guard.
  await secondary.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => new URL(name).pathname === '/src/store/gameStore.ts').at(-1)!
    const { useGameStore } = await import(path)
    useGameStore.getState().aggiornaMonete(1, 999)
    useGameStore.setState({ giocatore1: { ...useGameStore.getState().giocatore1, nome: 'STALE OVERWRITE' } })
  })
  expect(await checkpoint(secondary)).toEqual(saved)
  await page.close()
  await secondary.bringToFront()
  await ownerReady(secondary)
  await expect(secondary.getByLabel('Giocatore 1', { exact: true })).toHaveValue('Melia aggiornata')
  await expect(secondary.getByLabel('Giocatore 2', { exact: true })).toHaveValue('Maggi aggiornata')
  await secondary.getByLabel('Giocatore 1', { exact: true }).fill('Melia nuova console')
  await secondary.getByRole('button', { name: 'Continua', exact: true }).click()
  const next = await checkpoint(secondary)
  expect(next.state.giocatore1).toMatchObject({ nome: 'Melia nuova console', monete: 700 })
  expect(next.arkamonSession.revision).toBeGreaterThan(saved.arkamonSession.revision)
  expect(next.arkamonSession.writer).not.toBe(saved.arkamonSession.writer)
})

test('the public view never owns the game, receives only public state and stays passive after the console closes', async ({ page, context }) => {
  await seed(context)
  await page.addInitScript(() => {
    const frames: unknown[] = []
    Object.assign(window, { roadmapPublicFrames: frames })
    new BroadcastChannel('arkamon-public-presentation-v1').addEventListener('message', event => { if (event.data?.kind === 'snapshot') frames.push(event.data.snapshot) })
  })
  await page.goto('/?view=broadcast')
  await expect.poll(() => mode(page)).toBe('viewer')
  await expect(page.getByRole('heading', { name: 'Arkamon · In onda' })).toBeVisible()
  const console = await context.newPage()
  await console.goto('/'); await ownerReady(console)
  await expect(page.locator('[data-broadcast-view]')).toHaveAttribute('data-broadcast-connected', 'true')
  await expect(page.getByRole('complementary', { name: 'Stato della gara' })).toContainText('Melia iniziale')
  await expect(page.locator('[data-admin-overlay], [data-presented-scene]')).toHaveCount(0)
  await expect(page.getByRole('button')).toHaveCount(0)
  const captured = await page.evaluate(() => (window as unknown as { roadmapPublicFrames: unknown[] }).roadmapPublicFrames)
  expect(captured.length).toBeGreaterThan(0)
  const text = JSON.stringify(captured)
  for (const privateKey of ['NARRATIVE_PRIVATE_CANARY', 'inventario', 'cespugliVisitati', 'hostToken', 'joinUrls', 'challengeContext', 'arkamonSession', 'arkamon-interactions']) expect(text).not.toContain(privateKey)
  const before = await checkpoint(console)
  await console.getByRole('button', { name: 'Passa turno', exact: true }).click()
  await expect.poll(async () => (await checkpoint(console)).state.giocatoreAttivo).toBe(2)
  await expect(page.locator('[aria-label="Stato della gara"] [data-active="true"]')).toContainText('Maggi')
  expect((await checkpoint(console)).arkamonSession.revision).toBeGreaterThan(before.arkamonSession?.revision ?? 0)
  await console.close()
  await expect(page.locator('[data-broadcast-view]')).toHaveAttribute('data-broadcast-connected', 'false', { timeout: 12_000 })
  expect(await mode(page)).toBe('viewer')
})

test('regia pauses between actions without changing durable state and resumes from the same turn', async ({ page, context }) => {
  await seed(context); await page.goto('/'); await ownerReady(page)
  const panel = await admin(page)
  await expect(panel.getByRole('button', { name: 'Pausa di regia', exact: true })).toBeEnabled()
  const before = await checkpoint(page)
  await panel.getByRole('button', { name: 'Pausa di regia', exact: true }).click()
  const paused = page.getByRole('dialog', { name: 'Pausa di regia', exact: true })
  await expect(paused).toBeVisible()
  await expect(page.locator('[data-presented-scene]')).toHaveJSProperty('inert', true)
  await page.keyboard.press('Enter')
  expect(await checkpoint(page)).toEqual(before)
  if (await paused.isVisible()) await paused.getByRole('button', { name: 'Riprendi la regia', exact: true }).click()
  await expect(paused).toHaveCount(0)
  await panel.getByRole('button', { name: 'Chiudi', exact: true }).click()
  await page.getByRole('button', { name: 'Passa turno', exact: true }).click()
  await expect.poll(async () => (await checkpoint(page)).state.giocatoreAttivo).toBe(2)
})

test('an unreadable checkpoint keeps its recovery warning during lock-held startup without overwriting the disk', async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('arkamon-save', '{ unreadable checkpoint')
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, reducedMotion: 'on' } }))
  })
  await page.goto('/'); await ownerReady(page)
  await expect(page.getByText('Alcuni dati del salvataggio sono stati recuperati. Controlla gli avvisi prima di continuare.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Mostra dettagli', exact: true }).click()
  await expect(page.getByText('Il salvataggio non è leggibile. Importa un backup per recuperare i progressi, oppure avvia una nuova partita.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe('{ unreadable checkpoint')
  expect(await mode(page)).toBe('owner')
})

test('an external checkpoint conflict rejects a direct integration setter before publishing stale memory', async ({ page, context }) => {
  await seed(context); await page.goto('/'); await ownerReady(page)
  const result = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => new URL(name).pathname === '/src/store/gameStore.ts').at(-1)!
    const { useGameStore } = await import(path)
    const beforeName = useGameStore.getState().giocatore1.nome
    const saved = JSON.parse(localStorage.getItem('arkamon-save')!)
    saved.state.giocatore1.nome = 'External latest checkpoint'
    localStorage.setItem('arkamon-save', JSON.stringify(saved))
    useGameStore.setState({ giocatore1: { ...useGameStore.getState().giocatore1, nome: 'Stale integration' } })
    return { beforeName, afterName: useGameStore.getState().giocatore1.nome, diskName: JSON.parse(localStorage.getItem('arkamon-save')!).state.giocatore1.nome }
  })
  expect(result.afterName).toBe(result.beforeName)
  expect(result.diskName).toBe('External latest checkpoint')
  await expect.poll(() => mode(page)).toBe('conflict')
  await expect(page.locator('[data-presented-scene]')).toHaveCount(0)
})

test('configuration import, subsequent editing and backup restore retain a writable fenced catalog', async ({ page, context }) => {
  test.setTimeout(90_000)
  await seed(context); await page.goto('/'); await ownerReady(page)
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await dialog.getByRole('button', { name: 'Apri Salvataggio', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Scarica backup partita', exact: true }).click()
  const download = await downloading
  const backup = await readFile((await download.path())!, 'utf8')
  await dialog.getByRole('button', { name: 'Riprendi il Viaggio', exact: true }).click()
  const before = (await checkpoint(page)).state
  const panel = await admin(page)
  const config = { format: 'arkamon-campaign-configuration', version: 1, name: 'Configurazione QA', league: null,
    catalog: { version: 1, interactions: [{ id: 'roadmap-shop', mapId: 'Venezia', nodeId: 'n56', title: 'Arkastore importato', dialogue: 'Configurazione locale verificata.',
      scope: 'player', enabled: true, repeatable: true, requirements: { gymIds: [], minLevel: 0, minCoins: 0, items: {}, completedInteractions: [] },
      cost: { coins: 0, items: {} }, reward: { coins: 0, items: {} }, action: { kind: 'shop' } }] } }
  await panel.getByLabel('Importa configurazione campagna', { exact: true }).setInputFiles({ name: 'config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) })
  await expect(panel.getByLabel('Anteprima configurazione campagna', { exact: true })).toContainText('Configurazione QA')
  await panel.getByRole('button', { name: 'Applica configurazione verificata', exact: true }).click()
  await expect(panel).toContainText('Configurazione applicata')
  const after = (await checkpoint(page)).state
  for (const key of ['giocatore1', 'giocatore2', 'posizione1', 'posizione2', 'turnoOverworld']) expect(after[key]).toEqual(before[key])
  await panel.getByRole('navigation', { name: 'Sezioni Admin' }).getByRole('button', { name: 'Interazioni', exact: true }).click()
  const editor = panel.getByRole('region', { name: 'Editor delle interazioni', exact: true })
  const select = editor.getByRole('combobox', { name: 'Interazione esistente', exact: true })
  await expect(select).toBeVisible()
  await select.selectOption(await select.getByRole('option', { name: /Arkastore importato/ }).getAttribute('value') ?? '')
  await editor.getByLabel('Titolo', { exact: true }).fill('Arkastore modificato')
  await editor.getByRole('button', { name: 'Salva interazione', exact: true }).click()
  await expect(editor).toContainText('Interazione salvata.')
  await panel.getByRole('button', { name: 'Chiudi', exact: true }).click()
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  await dialog.getByRole('button', { name: 'Apri Salvataggio', exact: true }).click()
  await dialog.getByLabel('Importa backup partita', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  await expect(dialog.getByLabel('Anteprima ripristino')).toBeVisible()
  await dialog.getByRole('checkbox', { name: /Confermo la sostituzione/ }).check()
  await dialog.getByRole('button', { name: 'Ripristina questa partita', exact: true }).click()
  await ownerReady(page)
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Riprendi il Viaggio', exact: true }).click()
  const again = await admin(page)
  await again.getByRole('navigation', { name: 'Sezioni Admin' }).getByRole('button', { name: 'Interazioni', exact: true }).click()
  const restored = again.getByRole('region', { name: 'Editor delle interazioni', exact: true })
  const restoredSelect = restored.getByRole('combobox', { name: 'Interazione esistente', exact: true })
  await expect(restoredSelect).toBeVisible()
  await restoredSelect.selectOption(await restoredSelect.getByRole('option', { name: /Arkastore originale/ }).getAttribute('value') ?? '')
  await expect(restored.getByLabel('Titolo', { exact: true })).toHaveValue('Arkastore originale')
  await restored.getByLabel('Titolo', { exact: true }).fill('Modifica dopo ripristino')
  await restored.getByRole('button', { name: 'Salva interazione', exact: true }).click()
  await expect(restored).toContainText('Interazione salvata.')
  expect(await mode(page)).toBe('owner')
  const catalog = await page.evaluate(() => JSON.parse(localStorage.getItem('arkamon-interactions-v1')!))
  expect(catalog.state.interactions[0].title).toBe('Modifica dopo ripristino')
  expect(catalog.arkamonSession.revision).toBeGreaterThan(0)
})


test('Register keeps the three archives; Race and Recap fit one 1080p screen without changing the campaign', async ({ page, context }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await seed(context, false, true); await page.goto('/'); await ownerReady(page)
  const before = await checkpoint(page)
  await page.getByRole('button', {name:'Partita',exact:true}).click()
  const dialog = page.getByRole('dialog',{name:'La tua partita',exact:true})
  await expect(dialog.locator('.pu-menu-tile')).toHaveCount(9)
  for (const [label, region] of [['Gara','Situazione della gara'], ['Ripresa','Ripresa della sessione']]) {
    await dialog.getByRole('button',{name:`Apri ${label}`,exact:true}).click()
    await expect(dialog.getByRole('region',{name:region,exact:true})).toBeVisible()
    const metrics = await dialog.locator('.pu-content').evaluate(element => ({content:element.scrollHeight,height:element.clientHeight,bottom:element.getBoundingClientRect().bottom,viewport:innerHeight}))
    expect(metrics.content).toBeLessThanOrEqual(metrics.height+2)
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewport)
    if (label === 'Ripresa') {
      await expect(dialog.locator('.pu-recap-events li')).toHaveCount(2)
      const titles: string[] = []
      const pages = dialog.getByRole('navigation', { name: 'Pagine degli ultimi eventi' })
      for (let index = 0; index < 3; index++) {
        titles.push(...await dialog.locator('.pu-recap-events li strong').allTextContents())
        if (index < 2) await pages.getByRole('button', { name: 'Successivi', exact: true }).click()
      }
      expect(new Set(titles).size).toBe(6)
      await expect(pages.getByRole('button', { name: 'Successivi', exact: true })).toBeDisabled()
      await test.info().attach('Ripresa · 1920×1080',{body:await page.screenshot(),contentType:'image/png'})
    }
    await dialog.getByRole('button',{name:'Menù Partita',exact:true}).click()
  }
  await dialog.getByRole('button',{name:'Apri Registro',exact:true}).click()
  const tabs = dialog.getByRole('navigation',{name:'Archivi del registro',exact:true})
  for (const [label, region] of [['Diario','Diario dei giocatori'], ['Eventi del match','Registro del match'], ['Cronache delle battaglie','Cronache delle battaglie']]) {
    await tabs.getByRole('button',{name:label,exact:true}).click()
    await expect(dialog.getByRole('region',{name:region,exact:true})).toBeVisible()
  }
  await dialog.getByRole('button',{name:'Arkadex',exact:true}).click()
  await expect(dialog.getByLabel('Giocatore dell’Arkadex')).toHaveCount(0)
  await dialog.getByRole('group',{name:'Giocatore degli strumenti',exact:true}).getByRole('button').nth(1).click()
  await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-player','2')
  await dialog.getByRole('button',{name:'Borsa',exact:true}).click()
  await expect(dialog.getByLabel('Giocatore della borsa')).toHaveCount(0)
  expect(await checkpoint(page)).toEqual(before)
})

test('new management views are also available as real editable Studio screens', async ({page}) => {
  await page.setViewportSize({width:1920,height:1080})
  await page.goto('/#ui-studio')
  const preview = page.frameLocator('.uis-canvas iframe')
  for (const [screen, region] of [['register','Registro della partita'],['race','Situazione della gara'],['recap','Ripresa della sessione']]) {
    await page.getByLabel('Schermata da modificare',{exact:true}).selectOption(screen)
    await expect(preview.getByRole('region',{name:region,exact:true})).toBeVisible()
    await expect(page.locator('.uis-layer').first()).toBeVisible()
  }
})

for (const viewport of [{width:1920,height:1080},{width:1280,height:640}]) {
  test(`public map preserves real roads and round separate player markers at ${viewport.width}x${viewport.height}`, async ({page,context}) => {
    await seed(context); await page.goto('/'); await ownerReady(page)
    const saved = await checkpoint(page)
    // Ownership can settle before the lazy map/image geometry is ready.
    await expect.poll(() => page.locator('[data-main-map-root] svg path[stroke="#e5e5e5"]').count()).toBeGreaterThan(20)
    const realRoads = await page.locator('[data-main-map-root] svg path[stroke="#e5e5e5"]').evaluateAll(paths => paths.map(path =>
      (path.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)))
    expect(realRoads.length).toBeGreaterThan(20)
    const screen = await context.newPage()
    await screen.setViewportSize(viewport); await screen.goto('/?view=broadcast')
    await expect(screen.locator('[data-broadcast-view]')).toHaveAttribute('data-broadcast-connected','true')
    const map = screen.locator('.arka-public-map')
    await expect.poll(() => map.evaluate((svg: SVGSVGElement) => Math.round(svg.viewBox.baseVal.width))).toBe(viewport.width)
    const publicRoads = await map.locator('[data-public-road]').evaluateAll(roads => roads.map(road => {
      const svg = (road as SVGElement).ownerSVGElement!
      const {width,height} = svg.viewBox.baseVal
      return (road.getAttribute('points')!.match(/-?\d+(?:\.\d+)?/g) ?? []).map((value,i) => Number(value) * 100 / (i%2 ? height : width))
    }))
    expect(publicRoads).toHaveLength(realRoads.length)
    for (let i=0;i<realRoads.length;i++) {
      expect(publicRoads[i]).toHaveLength(realRoads[i].length)
      realRoads[i].forEach((coordinate,j) => expect(publicRoads[i][j]).toBeCloseTo(coordinate,4))
    }
    const markers = await map.locator('circle[data-public-player]').evaluateAll(circles => circles.map(circle => {
      const box = circle.getBoundingClientRect()
      return {x:box.x,y:box.y,w:box.width,h:box.height}
    }))
    expect(markers).toHaveLength(2)
    markers.forEach(marker => expect(Math.abs(marker.w-marker.h)).toBeLessThan(1))
    expect(markers[0].x+markers[0].w).toBeLessThan(markers[1].x)
    await expect(map).not.toContainText('Melia iniziale')
    await expect(screen.getByRole('complementary',{name:'Stato della gara'})).toContainText('Melia iniziale')
    await expect(screen.getByRole('button')).toHaveCount(0)
    expect(await checkpoint(page)).toEqual(saved)
  })
}
