import type { MappaGriglia } from '@/types'
import { T, U } from './_helpers'

const U_VENEZIA = U('Venezia', 1, 8)

export const PORDENONE: MappaGriglia = {
  id: 'Pordenone',
  larghezza: 10,
  altezza: 7,
  background: '/maps/Mappa-Finale.jpg',
  spawnDefault: { x: 5, y: 3 },
  caselle: [
    [T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, U_VENEZIA],
    [T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T],
  ],
}
