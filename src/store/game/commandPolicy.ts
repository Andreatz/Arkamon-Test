import { isLeagueTurnLocked } from '@/league/leagueModel'
import type { GameSaveState } from '@/save/gamePersistence'
import type { ChallengeContext } from '@/challenges/challengePersistence'

export type CommandCode = 'applied' | 'unchanged' | 'invalid-player' | 'battle-active' | 'challenge-active'
  | 'league-active' | 'scene-locked' | 'wrong-turn' | 'invalid-slot' | 'empty-slot' | 'team-full'
  | 'team-level-cap' | 'invalid-battle' | 'secret-locked' | 'readonly' | 'recovery-required' | 'save-pending' | 'save-failed'
export type GameCommandResult =
  | { ok: true; code: 'applied' | 'unchanged'; changed: boolean; message: string }
  | { ok: false; code: Exclude<CommandCode, 'applied' | 'unchanged'>; message: string }
export type CommandFailure = Extract<GameCommandResult, { ok: false }>
export const commandFailure = (code: CommandFailure['code'], message: string): CommandFailure => ({ ok: false, code, message })
export const commandApplied = (message: string): GameCommandResult => ({ ok: true, code: 'applied', changed: true, message })

export type CampaignActivityState = Pick<GameSaveState, 'battaglia' | 'interactionProgress' | 'league'> & { challengeContext: ChallengeContext | null }
export type TeamManagementState = CampaignActivityState & Pick<GameSaveState, 'scenaCorrente' | 'giocatoreAttivo' | 'turnoOverworld'>

/** This is the campaign boundary, not an authorization rule for battle actions.
 * Challenge/League continuations have their own explicit commands and must not
 * call an ordinary campaign command to bypass their reserved roster/turn.
 */
export function campaignActivityBlock(state: CampaignActivityState): CommandFailure | null {
  if (state.challengeContext) return commandFailure('challenge-active', 'Concludi o abbandona la sfida prima di modificare la campagna.')
  if (state.battaglia || state.interactionProgress.pendingBattle) return commandFailure('battle-active', 'Concludi prima la battaglia in corso.')
  if (isLeagueTurnLocked(state.league)) return commandFailure('league-active', 'Concludi la Lega prima di modificare la squadra o iniziare altre attività.')
  return null
}

export function teamManagementBlock(state: TeamManagementState, playerId: 1 | 2): CommandFailure | null {
  if (playerId !== 1 && playerId !== 2) return commandFailure('invalid-player', 'Giocatore non valido.')
  const activity = campaignActivityBlock(state)
  if (activity) return activity
  if (['titolo', 'laboratorio', 'evoluzione'].includes(state.scenaCorrente.scena))
    return commandFailure('scene-locked', 'Concludi questa schermata prima di modificare la squadra.')
  const turn = state.turnoOverworld
  if (state.giocatoreAttivo !== playerId || turn.giocatoreAttivo !== playerId
    || !Number.isInteger(turn.azioniRimaste) || turn.azioniRimaste < 1 || turn.azioniRimaste > 2)
    return commandFailure('wrong-turn', 'La squadra è in consultazione. Potrai modificarla durante il tuo turno.')
  return null
}

/** Used by both the displayed controls and the command itself. Consultation
 * remains available for either player and never changes the active turn.
 */
export function canManagePlayerTeam(state: TeamManagementState, playerId: 1 | 2): boolean {
  return teamManagementBlock(state, playerId) === null
}
