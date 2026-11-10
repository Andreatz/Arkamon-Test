import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PokemonMoves } from '../kit'

describe('informazioni sulle mosse del compagno', () => {
  it.each([
    [53, 'Risveglio verde', 40], [84, 'Respiro profondo', 30],
    [85, 'Tocco di pace', 50], [95, 'Assorbilinfa', 25],
  ] as const)('mostra la cura effettiva della specie %i senza presentarla come un attacco a dadi', (speciesId, name, percent) => {
    const markup = renderToStaticMarkup(<PokemonMoves pokemon={{ istanzaId: 'move-facts', specieId: speciesId, nome: 'Compagno', livello: 20, hp: 3, xp: 0 }} />)
    const row = markup.split('class="pu-move"').find(part => part.includes(`<strong>${name}</strong>`))!
    expect(row).toContain(`Cura ${percent}%`)
    expect(row).toContain(`Cura ${percent}% degli HP massimi e rimuove veleno e paralisi`)
    expect(row).not.toMatch(/\d+d6/)
  })

  it('conserva dadi e incremento delle mosse offensive e la distinzione degli status puri', () => {
    const markup = renderToStaticMarkup(<PokemonMoves pokemon={{ istanzaId: 'attack-facts', specieId: 1, nome: 'Vyrath', livello: 5, hp: 12, xp: 0 }} />)
    expect(markup).toContain('Soffio')
    expect(markup).toContain('1d6 +1')
    const statuses = renderToStaticMarkup(<PokemonMoves pokemon={{ istanzaId: 'status-facts', specieId: 3, nome: 'Vyrath', livello: 35, hp: 12, xp: 0 }} />)
    expect(statuses).toContain('Stato')
  })
})
