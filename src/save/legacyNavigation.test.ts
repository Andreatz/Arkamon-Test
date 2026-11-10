import { describe, expect, it } from 'vitest'
import { initialGameSave, normalizeGameSave, serializeGameState } from './gamePersistence'
import { creaIstanza } from '@/engine/pokemonFactory'

describe('legacy saved navigation', () => {
  it.each(['palestra', 'centro-pokemon', 'squadra'] as const)('recovers obsolete %s routes without losing campaign data', (scena) => {
    const saved = initialGameSave()
    const creature = { ...creaIstanza(1, 15)!, hp: 3, stato: { tipo: 'Paralizzato' as const, turniRimanenti: -1 } }
    saved.giocatore1.squadra = [creature]
    saved.giocatore1.monete = 123
    saved.scenaCorrente = { scena, payload: { luogo: 'Venezia' } }
    saved.scenaPrecedente = { scena }
    const { state, warnings } = normalizeGameSave(serializeGameState(saved))
    expect(state.scenaCorrente).toEqual({ scena: 'mappa-principale' })
    expect(state.scenaPrecedente).toBeNull()
    expect(state.giocatore1).toEqual(saved.giocatore1)
    expect(state.turnoOverworld).toEqual(saved.turnoOverworld)
    expect(warnings.join(' ')).toMatch(/schermata.*storica/i)
    expect(normalizeGameSave(serializeGameState(state)).warnings).toEqual([])
  })

  it.each(['palestra', 'centro-pokemon', 'squadra'] as const)('resumes a preserved battle ahead of obsolete %s navigation', (scena) => {
    const saved = initialGameSave()
    const pokemonA = { ...creaIstanza(1, 15)!, hp: 3 }
    const pokemonB = creaIstanza(5, 15)!
    saved.giocatore1.squadra = [pokemonA]
    saved.scenaCorrente = { scena }
    saved.battaglia = { tipo: 'Selvatico', pokemonA, pokemonB, squadraA: [pokemonA], squadraB: [pokemonB], hpMaxA: 50, hpMaxB: 50,
      turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null }
    const { state } = normalizeGameSave(serializeGameState(saved))
    expect(state.scenaCorrente).toEqual({ scena: 'battaglia' })
    expect(state.battaglia).toEqual(saved.battaglia)
    expect(state.giocatore1.squadra).toEqual([pokemonA])
  })
})
