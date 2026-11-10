import { scambia, getInSlot, BOX_COUNT, SLOT_PER_BOX, SQUADRA_MAX, type SlotRef } from '@/engine/deposito'
import { isTeamWithinLevelCap, teamCapMessage } from '@/engine/teamLevelCap'
import type { GameSaveState } from '@/save/gamePersistence'
import { commandApplied, commandFailure, teamManagementBlock, type GameCommandResult, type TeamManagementState } from './commandPolicy'

type RosterState = TeamManagementState & Pick<GameSaveState, 'giocatore1' | 'giocatore2'>
export interface RosterResolution { result: GameCommandResult; patch?: Partial<GameSaveState> & { teamRuleMessage?: string | null } }

function validSlot(ref: SlotRef): boolean {
  if (!ref || typeof ref !== 'object') return false
  if (ref.tipo === 'squadra') return Number.isSafeInteger(ref.indice) && ref.indice >= 0 && ref.indice < SQUADRA_MAX
  if (ref.tipo !== 'deposito' || typeof ref.chiave !== 'string' || !/^\d+:\d+$/.test(ref.chiave)) return false
  const [box, slot] = ref.chiave.split(':').map(Number)
  return box >= 1 && box <= BOX_COUNT && slot >= 1 && slot <= SLOT_PER_BOX && ref.chiave === `${box}:${slot}`
}

/** Pure domain command. Nothing, including diagnostics, is written on denial.
 * In particular a negative/oversized slot must not create array properties or
 * deposit keys which would be silently lost by the next save normalization.
 */
export function resolveRosterSwap(state: RosterState, playerId: 1 | 2, source: SlotRef, target: SlotRef): RosterResolution {
  const denied = teamManagementBlock(state, playerId)
  if (denied) return { result: denied }
  if (!validSlot(source) || !validSlot(target)) return { result: commandFailure('invalid-slot', 'Scegli un posto valido della squadra o del deposito.') }
  const key = playerId === 1 ? 'giocatore1' : 'giocatore2', player = state[key]
  if (!getInSlot(player.squadra, player.deposito, source)) return { result: commandFailure('empty-slot', 'L’Arkamon selezionato non è più in questo posto.') }
  if (target.tipo === 'squadra' && target.indice >= player.squadra.length && player.squadra.length >= SQUADRA_MAX)
    return { result: commandFailure('team-full', 'La squadra è già completa.') }
  const swapped = scambia(player.squadra, player.deposito, source, target)
  if (swapped.squadra === player.squadra && swapped.deposito === player.deposito)
    return { result: { ok: true, code: 'unchanged', changed: false, message: 'L’Arkamon è già nel posto scelto.' } }
  // Existing saves outside the cap may be repaired by removing a teammate.
  if (!isTeamWithinLevelCap(swapped.squadra) && swapped.squadra.length >= player.squadra.length)
    return { result: commandFailure('team-level-cap', teamCapMessage(swapped.squadra)) }
  return { result: commandApplied('Arkamon spostato. Livello, HP e status sono conservati.'),
    patch: { [key]: { ...player, ...swapped }, teamRuleMessage: null } }
}
