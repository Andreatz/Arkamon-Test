export type { LocalMapPoint, LocalMapNode, LocalMapRoad, LocalMapDefinition } from './localMaps/types'
import type { LocalMapDefinition } from './localMaps/types'
import { Cagliari } from './localMaps/Cagliari'
import { Foggia } from './localMaps/Foggia'
import { Milano } from './localMaps/Milano'
import { Napoli } from './localMaps/Napoli'
import { Palermo } from './localMaps/Palermo'
import { Percorso1 } from './localMaps/Percorso_1'
import { Percorso13 } from './localMaps/Percorso_13'
import { Percorso14 } from './localMaps/Percorso_14'
import { Percorso15 } from './localMaps/Percorso_15'
import { Percorso2 } from './localMaps/Percorso_2'
import { Percorso4 } from './localMaps/Percorso_4'
import { Piacenza } from './localMaps/Piacenza'
import { ReggioCalabria } from './localMaps/ReggioCalabria'
import { Roma } from './localMaps/Roma'
import { Torino } from './localMaps/Torino'
import { Venezia } from './localMaps/Venezia'

// Coordinate, identificatori e strade conservati; un modulo per ciascuna foto.
export const LOCAL_MAPS: Readonly<Record<string, LocalMapDefinition>> = {
  'Cagliari': Cagliari,
  'Foggia': Foggia,
  'Milano': Milano,
  'Napoli': Napoli,
  'Palermo': Palermo,
  'Percorso_1': Percorso1,
  'Percorso_13': Percorso13,
  'Percorso_14': Percorso14,
  'Percorso_15': Percorso15,
  'Percorso_2': Percorso2,
  'Percorso_4': Percorso4,
  'Piacenza': Piacenza,
  'ReggioCalabria': ReggioCalabria,
  'Roma': Roma,
  'Torino': Torino,
  'Venezia': Venezia,
}

export function getLocalMap(id: string): LocalMapDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(LOCAL_MAPS, id) ? LOCAL_MAPS[id] : undefined
}
