/**
 * Registry delle mappe-griglia (Fase E.6).
 * Aggiungi qui ogni nuova mappa man mano che la migri al sistema overworld.
 */
import type { MappaGriglia } from '@/types'
import { MILANO } from './Milano'
import { PERCORSO_1 } from './Percorso_1'
import { PERCORSO_2 } from './Percorso_2'
import { PERCORSO_3 } from './Percorso_3'
import { PORDENONE } from './Pordenone'
import { VENEZIA } from './Venezia'
import { MAPPA_PRINCIPALE_GRIGLIA } from './mappa-principale'
import { PIACENZA } from './Piacenza'
import { MAPPE_RESTANTI } from './restanti'

export const MAPPE_GRIGLIA: Record<string, MappaGriglia> = {
  [PORDENONE.id]: PORDENONE,
  [MILANO.id]: MILANO,
  [PERCORSO_1.id]: PERCORSO_1,
  [PERCORSO_2.id]: PERCORSO_2,
  [PERCORSO_3.id]: PERCORSO_3,
  [VENEZIA.id]: VENEZIA,
  [PIACENZA.id]: PIACENZA,
  ...Object.fromEntries(MAPPE_RESTANTI.map((m) => [m.id, m])),
  [MAPPA_PRINCIPALE_GRIGLIA.id]: MAPPA_PRINCIPALE_GRIGLIA,
}

/** Ritorna la `MappaGriglia` con id dato, o `null` se non registrata. */
export function getMappaGriglia(id: string): MappaGriglia | null {
  return MAPPE_GRIGLIA[id] ?? null
}

export {
  PORDENONE,
  MILANO,
  PERCORSO_1,
  PERCORSO_2,
  PERCORSO_3,
  VENEZIA,
  PIACENZA,
  MAPPA_PRINCIPALE_GRIGLIA,
}
export * from './restanti'
