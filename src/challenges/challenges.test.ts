import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POKEMON_BASE } from '@/data'
import { calcolaHPMax } from '@/engine/battleEngine'
import { CHALLENGE_LEVEL, FANTA_BUDGET, createChallengeSession, exportChallengeCode, fantaSpeciesCost, fantaTeamCost, generateSeedTeam, importChallengeCode, speciesEvolutionStage, validateFantaTeam } from './challengeRules'
import { CHALLENGE_STORAGE_KEY, challengeLeaderboard, normalizeChallengeCollection, normalizeChallengeDraft, normalizeChallengeResult, useChallengeStore } from './challengeStore'
import { MAX_RANDOM_CURSOR, createSeededRandomState, nextSeededRandom, validateChallengeSeed } from './seededRandom'
import type { ChallengeResult } from './types'

const result = (patch: Partial<ChallengeResult> = {}): ChallengeResult => ({ id: 'attempt-1', sessionId: 'challenge-1', rulesVersion: 1, mode: 'seed', seed: 'Italia', outcome: 'vittoria', turns: 12, remainingHp: 30, completedAt: '2026-10-10T10:00:00.000Z', team: generateSeedTeam('Italia', 'player', 1), ...patch })

describe('versioned seeded random', () => {
  it('resumes the exact following roll from a JSON cursor', () => {
    let state = createSeededRandomState('Roma')
    const first = nextSeededRandom(state)
    state = first.state
    const second = nextSeededRandom(state)
    expect(nextSeededRandom(JSON.parse(JSON.stringify(state)))).toEqual(second)
    expect(state.cursor).toBe(1)
    expect(second.state.cursor).toBe(2)
    expect(first.value).not.toBe(second.value)
    expect(first.value).toBeGreaterThanOrEqual(0)
    expect(first.value).toBeLessThan(1)
    expect(nextSeededRandom(createSeededRandomState('Roma'))).toEqual(first)
  })
  it('keeps an immutable input and independent streams', () => {
    const state = createSeededRandomState('Venezia')
    const first = nextSeededRandom(state)
    expect(state.cursor).toBe(0)
    expect(first.value).not.toBe(nextSeededRandom(createSeededRandomState('Milano')).value)
    expect(nextSeededRandom(state).value).toBe(first.value)
  })
  it('does not replace or use global Math.random', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Unexpected global RNG') })
    expect(() => createChallengeSession({ version: 1, mode: 'seed', seed: 'Deterministico', speciesIds: [] })).not.toThrow()
    random.mockRestore()
  })
  it('normalizes surrounding whitespace and unicode without changing case', () => {
    expect(validateChallengeSeed('  città  ')).toBe('città')
    expect(validateChallengeSeed('citta\u0300')).toBe('città')
    expect(validateChallengeSeed('Roma')).not.toBe(validateChallengeSeed('roma'))
  })
  it.each(['', '  ', '\u0000Roma', 'R'.repeat(65)])('rejects invalid seed %j', (seed) => {
    expect(() => createSeededRandomState(seed)).toThrow()
  })
  it.each([-1, 1.5, NaN, Infinity, MAX_RANDOM_CURSOR + 1])('rejects invalid cursor %s', (cursor) => {
    expect(() => createSeededRandomState('Roma', cursor)).toThrow()
  })
  it('rejects unsupported algorithm and exhausted state', () => {
    expect(() => nextSeededRandom({ algorithm: 'unknown' as never, seed: 'Roma', cursor: 0 })).toThrow()
    expect(() => nextSeededRandom(createSeededRandomState('Roma', MAX_RANDOM_CURSOR))).toThrow()
  })
})

describe('seed challenges and Fanta rules', () => {
  it('reproduces two complete teams and independent full-HP battle random state', () => {
    const draft = { version: 1 as const, mode: 'seed' as const, seed: 'Arkamon', speciesIds: [] }
    const one = createChallengeSession(draft)
    expect(createChallengeSession(draft)).toEqual(one)
    expect(one.team).toHaveLength(6)
    expect(one.enemyTeam).toHaveLength(6)
    expect(new Set([...one.team, ...one.enemyTeam].map((pokemon) => pokemon.istanzaId)).size).toBe(12)
    expect(one.rng.cursor).toBe(0)
    for (const pokemon of [...one.team, ...one.enemyTeam]) {
      expect(pokemon.livello).toBe(CHALLENGE_LEVEL)
      expect(pokemon.hp).toBe(calcolaHPMax(pokemon))
      expect(pokemon.stato).toBeUndefined()
      expect(pokemon.xp).toBe(0)
    }
  })
  it('supports the maximum seed length during team generation', () => {
    expect(generateSeedTeam('R'.repeat(64), 'player')).toHaveLength(6)
  })
  it('can construct complete affordable squads across 120 seeds', () => {
    for (let index = 0; index < 120; index++) {
      for (const namespace of ['player', 'opponent'] as const) {
        const ids = generateSeedTeam(`Arkamon-${index}`, namespace)
        expect(validateFantaTeam(ids)).toEqual({ ok: true })
        expect(fantaTeamCost(ids)).toBeLessThanOrEqual(FANTA_BUDGET)
      }
    }
  })
  it('prices evolution stages and every catalog species', () => {
    expect(speciesEvolutionStage(1)).toBe(0)
    expect(speciesEvolutionStage(4)).toBe(3)
    for (const species of POKEMON_BASE) {
      expect(Number.isSafeInteger(fantaSpeciesCost(species.id))).toBe(true)
      expect(fantaSpeciesCost(species.id)).toBeGreaterThan(0)
    }
    expect(fantaSpeciesCost(4)).toBeGreaterThan(fantaSpeciesCost(1))
  })
  it('validates exactly six known unique species and budget', () => {
    expect(validateFantaTeam([]).ok).toBe(false)
    expect(validateFantaTeam([], false)).toEqual({ ok: true })
    expect(validateFantaTeam([1, 1], false).ok).toBe(false)
    expect(validateFantaTeam([9999], false).ok).toBe(false)
    expect(validateFantaTeam([1, 2, 3, 4, 5, 6, 7]).ok).toBe(false)
    const expensive = [...POKEMON_BASE].sort((a, b) => fantaSpeciesCost(b.id) - fantaSpeciesCost(a.id)).slice(0, 6).map((species) => species.id)
    expect(validateFantaTeam(expensive).ok).toBe(false)
    expect(() => createChallengeSession({ version: 1, seed: 'Roma', mode: 'fanta', speciesIds: expensive })).toThrow(/budget/)
  })
  it('makes Fanta opponents depend on the seed, with equal levels and fresh HP', () => {
    const team = generateSeedTeam('Uno', 'player', 1)
    const one = createChallengeSession({ version: 1, mode: 'fanta', seed: 'Roma', speciesIds: team })
    const two = createChallengeSession({ version: 1, mode: 'fanta', seed: 'Roma', speciesIds: generateSeedTeam('Due', 'player', 1) })
    expect(one.enemyTeam.map((pokemon) => pokemon.specieId)).toEqual(two.enemyTeam.map((pokemon) => pokemon.specieId))
    expect(one.id).not.toBe(two.id)
    expect(Math.max(...one.team.map((pokemon) => pokemon.livello)) - Math.min(...one.team.map((pokemon) => pokemon.livello))).toBeLessThanOrEqual(5)
  })
  it('round-trips configuration without trusting HP, state or cursor', () => {
    const session = createChallengeSession({ version: 1, mode: 'fanta', seed: 'Italia', speciesIds: generateSeedTeam('Italia', 'player', 1) })
    const code = exportChallengeCode(session)
    expect(importChallengeCode(code)).toEqual(session)
    const tampered = JSON.parse(code)
    tampered.hp = 9999
    tampered.rng = { cursor: 1_000_000 }
    expect(importChallengeCode(JSON.stringify(tampered))).toEqual(session)
    expect(code).not.toContain('hp')
    expect(code).not.toContain('cursor')
  })
  it('round-trips seeded generated teams', () => {
    const session = createChallengeSession({ version: 1, mode: 'seed', seed: 'Italia', speciesIds: [] })
    expect(importChallengeCode(exportChallengeCode(session))).toEqual(session)
  })
  it.each(['not JSON', '[]', '{}', 'a'.repeat(8193), JSON.stringify({ format: 'arkamon-challenge', version: 2, rulesVersion: 1, mode: 'seed', seed: 'Roma', speciesIds: [] }), JSON.stringify({ format: 'arkamon-challenge', version: 1, rulesVersion: 1, mode: 'seed', seed: 'Roma', speciesIds: [1] })])('rejects unsafe or unsupported shared code', (code) => {
    expect(() => importChallengeCode(code)).toThrow()
  })
})

describe('separate drafts and result archive', () => {
  beforeEach(() => {
    const storage = new Map<string, unknown>()
    useChallengeStore.persist.setOptions({ storage: { getItem: (key) => storage.get(key) as never, setItem: (key, value) => { storage.set(key, value) }, removeItem: (key) => { storage.delete(key) } } })
    useChallengeStore.setState({ version: 1, draft: normalizeChallengeDraft(null), results: [], storageWarning: null })
  })
  it('normalizes imported drafts and refuses invalid costs or duplicated slots', () => {
    expect(normalizeChallengeDraft({ version: 1, seed: 'Roma', mode: 'fanta', speciesIds: [1, 1] }).mode).toBe('seed')
    expect(normalizeChallengeDraft({ version: 1, seed: 'Roma', mode: 'fanta', speciesIds: [1] }).speciesIds).toEqual([1])
    expect(useChallengeStore.getState().saveDraft({ version: 1, seed: 'Roma', mode: 'fanta', speciesIds: [1] })).toEqual({ ok: true })
    expect(useChallengeStore.getState().draft.speciesIds).toEqual([1])
  })
  it('retains at most 30 unique valid completed results', () => {
    const candidates = Array.from({ length: 50 }, (_, index) => result({ id: `attempt-${index}` }))
    const collection = normalizeChallengeCollection({ version: 1, results: [candidates[0], candidates[0], ...candidates] })
    expect(collection.results).toHaveLength(30)
    expect(new Set(collection.results.map((item) => item.id)).size).toBe(30)
    expect(normalizeChallengeResult(result({ turns: Infinity }))).toBeNull()
    expect(normalizeChallengeResult(result({ team: [1] }))).toBeNull()
    expect(normalizeChallengeResult(result({ remainingHp: -1 }))).toBeNull()
  })
  it('records completion once and caps the archive', () => {
    for (let index = 0; index < 35; index++) expect(useChallengeStore.getState().addResult(result({ id: `attempt-${index}` }))).toEqual({ ok: true })
    useChallengeStore.getState().addResult(result({ id: 'attempt-34' }))
    expect(useChallengeStore.getState().results).toHaveLength(30)
    expect(useChallengeStore.getState().results[0].id).toBe('attempt-34')
  })
  it('compares only the same configuration and ranks wins, actions and HP', () => {
    const ranking = challengeLeaderboard([result({ id: 'loss', outcome: 'sconfitta', turns: 1 }), result({ id: 'different', sessionId: 'other', turns: 1 }), result({ id: 'slow', turns: 20 }), result({ id: 'best-hp', turns: 10, remainingHp: 40 }), result({ id: 'low-hp', turns: 10, remainingHp: 3 })], 'challenge-1')
    expect(ranking.map((item) => item.id)).toEqual(['best-hp', 'low-hp', 'slow', 'loss'])
  })
  it('keeps the previous draft on a quota error and exposes a warning', () => {
    const old = useChallengeStore.getState().draft
    useChallengeStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded') }, removeItem: () => undefined } })
    expect(useChallengeStore.getState().saveDraft({ version: 1, mode: 'fanta', seed: 'Roma', speciesIds: [1] }).ok).toBe(false)
    expect(useChallengeStore.getState().draft).toEqual(old)
    expect(useChallengeStore.getState().storageWarning).toMatch(/salvare/)
  })
  it('keeps a completed result readable during a storage failure without duplicates', () => {
    useChallengeStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded') }, removeItem: () => undefined } })
    expect(useChallengeStore.getState().addResult(result()).ok).toBe(false)
    expect(useChallengeStore.getState().results).toHaveLength(1)
    expect(useChallengeStore.getState().addResult(result()).ok).toBe(false)
    expect(useChallengeStore.getState().results).toHaveLength(1)
    expect(useChallengeStore.getState().clearResults().ok).toBe(false)
    expect(useChallengeStore.getState().results).toHaveLength(1)
  })
  it('retries an unsaved duplicate durably while preserving its original completion', async () => {
    const workingStorage = useChallengeStore.persist.getOptions().storage!
    useChallengeStore.persist.setOptions({ storage: { ...workingStorage, setItem: () => { throw new Error('QuotaExceeded') } } })
    const original = result()
    expect(useChallengeStore.getState().addResult(original).ok).toBe(false)
    expect(useChallengeStore.getState().addResult(original).ok).toBe(false)
    useChallengeStore.persist.setOptions({ storage: workingStorage })
    expect(useChallengeStore.getState().addResult(result({ completedAt: '2026-10-10T11:00:00.000Z', outcome: 'sconfitta' })).ok).toBe(true)
    expect(useChallengeStore.getState().results).toEqual([original])
    expect(useChallengeStore.getState().storageWarning).toBeNull()
    const saved = await workingStorage.getItem(CHALLENGE_STORAGE_KEY)
    expect((saved?.state as { results: unknown[] } | undefined)?.results).toEqual([original])
  })
})
