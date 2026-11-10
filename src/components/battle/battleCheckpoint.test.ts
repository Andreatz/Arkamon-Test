import { describe, expect, it } from 'vitest'
import { restoreBattleCheckpoint, settledBattleCheckpoint } from './battleCheckpoint'
import { nextBattleSide } from './battleRoundOrder'
import type { BattleCheckpoint, StatoBattaglia } from '@/types'

const battle: StatoBattaglia = {
  tipo: 'Selvatico',
  pokemonA: { istanzaId: 'a', specieId: 1, nome: 'A', hp: 7, livello: 5, xp: 0 },
  pokemonB: { istanzaId: 'b', specieId: 13, nome: 'B', hp: 3, livello: 5, xp: 0 },
  hpMaxA: 12, hpMaxB: 12, turnoCorrente: 'B', luogoRitorno: 'Percorso_1',
  log: [], evoluzioneInAttesa: null,
}
const options = {
  initialPriority: 'A' as const, actedThisRound: new Set<'A' | 'B'>(['A']),
  turnA: false, pvp: false, chooseRivalMove: false, outcome: null,
  openingComplete: true, evolutions: [], rivalMessages: [],
}
function reload(checkpoint: BattleCheckpoint) {
  return restoreBattleCheckpoint(JSON.parse(JSON.stringify({ ...battle, checkpoint })) as StatoBattaglia)
}

describe('settled battle checkpoints', () => {
  it('retains damaged Pokémon and current round, without changing initial coin priority on reload', () => {
    const saved = JSON.parse(JSON.stringify({ ...battle, checkpoint: settledBattleCheckpoint(options) })) as StatoBattaglia
    const restored = restoreBattleCheckpoint(saved)
    expect(saved.pokemonA.hp).toBe(7)
    expect(saved.pokemonB.hp).toBe(3)
    expect(restored.phase).toBe('opponent')
    expect(restored.openingComplete).toBe(true)
    expect(nextBattleSide(new Set(restored.actedThisRound), 'B', restored.initialPriority)).toBe('A')
  })
  it('restores the already-resolved PvP status stage rather than rolling it again', () => {
    const restored = reload(settledBattleCheckpoint({ ...options, pvp: true, chooseRivalMove: true, rivalMessages: ['Paralisi terminata'] }))
    expect(restored.phase).toBe('rival-move')
    expect(restored.rivalMessages).toEqual(['Paralisi terminata'])
  })
  it('restores a forced replacement and its pending hand-off', () => {
    const restored = reload(settledBattleCheckpoint({ ...options, switchRequest: { motivo: 'KO', prossimoPasso: 'passaAB' } }))
    expect(restored.phase).toBe('switch')
    expect(restored.switchRequest?.prossimoPasso).toBe('passaAB')
  })
  it('preserves finished outcome and pending evolution, preventing a new attack/reward cycle', () => {
    const restored = reload(settledBattleCheckpoint({
      ...options, outcome: 'vittoria',
      evolutions: [{ istanzaId: 'a', oldSpecieId: 1, newSpecieId: 2 }],
    }))
    expect(restored.phase).toBe('ended')
    expect(restored.outcome).toBe('vittoria')
    expect(restored.evolutions).toHaveLength(1)
    expect(restored.openingComplete).toBe(true)
  })
  it('keeps legacy battle saves usable and ignores an incomplete ended checkpoint', () => {
    expect(restoreBattleCheckpoint(battle)).toMatchObject({ phase: 'opponent', initialPriority: 'B', outcome: null })
    expect(restoreBattleCheckpoint({ ...battle, checkpoint: { ...settledBattleCheckpoint(options), phase: 'ended' } }))
      .toMatchObject({ phase: 'opponent', outcome: null, openingComplete: false })
  })
})
