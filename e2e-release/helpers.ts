import type { Page } from '@playwright/test'

export async function seed(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('release-fixture')) return
    const player = (id: 1 | 2) => ({ id, nome: id === 1 ? 'Melia' : 'Maggi', squadra: [{ istanzaId: `release-${id}`, specieId: id === 1 ? 1 : 5, nome: id === 1 ? 'Vyrath' : 'Darklaw', livello: 10, hp: 8, xp: 0 }], deposito: {}, cespugliVisitati: [], allenatoriSconfitti: [], caselleConsumate: [], monete: 700, inventario: { potion: 2 } })
    const position = { mappaId: 'mappa-principale', luogo: 'Venezia', x: 0, y: 0, direzione: 'S' }
    localStorage.setItem('arkamon-save', JSON.stringify({ version: 0, state: { giocatore1: player(1), giocatore2: player(2), giocatoreAttivo: 1, rivaleStarterId: 9,
      posizione1: position, posizione2: position, posizioniLocali1: {}, posizioniLocali2: {}, battaglia: null,
      scenaCorrente: { scena: 'mappa-principale' }, scenaPrecedente: null, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, audioMuted: true } }))
    localStorage.setItem('arkamon-preferences-v1', JSON.stringify({ version: 1, state: { musicVolume: 0, effectsVolume: 0, reducedMotion: 'on', animationSpeed: 'fast' } }))
    localStorage.setItem('release-fixture', 'ready')
  })
}
