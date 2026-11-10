import { normalizeGameSave, serializeGameState } from '@/save/gamePersistence'
import { createSeededRandomState } from './seededRandom'
import { createChallengeSession, isChallengeRulesVersion } from './challengeRules'
import type { ChallengeSession } from './types'
import { canRecoverCampaignCheckpoint, recoverCampaignCheckpoint, retireRecoveredCampaignCheckpoint, readCampaignCheckpoint, writeCampaignCheckpoint, removeCampaignCheckpoint } from '@/session/sessionOwnership'

export const ACTIVE_CHALLENGE_STORAGE_KEY = 'arkamon-active-challenge-v1'
export interface ChallengeContext { version: 1; attemptId: string; session: ChallengeSession; campaign: Record<string, unknown> }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export function canonicalChallengeSession(value: unknown): ChallengeSession | null {
  if (!record(value) || !isChallengeRulesVersion(value.version) || value.rulesVersion !== value.version || !Array.isArray(value.team) || value.team.length !== 6
    || !value.team.every((p) => record(p) && typeof p.specieId === 'number') || (value.mode !== 'seed' && value.mode !== 'fanta') || typeof value.seed !== 'string') return null
  try { return createChallengeSession({ version: value.version, mode: value.mode, seed: value.seed, speciesIds: value.team.map((p) => (p as { specieId: number }).specieId) }) }
  catch { return null }
}
export function normalizeChallengeContext(value: unknown): ChallengeContext | null {
  if (!record(value) || value.version !== 1 || typeof value.attemptId !== 'string' || !value.attemptId || value.attemptId.length > 120
    || !record(value.campaign) || !record(value.campaign.giocatore1) || !record(value.campaign.giocatore2)) return null
  const session = canonicalChallengeSession(value.session)
  if (!session) return null
  return { version: 1, attemptId: value.attemptId, session, campaign: serializeGameState(normalizeGameSave(value.campaign).state) }
}
/** Challenge writes never touch the campaign key. A valid active envelope resumes after reload. */
export const scopedGameStorage = {
  getItem(name: string): string | null {
    const campaign = readCampaignCheckpoint(name)
    const active = readCampaignCheckpoint(ACTIVE_CHALLENGE_STORAGE_KEY)
    if (active) {
      try {
        const state = JSON.parse(active)?.state
        const context = normalizeChallengeContext(state?.challengeContext)
        if (context) {
          const seeded = state?.battaglia?.seeded
          try {
            if (seeded?.algorithm !== 'arkamon-counter-v1' || seeded.seed !== context.session.seed) throw new Error('Invalid seed')
            createSeededRandomState(seeded.seed, seeded.cursor)
            if (!normalizeGameSave(state).state.battaglia?.seeded) throw new Error('Invalid battle')
            return active
          } catch {
            // Persist the recovered campaign before retiring this envelope; otherwise
            // each reload would resurrect its stale snapshot and discard new progress.
            const recovered = JSON.stringify({ version: 0, state: context.campaign })
            if (canRecoverCampaignCheckpoint()) {
              recoverCampaignCheckpoint(name, recovered)
              retireRecoveredCampaignCheckpoint(ACTIVE_CHALLENGE_STORAGE_KEY)
            }
            return recovered
          }
        }
      }
      catch { /* Keep unreadable data available; resume the campaign instead. */ }
    }
    return campaign
  },
  setItem(name: string, text: string) {
    const envelope = JSON.parse(text)
    if (envelope?.state?.challengeContext) writeCampaignCheckpoint(ACTIVE_CHALLENGE_STORAGE_KEY, text)
    else writeCampaignCheckpoint(name, text)
  },
  removeItem(name: string) { removeCampaignCheckpoint(name) },
}
