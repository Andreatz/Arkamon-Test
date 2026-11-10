import { MOSSE } from '@data/index'
import type { MossaDef, TipoPokemon } from '@/types'
import data from '@/data/move-vfx-assignments.json'
import type { VfxAnchor } from './types'

export type MovesetTier = 'light' | 'medium' | 'heavy' | 'status'
export type AssignmentReview = 'confirmed' | 'proposed' | 'needs-adaptation' | 'missing'

export interface MoveVfxAssignment {
  sourceMoveId: number
  gameMoveId: number | null
  name: string
  type: string
  element: TipoPokemon
  tier: MovesetTier
  arkamon: { id: number; name: string }[]
  sourceCells: string[]
  assetId: string | null
  anchor: VfxAnchor | null
  scale: number | null
  review: AssignmentReview
  notes: string
}

// Owned separately from the generated asset manifest. Each asset is reserved
// for exactly one source move; null means a new distinct effect is still needed.
export const MOVE_VFX_ASSIGNMENTS = data.moves as MoveVfxAssignment[]
const byRuntimeId = new Map(MOVE_VFX_ASSIGNMENTS.map((entry) => [
  entry.gameMoveId ?? entry.sourceMoveId, entry,
]))
const normalize = (name: string) => name.trim().toLocaleLowerCase('it')

export function getMoveVfxAssignment(move: Pick<MossaDef, 'id' | 'nome'>): MoveVfxAssignment | undefined {
  const entry = byRuntimeId.get(move.id)
  // Protect against silently assigning to an unrelated move after a data import.
  return entry && normalize(entry.name) === normalize(move.nome) ? entry : undefined
}

export const MOVE_VFX_ASSIGNMENT_COUNTS = {
  total: MOVE_VFX_ASSIGNMENTS.length,
  assigned: MOVE_VFX_ASSIGNMENTS.filter((entry) => entry.assetId !== null).length,
  missing: MOVE_VFX_ASSIGNMENTS.filter((entry) => entry.assetId === null).length,
  needsAdaptation: MOVE_VFX_ASSIGNMENTS.filter((entry) => entry.review === 'needs-adaptation').length,
}

// Extra status/fixed-damage moves are preview definitions only. Importing the
// supplied moveset does not invent damage tables or alter combat mechanics.
export const VFX_MOVE_PREVIEWS: MossaDef[] = MOVE_VFX_ASSIGNMENTS.map((entry) => {
  const existing = entry.gameMoveId === null ? undefined : MOSSE.find((move) => move.id === entry.gameMoveId)
  return existing ?? {
    id: entry.sourceMoveId,
    nome: entry.name,
    tipo: entry.element,
    effetto: entry.type.includes('Recupero') || entry.type.includes('Cura') ? 'CURA'
      : entry.type.includes('Paralisi') ? 'PARALISI'
      : entry.type.includes('Confusione') ? 'CONFUSIONE'
      : entry.type.includes('Sonno') ? 'SONNO'
      : entry.type.includes('Veleno') ? 'VELENO' : null,
    valoreEffetto: null,
    dadiPerLivello: {},
    incrementoPerLivello: {},
  }
})
