/**
 * Percorso_1 (Fase E.6) — primo percorso del gioco, tra Venezia e Piacenza.
 *
 * Layout 12×7:
 *   - 7 cespugli A..G distribuiti tra le righe alte e basse
 *   - 2 allenatori: Rivale (id 201) e Gennaro Bullo (id 202)
 *   - Uscita (0,0) verso `mappa-principale`, uscita (11,0) verso `Venezia`
 *
 * Gli `IncontroSelvatici` per i cespugli A..G sono già presenti nel
 * `incontri.json` con `luogo: "Percorso_1"`.
 */
import type { MappaGriglia } from '@/types'
import { T, O, C, X, U } from './_helpers'

const U_MAIN = U('mappa-principale', 7, 4)
const U_VENEZIA = U('Venezia', 1, 8)

export const PERCORSO_1: MappaGriglia = {
  id: 'Percorso_1',
  larghezza: 12,
  altezza: 7,
  background: '/backgrounds/route_1.jpg',
  spawnDefault: { x: 1, y: 6 },
  caselle: [
    [T, T, T, T, T, T, T, T, T, T, T, U_VENEZIA],
    [T, T, C('A'), T, T, C('B'), T, T, C('C'), T, T, T],
    [T, T, T, T, T, X(201), T, T, T, T, T, T],
    [T, O, O, T, T, T, T, T, O, O, T, T],
    [T, T, T, T, T, X(202), T, T, T, T, T, T],
    [T, T, C('D'), T, T, C('E'), T, T, C('F'), T, T, C('G')],
    [U_MAIN, T, T, T, T, T, T, T, T, T, T, T],
  ],
}
