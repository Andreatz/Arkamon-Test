import type { Casella, MappaGriglia } from '@/types'
import { T, O, C, X, EDF, U, NPC } from './_helpers'

interface LinkMappa {
  id: string
  x: number
  y: number
}

function routeMap(
  id: string,
  background: string,
  allenatoreId: number,
  prev: LinkMappa,
  next: LinkMappa
): MappaGriglia {
  return {
    id,
    larghezza: 13,
    altezza: 7,
    background,
    spawnDefault: { x: 1, y: 3 },
    caselle: [
      [T, T, C('A'), T, T, T, O, T, T, T, C('B'), T, T],
      [T, O, T, T, O, T, O, T, O, T, T, O, T],
      [T, O, T, C('C'), T, T, X(allenatoreId), T, T, C('D'), T, O, T],
      [U(prev.id, prev.x, prev.y), T, T, T, T, T, T, T, T, T, T, T, U(next.id, next.x, next.y)],
      [T, O, T, T, O, O, T, O, O, T, T, O, T],
      [T, O, T, C('E'), T, T, T, T, T, C('F'), T, O, T],
      [T, T, T, T, T, T, T, T, T, T, T, T, T],
    ],
  }
}

function trainerCell(id?: number): Casella {
  return id ? X(id) : T
}

function cityMap(
  id: string,
  background: string,
  trainerIds: number[],
  hasPalestra: boolean,
  prev: LinkMappa,
  next: LinkMappa,
  mainSpawnX: number
): MappaGriglia {
  return {
    id,
    larghezza: 12,
    altezza: 8,
    background,
    spawnDefault: { x: 1, y: 4 },
    caselle: [
      [T, T, T, T, T, T, T, T, T, T, T, T],
      [T, O, O, O, T, T, T, T, O, O, O, T],
      [
        T,
        O,
        EDF(hasPalestra ? 'palestra' : 'centro'),
        O,
        T,
        T,
        T,
        T,
        O,
        EDF(hasPalestra ? 'centro' : 'deposito'),
        O,
        T,
      ],
      [T, O, trainerCell(trainerIds[0]), O, T, T, NPC(`${id}-passante`), T, O, O, O, T],
      [U(prev.id, prev.x, prev.y), T, T, T, T, T, T, T, T, T, T, U(next.id, next.x, next.y)],
      [T, T, T, trainerCell(trainerIds[1]), O, O, O, T, T, EDF('deposito'), T, T],
      [T, T, T, T, T, T, T, T, T, T, T, T],
      [T, T, T, T, T, T, T, T, T, T, T, U('mappa-principale', mainSpawnX, 4)],
    ],
  }
}

export const PERCORSO_4 = routeMap(
  'Percorso_4',
  '/backgrounds/route_4.png',
  252,
  { id: 'Percorso_3', x: 11, y: 3 },
  { id: 'Percorso_5', x: 1, y: 3 }
)

export const PERCORSO_5 = routeMap(
  'Percorso_5',
  '/backgrounds/route_5.png',
  253,
  { id: 'Percorso_4', x: 11, y: 3 },
  { id: 'Percorso_6', x: 1, y: 3 }
)

export const PERCORSO_6 = routeMap(
  'Percorso_6',
  '/backgrounds/route_6.jpg',
  254,
  { id: 'Percorso_5', x: 11, y: 3 },
  { id: 'Torino', x: 1, y: 4 }
)

export const TORINO = cityMap(
  'Torino',
  '/backgrounds/torino.png',
  [303],
  true,
  { id: 'Percorso_6', x: 11, y: 3 },
  { id: 'Grosseto', x: 1, y: 4 },
  11
)

export const GROSSETO = cityMap(
  'Grosseto',
  '/backgrounds/grosseto.png',
  [304],
  false,
  { id: 'Torino', x: 11, y: 4 },
  { id: 'Civitavecchia', x: 1, y: 4 },
  12
)

export const CIVITAVECCHIA = cityMap(
  'Civitavecchia',
  '/backgrounds/civitavecchia.png',
  [305],
  true,
  { id: 'Grosseto', x: 11, y: 4 },
  { id: 'Percorso_7', x: 1, y: 3 },
  13
)

export const PERCORSO_7 = routeMap(
  'Percorso_7',
  '/backgrounds/route_7.jpg',
  255,
  { id: 'Civitavecchia', x: 11, y: 4 },
  { id: 'Cagliari', x: 1, y: 4 }
)

export const CAGLIARI = cityMap(
  'Cagliari',
  '/backgrounds/cagliari.png',
  [306],
  true,
  { id: 'Percorso_7', x: 11, y: 3 },
  { id: 'Percorso_8', x: 1, y: 3 },
  1
)

export const PERCORSO_8 = routeMap(
  'Percorso_8',
  '/backgrounds/route_8.jpg',
  256,
  { id: 'Cagliari', x: 11, y: 4 },
  { id: 'Palermo', x: 1, y: 4 }
)

export const PALERMO = cityMap(
  'Palermo',
  '/backgrounds/palermo.png',
  [307],
  true,
  { id: 'Percorso_8', x: 11, y: 3 },
  { id: 'Percorso_9', x: 1, y: 3 },
  2
)

export const PERCORSO_9 = routeMap(
  'Percorso_9',
  '/backgrounds/route_9.png',
  257,
  { id: 'Palermo', x: 11, y: 4 },
  { id: 'ReggioCalabria', x: 1, y: 4 }
)

export const REGGIO_CALABRIA = cityMap(
  'ReggioCalabria',
  '/backgrounds/reggio_calabria.png',
  [258, 259],
  false,
  { id: 'Percorso_9', x: 11, y: 3 },
  { id: 'Percorso_10', x: 1, y: 3 },
  3
)

export const PERCORSO_10 = routeMap(
  'Percorso_10',
  '/backgrounds/route_10.png',
  260,
  { id: 'ReggioCalabria', x: 11, y: 4 },
  { id: 'Foggia', x: 1, y: 4 }
)

export const FOGGIA = cityMap(
  'Foggia',
  '/backgrounds/foggia.png',
  [308],
  false,
  { id: 'Percorso_10', x: 11, y: 3 },
  { id: 'Percorso_11', x: 1, y: 3 },
  4
)

export const PERCORSO_11 = routeMap(
  'Percorso_11',
  '/backgrounds/route_11.png',
  261,
  { id: 'Foggia', x: 11, y: 4 },
  { id: 'Percorso_12', x: 1, y: 3 }
)

export const PERCORSO_12 = routeMap(
  'Percorso_12',
  '/backgrounds/route_12.png',
  262,
  { id: 'Percorso_11', x: 11, y: 3 },
  { id: 'Napoli', x: 1, y: 4 }
)

export const NAPOLI = cityMap(
  'Napoli',
  '/backgrounds/napoli.png',
  [309],
  true,
  { id: 'Percorso_12', x: 11, y: 3 },
  { id: 'Molisnt', x: 1, y: 4 },
  5
)

export const MOLISNT = cityMap(
  'Molisnt',
  '/backgrounds/molise.png',
  [263, 264],
  false,
  { id: 'Napoli', x: 11, y: 4 },
  { id: 'Percorso_13', x: 1, y: 3 },
  6
)

export const PERCORSO_13 = routeMap(
  'Percorso_13',
  '/backgrounds/route_13.jpg',
  265,
  { id: 'Molisnt', x: 11, y: 4 },
  { id: 'Pescara', x: 1, y: 4 }
)

export const PESCARA = cityMap(
  'Pescara',
  '/backgrounds/pescara.png',
  [310],
  false,
  { id: 'Percorso_13', x: 11, y: 3 },
  { id: 'Percorso_14', x: 1, y: 3 },
  7
)

export const PERCORSO_14 = routeMap(
  'Percorso_14',
  '/backgrounds/route_14.jpg',
  266,
  { id: 'Pescara', x: 11, y: 4 },
  { id: 'Roma', x: 1, y: 4 }
)

export const ROMA = cityMap(
  'Roma',
  '/backgrounds/roma.png',
  [311],
  true,
  { id: 'Percorso_14', x: 11, y: 3 },
  { id: 'mappa-principale', x: 8, y: 4 },
  8
)

export const MAPPE_RESTANTI: MappaGriglia[] = [
  PERCORSO_4,
  PERCORSO_5,
  PERCORSO_6,
  TORINO,
  GROSSETO,
  CIVITAVECCHIA,
  PERCORSO_7,
  CAGLIARI,
  PERCORSO_8,
  PALERMO,
  PERCORSO_9,
  REGGIO_CALABRIA,
  PERCORSO_10,
  FOGGIA,
  PERCORSO_11,
  PERCORSO_12,
  NAPOLI,
  MOLISNT,
  PERCORSO_13,
  PESCARA,
  PERCORSO_14,
  ROMA,
]
