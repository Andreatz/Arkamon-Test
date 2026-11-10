import { expect, test } from '@playwright/test'

test('a late file read cannot replace the automatic backup selected afterward', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('backup-audit-fixture')) return
    const pokemon = { istanzaId: 'backup-audit-one', specieId: 1, nome: 'Vyrath originale', livello: 5, hp: 3, xp: 0 }
    const player = (id: number) => ({ id, nome: `Campagna attuale ${id}`, squadra: [{ ...pokemon, istanzaId: `backup-audit-${id}` }], deposito: {},
      cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 321, inventario: { masterball: 1 } })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    const campaign = { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, battaglia: null, rivaleStarterId: 9,
      posizione1: position, posizione2: position, posizioniLocali1: {}, posizioniLocali2: {}, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null, audioMuted: true }
    const copy = { ...campaign, giocatore1: { ...campaign.giocatore1, nome: 'Copia automatica scelta' } }
    const backup = JSON.stringify({ format: 'arkamon-campaign-backup', version: 1, saveSchemaVersion: 1, createdAt: '2026-10-13T10:00:00Z', campaign: copy })
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: campaign }))
    localStorage.setItem('arkamon-automatic-backups-v1', JSON.stringify({ version: 1, copies: [{ createdAt: '2026-10-13T10:00:00Z', backup }] }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, reducedMotion: 'on' } }))
    localStorage.setItem('backup-audit-fixture', 'ready')
  })
  await page.goto('/')
  await expect(page.locator('[data-presented-scene]')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('button', { name: 'Partita', exact: true }).click()
  const tools = page.getByRole('dialog', { name: 'La tua partita', exact: true })
  await tools.getByRole('button', { name: 'Apri Salvataggio', exact: true }).click()
  const primary = await page.evaluate(() => localStorage.getItem('arkamon-save'))
  await page.evaluate(() => {
    File.prototype.text = function () {
      return new Promise<string>(resolve => Object.assign(window, { completeBackupFileRead: resolve }))
    }
  })
  await tools.getByLabel('Importa backup partita', { exact: true }).setInputFiles({ name: 'lettura-lenta.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { completeBackupFileRead?: unknown }).completeBackupFileRead)).toBe('function')
  await tools.getByRole('button', { name: 'Controlla copia automatica 1', exact: true }).click()
  const preview = tools.getByLabel('Anteprima ripristino', { exact: true })
  await expect(preview).toContainText('Copia automatica scelta')
  await page.evaluate(() => {
    const copy = JSON.parse(JSON.parse(localStorage.getItem('arkamon-automatic-backups-v1')!).copies[0].backup)
    copy.campaign.giocatore1.nome = 'File vecchio completato dopo'
    ;(window as unknown as { completeBackupFileRead: (text: string) => void }).completeBackupFileRead(JSON.stringify(copy))
  })
  await expect(preview).toContainText('Copia automatica scelta')
  await expect(preview).not.toContainText('File vecchio completato dopo')
  await expect(tools.getByRole('button', { name: 'Ripristina questa partita', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(primary)
  expect(errors).toEqual([])
})
