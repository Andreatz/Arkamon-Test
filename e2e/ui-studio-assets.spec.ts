import { expect, test, type Locator, type Page } from '@playwright/test'

const preview = (page: Page) => page.frameLocator('.uis-canvas iframe')

async function openStudio(page: Page, screen = 'battaglia') {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/#ui-studio')
  await expect(page.locator('.uis-layer').first()).toBeVisible()
  await page.getByLabel('Schermata da modificare', { exact: true }).selectOption(screen)
}

async function selectLayer(page: Page, label: string, kind?: string) {
  await page.getByLabel('Cerca elemento', { exact: true }).fill(label)
  let entry = page.locator('.uis-layer').filter({ has: page.locator('strong', { hasText: new RegExp(`^${label}$`) }) })
  if (kind) entry = entry.filter({ hasText: kind })
  await entry.click()
  await expect(page.getByTestId('ui-studio-selection')).toBeVisible()
}

async function chooseAsset(page: Page, name: string, category = 'Comuni') {
  await page.getByRole('button', { name: 'Scegli asset', exact: true }).click()
  const library = page.getByRole('dialog', { name: 'Scegli asset', exact: true })
  await library.getByLabel('Categoria asset', { exact: true }).selectOption(category)
  await library.getByLabel('Cerca asset', { exact: true }).fill(name)
  await library.getByRole('button', { name: `${name} ${category}`, exact: true }).click()
  await expect(library).toBeHidden()
}

async function original(page: Page) {
  await page.getByRole('button', { name: 'Originale', exact: true }).click()
}

async function assertBackground(target: Locator, file: string) {
  // Known HP templates are sanitized into a vector skin with live game data;
  // their data URL records the original library source for comparison.
  await expect.poll(() => target.evaluate(element => {
    const background = getComputedStyle(element).backgroundImage
    try { return decodeURIComponent(background.replace(/%(?![0-9a-f]{2})/gi, '%25')) }
    catch { return background }
  })).toContain(file)
}

test.describe('Studio UI artwork replaces the existing artwork', () => {
  test.skip(({ isMobile }) => isMobile, 'The layout editor is a desktop workspace.')
  test.setTimeout(120_000)

  test('the asset library bounds previews to one page while searching the complete catalog', async ({ page }) => {
    const requestedSplash = new Set<string>()
    page.on('request', request => { if (request.url().includes('/backgrounds/arkamon-splash/')) requestedSplash.add(request.url()) })
    await openStudio(page, 'menu')
    await selectLayer(page, 'Apri Registro')
    await page.getByRole('button', { name: 'Scegli asset', exact: true }).click()
    const library = page.getByRole('dialog', { name: 'Scegli asset', exact: true })
    await expect(library.locator('.uis-asset-grid > button')).toHaveCount(24)
    await library.getByRole('button', { name: 'Asset successivi', exact: true }).click()
    await expect(library.getByRole('status')).toContainText('Pagina 2 /')
    await expect(library.locator('.uis-asset-grid > button')).toHaveCount(24)
    await library.getByLabel('Categoria asset', { exact: true }).selectOption('Splash Arkamon')
    await library.getByLabel('Cerca asset', { exact: true }).fill('109 oniros')
    await expect(library.locator('.uis-asset-grid > button')).toHaveCount(1)
    await expect(library.getByRole('status')).toContainText('Pagina 1 / 1')
    await expect(library.getByRole('button', { name: '109 oniros Splash Arkamon', exact: true })).toBeVisible()
    // A library opening must not eagerly download all 110 full-resolution paintings.
    expect(requestedSplash.size).toBeLessThanOrEqual(49)
  })

  test('the enemy and player HP groups replace their frame and texture while preserving the live bar and labels', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await openStudio(page)
    const enemy = preview(page).locator('[data-ui-id="layout.hp-nemico"]')
    const surface = enemy.locator('[data-ui-asset-surface]').first()
    const texture = surface.locator('[data-ui-asset-decoration]')
    const fill = surface.locator('svg rect')
    const track = surface.locator('[data-ui-hp-track]')
    await assertBackground(surface, '/ui/hp_bar_enemy.png')
    await expect(texture).toBeVisible()
    const labels = (await surface.textContent())!.trim()
    const originalFillWidth = await fill.getAttribute('width')
    const originalTexture = await texture.getAttribute('src')
    const trackGeometry = () => track.evaluate(element => {
      const style = getComputedStyle(element)
      return { left: style.left, top: style.top, width: style.width, height: style.height }
    })
    const originalTrackGeometry = await trackGeometry()

    await selectLayer(page, 'HP nemico')
    await chooseAsset(page, 'hp bar enemy')
    await page.getByRole('combobox', { name: 'Adattamento immagine', exact: true }).selectOption('fill')
    await assertBackground(surface, '/ui/studio/Comuni/hp-bar-enemy.svg')
    await expect(enemy).toHaveCSS('background-image', 'none')
    await expect(texture).toBeHidden()
    await expect(surface.locator('svg')).toBeVisible()
    await expect(fill).toHaveAttribute('width', originalFillWidth!)
    expect((await surface.textContent())!.trim()).toBe(labels)
    await test.info().attach('HP nemico: nuova cornice senza sovrapposizione', { body: await page.screenshot({ path: 'output/ui-studio-asset-replacement.png' }), contentType: 'image/png' })

    // Change the real Zustand color observed by HpBar: React must still own the
    // animated health fill after the editor replaces only the surrounding art.
    await preview(page).locator('body').evaluate(async () => {
      const modulePath = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => new URL(name).pathname === '/src/store/adminStore.ts').at(-1) ?? '/src/store/adminStore.ts'
      const { useAdminStore } = await import(modulePath)
      useAdminStore.getState().updateColor('hpHigh', '#1122ee')
    })
    await expect(fill).toHaveCSS('fill', 'rgb(17, 34, 238)')
    await assertBackground(surface, '/ui/studio/Comuni/hp-bar-enemy.svg')
    expect((await surface.textContent())!.trim()).toBe(labels)

    await original(page)
    await assertBackground(surface, '/ui/hp_bar_enemy.png')
    await expect(texture).toBeVisible()
    await expect(texture).toHaveAttribute('src', originalTexture!)
    await expect(fill).toHaveCSS('fill', 'rgb(17, 34, 238)')
    await expect.poll(trackGeometry).toEqual(originalTrackGeometry)
    await page.getByRole('button', { name: '↶ Annulla', exact: true }).click()
    await assertBackground(surface, '/ui/studio/Comuni/hp-bar-enemy.svg')
    await expect(texture).toBeHidden()
    await page.getByRole('button', { name: '↷ Ripeti', exact: true }).click()
    await assertBackground(surface, '/ui/hp_bar_enemy.png')
    await expect(texture).toBeVisible()

    const player = preview(page).locator('[data-ui-id="layout.hp-giocatore"]')
    const playerSurface = player.locator('[data-ui-asset-surface]').first()
    const playerLabels = (await playerSurface.textContent())!.trim()
    await selectLayer(page, 'HP giocatore')
    await chooseAsset(page, 'hp bar')
    await assertBackground(playerSurface, '/ui/studio/Comuni/hp-bar.svg')
    await expect(player).toHaveCSS('background-image', 'none')
    await expect(playerSurface.locator('[data-ui-asset-decoration]')).toBeHidden()
    await expect(playerSurface.locator('svg[viewBox="0 0 507 40"]')).toBeVisible()
    expect((await playerSurface.textContent())!.trim()).toBe(playerLabels)
    await original(page)
    await assertBackground(playerSurface, '/ui/hp_bar_player.png')
    await expect(playerSurface.locator('[data-ui-asset-decoration]')).toBeVisible()

    await selectLayer(page, 'HP nemico')
    await chooseAsset(page, 'hp bar enemy')
    await page.getByRole('button', { name: 'Applica al gioco', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Layout applicato')
    await page.reload()
    await expect(page.locator('.uis-layer').first()).toBeVisible()
    await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('battaglia')
    await assertBackground(surface, '/ui/studio/Comuni/hp-bar-enemy.svg')
    await expect(texture).toBeHidden()
    await expect(surface.locator('[data-ui-hp-labels]')).toContainText('Darklaw')
    await expect(surface.locator('[data-ui-hp-labels]')).toContainText('LV. 21')
    await expect(surface.locator('[data-ui-hp-value]')).toHaveText('36/36')
    expect(errors).toEqual([])
  })

  test('message groups and direct move buttons replace their own background without losing text and type icons', async ({ page }) => {
    await openStudio(page)
    await preview(page).locator('body').evaluate(async () => {
      const modulePath = '/src/store/adminStore.ts'
      const { useAdminStore } = await import(modulePath)
      useAdminStore.getState().setLayoutEditing(true)
    })
    const infoGroup = preview(page).locator('[data-ui-id="layout.box-messaggi"]')
    const info = infoGroup.locator('[data-ui-asset-surface]').first()
    await assertBackground(info, '/ui/infobox.png')
    const messageLines = info.locator('.battle-message-lines')
    await expect(messageLines).toBeAttached()
    await selectLayer(page, 'Box messaggi', 'Gruppo')
    await chooseAsset(page, 'infobox')
    await assertBackground(info, '/ui/studio/Comuni/infobox.svg')
    await expect(infoGroup).toHaveCSS('background-image', 'none')
    await expect(messageLines).toBeAttached()
    await original(page)
    await assertBackground(info, '/ui/infobox.png')

    const editorCommand = preview(page).getByRole('button', { name: 'Mosse giocatore', exact: true })
    await expect(editorCommand).toBeVisible()
    await expect(editorCommand).toHaveAttribute('data-ui-id', /.+/)
    const editorBackground = await editorCommand.evaluate(element => getComputedStyle(element).backgroundImage)
    const move = preview(page).locator('.battle-move-button').first()
    const moveId = (await move.getAttribute('data-ui-id'))!
    const moveText = (await move.textContent())!.trim()
    const typeIcon = move.locator('img')
    const typeSource = await typeIcon.getAttribute('src')
    await page.getByLabel('Cerca elemento', { exact: true }).fill(moveId)
    // Layout-editing commands can have an ID containing the move's ID. A
    // substring search is only a filter; select the exact registered element.
    const moveLayer = page.locator(`.uis-layer[data-ui-element-id=${JSON.stringify(moveId)}]`)
    await expect(moveLayer).toHaveCount(1)
    await moveLayer.click()
    await expect(moveLayer).toHaveClass(/is-selected/)
    await expect(page.locator('.uis-element-id')).toHaveText(moveId)
    await chooseAsset(page, 'infobox')
    await assertBackground(move, '/ui/studio/Comuni/infobox.svg')
    await expect(editorCommand).toHaveCSS('background-image', editorBackground)
    expect((await move.textContent())!.trim()).toBe(moveText)
    await expect(typeIcon).toBeVisible()
    await expect(typeIcon).toHaveAttribute('src', typeSource!)
    await original(page)
    await assertBackground(move, '/ui/move_button.png')
    await expect(typeIcon).toBeVisible()
  })

  test('the supplied PNG menu frame and title command accept reversible artwork without losing labels', async ({ page }) => {
    await openStudio(page, 'menu')
    const diary = preview(page).locator('[data-ui-id="service.register"]')
    const frame = diary.locator('.ref-menu-card-frame')
    await expect(frame).toHaveAttribute('src', /\/ui\/reference-png\/panel-modular\.webp$/)
    const originalFrame = await frame.getAttribute('src')
    const label = (await diary.textContent())!.trim()
    await selectLayer(page, 'Apri Registro')
    await chooseAsset(page, 'info panel', 'UI PNG fornita')
    // The PNG frame is the declared decoration. An override must replace it,
    // not paint a second panel behind its opaque artwork.
    await expect(frame).toHaveAttribute('src', /\/ui\/reference-png\/info-panel\.webp$/)
    expect((await diary.textContent())!.trim()).toBe(label)
    await page.getByRole('button', { name: 'Applica al gioco', exact: true }).click()
    await page.getByRole('button', { name: 'Esci', exact: true }).click()
    await page.getByRole('button', { name: 'Partita', exact: true }).click()
    await expect(page.locator('[data-ui-id="service.register"] .ref-menu-card-frame')).toHaveAttribute('src', /\/ui\/reference-png\/info-panel\.webp$/)
    await page.reload()
    await page.getByRole('button', { name: 'Partita', exact: true }).click()
    await expect(page.locator('[data-ui-id="service.register"] .ref-menu-card-frame')).toHaveAttribute('src', /\/ui\/reference-png\/info-panel\.webp$/)
    await page.goto('/#ui-studio')
    await expect(page.locator('.uis-layer').first()).toBeVisible()
    await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('menu')
    await selectLayer(page, 'Apri Registro')
    await original(page)
    await expect(frame).toHaveAttribute('src', originalFrame!)
    await page.getByRole('button', { name: 'Applica al gioco', exact: true }).click()
    await chooseAsset(page, 'infobox')
    await expect(frame).toHaveAttribute('src', originalFrame!)
    expect((await diary.textContent())!.trim()).toBe(label)
    await original(page)

    await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('titolo')
    const command = preview(page).locator('button[data-game-button]').first()
    const commandLabel = (await command.textContent())!.trim()
    await selectLayer(page, 'Comando titolo 1')
    await chooseAsset(page, 'info panel', 'UI PNG fornita')
    await assertBackground(command, '/ui/reference-png/info-panel.webp')
    expect((await command.textContent())!.trim()).toBe(commandLabel)
    await original(page)
    await expect(command).not.toHaveCSS('background-image', /info-panel/)
    await expect(command).toBeEnabled()
  })

  test('hero decoration changes preserve the full-screen splash and official analysis portrait', async ({ page }) => {
    await openStudio(page, 'squadra')
    for (const screen of ['squadra', 'analisi', 'arkadex']) {
      await page.getByLabel('Schermata da modificare', { exact: true }).selectOption(screen)
      const hero = preview(page).locator('[data-ui-id="hero"]')
      await expect(hero).toBeVisible()
      const portrait = hero.locator('svg.pu-creature-art image')
      const splash = hero.locator('[data-splash-species]')
      const usesSplash = screen !== 'analisi'
      if (usesSplash) await expect(splash).toHaveAttribute('data-splash-species', '1')
      else await expect(portrait).toHaveAttribute('href', /front_sprites\/1\.png$/)
      const source = usesSplash ? await splash.getAttribute('data-splash-source') : await portrait.getAttribute('href')
      const background = await hero.evaluate(element => getComputedStyle(element).backgroundImage)
      await selectLayer(page, 'Arkamon selezionato', 'Gruppo')
      await chooseAsset(page, 'info panel', 'UI PNG fornita')
      await assertBackground(hero, '/ui/reference-png/info-panel.webp')
      if (usesSplash) await expect(splash).toHaveAttribute('data-splash-source', source!)
      else await expect(portrait).toHaveAttribute('href', source!)
      await original(page)
      await expect(hero).toHaveCSS('background-image', background)
      if (usesSplash) await expect(splash).toHaveAttribute('data-splash-source', source!)
      else await expect(portrait).toHaveAttribute('href', source!)
    }
  })
})
