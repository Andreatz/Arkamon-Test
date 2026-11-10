import { describe, expect, it } from 'vitest'
import { initialGameSave, normalizeGameSave, serializeGameState } from './gamePersistence'
import { serializeGameBackup, stateFromValidatedBackup, validateGameBackup } from './gameBackup'
import { updateBattleSquad } from '@/engine/battleResolution'
import type { PokemonIstanza } from '@/types'

const creature = (id: string, species = 1): PokemonIstanza => ({ istanzaId: id, specieId: species, nome: `Specie ${species}`, livello: 15, hp: 3, xp: 0,
  stato: { tipo: 'Paralizzato', turniRimanenti: -1 } })
function duplicatedCampaign() {
  const state = initialGameSave()
  state.giocatore1.squadra = [creature('duplicate'), creature('duplicate', 5)]
  state.giocatore1.deposito = { '1:1': creature('duplicate', 9), '1:2': creature('duplicate-recovered-1', 13) }
  state.giocatore2.squadra = [creature('duplicate', 16)]
  return state
}
describe('recovery of creature identity and live references', () => {
  it('recovers every owned creature with unique deterministic IDs and preserves its species, HP and status', () => {
    const state = duplicatedCampaign()
    const recovered = normalizeGameSave(serializeGameState(state))
    const creatures = [...recovered.state.giocatore1.squadra, ...Object.values(recovered.state.giocatore1.deposito), ...recovered.state.giocatore2.squadra]
    expect(new Set(creatures.map((pokemon) => pokemon.istanzaId)).size).toBe(5)
    expect(creatures.map((pokemon) => pokemon.specieId)).toEqual([1, 5, 9, 13, 16])
    expect(creatures.every((pokemon) => pokemon.hp === 3 && pokemon.stato?.tipo === 'Paralizzato')).toBe(true)
    expect(recovered.state.giocatore1.squadra[0].istanzaId).toBe('duplicate')
    expect(recovered.state.giocatore1.squadra[1].istanzaId).toBe('duplicate-recovered-2')
    expect(recovered.warnings.join(' ')).toContain('identità duplicate')
    const updated = updateBattleSquad(recovered.state.giocatore1.squadra, { ...creatures[0], hp: 1 })
    expect(updated.map((pokemon) => [pokemon.specieId, pokemon.hp])).toEqual([[1, 1], [5, 3]])
    expect(normalizeGameSave(serializeGameState(recovered.state)).warnings).toEqual([])
  })
  it('closes an ambiguous battle/evolution instead of guessing which duplicate it referred to', () => {
    const state = duplicatedCampaign(), pokemonA = state.giocatore1.squadra[0], pokemonB = creature('enemy', 20)
    state.battaglia = { tipo: 'NPC', pokemonA, pokemonB, squadraA: state.giocatore1.squadra, squadraB: [pokemonB], hpMaxA: 30, hpMaxB: 30,
      turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null }
    state.scenaCorrente = { scena: 'evoluzione', payload: { evoluzioni: [{ istanzaId: 'duplicate', oldSpecieId: 1, newSpecieId: 2 }] } }
    const recovered = normalizeGameSave(serializeGameState(state))
    expect(recovered.state.battaglia).toBeNull()
    expect(recovered.state.scenaCorrente.scena).toBe('mappa-principale')
    expect(recovered.state.giocatore1.squadra.map((pokemon) => pokemon.specieId)).toEqual([1, 5])
    expect(recovered.warnings.join(' ')).toMatch(/riferimenti.*ambigui/)
  })
  it('keeps normal canonical creature and battle snapshots sharing the same ID without warning', () => {
    const state = initialGameSave(), pokemonA = creature('player'), pokemonB = creature('enemy', 20)
    state.giocatore1.squadra = [pokemonA]
    state.battaglia = { tipo: 'NPC', pokemonA, pokemonB, squadraA: [pokemonA], squadraB: [pokemonB], hpMaxA: 30, hpMaxB: 30,
      turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null }
    const recovered = normalizeGameSave(serializeGameState(state))
    expect(recovered.warnings).toEqual([])
    expect(recovered.state.battaglia).not.toBeNull()
  })
  it('rejects an active creature whose same-ID roster entry is a different species', () => {
    const state = initialGameSave(), pokemonA = creature('player'), pokemonB = creature('enemy', 20)
    state.giocatore1.squadra = [pokemonA]
    state.battaglia = { tipo: 'NPC', pokemonA, pokemonB, squadraA: [{ ...pokemonA, specieId: 5 }], squadraB: [pokemonB], hpMaxA: 30, hpMaxB: 30,
      turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null }
    expect(normalizeGameSave(serializeGameState(state)).state.battaglia).toBeNull()
  })
  it('carries the explicit repair warning through the portable backup preview and roundtrip', () => {
    const valid = initialGameSave()
    valid.giocatore1.squadra = [creature('a'), creature('b', 5)]
    const file = JSON.parse(serializeGameBackup(valid))
    file.campaign.giocatore1.squadra[1].istanzaId = 'a'
    const validation = validateGameBackup(JSON.stringify(file))
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.preview.warnings.join(' ')).toContain('identità duplicate')
    const restored = stateFromValidatedBackup(validation.preview)!
    expect(new Set(restored.giocatore1.squadra.map((pokemon) => pokemon.istanzaId)).size).toBe(2)
    expect(restored.giocatore1.squadra.map((pokemon) => pokemon.specieId)).toEqual([1, 5])
  })
})
