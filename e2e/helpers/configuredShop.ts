import { expect, type Page } from '@playwright/test'

/** A test-owned shop is configured on the actor's real local-map point. */
export async function seedConfiguredShop(page: Page) {
  await page.addInitScript(() => {
    const key = 'arkamon-interactions-v1'
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, JSON.stringify({ version: 0, state: { interactions: [{
      id: 'ui-venezia-shop', mapId: 'Venezia', nodeId: 'n56', title: 'Arkastore del punto',
      dialogue: 'Rifornisci la borsa prima di ripartire.', scope: 'player', enabled: true, repeatable: true,
      requirements: { gymIds: [], minLevel: 0, minCoins: 0, items: {}, completedInteractions: [] },
      cost: { coins: 0, items: {} }, reward: { coins: 0, items: {} }, action: { kind: 'shop' },
    }] } }))
  })
}

export async function openConfiguredShop(page: Page) {
  const existing = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  if (await existing.isVisible()) await existing.getByRole('button', { name: 'Riprendi il Viaggio', exact: true }).click()
  await page.getByRole('button', { name: 'Interagisci sul punto', exact: true }).click()
  await page.getByRole('button', { name: 'Apri Arkastore', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await expect(dialog.locator('.pu-shell')).toHaveAttribute('data-player-ui-screen', 'negozio')
  await expect(dialog.getByRole('region', { name: 'Arkastore di Venezia', exact: true })).toBeVisible()
  return dialog
}
