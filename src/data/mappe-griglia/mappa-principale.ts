/**
 * mappa-principale (Fase E.8) - versione griglia "macro" della mappa Italia.
 *
 * Espone tutte le mappe storiche come uscite reali nel registry griglia.
 * Resta accessibile la versione 2D classica (`MappaPrincipaleScene`) come
 * fallback di navigazione finche serve.
 */
import type { MappaGriglia } from '@/types'
import { T, U } from './_helpers'

export const MAPPA_PRINCIPALE_GRIGLIA: MappaGriglia = {
  id: 'mappa-principale',
  larghezza: 14,
  altezza: 8,
  background: '/maps/Mappa-Finale.jpg',
  spawnDefault: { x: 7, y: 4 },
  caselle: [
    [U('Pordenone', 5, 3), T, T, T, T, T, T, T, T, T, T, T, T, T],
    [
      U('Venezia', 6, 8),
      U('Percorso_1', 0, 6),
      U('Piacenza', 1, 7),
      U('Percorso_2', 1, 3),
      U('Milano', 1, 4),
      U('Percorso_3', 1, 3),
      U('Percorso_4', 1, 3),
      U('Percorso_5', 1, 3),
      U('Percorso_6', 1, 3),
      U('Torino', 1, 4),
      U('Grosseto', 1, 4),
      U('Civitavecchia', 1, 4),
      U('Percorso_7', 1, 3),
      U('Cagliari', 1, 4),
    ],
    [
      U('Percorso_8', 1, 3),
      U('Palermo', 1, 4),
      U('Percorso_9', 1, 3),
      U('ReggioCalabria', 1, 4),
      U('Percorso_10', 1, 3),
      U('Foggia', 1, 4),
      U('Percorso_11', 1, 3),
      U('Percorso_12', 1, 3),
      U('Napoli', 1, 4),
      U('Molisnt', 1, 4),
      U('Percorso_13', 1, 3),
      U('Pescara', 1, 4),
      U('Percorso_14', 1, 3),
      U('Roma', 1, 4),
    ],
    [T, T, T, T, T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T, T, T, T, T],
    [T, T, T, T, T, T, T, T, T, T, T, T, T, T],
  ],
}
