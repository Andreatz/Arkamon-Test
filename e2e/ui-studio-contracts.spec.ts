import { expect, test, type Page } from '@playwright/test'

const preview = (page: Page) => page.frameLocator('.uis-canvas iframe')
async function battleEditor(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/#ui-studio')
  await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('battaglia')
  await expect(preview(page).locator('[data-battle-hp-side="enemy"]')).toBeVisible()
}
async function selectLayer(page: Page, label: string) {
  await page.getByLabel('Cerca elemento', { exact: true }).fill(label)
  await page.locator('.uis-layer').filter({ has: page.locator('strong', { hasText: new RegExp(`^${label}$`) }) }).click()
}

test.describe('declared graphical slots and shared battle coordinates', () => {
  test.skip(({ isMobile }) => isMobile, 'The editor is a desktop workspace.')

  test('replaces the real enemy HP skin without stacking old art, survives Apply and restores Original', async ({ page }) => {
    await battleEditor(page)
    await selectLayer(page, 'HP nemico')
    const group = preview(page).locator('[data-ui-id="layout.hp-nemico"]')
    const hp = group.locator('[data-battle-hp-side="enemy"]')
    const oldDecoration = hp.locator('[data-ui-skin-dependent="frame"]')
    const text = await hp.innerText()
    const selectedSkin = () => hp.evaluate(element => decodeURIComponent(getComputedStyle(element).backgroundImage))
    const selectSkin = async () => {
      await page.getByRole('button', { name: 'Scegli asset', exact: true }).click()
      await page.getByLabel('Cerca asset', { exact: true }).fill('hp bar enemy')
      await page.getByRole('dialog', { name: 'Scegli asset', exact: true }).getByRole('button', { name: 'hp bar enemy Comuni', exact: true }).click()
    }
    await expect(hp).toHaveCSS('background-image', /\/ui\/hp_bar_enemy\.png/)
    await selectSkin()
    await expect.poll(selectedSkin).toContain('/ui/studio/Comuni/hp-bar-enemy.svg')
    await expect(group).toHaveCSS('background-image', 'none')
    await expect(oldDecoration).toHaveCSS('visibility', 'hidden')
    expect(await hp.innerText()).toBe(text)
    await expect(hp.locator('svg rect')).toHaveCount(1)
    await page.getByRole('button', { name: 'Applica al gioco', exact: true }).click()
    await page.reload()
    await page.getByLabel('Schermata da modificare', { exact: true }).selectOption('battaglia')
    await expect.poll(selectedSkin).toContain('/ui/studio/Comuni/hp-bar-enemy.svg')
    await selectLayer(page, 'HP nemico')
    await page.getByRole('button', { name: 'Originale', exact: true }).click()
    await expect(hp).toHaveCSS('background-image', /\/ui\/hp_bar_enemy\.png/)
    await expect(oldDecoration).toHaveCSS('visibility', 'visible')
    expect(await hp.innerText()).toBe(text)
  })

  test('draft sprite geometry inherits into dice view, and applied VFX use the same target', async ({ page }) => {
    await battleEditor(page)
    await selectLayer(page, 'Sprite nemico')
    await page.getByLabel('X', { exact: true }).fill('960')
    await page.getByLabel('Y', { exact: true }).fill('270')
    await page.getByLabel('Larghezza', { exact: true }).fill('384')
    await page.getByLabel('Altezza', { exact: true }).fill('324')
    const sprite = preview(page).locator('[data-ui-id="layout.sprite-nemico"]')
    await expect(sprite).toHaveCSS('left', '960px')
    await expect(sprite).toHaveCSS('top', '270px')
    await page.getByLabel('Vista interna', { exact: true }).selectOption('dice')
    await expect(sprite).toHaveCSS('left', '960px')
    await selectLayer(page, 'Sprite nemico')
    await page.getByLabel('X', { exact: true }).fill('1152')
    await expect(sprite).toHaveCSS('left', '1152px')
    await page.getByLabel('Vista interna', { exact: true }).selectOption('default')
    await expect(sprite).toHaveCSS('left', '960px')
    await page.getByRole('button', { name: 'Applica al gioco', exact: true }).click()
    await page.goto('/#vfx-lab')
    await page.getByRole('combobox', { name: 'Posizione', exact: true }).selectOption('target')
    await page.getByRole('button', { name: 'Replay sincronizzato', exact: true }).click()
    const effect = page.locator('[data-vfx-anchor="target"]').first()
    await expect(effect).toBeAttached()
    await expect.poll(() => effect.evaluate(element => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top }))).toEqual({ left: '60%', top: '40%' })
  })

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 640 }]) {
    test(`screen VFX stay centered in their real container at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/#vfx-lab')
      await page.getByRole('combobox', { name: 'Posizione', exact: true }).selectOption('screen')
      await page.getByRole('button', { name: 'Replay sincronizzato', exact: true }).click()
      const effect = page.locator('[data-vfx-anchor="screen"]').first()
      await expect(effect).toBeAttached()
      const geometry = await effect.evaluate(element => {
        const rect = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect()
        return { dx: rect.x + rect.width / 2 - parent.x - parent.width / 2, dy: rect.y + rect.height / 2 - parent.y - parent.height / 2, marginTop: getComputedStyle(element).marginTop }
      })
      expect(Math.abs(geometry.dx)).toBeLessThan(1)
      expect(Math.abs(geometry.dy)).toBeLessThan(1)
      expect(geometry.marginTop).toBe('0px')
    })
  }
})
