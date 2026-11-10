import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/store/gameStore'
import { GAME_SAVE_STORAGE_KEY, initialGameSave, serializeGameState } from '@/save/gamePersistence'
import { useBattleArchiveStore } from '@/components/battle/battleArchiveStore'
import { createChallengeSession, generateSeedTeam } from './challengeRules'
import { ACTIVE_CHALLENGE_STORAGE_KEY } from './challengePersistence'
import { CHALLENGE_STORAGE_KEY, useChallengeStore } from './challengeStore'
import { exitChallenge, launchChallenge } from './challengeRuntime'
import { serializeGameBackup, stateFromValidatedBackup, validateGameBackup } from '@/save/gameBackup'

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

const session = () => createChallengeSession({ version: 1, mode: 'seed', seed: 'Runtime-review', speciesIds: [] })

function saveCompletedBattle() {
  const current = useGameStore.getState().battaglia!
  useGameStore.getState().aggiornaBattaglia({ checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended', openingComplete: true, outcome: 'vittoria', evolutions: [], rivalMessages: [] },
    cronaca: { version: 1, battleId: 'runtime-battle', nextSequence: 2, omittedEvents: 0,
      events: [{ id: 'runtime-battle-attack', kind: 'attack', side: 'A', title: 'Attacco rivelato', messages: [] }] },
    pokemonA: { ...current.pokemonA, hp: 3 }, squadraA: current.squadraA!.map((pokemon, index) => index === 0 ? { ...pokemon, hp: 3 } : pokemon),
  })
}

describe('Challenge campaign preservation and durable recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); localStorage.clear()
    const game = initialGameSave()
    game.giocatore1 = { ...game.giocatore1, nome: 'Campagna uno', monete: 321,
      squadra: [{ istanzaId: 'campaign-1', specieId: 1, nome: 'Vyrath originale', livello: 5, hp: 3, xp: 0, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }] }
    game.giocatore2 = { ...game.giocatore2, nome: 'Campagna due', monete: 123,
      squadra: [{ istanzaId: 'campaign-2', specieId: 5, nome: 'Darklaw originale', livello: 5, hp: 7, xp: 0 }] }
    game.arkadex = { seen1: [1], seen2: [5], caught1: [1], caught2: [5] }
    game.scenaCorrente = { scena: 'mappa-principale' }
    useGameStore.setState({ ...game, challengeContext: null, campaignRevision: 0, saveRecoveryWarnings: [], teamRuleMessage: null })
    useChallengeStore.setState({ version: 1, draft: { version: 1, mode: 'seed', seed: 'Originale', speciesIds: [] }, results: [], storageWarning: null })
    useBattleArchiveStore.setState({ version: 1, matches: [], storageWarning: null })
  })
  afterEach(() => vi.restoreAllMocks())

  it('launches a canonical seeded battle without changing the campaign save or campaign archive', () => {
    const original = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    const requested = session()
    requested.team[0] = { ...requested.team[0], hp: 99999, livello: 100, nome: 'Dati manipolati' }
    requested.enemyTeam = []
    expect(launchChallenge(requested).ok).toBe(true)
    const current = useGameStore.getState()
    expect(current.challengeContext).not.toBeNull()
    expect(current.battaglia?.seeded?.seed).toBe('Runtime-review')
    expect(current.giocatore1.squadra).toEqual(session().team)
    expect(current.battaglia?.squadraB).toEqual(session().enemyTeam)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(original)
    expect(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)).not.toBeNull()
    expect(useBattleArchiveStore.getState().matches).toEqual([])
  })

  it('refuses launch when preserving the active challenge fails', () => {
    const before = serializeGameState(useGameStore.getState())
    const originalSet = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === ACTIVE_CHALLENGE_STORAGE_KEY) throw new Error('Quota exceeded')
      originalSet.call(this, key, value)
    })
    expect(launchChallenge(session()).ok).toBe(false)
    expect(serializeGameState(useGameStore.getState())).toEqual(before)
    expect(useGameStore.getState().challengeContext).toBeNull()
  })

  it('restores the full campaign after abandonment, preserving HP, status, coins and discoveries', () => {
    const original = serializeGameState(useGameStore.getState())
    expect(launchChallenge(session()).ok).toBe(true)
    const player = useGameStore.getState().giocatore1
    useGameStore.setState({ giocatore1: { ...player, monete: 9999 }, audioMuted: true })
    expect(exitChallenge().ok).toBe(true)
    expect(serializeGameState(useGameStore.getState())).toEqual({ ...original, audioMuted: true })
    expect(useGameStore.getState().challengeContext).toBeNull()
    expect(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)).toBeNull()
    expect(useChallengeStore.getState().results).toEqual([])
  })

  it.each([
    { version: 1, mode: 'seed' }, { version: 2, mode: 'seed' },
    { version: 1, mode: 'fanta' }, { version: 2, mode: 'fanta' },
  ] as const)('exports the conserved campaign while a $mode rules v$version challenge is active', ({ version, mode }) => {
    const original = serializeGameState(useGameStore.getState())
    const configured = createChallengeSession({ version, mode, seed: 'Backup-during-challenge', speciesIds: mode === 'seed' ? [] : generateSeedTeam('Backup-during-challenge', 'player', version) })
    expect(launchChallenge(configured).ok).toBe(true)
    const diskBefore = localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)
    const checked = validateGameBackup(serializeGameBackup(useGameStore.getState()))
    expect(checked.ok).toBe(true)
    if (!checked.ok) throw new Error(checked.error)
    expect(serializeGameState(stateFromValidatedBackup(checked.preview)!)).toEqual(original)
    expect(checked.preview.players.map(player => player.name)).toEqual(['Campagna uno', 'Campagna due'])
    expect(checked.preview.battle).toBe(false)
    expect(checked.preview.source).not.toContain('challengeContext')
    expect(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)).toBe(diskBefore)
  })

  it('refuses to score an unfinished challenge and keeps the recoverable active checkpoint', () => {
    expect(launchChallenge(session()).ok).toBe(true)
    const active = localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)
    expect(exitChallenge(true).ok).toBe(false)
    expect(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)).toBe(active)
    expect(useGameStore.getState().challengeContext).not.toBeNull()
    expect(useChallengeStore.getState().results).toEqual([])
  })

  it('records a completed attempt once and restores the campaign without rewards or archive pollution', () => {
    const original = serializeGameState(useGameStore.getState())
    expect(launchChallenge(session()).ok).toBe(true)
    const attemptId = useGameStore.getState().challengeContext!.attemptId
    saveCompletedBattle()
    expect(exitChallenge(true).ok).toBe(true)
    expect(useChallengeStore.getState().results).toHaveLength(1)
    expect(useChallengeStore.getState().results[0]).toMatchObject({ id: attemptId, outcome: 'vittoria', turns: 1, seed: 'Runtime-review' })
    expect(exitChallenge(true).ok).toBe(false)
    expect(useChallengeStore.getState().results).toHaveLength(1)
    expect(serializeGameState(useGameStore.getState())).toEqual(original)
    expect(useBattleArchiveStore.getState().matches).toEqual([])
    expect(JSON.parse(localStorage.getItem(CHALLENGE_STORAGE_KEY)!).state.results).toHaveLength(1)
  })

  it('retains the ended checkpoint if the result cannot be saved, then retries with the same attempt ID', () => {
    expect(launchChallenge(session()).ok).toBe(true)
    saveCompletedBattle()
    const attemptId = useGameStore.getState().challengeContext!.attemptId
    const options = useChallengeStore.persist.getOptions(), originalStorage = options.storage!
    useChallengeStore.persist.setOptions({ storage: { ...originalStorage, setItem: () => { throw new Error('Quota exceeded') } } })
    try {
      expect(exitChallenge(true).ok).toBe(false)
      expect(useGameStore.getState().challengeContext?.attemptId).toBe(attemptId)
      expect(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)).not.toBeNull()
    } finally { useChallengeStore.persist.setOptions({ storage: originalStorage }) }
    expect(exitChallenge(true).ok).toBe(true)
    expect(useChallengeStore.getState().results.filter((entry) => entry.id === attemptId)).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(CHALLENGE_STORAGE_KEY)!).state.results.filter((entry: { id: string }) => entry.id === attemptId)).toHaveLength(1)
  })

  it('leaves the active challenge intact if the final campaign write fails', () => {
    expect(launchChallenge(session()).ok).toBe(true)
    const active = localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)
    const originalSet = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === GAME_SAVE_STORAGE_KEY) throw new Error('Quota exceeded')
      originalSet.call(this, key, value)
    })
    expect(exitChallenge().ok).toBe(false)
    expect(useGameStore.getState().challengeContext).not.toBeNull()
    expect(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)).toBe(active)
  })

  it('recovers a bad RNG envelope once and does not roll back later campaign progress on subsequent reloads', async () => {
    expect(launchChallenge(session()).ok).toBe(true)
    const envelope = JSON.parse(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)!)
    envelope.state.battaglia.seeded.seed = 'Unrelated-seed'
    localStorage.setItem(ACTIVE_CHALLENGE_STORAGE_KEY, JSON.stringify(envelope))
    await useGameStore.persist.rehydrate()
    expect(useGameStore.getState().challengeContext).toBeNull()
    const player = useGameStore.getState().giocatore1
    useGameStore.setState({ giocatore1: { ...player, monete: 777 } })
    await useGameStore.persist.rehydrate()
    expect(useGameStore.getState().challengeContext).toBeNull()
    expect(useGameStore.getState().giocatore1.monete).toBe(777)
  })

  it.each([1, 2] as const)('resumes a rules v%s checkpoint at its saved RNG cursor and records its own version', async (version) => {
    const campaignBefore = serializeGameState(useGameStore.getState())
    const configured = createChallengeSession({ version, mode: 'seed', seed: 'Versioned-runtime', speciesIds: [] })
    expect(launchChallenge(configured).ok).toBe(true)
    useGameStore.getState().aggiornaBattaglia({ seeded: { algorithm: 'arkamon-counter-v1', seed: configured.seed, cursor: 27 } })
    await useGameStore.persist.rehydrate()
    expect(useGameStore.getState().challengeContext?.session).toEqual(configured)
    expect(useGameStore.getState().battaglia?.seeded?.cursor).toBe(27)
    saveCompletedBattle()
    expect(exitChallenge(true).ok).toBe(true)
    expect(useChallengeStore.getState().results[0]).toMatchObject({ rulesVersion: version, sessionId: configured.id })
    expect(serializeGameState(useGameStore.getState())).toEqual(campaignBefore)
  })

  it.each([1, 2] as const)('recovers the campaign rather than trusting an invalid rules v%s replay cursor', async (version) => {
    const configured = createChallengeSession({ version, mode: 'seed', seed: 'Versioned-invalid-cursor', speciesIds: [] })
    expect(launchChallenge(configured).ok).toBe(true)
    const envelope = JSON.parse(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)!)
    envelope.state.battaglia.seeded.cursor = -1
    localStorage.setItem(ACTIVE_CHALLENGE_STORAGE_KEY, JSON.stringify(envelope))
    await useGameStore.persist.rehydrate()
    expect(useGameStore.getState().challengeContext).toBeNull()
    expect(useGameStore.getState().giocatore1.nome).toBe('Campagna uno')
    expect(localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)).toBeNull()
    expect(useChallengeStore.getState().results).toEqual([])
  })
})
