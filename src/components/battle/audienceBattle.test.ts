import { describe, expect, it } from 'vitest'
import { audienceChannelForBattle, createAudienceBattleId, makeAudienceRoundRequest, validAudienceWinner } from './audienceBattle'
import { restoreBattleCheckpoint, settledBattleCheckpoint } from './battleCheckpoint'
import { nextBattleSide } from './battleRoundOrder'
import { ALLENATORI, getPokemon } from '@/data'
import { applicaStato, risolviStatoInizioTurno } from '@/engine/battleEngine'
import { creaIstanza } from '@/store/gameStore'
import type { BattleCheckpoint, StatoBattaglia } from '@/types'
import type { AudienceRound } from '@/audience/types'

const target = creaIstanza(4, 100)!
const pokemon = creaIstanza(4, 10)!
const npc = ALLENATORI.find((item) => item.tipo === 'NPC')!
const gym = ALLENATORI.find((item) => item.tipo === 'Capopalestra')!
const battle: StatoBattaglia = { tipo: 'NPC', allenatoreId: npc.id, pokemonA: target, pokemonB: pokemon,
  hpMaxA: target.hp, hpMaxB: pokemon.hp, turnoCorrente: 'B', luogoRitorno: npc.luogo, log: [], evoluzioneInAttesa: null }
const request = makeAudienceRoundRequest(battle, pokemon, target, 'stable-battle', 3, 15)!
const pending = { sessionId: 'a'.repeat(32), request }
const round: AudienceRound = { id: 'round', ...request, counts: [3, 0, 0], status: 'closed', openedAt: 1000,
  deadlineAt: 16000, closedAt: 16000, winnerIndex: request.options[0].index, resolution: 'majority' }
const options = { initialPriority: 'A' as const, actedThisRound: new Set<'A' | 'B'>(['A']), turnA: false,
  pvp: false, chooseRivalMove: false, outcome: null, openingComplete: true, evolutions: [], rivalMessages: [] }

describe('audience battle turn identity and actual moves', () => {
  it('uses the two requested groups and excludes wild Pokémon', () => {
    expect(audienceChannelForBattle(battle)).toBe('npc')
    expect(audienceChannelForBattle({ ...battle, allenatoreId: gym.id })).toBe('boss')
    expect(audienceChannelForBattle({ ...battle, tipo: 'PVP' })).toBe('boss')
    expect(audienceChannelForBattle({ ...battle, tipo: 'Selvatico' })).toBeNull()
    expect(audienceChannelForBattle(null)).toBeNull()
  })
  it('assigns Elite Four and champions only to the private guest channel and rejects old boss majority results', () => {
    for (const tipo of ['Superquattro', 'Campione'] as const) {
      const leagueBattle = { ...battle, tipo: 'PVP' as const, leagueOpponent: { ...gym, tipo, nome: tipo } }
      expect(audienceChannelForBattle(leagueBattle)).toBe('boss')
      const guestRequest = makeAudienceRoundRequest(leagueBattle, pokemon, target, 'league', 1, 15)!
      expect(guestRequest.trainer.kind).toBe(tipo)
      expect(guestRequest.durationSeconds).toBe(120)
      const guestRound = { ...round, ...guestRequest, resolution: 'guest' as const }
      expect(validAudienceWinner({ ...pending, request: guestRequest }, guestRound, pokemon, guestRequest.turnKey)).toBe(guestRound.winnerIndex)
      expect(validAudienceWinner({ ...pending, request: guestRequest }, { ...guestRound, resolution: 'majority' }, pokemon, guestRequest.turnKey)).toBeNull()
    }
  })
  it('includes only actual populated move slots for every species, including sparse slots and healing/status moves', () => {
    for (let id = 1; id <= 110; id++) {
      const actor = creaIstanza(id, 25)!
      const result = makeAudienceRoundRequest(battle, actor, target, 'battle', 0, 15)!
      expect(result.options.map((option) => option.moveId)).toEqual(getPokemon(id)!.mosse.filter(Boolean))
      expect(result.options.some((option) => option.index === result.fallbackIndex)).toBe(true)
      expect(result.options.every((option) => !option.name.includes('Suprema'))).toBe(true)
    }
  })
  it('never opens a ballot for a wild or fainted rival', () => {
    expect(makeAudienceRoundRequest({ ...battle, tipo: 'Selvatico' }, pokemon, target, 'battle', 0, 15)).toBeNull()
    expect(makeAudienceRoundRequest(battle, { ...pokemon, hp: 0 }, target, 'battle', 0, 15)).toBeNull()
  })
  it('separates turns, Pokémon replacements and separate battles even when the same actor returns', () => {
    expect(request.turnKey).not.toBe(makeAudienceRoundRequest(battle, pokemon, target, 'stable-battle', 4, 15)!.turnKey)
    expect(request.turnKey).not.toBe(makeAudienceRoundRequest(battle, { ...pokemon, istanzaId: 'replacement' }, target, 'stable-battle', 3, 15)!.turnKey)
    expect(request.turnKey).not.toBe(makeAudienceRoundRequest(battle, pokemon, target, 'new-battle', 3, 15)!.turnKey)
    expect(createAudienceBattleId()).not.toBe(createAudienceBattleId())
  })
  it('only accepts a closed result for the current turn, channel, Pokémon and real move', () => {
    const valid = request.options[0].index
    expect(validAudienceWinner(pending, round, pokemon, request.turnKey)).toBe(valid)
    expect(validAudienceWinner(pending, { ...round, status: 'open' }, pokemon, request.turnKey)).toBeNull()
    expect(validAudienceWinner(pending, { ...round, turnKey: 'old-turn' }, pokemon, request.turnKey)).toBeNull()
    expect(validAudienceWinner(pending, { ...round, channel: 'boss' }, pokemon, request.turnKey)).toBeNull()
    expect(validAudienceWinner(pending, round, { ...pokemon, istanzaId: 'new' }, request.turnKey)).toBeNull()
    expect(validAudienceWinner(pending, round, { ...pokemon, hp: 0 }, request.turnKey)).toBeNull()
    expect(validAudienceWinner(pending, { ...round, options: round.options.map((move) => ({ ...move, moveId: 9999 })) }, pokemon, request.turnKey)).toBeNull()
  })
})

describe('audience checkpoint preserves the mandatory status step on reload', () => {
  it('saves only public metadata, then restores the same ballot and B turn', () => {
    const checkpoint = settledBattleCheckpoint({ ...options, audienceBattleId: 'stable-battle', opponentTurnNumber: 3, audiencePending: pending })
    const restored = restoreBattleCheckpoint(JSON.parse(JSON.stringify({ ...battle, checkpoint })))
    expect(restored.phase).toBe('audience')
    expect(restored.audiencePending).toEqual(pending)
    expect(restored.opponentTurnNumber).toBe(3)
    expect(restored.audienceBattleId).toBe('stable-battle')
    expect(JSON.stringify(checkpoint)).not.toContain('hostToken')
  })
  it('keeps the resolved poison tick rather than returning to the status check', () => {
    const poisoned = applicaStato(pokemon, 'Avvelenato')
    const resolved = risolviStatoInizioTurno(poisoned, pokemon.hp, () => .8, false)
    const poisonRequest = makeAudienceRoundRequest(battle, resolved.istanza, target, 'stable-battle', 3, 15)!
    const checkpoint = settledBattleCheckpoint({ ...options, audienceBattleId: 'stable-battle', opponentTurnNumber: 3,
      rivalMessages: resolved.messaggi, audiencePending: { ...pending, request: poisonRequest } })
    const saved = JSON.parse(JSON.stringify({ ...battle, pokemonB: resolved.istanza, checkpoint })) as StatoBattaglia
    const restored = restoreBattleCheckpoint(saved)
    expect(restored.phase).toBe('audience')
    expect(saved.pokemonB.hp).toBe(resolved.istanza.hp)
    expect(saved.pokemonB.stato?.turniTrascorsi).toBe(1)
    expect(restored.rivalMessages).toEqual(resolved.messaggi)
  })
  it('drops malformed or cross-channel ballots while keeping the already-prepared move stage', () => {
    const checkpoint = settledBattleCheckpoint({ ...options, audienceBattleId: 'stable-battle', opponentTurnNumber: 3, audiencePending: pending })
    for (const audiencePending of [
      { ...pending, request: { ...request, pokemon: { ...request.pokemon, instanceId: 'wrong' } } },
      { ...pending, request: { ...request, channel: 'boss', trainer: { ...request.trainer, kind: 'PVP' } } },
      { ...pending, request: { ...request, options: [] } },
      { ...pending, request: { ...request, options: [request.options[0]], fallbackIndex: 2 } },
    ]) {
      const restored = restoreBattleCheckpoint({ ...battle, checkpoint: { ...checkpoint, audiencePending } as BattleCheckpoint })
      expect(restored.phase).toBe('rival-move')
      expect(restored.openingComplete).toBe(true)
      expect(restored.audiencePending).toBeUndefined()
    }
  })
  it('drops a stale or missing turn identity without losing initiative, acted sides or earned evolutions', () => {
    const checkpoint = settledBattleCheckpoint({ ...options, initialPriority: 'B',
      audienceBattleId: 'stable-battle', opponentTurnNumber: 3, audiencePending: pending,
      evolutions: [{ istanzaId: target.istanzaId, oldSpecieId: 1, newSpecieId: 2 }],
      rivalMessages: ['Veleno già risolto'],
    })
    for (const change of [
      { audiencePending: { ...pending, request: { ...request, turnKey: 'old-battle:B:3:old' } } },
      { audienceBattleId: undefined },
      { opponentTurnNumber: undefined },
    ]) {
      const restored = restoreBattleCheckpoint(JSON.parse(JSON.stringify({ ...battle,
        checkpoint: { ...checkpoint, ...change } })))
      expect(restored).toMatchObject({ phase: 'rival-move', openingComplete: true,
        initialPriority: 'B', actedThisRound: ['A'],
        evolutions: checkpoint.evolutions, rivalMessages: checkpoint.rivalMessages })
      expect(restored.audiencePending).toBeUndefined()
      // B still finishes this round before the remembered B-first next round.
      expect(nextBattleSide(new Set(restored.actedThisRound), 'B', restored.initialPriority)).toBe('B')
    }
  })
  it('finishing or switching wins over an obsolete pending ballot', () => {
    expect(settledBattleCheckpoint({ ...options, outcome: 'vittoria', audiencePending: pending }).phase).toBe('ended')
    expect(settledBattleCheckpoint({ ...options, switchRequest: { motivo: 'KO', prossimoPasso: 'passaAdA' }, audiencePending: pending }).phase).toBe('switch')
  })
  it('keeps the prepared NPC recovery phase through another save before its move runs', () => {
    expect(settledBattleCheckpoint({ ...options, pvp: false, chooseRivalMove: true }).phase).toBe('rival-move')
  })
  it('never resumes an attack ballot for a sleeping or fainted B', () => {
    const checkpoint = settledBattleCheckpoint({ ...options, audiencePending: pending })
    expect(restoreBattleCheckpoint({ ...battle, pokemonB: applicaStato(pokemon, 'Addormentato'), checkpoint }).phase).toBe('opponent')
    expect(restoreBattleCheckpoint({ ...battle, pokemonB: { ...pokemon, hp: 0 }, checkpoint }).phase).toBe('opponent')
  })
})
