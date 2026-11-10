import { expect, test } from '@playwright/test'

for (const [module, label] of [['TeamScreen', 'Squadra'], ['LaboratorioScene', 'Nuova Partita']] as const) {
  test(`a failed ${module} chunk offers recovery without replacing the saved campaign`, async ({ page }) => {
    if (module === 'TeamScreen') await page.addInitScript(() => {
      if (localStorage.getItem('arkamon-save')) return
      const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Aldo' : 'Beatrice', squadra: [{
        istanzaId: `recovery-g${id}`, specieId: id === 1 ? 1 : 5, nome: id === 1 ? 'Vyrath di Aldo' : 'Darklaw di Beatrice', livello: 12, hp: 3, xp: 0,
      }], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 700, inventario: { potion: 2 } })
      const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
      localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: {
        giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9, battaglia: null,
        posizione1: position, posizione2: position, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
        scenaCorrente: { scena: 'titolo' }, scenaPrecedente: null, posizioniLocali1: {}, posizioniLocali2: {}, audioMuted: true,
      } }))
    })
    await page.addInitScript(() => localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: {
      musicVolume: 0, effectsVolume: 0, reducedMotion: 'on',
    } })))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Nuova Partita', exact: true })).toBeVisible()
    const route = `**/src/${module === 'TeamScreen' ? 'player-ui' : 'scenes'}/${module}.tsx*`
    let denied = 0
    await page.route(route, async request => { denied++; await request.abort('failed') })
    if (module === 'TeamScreen') await page.getByRole('button', { name: 'Partita', exact: true }).click()
    // Capture the last checkpoint immediately before the unavailable view.
    const before = await page.evaluate(() => localStorage.getItem('arkamon-save'))
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Questa schermata non è disponibile', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Questa schermata non è disponibile', exact: true })).toBeFocused()
    expect(denied).toBeGreaterThan(0)
    const after = await page.evaluate(() => localStorage.getItem('arkamon-save'))
    // Starting a new campaign saves its normal laboratory checkpoint before loading.
    if (module === 'TeamScreen') expect(after).toBe(before)
    else expect(JSON.parse(after!).state.scenaCorrente.scena).toBe('laboratorio')
    await page.unroute(route)
    await page.getByRole('button', { name: 'Ricarica il gioco', exact: true }).click()
    if (module === 'TeamScreen') {
      await expect(page.getByRole('button', { name: 'Nuova Partita', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Partita', exact: true }).click()
      await page.getByRole('button', { name: 'Squadra', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'La tua partita', exact: true }).getByRole('heading', { name: 'Squadra', exact: true })).toBeVisible()
      await expect(page.getByRole('group', { name: 'Squadra di Aldo', exact: true })).toContainText('Vyrath di Aldo')
    } else await expect(page.getByRole('heading', { name: 'Laboratorio del Professore', exact: true })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('arkamon-save'))).toBe(after)
    await expect(page.getByRole('heading', { name: 'Questa schermata non è disponibile', exact: true })).toHaveCount(0)
  })
}
