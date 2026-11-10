/**
 * Helper builder per le mappe-griglia (Fase E.6).
 *
 * I file di mappa diventano molto verbosi se ogni casella è scritta come
 * oggetto completo. Questi alias compatti tengono la matrice leggibile.
 */
import type { Casella } from '@/types'

export const T: Casella = { tipo: 'transito' }
export const O: Casella = { tipo: 'ostacolo' }

export const C = (id: string): Casella => ({ tipo: 'cespuglio', cespuglioId: id })
export const X = (id: number): Casella => ({ tipo: 'allenatore', allenatoreId: id })
export const NPC = (id: string): Casella => ({ tipo: 'npc', dialogoId: id })

export const EDF = (
  id: 'centro' | 'palestra' | 'laboratorio' | 'deposito'
): Casella => ({ tipo: 'edificio', edificioId: id })

export const U = (versoMappaId: string, spawnX: number, spawnY: number): Casella => ({
  tipo: 'uscita',
  versoMappaId,
  spawnX,
  spawnY,
})
