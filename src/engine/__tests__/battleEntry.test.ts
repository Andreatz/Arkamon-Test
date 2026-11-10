import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calcolaHPMax, esitoSquadre, risolviStatoInizioTurno } from '../battleEngine'
import { teamProgressionLimit } from '../teamLevelCap'
import { useGameStore } from '@/store/gameStore'
import { initialGameSave, normalizeGameSave, serializeGameState } from '@/save/gamePersistence'
import { restoreBattleCheckpoint } from '@/components/battle/battleCheckpoint'
import type { PokemonIstanza, StatoBattaglia } from '@/types'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
})

const pokemon = (id: string, livello = 10, hp = 8): PokemonIstanza =>
  ({ istanzaId: id, specieId: 1, nome: id, livello, hp, xp: 0 })

function request(lead: PokemonIstanza, luogoRitorno: string): StatoBattaglia {
  const enemy = { ...pokemon('wild-target'), specieId: 13 }
  return { tipo: 'Selvatico', pokemonA: lead, pokemonB: enemy, hpMaxA: calcolaHPMax(lead), hpMaxB: calcolaHPMax(enemy),
    turnoCorrente: 'A', luogoRitorno, log: ['Appare un Arkamon selvatico!'], evoluzioneInAttesa: null }
}

describe('complete player roster at direct battle entry', () => {
  beforeEach(() => useGameStore.setState({ ...initialGameSave(), challengeContext: null, teamRuleMessage: null }))

  it.each([['Percorso_1', 1], ['mappa-griglia', 2]] as const)('keeps every reserve from %s for player %s, including status and KO slots', (location, playerId) => {
    const lead = { ...pokemon('lead', 10, 1), stato: { tipo: 'Avvelenato' as const, turniRimanenti: -1 } }
    const reserve = pokemon('reserve', 5, 4), fainted = pokemon('fainted', 8, 0)
    const key = playerId === 1 ? 'giocatore1' : 'giocatore2'
    useGameStore.setState(state => ({ giocatoreAttivo: playerId, [key]: { ...state[key], squadra: [lead, reserve, fainted] } }))
    const before = useGameStore.getState()[key]
    useGameStore.getState().iniziaBattaglia(request(lead, location))
    const battle = useGameStore.getState().battaglia!
    expect(battle.squadraA).toEqual([lead, reserve, fainted])
    expect(useGameStore.getState()[key]).toBe(before)
    expect(teamProgressionLimit(battle.squadraA!, lead.istanzaId)).toBe(10)
    const poisoned = risolviStatoInizioTurno(battle.pokemonA, battle.hpMaxA).istanza
    const afterKO = battle.squadraA!.map(entry => entry.istanzaId === lead.istanzaId ? poisoned : entry)
    expect(esitoSquadre(afterKO, [battle.pokemonB])).toBeNull()
    expect(afterKO.filter(entry => entry.hp > 0)).toEqual([reserve])
    const restored = normalizeGameSave(serializeGameState(useGameStore.getState())).state.battaglia!
    expect(restored.squadraA).toEqual([lead, reserve, fainted])
    expect(restoreBattleCheckpoint(restored).phase).toBe('player')
  })

  it('retains an explicitly supplied battle squad and uses its lead as the canonical active copy', () => {
    const lead = pokemon('explicit-lead', 10, 5), reserve = pokemon('explicit-reserve', 10, 2)
    const battle = { ...request({ ...lead, hp: 1 }, 'Percorso_1'), squadraA: [lead, reserve] }
    useGameStore.getState().iniziaBattaglia(battle)
    expect(useGameStore.getState().battaglia).toMatchObject({ pokemonA: lead, squadraA: [lead, reserve], hpMaxA: calcolaHPMax(lead) })
  })

  it.each(['missing', 'ko', 'non-finite', 'above-max'] as const)('does not open a battle with a %s lead', kind => {
    const lead = pokemon('owned-lead')
    const requested = kind === 'missing' ? pokemon('not-in-the-team') : lead
    if (kind === 'ko') lead.hp = 0
    if (kind === 'non-finite') lead.hp = Number.NaN
    if (kind === 'above-max') lead.hp = calcolaHPMax(lead) + 1
    useGameStore.setState(state => ({ giocatore1: { ...state.giocatore1, squadra: [lead] } }))
    useGameStore.getState().iniziaBattaglia(request(requested, 'Percorso_1'))
    expect(useGameStore.getState().battaglia).toBeNull()
  })
})
