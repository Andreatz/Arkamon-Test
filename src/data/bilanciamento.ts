import type { Probabilita } from '@/types'

export const PROGRESSIONE_MAPPE = [
  'Pordenone',
  'Venezia',
  'Percorso_1',
  'Piacenza',
  'Percorso_2',
  'Milano',
  'Percorso_3',
  'Percorso_4',
  'Percorso_5',
  'Percorso_6',
  'Torino',
  'Grosseto',
  'Civitavecchia',
  'Percorso_7',
  'Cagliari',
  'Percorso_8',
  'Palermo',
  'Percorso_9',
  'ReggioCalabria',
  'Percorso_10',
  'Foggia',
  'Percorso_11',
  'Percorso_12',
  'Napoli',
  'Molisnt',
  'Percorso_13',
  'Pescara',
  'Percorso_14',
  'Roma',
] as const

export const RANGE_LIVELLI_ALLENATORI: Record<
  number,
  { min: number; max: number }
> = {
  201: { min: 5, max: 5 },
  202: { min: 5, max: 5 },
  301: { min: 8, max: 8 },
  203: { min: 10, max: 12 },
  250: { min: 12, max: 12 },
  302: { min: 16, max: 18 },
  251: { min: 18, max: 18 },
  252: { min: 19, max: 19 },
  253: { min: 20, max: 20 },
  254: { min: 21, max: 21 },
  303: { min: 22, max: 24 },
  304: { min: 24, max: 25 },
  305: { min: 28, max: 31 },
  255: { min: 32, max: 32 },
  306: { min: 34, max: 37 },
  256: { min: 38, max: 38 },
  307: { min: 40, max: 43 },
  257: { min: 43, max: 43 },
  258: { min: 44, max: 44 },
  259: { min: 45, max: 45 },
  260: { min: 44, max: 44 },
  308: { min: 42, max: 43 },
  261: { min: 44, max: 44 },
  262: { min: 45, max: 45 },
  309: { min: 46, max: 49 },
  263: { min: 49, max: 49 },
  264: { min: 49, max: 49 },
  265: { min: 49, max: 49 },
  310: { min: 50, max: 51 },
  266: { min: 53, max: 53 },
  311: { min: 56, max: 60 },
}

export const RANGE_INCONTRI_PERCORSO: Record<
  string,
  { min: number; max: number }
> = {
  Percorso_1: { min: 5, max: 7 },
  Percorso_2: { min: 10, max: 13 },
  Percorso_3: { min: 16, max: 19 },
  Percorso_4: { min: 17, max: 21 },
  Percorso_5: { min: 18, max: 22 },
  Percorso_6: { min: 19, max: 23 },
  Percorso_7: { min: 30, max: 34 },
  Percorso_8: { min: 36, max: 40 },
  Percorso_9: { min: 40, max: 44 },
  Percorso_10: { min: 41, max: 45 },
  Percorso_11: { min: 42, max: 46 },
  Percorso_12: { min: 43, max: 47 },
  Percorso_13: { min: 47, max: 51 },
  Percorso_14: { min: 51, max: 55 },
}

export const ROUTE_GENERATE = [
  'Percorso_4',
  'Percorso_5',
  'Percorso_6',
  'Percorso_7',
  'Percorso_8',
  'Percorso_9',
  'Percorso_10',
  'Percorso_11',
  'Percorso_12',
  'Percorso_13',
  'Percorso_14',
] as const

export const CESPUGLI_STANDARD = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export const POKEMON_INCONTRI_COMUNI = [13, 16, 20, 21, 32, 34] as const
export const POKEMON_INCONTRI_SPECIALI = [47, 26, 36, 52, 56, 60] as const

export const PROBABILITA_INCONTRI_STANDARD: Probabilita[] = [
  'Comune',
  'Medio',
]

export const ECONOMIA_BILANCIAMENTO = {
  premioNpc: 200,
  premioCapopalestra: 1000,
  penalitaSconfittaTrainer: -200,
  rapportoCapopalestraNpc: 5,
} as const

export const SOGLIE_EFFETTI_SPECIALI = {
  curaPctMin: 25,
  curaPctMax: 50,
  statoValoreMin: 30,
  statoValoreMax: 40,
  supremaAutodannoPct: 50,
} as const
