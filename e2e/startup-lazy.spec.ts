import { expect, test } from '@playwright/test'

test('the title defers game scenes and loads the laboratory on its first visit', async ({ page }) => {
  const requested: string[] = []
  page.on('request', request => requested.push(new URL(request.url()).pathname))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Nuova Partita', exact: true })).toBeVisible()
  for (const name of ['LaboratorioScene', 'MappaPrincipaleScene', 'BattagliaScene', 'PercorsoScene', 'CittaScene', 'DepositoScene', 'EvoluzioneScene']) {
    expect(requested.some(url => url.includes(`/scenes/${name}.tsx`)), name).toBe(false)
  }
  expect(requested.some(url => url.includes('/admin/AdminPanel.tsx'))).toBe(false)
  expect(requested.some(url => url.includes('/ui-studio/UiStudioEditor.tsx'))).toBe(false)
  expect(requested.some(url => url.includes('/ui-studio/UiStudioPreview.tsx'))).toBe(false)
  expect(requested.some(url => url.includes('/vfxCuration.ts'))).toBe(false)
  expect(requested.some(url => url.includes('/vfx-curation-runtime.json'))).toBe(false)
  expect(requested.some(url => url.includes('/arkamon-paged/') || url.includes('/sprites/arkamon/'))).toBe(false)
  await page.getByRole('button', { name: 'Nuova Partita', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Laboratorio del Professore', exact: true })).toBeVisible()
  expect(requested.some(url => url.includes('/scenes/LaboratorioScene.tsx'))).toBe(true)
  expect(requested.some(url => url.includes('/scenes/BattagliaScene.tsx'))).toBe(false)
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Modalità Admin', exact: true })).toBeVisible()
  expect(requested.some(url => url.includes('/admin/AdminPanel.tsx'))).toBe(true)
  await test.info().attach('Deferred initial scene requests', { body: JSON.stringify(requested.filter(url => url.includes('/src/')), null, 2), contentType: 'application/json' })
})
