import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isCampaignWritable, sessionOwnershipMessage, readCampaignCheckpoint, writeCampaignCheckpoint, removeCampaignCheckpoint } from '@/session/sessionOwnership'
import { getPokemon } from '@/data'
import { CHALLENGE_RULES_VERSION, isChallengeRulesVersion, validateFantaTeam } from './challengeRules'
import { validateChallengeSeed } from './seededRandom'
import type { ChallengeDraft, ChallengeResult, ChallengeSession } from './types'

export const CHALLENGE_STORAGE_KEY = 'arkamon-challenges-v1'
export const MAX_CHALLENGE_RESULTS = 30
const defaultDraft = (): ChallengeDraft => ({ version: CHALLENGE_RULES_VERSION, seed: 'ARKAMON-2026', mode: 'seed', speciesIds: [] })
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))

export interface ChallengeCollection { version: 1; draft: ChallengeDraft; results: ChallengeResult[] }
type WriteResult = { ok: true } | { ok: false; error: string }
interface ChallengeStore extends ChallengeCollection {
  storageWarning: string | null
  saveDraft: (draft: ChallengeDraft) => WriteResult
  rememberSession: (session: ChallengeSession) => WriteResult
  addResult: (result: ChallengeResult) => WriteResult
  clearResults: () => WriteResult
}

export function normalizeChallengeDraft(value: unknown): ChallengeDraft {
  if (!isRecord(value) || !isChallengeRulesVersion(value.version) || (value.mode !== 'seed' && value.mode !== 'fanta')) return defaultDraft()
  try {
    const seed = validateChallengeSeed(value.seed)
    const checked = validateFantaTeam(value.speciesIds, false, value.version)
    if (!checked.ok) return defaultDraft()
    return { version: value.version, seed, mode: value.mode, speciesIds: [...value.speciesIds as number[]] }
  } catch { return defaultDraft() }
}

export function normalizeChallengeResult(value: unknown): ChallengeResult | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || value.id.length > 120
    || typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 120
    || (value.mode !== 'seed' && value.mode !== 'fanta') || (value.outcome !== 'vittoria' && value.outcome !== 'sconfitta')
    || !Number.isSafeInteger(value.turns) || (value.turns as number) < 0 || (value.turns as number) > 100_000
    || !Number.isSafeInteger(value.remainingHp) || (value.remainingHp as number) < 0 || (value.remainingHp as number) > 1_000_000
    || typeof value.completedAt !== 'string' || value.completedAt.length > 40 || !Number.isFinite(Date.parse(value.completedAt))
    || !Array.isArray(value.team) || value.team.length !== 6 || new Set(value.team).size !== 6
    || value.team.some((id) => !Number.isSafeInteger(id) || !getPokemon(id))) return null
  const rulesVersion = value.rulesVersion === undefined ? 1 : value.rulesVersion
  if (!isChallengeRulesVersion(rulesVersion) || !validateFantaTeam(value.team, true, rulesVersion).ok) return null
  const idVersion = /^challenge-v(\d+)-/.exec(value.sessionId)
  if (idVersion && Number(idVersion[1]) !== rulesVersion) return null
  try {
    return { id: value.id, sessionId: value.sessionId, rulesVersion, mode: value.mode, seed: validateChallengeSeed(value.seed),
      outcome: value.outcome, turns: value.turns as number, remainingHp: value.remainingHp as number,
      completedAt: value.completedAt, team: [...value.team] as number[] }
  } catch { return null }
}

export function normalizeChallengeCollection(value: unknown): ChallengeCollection {
  const results: ChallengeResult[] = []
  const ids = new Set<string>()
  if (isRecord(value) && value.version === 1 && Array.isArray(value.results)) {
    for (const candidate of value.results.slice(0, MAX_CHALLENGE_RESULTS * 2)) {
      const result = normalizeChallengeResult(candidate)
      if (!result || ids.has(result.id)) continue
      ids.add(result.id)
      results.push(result)
      if (results.length === MAX_CHALLENGE_RESULTS) break
    }
  }
  return { version: 1, draft: normalizeChallengeDraft(isRecord(value) ? value.draft : null), results }
}

/** Scores are comparable only within the same configuration and rules version. */
export function challengeLeaderboard(results: readonly ChallengeResult[], configuration: ChallengeSession | string): ChallengeResult[] {
  const sessionId = typeof configuration === 'string' ? configuration : configuration.id
  const rulesVersion = typeof configuration === 'string' ? (/^challenge-v2-/.test(configuration) ? 2 : 1) : configuration.rulesVersion
  return results.filter((result) => result.sessionId === sessionId && (result.rulesVersion ?? 1) === rulesVersion
    && (typeof configuration === 'string' || result.seed === configuration.seed && result.mode === configuration.mode
      && result.team.length === configuration.team.length && result.team.every((id, index) => id === configuration.team[index].specieId))).sort((a, b) => {
    const outcome = Number(b.outcome === 'vittoria') - Number(a.outcome === 'vittoria')
    return outcome || a.turns - b.turns || b.remainingHp - a.remainingHp || a.completedAt.localeCompare(b.completedAt)
  })
}

function publish(collection: ChallengeCollection, storageWarning: string | null) {
  const storage = useChallengeStore.persist.getOptions().storage
  if (storage) useChallengeStore.persist.setOptions({ storage: { ...storage, setItem: () => undefined } })
  try { useChallengeStore.setState({ ...collection, storageWarning }) }
  finally { if (storage) useChallengeStore.persist.setOptions({ storage }) }
}

function write(collection: ChallengeCollection, keepResultInMemory = false): WriteResult {
  if (!isCampaignWritable()) return { ok: false, error: sessionOwnershipMessage() }
  try {
    const storage = useChallengeStore.persist.getOptions().storage
    if (!storage) throw new Error('Storage unavailable')
    storage.setItem(CHALLENGE_STORAGE_KEY, { state: collection, version: 1 })
    publish(collection, null)
    return { ok: true }
  } catch {
    const error = keepResultInMemory
      ? 'Non riesco a salvare il risultato su questo dispositivo. Rimane consultabile durante questa sessione: libera spazio e riprova.'
      : 'Non riesco a salvare le sfide su questo dispositivo. Libera spazio e riprova; puoi condividere la configurazione per conservarla.'
    const current = useChallengeStore.getState()
    const kept = keepResultInMemory ? collection : { version: 1 as const, draft: current.draft, results: current.results }
    if (current.storageWarning !== error || JSON.stringify(current.results) !== JSON.stringify(kept.results)) publish(kept, error)
    return { ok: false, error }
  }
}

export const useChallengeStore = create<ChallengeStore>()(persist((_set, get) => ({
  version: 1, draft: defaultDraft(), results: [], storageWarning: null,
  saveDraft: (draft) => {
    if (!isChallengeRulesVersion(draft.version) || (draft.mode !== 'seed' && draft.mode !== 'fanta')) return { ok: false, error: 'Versione o modalità della sfida non valida.' }
    try { validateChallengeSeed(draft.seed) } catch (error) { return { ok: false, error: (error as Error).message } }
    const validation = validateFantaTeam(draft.speciesIds, false, draft.version)
    if (!validation.ok) return validation
    return write({ version: 1, draft: normalizeChallengeDraft(draft), results: get().results })
  },
  rememberSession: (session) => get().saveDraft({ version: session.rulesVersion, mode: session.mode, seed: session.seed, speciesIds: session.mode === 'fanta' ? session.team.map((pokemon) => pokemon.specieId) : [] }),
  addResult: (candidate) => {
    const result = normalizeChallengeResult(candidate)
    if (!result) return { ok: false, error: 'Il risultato della sfida non è valido.' }
    if (get().results.some((item) => item.id === result.id)) {
      // A failed write keeps the result readable in memory. Retrying its same
      // completion must durably write that original result before reporting success.
      if (get().storageWarning) return write({ version: 1, draft: get().draft, results: get().results }, true)
      return { ok: true }
    }
    return write({ version: 1, draft: get().draft, results: [result, ...get().results].slice(0, MAX_CHALLENGE_RESULTS) }, true)
  },
  clearResults: () => write({ version: 1, draft: get().draft, results: [] }),
}), {
  name: CHALLENGE_STORAGE_KEY, version: 1,
  storage: createJSONStorage(() => ({
    getItem: (key) => { try { return readCampaignCheckpoint(key) } catch { return null } },
    setItem: (key, value) => writeCampaignCheckpoint(key, value),
    removeItem: (key) => removeCampaignCheckpoint(key),
  })),
  partialize: (state) => ({ version: 1, draft: state.draft, results: state.results }),
  merge: (saved, current) => ({ ...current, ...normalizeChallengeCollection(saved) }),
  onRehydrateStorage: () => (_state, error) => {
    if (error) queueMicrotask(() => {
      const current = useChallengeStore.getState()
      publish({ version: 1, draft: current.draft, results: current.results }, 'Il salvataggio delle sfide non è leggibile. I dati originali sono conservati sul dispositivo; importa una configurazione valida per riprendere.')
    })
  },
}))

const setChallengeState = useChallengeStore.setState
useChallengeStore.setState = ((...args: Parameters<typeof setChallengeState>) => {
  if (isCampaignWritable()) setChallengeState(...args)
}) as typeof useChallengeStore.setState
