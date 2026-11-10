/**
 * Milano (Fase E.8) - seconda citta palestra migrata a griglia.
 *
 * Layout 12x8:
 *   - Anna Voltaggio (id 302) nella palestra
 *   - Centro Pokemon e deposito accessibili
 *   - NPC dialogo in piazza
 *   - Uscita ovest verso Percorso_2, est verso Percorso_3, sud verso mappa-principale
 */
import type { MappaGriglia } from '@/types'
import { T, O, X, EDF, U, NPC } from './_helpers'

const U_PERCORSO_2 = U('Percorso_2', 11, 3)
const U_PERCORSO_3 = U('Percorso_3', 1, 3)
const U_MAIN = U('mappa-principale', 9, 4)

export const MILANO: MappaGriglia = {
  id: 'Milano',
  larghezza: 12,
  altezza: 8,
  background: '/backgrounds/milano.jpg',
  spawnDefault: { x: 1, y: 4 },
  caselle: [
    [T, T, T, T, T, T, T, T, T, T, T, T],
    [T, O, O, O, T, T, T, T, O, O, O, T],
    [T, O, EDF('palestra'), O, T, T, T, T, O, EDF('centro'), O, T],
    [T, O, X(302), O, T, T, NPC('milano-passante'), T, O, O, O, T],
    [U_PERCORSO_2, T, T, T, T, T, T, T, T, T, T, U_PERCORSO_3],
    [T, T, T, T, O, O, O, T, T, EDF('deposito'), T, T],
    [T, T, T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T, T, U_MAIN],
  ],
}
