/**
 * Percorso_2 (Fase E.8) - tratto tra Piacenza e il prossimo snodo lombardo.
 *
 * Layout 13x7:
 *   - 6 cespugli A..F con incontri selvatici dedicati
 *   - Pendolare Lia (id 250) come allenatore di percorso
 *   - Uscita ovest verso Piacenza, uscita est verso Milano
 */
import type { MappaGriglia } from '@/types'
import { T, O, C, X, U } from './_helpers'

const U_PIACENZA = U('Piacenza', 10, 4)
const U_MILANO = U('Milano', 1, 4)

export const PERCORSO_2: MappaGriglia = {
  id: 'Percorso_2',
  larghezza: 13,
  altezza: 7,
  background: '/backgrounds/route_2.jpg',
  spawnDefault: { x: 1, y: 3 },
  caselle: [
    [T, T, T, C('A'), T, T, O, T, T, C('B'), T, T, T],
    [T, O, T, T, T, T, O, T, T, T, T, O, T],
    [T, O, T, C('C'), T, X(250), T, T, C('D'), T, T, O, T],
    [U_PIACENZA, T, T, T, T, T, T, T, T, T, T, T, U_MILANO],
    [T, O, T, T, T, O, O, O, T, T, T, O, T],
    [T, O, T, C('E'), T, T, T, T, T, C('F'), T, O, T],
    [T, T, T, T, T, T, T, T, T, T, T, T, T],
  ],
}
