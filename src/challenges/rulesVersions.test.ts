import { beforeEach, describe, expect, it } from 'vitest'
import { getMossa, getPokemon, POKEMON_BASE } from '@/data'
import { calcolaDanno, calcolaHPMax } from '@/engine/battleEngine'
import { createChallengeSession, exportChallengeCode, fantaSpeciesCost, fantaTeamCost, generateSeedTeam, importChallengeCode, speciesEvolutionStage, validateFantaTeam } from './challengeRules'
import { canonicalChallengeSession } from './challengePersistence'
import { challengeLeaderboard, normalizeChallengeCollection, normalizeChallengeDraft, normalizeChallengeResult, useChallengeStore } from './challengeStore'
import type { ChallengeResult, ChallengeRulesVersion } from './types'
import golden from './__fixtures__/classicSessionsV1.json'

const configuration = (version: ChallengeRulesVersion) => createChallengeSession({ version, seed: 'Italia', mode: 'seed', speciesIds: [] })
const result = (version: ChallengeRulesVersion): ChallengeResult => {
  const session = configuration(version)
  return { id: `version-${version}`, sessionId: session.id, rulesVersion: version, mode: session.mode, seed: session.seed,
    team: session.team.map((pokemon) => pokemon.specieId), outcome: 'vittoria', turns: 10, remainingHp: 20, completedAt: '2026-10-12T12:00:00Z' }
}

describe('classic rules v1 remain the released baseline', () => {
  it.each(golden.sessions)('preserves both teams and configuration identity for $seed', (expected) => {
    const session = createChallengeSession({ version: 1, mode: 'seed', seed: expected.seed, speciesIds: [] })
    expect(session.id).toBe(expected.id)
    expect(session.team.map((pokemon) => pokemon.specieId)).toEqual(expected.team)
    expect(session.enemyTeam.map((pokemon) => pokemon.specieId)).toEqual(expected.enemy)
    expect(importChallengeCode(exportChallengeCode(session))).toEqual(session)
    expect(canonicalChallengeSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
  })

  it('retains the released prices and corrected Grimbolt lineage without inventing earlier prices', () => {
    expect(fantaSpeciesCost(53, 1)).toBe(21)
    expect(fantaSpeciesCost(95, 1)).toBe(15)
    expect([23, 24, 25, 26].map((id) => fantaSpeciesCost(id, 1))).toEqual([13, 13, 13, 15])
    expect([23, 24, 25, 26].map((id) => speciesEvolutionStage(id, 1))).toEqual([0, 0, 1, 0])
  })
})

describe('updated rules v2 price offensive moves only', () => {
  it('reduces Leafrex and Beestrix prices without changing battle data or damage', () => {
    const before = structuredClone(POKEMON_BASE)
    expect(fantaSpeciesCost(53)).toBe(19)
    expect(fantaSpeciesCost(95)).toBe(12)
    expect(fantaSpeciesCost(53, 2)).toBeLessThan(fantaSpeciesCost(53, 1))
    expect(fantaSpeciesCost(95, 2)).toBeLessThan(fantaSpeciesCost(95, 1))
    const attacker = { istanzaId: 'leafrex', specieId: 53, nome: 'Leafrex', livello: 20, hp: 20, xp: 0 }
    const defender = { ...attacker, istanzaId: 'target', specieId: 1 }
    const ordinary = calcolaDanno(attacker, defender, 1, () => .5, false)
    fantaSpeciesCost(53, 1); fantaSpeciesCost(53, 2)
    expect(calcolaDanno(attacker, defender, 1, () => .5, false)).toEqual(ordinary)
    expect(POKEMON_BASE).toEqual(before)
  })

  it('preserves prices for species without HP healing moves and keeps every price integral', () => {
    for (const species of POKEMON_BASE) {
      expect(Number.isSafeInteger(fantaSpeciesCost(species.id, 2))).toBe(true)
      const hasHeal = species.mosse.some((id) => ['CURA', 'CURA_PCT'].includes(getMossa(id)?.effetto ?? ''))
      if (!hasHeal) expect(fantaSpeciesCost(species.id, 2)).toBe(fantaSpeciesCost(species.id, 1))
    }
  })

  it.each([1, 2] as const)('generates deterministic affordable six-species teams with rules v%s', (version) => {
    for (let index = 0; index < 30; index++) {
      const seed = `Versioned-${index}`
      const team = generateSeedTeam(seed, 'player', version)
      expect(generateSeedTeam(seed, 'player', version)).toEqual(team)
      expect(validateFantaTeam(team, true, version)).toEqual({ ok: true })
      expect(fantaTeamCost(team, version)).toBeLessThanOrEqual(100)
      const session = createChallengeSession({ version, seed, mode: 'fanta', speciesIds: team })
      expect(session.rulesVersion).toBe(version)
      expect(session.id).toMatch(new RegExp(`^challenge-v${version}-`))
      expect(session.team.every((pokemon) => pokemon.livello === 20 && pokemon.hp === calcolaHPMax(pokemon))).toBe(true)
      expect(importChallengeCode(exportChallengeCode(session))).toEqual(session)
    }
  })

  it('can admit a Fanta team under updated prices while refusing it under the classic budget', () => {
    const team = [53, 95, 1, 2, 3, 4]
    expect(fantaTeamCost(team, 2)).toBeLessThan(fantaTeamCost(team, 1))
    // Find a concrete boundary team from the unchanged species catalog, not a fake price.
    const boundary = POKEMON_BASE.map((species) => [53, 95, 1, 2, 3, species.id])
      .find((ids) => new Set(ids).size === 6 && fantaTeamCost(ids, 2) <= 100 && fantaTeamCost(ids, 1) > 100)
    expect(boundary).toBeDefined()
    expect(validateFantaTeam(boundary, true, 2)).toEqual({ ok: true })
    expect(validateFantaTeam(boundary, true, 1).ok).toBe(false)
  })
})

describe('versioned persistence, imports and fair comparisons', () => {
  beforeEach(() => {
    const saved = new Map<string, unknown>()
    useChallengeStore.persist.setOptions({ storage: { getItem: (key) => saved.get(key) as never,
      setItem: (key, value) => { saved.set(key, value) }, removeItem: (key) => { saved.delete(key) } } })
    useChallengeStore.setState({ version: 1, draft: normalizeChallengeDraft(null), results: [], storageWarning: null })
  })

  it('defaults new drafts to updated rules and preserves old drafts and results as classic', () => {
    expect(normalizeChallengeDraft(null).version).toBe(2)
    const oldResult = result(1)
    delete oldResult.rulesVersion
    const migrated = normalizeChallengeCollection({ version: 1,
      draft: { version: 1, seed: 'Italia', mode: 'fanta', speciesIds: [53, 95] }, results: [oldResult] })
    expect(migrated.draft).toEqual({ version: 1, seed: 'Italia', mode: 'fanta', speciesIds: [53, 95] })
    expect(migrated.results[0].rulesVersion).toBe(1)
    expect(migrated.results[0].sessionId).toBe(oldResult.sessionId)
  })

  it.each([1, 2] as const)('persists and reloads drafts and results using rules v%s', async (version) => {
    const session = configuration(version)
    expect(useChallengeStore.getState().rememberSession(session).ok).toBe(true)
    expect(useChallengeStore.getState().addResult(result(version)).ok).toBe(true)
    await useChallengeStore.persist.rehydrate()
    expect(useChallengeStore.getState().draft.version).toBe(version)
    expect(useChallengeStore.getState().results[0].rulesVersion).toBe(version)
    expect(useChallengeStore.getState().results[0].sessionId).toBe(session.id)
  })

  it('never mixes versions, seeds, modes or ordered teams, even when a stored ID is copied', () => {
    const session = configuration(2), exact = result(2)
    const candidates = [exact, { ...exact, id: 'wrong-version', rulesVersion: 1 as const },
      { ...exact, id: 'wrong-seed', seed: 'italia' }, { ...exact, id: 'wrong-mode', mode: 'fanta' as const },
      { ...exact, id: 'wrong-order', team: [...exact.team].reverse() }, { ...exact, id: 'wrong-id', sessionId: configuration(1).id }]
    expect(challengeLeaderboard(candidates, session)).toEqual([exact])
    expect(challengeLeaderboard([result(1), exact], configuration(1))).toEqual([result(1)])
  })

  it.each([0, 3, '2', null])('refuses unsupported or malformed versions %j', (version) => {
    const session = configuration(2)
    const code = JSON.parse(exportChallengeCode(session))
    code.version = version; code.rulesVersion = version
    expect(() => importChallengeCode(JSON.stringify(code))).toThrow(/versione/)
    expect(canonicalChallengeSession({ ...session, version, rulesVersion: version })).toBeNull()
    expect(normalizeChallengeResult({ ...result(2), rulesVersion: version })).toBeNull()
    const before = useChallengeStore.getState().draft
    expect(useChallengeStore.getState().saveDraft({ version: version as never, mode: 'seed', seed: 'Roma', speciesIds: [] }).ok).toBe(false)
    expect(useChallengeStore.getState().draft).toBe(before)
  })

  it('rejects mismatched schema/rules versions and restores configuration rather than trusted HP or cursors', () => {
    const session = configuration(2)
    const code = JSON.parse(exportChallengeCode(session))
    expect(() => importChallengeCode(JSON.stringify({ ...code, rulesVersion: 1 }))).toThrow()
    expect(canonicalChallengeSession({ ...session, rulesVersion: 1 })).toBeNull()
    expect(normalizeChallengeResult({ ...result(2), rulesVersion: 1 })).toBeNull()
    expect(importChallengeCode(JSON.stringify({ ...code, rng: { algorithm: 'unknown', cursor: Infinity }, hp: 9999 }))).toEqual(session)
    expect(canonicalChallengeSession({ ...session, team: session.team.map((pokemon) => ({ ...pokemon, hp: 99999, livello: 100 })), rng: { cursor: 99999 } })).toEqual(session)
    expect(getPokemon(53)?.mosse).toEqual([66, 176, 0])
  })
})
