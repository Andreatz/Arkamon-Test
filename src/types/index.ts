import type { AudienceRoundRequest } from '@/audience/types'
import type { SeededRandomState } from '@/challenges/types'

/**
 * Tipi del dominio Arkamon.
 * Questi tipi rappresentano l'intero modello di gioco e sono condivisi
 * tra engine, store e componenti UI.
 */

// =============================================================
// TIPI BASE
// =============================================================

export type TipoPokemon =
  | 'Normale'
  | 'Elettro'
  | 'Fuoco'
  | 'Terra'
  | 'Acqua'
  | 'Erba'
  | 'Oscurità'
  | 'Psico'

export type CategoriaHP = 'Lenta' | 'Media' | 'Veloce' | 'Leggendaria'

export type Probabilita = 'Comune' | 'Medio' | 'Difficile'

export type TipoAllenatore = 'PVP' | 'NPC' | 'Capopalestra' | 'Superquattro' | 'Campione'

export type TipoBattaglia = 'Selvatico' | 'NPC' | 'PVP'

export type Lato = 'A' | 'B'

/** Stati alterati di un pokemon in battaglia (porting roadmap Fase B). */
export type StatoAlterato = 'Paralizzato' | 'Confuso' | 'Addormentato' | 'Avvelenato'

/** Stato attivo: -1 indica durata indefinita. La paralisi termina solo con una cura. */
export interface Stato {
  tipo: StatoAlterato
  /** Sonno: 3 = primo turno obbligatorio ancora da saltare, 2/1 = turni con tiro di risveglio. */
  turniRimanenti: number
  /** Tick di veleno già applicati; assente nei vecchi salvataggi equivale a 0. */
  turniTrascorsi?: number
}

// =============================================================
// DATI STATICI (JSON)
// =============================================================

/** Definizione di una specie di Pokémon (dal foglio Pokemon_Base) */
export interface PokemonSpecie {
  id: number
  nome: string
  categoria: CategoriaHP
  tipo: TipoPokemon
  hpBase: number
  /** ID delle 3 mosse possedute. 0 = nessuna */
  mosse: [number, number, number]
  /** Livello di evoluzione, null se non evolve */
  livelloEvoluzione: number | null
  /** ID della specie evoluta, null se non evolve */
  evoluzioneId: number | null
  /** Tasso base di cattura (0-5, più alto = più facile) */
  tassoCattura: number
}

/** Definizione di una mossa (dal foglio Mosse) */
export interface MossaDef {
  id: number
  nome: string
  tipo: TipoPokemon
  /** Effetto speciale (es. "CURA", "RIDUZIONE"), null se nessuno */
  effetto: string | null
  /** Valore numerico associato all'effetto */
  valoreEffetto: number | null
  /** Mossa che applica soltanto uno stato: nessun danno, tiro offensivo o Suprema. */
  soloStato?: boolean
  /** Numero di dadi D6 per livello {"5": 1, "6": 1, ...} */
  dadiPerLivello: Record<string, number>
  /** Incremento fisso per livello {"5": 0, "6": 0, ...} */
  incrementoPerLivello: Record<string, number>
}

/** Tabella di efficacia dei tipi */
export interface TabellaTipi {
  tipi: TipoPokemon[]
  /** efficacia[attaccante][difensore] = moltiplicatore (es. 1.5, 0.5, 1) */
  efficacia: Record<TipoPokemon, Record<TipoPokemon, number>>
}

/** Configurazione di un luogo della mappa */
export interface Mappa {
  nome: string
  idDiapositiva: number | null
}

/** Un possibile incontro selvatico in un cespuglio */
export interface IncontroSelvatico {
  luogo: string
  cespuglio: string // 'A', 'B', 'C', 'D'
  pokemonId: number
  probabilita: Probabilita
  livelloMin: number
  livelloMax: number
}

/** Un allenatore (NPC, capopalestra o rivale) */
export interface AllenatoreDef {
  id: number
  nome: string
  luogo: string
  tipo: TipoAllenatore
  squadra: { pokemonId: number; livello: number }[]
}

// =============================================================
// STATO RUNTIME (cosa cambia durante una partita)
// =============================================================

/** Istanza viva di un Pokémon (uno dei 6 in squadra o nel deposito) */
export interface PokemonIstanza {
  /** ID univoco dell'istanza, per distinguere due Vyrath con stessa specie */
  istanzaId: string
  /** ID della specie corrente (cambia se si evolve) */
  specieId: number
  /** Nome custom o nome della specie */
  nome: string
  livello: number
  /** HP correnti */
  hp: number
  /** XP guadagnati al livello attuale */
  xp: number
  /** Stato alterato attivo (se presente). Pulito a fine battaglia. */
  stato?: Stato
}

/** Identificatori degli oggetti supportati. */
export type OggettoId = 'masterball' | 'potion' | 'super-potion' | 'revive' | 'antidote' | 'paralysis-heal' | 'awakening'

/** Stato di un singolo giocatore */
export interface StatoGiocatore {
  id: 1 | 2
  nome: string
  squadra: PokemonIstanza[] // max 6
  /** 30 box × 35 slot (impostazione classica). Sparse: solo gli slot occupati */
  deposito: Record<string, PokemonIstanza> // chiave: "box:slot" es. "1:5"
  /** Cespugli già visitati (formato: "Percorso_1:A") */
  cespugliVisitati: Set<string>
  /** Allenatori già sconfitti */
  allenatoriSconfitti: Set<number>
  /** Monete possedute (porting di Stato_Giocatore.Monete del VBA) */
  monete: number
  /** Inventario oggetti (id → quantità). 0 o assente = nessuno. */
  inventario: Partial<Record<OggettoId, number>>
  /**
   * Caselle overworld già consumate da questo giocatore (Fase E).
   * Chiavi nel formato `<mappaId>:<x>,<y>:<tipo>:<id>` (vedi
   * `chiaveCasellaConsumata` in `src/engine/movimento.ts`).
   */
  caselleConsumate: Set<string>
}

/** Stato della battaglia in corso (analogo del foglio Battaglia_Corrente VBA) */
export interface StatoBattaglia {
  /** League opponents are explicitly configured, not synthetic entries in the campaign catalog. */
  leagueOpponent?: AllenatoreDef
  leagueBattle?: { runId: string; stageIndex: number; playerId: 1 | 2 }
  /** Competitive battle randomness. Saved only with a settled checkpoint. */
  seeded?: SeededRandomState
  challengeActionCount?: number
  tipo: TipoBattaglia
  /** Lato A = giocatore principale, lato B = avversario */
  pokemonA: PokemonIstanza
  pokemonB: PokemonIstanza
  hpMaxA: number
  hpMaxB: number
  turnoCorrente: Lato
  /** Per battaglie NPC/PVP: squadre intere */
  squadraA?: PokemonIstanza[]
  squadraB?: PokemonIstanza[]
  /** Luogo di ritorno dopo la battaglia */
  luogoRitorno: string
  /** ID dell'allenatore avversario (se NPC/PVP) */
  allenatoreId?: number
  /** Log degli eventi della battaglia (per UI) */
  log: string[]
  /** Cronaca dei soli risultati già mostrati. Il tiro in preparazione non viene salvato. */
  cronaca?: BattleChronicle
  /** Flag per evoluzione in attesa post-battaglia */
  evoluzioneInAttesa: { istanzaId: string; nuovaSpecieId: number } | null
  /** Settled UI turn checkpoint; media playback itself restarts from the last settled turn. */
  checkpoint?: BattleCheckpoint
  /** Reward settlement is idempotent even if the game reloads before leaving the scene. */
  ricompenseApplicate?: boolean
}

export interface BattleCheckpoint {
  version: 1
  initialPriority: Lato
  actedThisRound: Lato[]
  phase: 'player' | 'opponent' | 'rival-move' | 'audience' | 'pass-player' | 'pass-rival' | 'switch' | 'ended'
  openingComplete: boolean
  outcome: 'vittoria' | 'sconfitta' | null
  switchRequest?: { motivo: string; prossimoPasso: 'passaAdA' | 'passaAB' }
  evolutions: { istanzaId: string; oldSpecieId: number; newSpecieId: number }[]
  rivalMessages: string[]
  /** Distinguishes separate battles and B turns when a phone ballot is resumed. */
  audienceBattleId?: string
  opponentTurnNumber?: number
  /** Only public turn metadata; the host capability stays in its separate store. */
  audiencePending?: { sessionId: string; request: AudienceRoundRequest }
}

/** Risultato del calcolo di danno (per UI: HP barre, animazioni) */
export interface RisultatoMossa {
  attaccante: PokemonIstanza
  difensore: PokemonIstanza
  mossa: MossaDef
  numDadi: number
  incremento: number
  tiriDado: number[]
  dannoBase: number
  moltiplicatoreTipo: number
  /** Regola Arkamon: true quando il bersaglio è debole al tipo della mossa. */
  stab: boolean
  dannoFinale: number
  difensoreSvenuto: boolean
  messaggi: string[]
  /** Stato alterato innescato sul difensore (se la mossa ha effetto e il roll è passato) */
  statoApplicato?: StatoAlterato
  /** Autodanno subito dall'attaccante (es. mossa Suprema). 0/undefined se nessuno. */
  autodanno?: number
  /** Suprema risolta per questa azione; true significa danno normale ×2 e costo 50% HP massimi. */
  suprema?: boolean
}

export type BattleLogKind = 'opening' | 'attack' | 'status' | 'heal' | 'ko' | 'xp' | 'recoil' | 'winner' | 'switch' | 'capture' | 'audience' | 'outcome'

export interface BattleLogPokemon {
  instanceId: string
  speciesId: number
  name: string
  level: number
  hp: number
}

/** Numerical values come from the resolved action; reading/replaying never rolls dice. */
export interface BattleLogEvent {
  id: string
  kind: BattleLogKind
  side?: Lato
  title: string
  messages: string[]
  actor?: BattleLogPokemon
  target?: BattleLogPokemon
  dice?: number[]
  diceSum?: number
  increment?: number
  baseDamage?: number
  effectiveness?: number
  supreme?: boolean
  damage?: number
  hpBefore?: number
  hpAfter?: number
  xp?: number
  levelBefore?: number
  levelAfter?: number
  winnerSide?: Lato
}

export interface BattleChronicle {
  version: 1
  battleId: string
  nextSequence: number
  omittedEvents: number
  events: BattleLogEvent[]
}

// =============================================================
// OVERWORLD A GRIGLIA (Fase E)
// =============================================================

/**
 * Una casella della griglia di una mappa overworld.
 * Discriminata per `tipo`. Le caselle "interagibili" (cespuglio, allenatore,
 * npc, edificio, uscita) consumano l'intero turno (2 azioni); `transito` ne
 * consuma 1; `ostacolo` non è calpestabile.
 */
export type Casella =
  | { tipo: 'transito' }
  | { tipo: 'cespuglio'; cespuglioId: string }
  | { tipo: 'allenatore'; allenatoreId: number }
  | { tipo: 'npc'; dialogoId: string }
  | { tipo: 'edificio'; edificioId: 'centro' | 'palestra' | 'laboratorio' | 'deposito' }
  | { tipo: 'uscita'; versoMappaId: string; spawnX: number; spawnY: number }
  | { tipo: 'ostacolo' }

/** Definizione statica di una mappa a griglia. */
export interface MappaGriglia {
  id: string
  larghezza: number
  altezza: number
  /** caselle[y][x], y dall'alto verso il basso */
  caselle: Casella[][]
  spawnDefault: { x: number; y: number }
  /** Path immagine di sfondo, da risolvere con assetUrl() in UI */
  background: string
}

/** Posizione runtime di un avatar in overworld. */
export interface PosizioneAvatar {
  mappaId: string
  x: number
  y: number
  direzione: 'N' | 'S' | 'E' | 'O'
  /** Nodo occupato quando l'avatar si trova sulla mappa principale. */
  luogo?: string
}

/** Stato del turno overworld (sequenziale a turni A→B). */
export interface StatoTurnoOverworld {
  giocatoreAttivo: 1 | 2
  /** 2 a inizio turno: due movimenti oppure un movimento e un'interazione. */
  azioniRimaste: number
}

/** Un nodo locale per ogni città/percorso visitato, indipendente dal nodo della mappa principale. */
export type PosizioniMappeLocali = Record<string, string>

// =============================================================
// SCENE / NAVIGAZIONE
// =============================================================

export type SceneId =
  | 'lega'
  | 'titolo'
  | 'laboratorio'
  | 'mappa-principale'
  | 'mappa-griglia'
  | 'percorso'
  | 'citta'
  | 'palestra'
  | 'centro-pokemon'
  | 'battaglia'
  | 'deposito'
  | 'squadra'
  | 'evoluzione'

export interface NavigazioneScena {
  scena: SceneId
  /** Parametri opzionali (es. nome luogo per percorso/città) */
  payload?: Record<string, unknown>
}
