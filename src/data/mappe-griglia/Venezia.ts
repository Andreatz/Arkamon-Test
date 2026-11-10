/**
 * Venezia (Fase E.6) — città di partenza, sede della prima palestra.
 *
 * Layout 14×9:
 *   - 2 isole edificio in alto (palestra a sinistra, centro Pokémon a destra)
 *     racchiuse da ostacoli per simulare i muri delle case
 *   - Capopalestra Marco il Marinaio (id 203) al centro della piazza
 *   - 1 NPC dialogo, 1 edificio deposito
 *   - Uscita verso Percorso_1 in basso a destra
 */
import type { MappaGriglia } from '@/types'
import { T, O, X, EDF, U, NPC } from './_helpers'

const U_P1 = U('Percorso_1', 1, 0)

export const VENEZIA: MappaGriglia = {
  id: 'Venezia',
  larghezza: 14,
  altezza: 9,
  background: '/backgrounds/venezia.png',
  spawnDefault: { x: 1, y: 8 },
  caselle: [
    [T, T, T, T, T, T, T, T, T, T, T, T, T, T],
    [T, O, O, O, T, T, T, T, T, T, O, O, O, T],
    [T, O, EDF('palestra'), O, T, T, T, T, T, T, O, EDF('centro'), O, T],
    [T, O, O, O, T, T, T, T, T, T, O, O, O, T],
    [T, T, T, T, T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, X(203), T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T, T, NPC('venezia-saggio'), T, T],
    [T, T, T, EDF('deposito'), T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T, T, T, T, U_P1],
  ],
}
