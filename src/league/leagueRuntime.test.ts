import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/store/gameStore'
import { initialGameSave, normalizeGameSave, serializeGameState } from '@/save/gamePersistence'
import { serializeGameBackup, stateFromValidatedBackup, validateGameBackup } from '@/save/gameBackup'
import { useSaveWriteStatus } from '@/save/durableWrites'
import { SECRET_LOCATION_GYM_IDS } from '@/data/secretLocation'
import { calcolaAzioneSuprema, esitoSquadre, risolviAttaccanteDopoMossa } from '@/engine/battleEngine'
import { createChallengeSession } from '@/challenges/challengeRules'
import { exitChallenge, launchChallenge } from '@/challenges/challengeRuntime'
import { draftLeagueConfiguration, leagueConfigurationProblems, type LeagueConfiguration } from './leagueModel'
import type { PokemonIstanza } from '@/types'

vi.hoisted(() => {
  class MemoryStorage implements Storage {
    private values = new Map<string, string>()
    get length() { return this.values.size }
    clear() { this.values.clear() }
    getItem(key: string) { return this.values.get(key) ?? null }
    key(index: number) { return [...this.values.keys()][index] ?? null }
    removeItem(key: string) { this.values.delete(key) }
    setItem(key: string, value: string) { this.values.set(key, value) }
  }
  vi.stubGlobal('Storage', MemoryStorage)
  vi.stubGlobal('localStorage', new MemoryStorage())
})

const pokemon = (id = 'league-player', specieId = 1): PokemonIstanza => ({ istanzaId: id, specieId, nome: id, livello: 20, hp: 8, xp: 0 })
const config = (defeat: LeagueConfiguration['defeat'] = 'restart', championEnabled = false): LeagueConfiguration => ({
  ...draftLeagueConfiguration(), defeat, championEnabled,
  opponents: [1, 2, 3, 4].map((n) => ({ name: `Avversario test ${n}`, team: [{ pokemonId: 13, livello: 20 }] })) as LeagueConfiguration['opponents'],
  champion: championEnabled ? { name: 'Campione test', team: [{ pokemonId: 17, livello: 20 }] } : null,
})
function ready() {
  const game = initialGameSave()
  game.giocatore1 = { ...game.giocatore1, nome: 'Melia', squadra: [pokemon()], allenatoriSconfitti: new Set(SECRET_LOCATION_GYM_IDS), inventario: { potion: 2, revive: 1 } }
  game.giocatore2 = { ...game.giocatore2, nome: 'Maggi', squadra: [pokemon('league-two', 5)], allenatoriSconfitti: new Set(SECRET_LOCATION_GYM_IDS) }
  game.posizione1 = { ...game.posizione1, luogo: 'Roma' }
  game.posizione2 = { ...game.posizione2, luogo: 'Roma' }
  game.scenaCorrente = { scena: 'lega' }
  useGameStore.setState({ ...game, challengeContext: null, campaignRevision: 0 })
}
function finish(outcome: 'vittoria' | 'sconfitta', team = useGameStore.getState().giocatore1.squadra) {
  useGameStore.getState().aggiornaBattaglia({ squadraA: team, pokemonA: team[0], checkpoint: { version: 1, initialPriority: 'A', actedThisRound: ['A'], phase: 'ended', openingComplete: true, outcome, evolutions: [], rivalMessages: [] } })
  return useGameStore.getState().concludiBattagliaLega(outcome, team)
}

describe('Lega: sequenza, checkpoint e campagna', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); useSaveWriteStatus.getState().clear(); ready() })
  it('does not invent opponents, rules, or a championship when Roma is reached', () => {
    expect(useGameStore.getState().league.winner).toBeNull()
    expect(useGameStore.getState().iniziaLega().ok).toBe(false)
    const draft = draftLeagueConfiguration()
    expect(leagueConfigurationProblems(draft)).toHaveLength(6)
    expect(draft.betweenBattleItems).toBe(true)
    expect(useGameStore.getState().configuraLega(draft).ok).toBe(true)
    expect(useGameStore.getState().iniziaLega().ok).toBe(false)
    expect(useGameStore.getState().battaglia).toBeNull()
  })
  it('requires all eight gyms, Roma, an available turn and a legal team before entry', () => {
    useGameStore.getState().configuraLega(config())
    useGameStore.setState((s) => ({ giocatore1: { ...s.giocatore1, allenatoriSconfitti: new Set(SECRET_LOCATION_GYM_IDS.slice(0, -1)) } }))
    expect(useGameStore.getState().iniziaLega().ok).toBe(false)
    useGameStore.setState((s) => ({ giocatore1: { ...s.giocatore1, allenatoriSconfitti: new Set(SECRET_LOCATION_GYM_IDS) }, posizione1: { ...s.posizione1, luogo: 'Venezia' } }))
    expect(useGameStore.getState().iniziaLega().ok).toBe(false)
    useGameStore.setState((s) => ({ posizione1: { ...s.posizione1, luogo: 'Roma' }, turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 2 } }))
    expect(useGameStore.getState().iniziaLega().ok).toBe(false)
    useGameStore.setState({ turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 } })
    expect(useGameStore.getState().iniziaLega().ok).toBe(true)
  })
  it('runs all four battles in one turn, preserves HP, persists the first winner once and blocks new racing moves', () => {
    useGameStore.getState().configuraLega(config())
    expect(useGameStore.getState().iniziaLega().ok).toBe(true)
    const originalTwo = serializeGameState(useGameStore.getState()).giocatore2
    for (let stage = 0; stage < 4; stage++) {
      const battle = useGameStore.getState().battaglia!
      expect(battle.leagueBattle?.stageIndex).toBe(stage)
      expect(battle.leagueOpponent?.tipo).toBe('Superquattro')
      expect(battle.pokemonA.hp).toBe(stage === 0 ? 8 : 4)
      expect(finish('vittoria', [{ ...pokemon(), hp: 4 }]).ok).toBe(true)
      expect(useGameStore.getState().giocatoreAttivo).toBe(1)
      expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 0 })
      const completed = serializeGameState(useGameStore.getState())
      expect(useGameStore.getState().concludiBattagliaLega('vittoria', [pokemon()]).ok).toBe(false)
      expect(serializeGameState(useGameStore.getState())).toEqual(completed)
      if (stage < 3) expect(useGameStore.getState().prossimoIncontroLega().ok).toBe(true)
    }
    const state = useGameStore.getState()
    expect(state.league.winner).toMatchObject({ name: 'Melia', playerId: 1, team: [{ hp: 4, xp: 0 }] })
    expect(state.league.players[1].completedStages).toEqual([0, 1, 2, 3])
    expect(serializeGameState(state).giocatore2).toEqual(originalTwo)
    state.passaTurnoOverworld(); state.cambiaGiocatoreAttivo()
    expect(useGameStore.getState().giocatoreAttivo).toBe(1)
    expect(state.muoviAvatarMappaPrincipale(1, 'Percorso_14')).toBe(false)
    expect(state.iniziaBattagliaNPC(1, 'Roma')).toBe(false)
    const validation = validateGameBackup(serializeGameBackup(useGameStore.getState()))
    expect(validation.ok).toBe(true)
    if (validation.ok) expect(stateFromValidatedBackup(validation.preview)?.league).toEqual(state.league)
  })
  it('makes the optional champion a fifth fight only when explicitly configured', () => {
    useGameStore.getState().configuraLega(config('restart', true))
    useGameStore.getState().iniziaLega()
    for (let stage = 0; stage < 4; stage++) { finish('vittoria'); useGameStore.getState().prossimoIncontroLega() }
    expect(useGameStore.getState().league.winner).toBeNull()
    expect(useGameStore.getState().battaglia?.leagueOpponent?.tipo).toBe('Campione')
    expect(finish('vittoria').ok).toBe(true)
    expect(useGameStore.getState().league.winner?.playerId).toBe(1)
  })
  it.each(['restart', 'retry-stage'] as const)('defeat with %s consumes no healing and passes the map turn, then obeys the selected retry rule', (rule) => {
    useGameStore.getState().configuraLega(config(rule)); useGameStore.getState().iniziaLega(); finish('vittoria'); useGameStore.getState().prossimoIncontroLega()
    expect(finish('sconfitta', [{ ...pokemon(), hp: 0 }]).ok).toBe(true)
    expect(useGameStore.getState().giocatore1.squadra[0].hp).toBe(0)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    useGameStore.setState({ giocatoreAttivo: 1, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 } })
    expect(useGameStore.getState().iniziaLega().ok).toBe(false)
    useGameStore.getState().curaSquadra(1)
    expect(useGameStore.getState().iniziaLega().ok).toBe(true)
    expect(useGameStore.getState().battaglia?.leagueBattle?.stageIndex).toBe(rule === 'restart' ? 0 : 1)
  })
  it('allows explicit owned item use between fights without passing the reserved turn or implicit healing', () => {
    useGameStore.getState().configuraLega(config()); useGameStore.getState().iniziaLega(); finish('vittoria', [{ ...pokemon(), hp: 2 }])
    const turn = useGameStore.getState().turnoOverworld
    expect(useGameStore.getState().applicaOggetto(1, 'potion', 'league-player').ok).toBe(true)
    expect(useGameStore.getState().giocatore1.squadra[0].hp).toBeGreaterThan(2)
    expect(useGameStore.getState().giocatore1.inventario.potion).toBe(1)
    expect(useGameStore.getState().turnoOverworld).toEqual(turn)
    expect(useGameStore.getState().applicaOggetto(2, 'potion', 'league-two').ok).toBe(false)
  })
  it('accepts the attacker victory after Suprema double KO and retains the final evolved winner portrait after reload', () => {
    const attacker = { ...pokemon(), livello: 14, hp: 1 }, defender = { ...pokemon('enemy', 13), livello: 5, hp: 1 }
    const action = calcolaAzioneSuprema(attacker, defender, 0, () => .99)!
    const result = risolviAttaccanteDopoMossa(action)
    const defeated = { ...defender, hp: 0 }
    expect(result.istanza.hp).toBe(0)
    expect(result.istanza.livello).toBe(15)
    expect(esitoSquadre([result.istanza], [defeated], 'A')).toBe('vittoria')
    useGameStore.getState().configuraLega(config()); useGameStore.getState().iniziaLega()
    for (let stage = 0; stage < 3; stage++) { finish('vittoria'); useGameStore.getState().prossimoIncontroLega() }
    useGameStore.getState().aggiornaBattaglia({ checkpoint: { version: 1, initialPriority: 'A', actedThisRound: ['A'], phase: 'ended', openingComplete: true, outcome: 'vittoria', evolutions: [], rivalMessages: [] } })
    expect(useGameStore.getState().concludiBattagliaLega('vittoria', [result.istanza], [{ istanzaId: result.istanza.istanzaId, oldSpecieId: 1, newSpecieId: 2 }]).ok).toBe(true)
    expect(useGameStore.getState().scenaCorrente.scena).toBe('evoluzione')
    useGameStore.getState().aggiornaPokemon(1, { ...result.istanza, specieId: 2 })
    expect(useGameStore.getState().league.winner?.team[0].specieId).toBe(2)
    const restored = normalizeGameSave(serializeGameState(useGameStore.getState())).state
    expect(restored.league.winner?.team[0]).toMatchObject({ specieId: 2, hp: 0, xp: 0 })
  })
  it('recovers mid-run backup and refuses a stale battle reference without inventing victory', () => {
    useGameStore.getState().configuraLega(config()); useGameStore.getState().iniziaLega(); finish('vittoria'); useGameStore.getState().prossimoIncontroLega()
    const backup = validateGameBackup(serializeGameBackup(useGameStore.getState()))
    expect(backup.ok).toBe(true)
    if (backup.ok) {
      const restored = stateFromValidatedBackup(backup.preview)!
      expect(restored.battaglia?.leagueOpponent?.nome).toBe('Avversario test 2')
      expect(restored.league.players[1].nextStage).toBe(1)
      expect(restored.giocatoreAttivo).toBe(1)
      const raw = serializeGameState(restored) as { battaglia: { leagueBattle: { stageIndex: number } } }
      raw.battaglia.leagueBattle.stageIndex = 0
      const damaged = normalizeGameSave(raw)
      expect(damaged.state.battaglia).toBeNull()
      expect(damaged.state.league.winner).toBeNull()
      expect(damaged.warnings.length).toBeGreaterThan(0)
    }
  })
  it('keeps the defeated player visible when the portable backup resumes on the next player turn', () => {
    useGameStore.getState().configuraLega(config()); useGameStore.getState().iniziaLega(); finish('sconfitta', [{ ...pokemon(), hp: 0 }])
    expect(useGameStore.getState().giocatoreAttivo).toBe(2)
    const backup = validateGameBackup(serializeGameBackup(useGameStore.getState()))
    expect(backup.ok).toBe(true)
    if (backup.ok) expect(stateFromValidatedBackup(backup.preview)?.scenaCorrente).toEqual({ scena: 'lega', payload: { playerId: 1 } })
  })
  it('does not publish league progress when the durable write fails', () => {
    useGameStore.getState().configuraLega(config()); useGameStore.getState().iniziaLega()
    useGameStore.getState().aggiornaBattaglia({ checkpoint: { version: 1, initialPriority: 'A', actedThisRound: ['A'], phase: 'ended', openingComplete: true, outcome: 'vittoria', evolutions: [], rivalMessages: [] } })
    const original = serializeGameState(useGameStore.getState())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota') })
    expect(useGameStore.getState().concludiBattagliaLega('vittoria', [pokemon()]).ok).toBe(false)
    expect(serializeGameState(useGameStore.getState())).toEqual(original)
  })
  it('keeps the league campaign in a challenge backup and restores it when the challenge exits', () => {
    useGameStore.getState().configuraLega(config()); useGameStore.getState().iniziaLega(); finish('sconfitta')
    const before = useGameStore.getState().league
    const challenge = createChallengeSession({ version: 1, mode: 'seed', seed: 'league-isolation', speciesIds: [] })
    expect(launchChallenge(challenge).ok).toBe(true)
    expect(useGameStore.getState().league.players[1].attempt).toBe(0)
    const backup = validateGameBackup(serializeGameBackup(useGameStore.getState()))
    expect(backup.ok).toBe(true)
    if (backup.ok) expect(stateFromValidatedBackup(backup.preview)?.league).toEqual(before)
    expect(useGameStore.getState().iniziaLega().ok).toBe(false)
    expect(exitChallenge().ok).toBe(true)
    expect(useGameStore.getState().league).toEqual(before)
  })
})
