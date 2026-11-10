import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

test('reworked title remains usable and unclipped at desktop and mobile sizes', async ({ page }) => {
  const warnings: string[] = []
  page.on('pageerror', error => warnings.push(error.message))
  await mkdir(resolve('output/rework-visual'), { recursive: true })
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/?uiStudioPreview=1&uiConceptFluid=1&uiConcept=aurora&screen=titolo')
    const scene = page.locator('.rpg-title-scene')
    await expect(scene).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Nuova Partita' })).toBeVisible()
    await expect(page.locator('.rpg-title-logo')).toBeVisible()
    const layout = await scene.evaluate(element => {
      const logo = element.querySelector('.rpg-title-logo')!.getBoundingClientRect()
      const buttons = element.querySelector('.rpg-title-commands')!.getBoundingClientRect()
      const stage = element.getBoundingClientRect()
      const styles = getComputedStyle(element.querySelector('.rpg-title-commands')!)
      return {
        titleInView: logo.left >= -1 && logo.right <= stage.right + 1 && logo.top >= -1 && logo.bottom <= stage.bottom + 1,
        actionsInView: buttons.left >= -1 && buttons.right <= stage.right + 1 && buttons.top >= -1 && buttons.bottom <= stage.bottom + 1,
        controlsReadable: buttons.width >= 280 && styles.backgroundImage !== 'none',
        scroll: element.scrollWidth <= element.clientWidth + 1,
      }
    })
    expect(layout, `viewport ${viewport.width}×${viewport.height}`).toEqual({
      titleInView: true, actionsInView: true, controlsReadable: true, scroll: true,
    })
    await page.screenshot({ path: resolve(`output/rework-visual/title-${viewport.width}x${viewport.height}.png`), animations: 'disabled' })
  }
  expect(warnings).toEqual([])
})