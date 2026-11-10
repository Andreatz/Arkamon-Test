/**
 * Percorso_3 (Fase E.8) - strada in uscita da Milano verso Torino.
 *
 * Layout 13x7:
 *   - 6 cespugli A..F con incontri selvatici dedicati
 *   - Camionista Tito (id 251) come allenatore di percorso
 *   - Uscita ovest verso Milano, uscita est verso Percorso_4
 */
import type { MappaGriglia } from '@/types'
import { T, O, C, X, U } from './_helpers'

const U_MILANO = U('Milano', 11, 4)
const U_PERCORSO_4 = U('Percorso_4', 1, 3)

export const PERCORSO_3: MappaGriglia = {
  id: 'Percorso_3',
  larghezza: 13,
  altezza: 7,
  background: '/backgrounds/route_3.jpg',
  spawnDefault: { x: 1, y: 3 },
  caselle: [
    [T, T, C('A'), T, T, T, O, T, T, T, C('B'), T, T],
    [T, O, T, T, O, T, O, T, O, T, T, O, T],
    [T, O, T, C('C'), T, T, X(251), T, T, C('D'), T, O, T],
    [U_MILANO, T, T, T, T, T, T, T, T, T, T, T, U_PERCORSO_4],
    [T, O, T, T, O, O, T, O, O, T, T, O, T],
    [T, O, T, C('E'), T, T, T, T, T, C('F'), T, O, T],
    [T, T, T, T, T, T, T, T, T, T, T, T, T],
  ],
}
