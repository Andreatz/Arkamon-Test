/**
 * Piacenza (Fase E.8) - prima citta migrata dopo l'MVP.
 *
 * Layout 11x8:
 *   - Luca (id 301) nella piazza centrale
 *   - Centro Pokemon e deposito accessibili
 *   - NPC dialogo per testare interazioni non-battaglia
 *   - Uscita verso mappa-principale in basso a sinistra
 */
import type { MappaGriglia } from '@/types'
import { T, O, X, EDF, U, NPC } from './_helpers'

const U_MAIN = U('mappa-principale', 7, 4)
const U_PERCORSO_2 = U('Percorso_2', 1, 3)

export const PIACENZA: MappaGriglia = {
  id: 'Piacenza',
  larghezza: 11,
  altezza: 8,
  background: '/backgrounds/padova.png',
  spawnDefault: { x: 1, y: 7 },
  caselle: [
    [T, T, T, T, T, T, T, T, T, T, T],
    [T, O, O, O, T, T, T, O, O, O, T],
    [T, O, EDF('centro'), O, T, T, T, O, EDF('deposito'), O, T],
    [T, O, O, O, T, T, T, O, O, O, T],
    [T, T, T, T, T, X(301), T, T, T, T, U_PERCORSO_2],
    [T, T, NPC('piacenza-mercante'), T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T, T],
    [U_MAIN, T, T, T, T, T, T, T, T, T, T],
  ],
}
