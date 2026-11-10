/**
 * Engine puro del movimento overworld a griglia (Fase E).
 *
 * Niente React/DOM/store. Funzioni pure testabili in isolamento.
 * Convenzioni:
 *   - coordinate (x, y) con y crescente verso il basso (origine in alto a sinistra)
 *   - movimento 4-direzionale (N/S/E/O), una casella per volta
 *   - 2 azioni a turno: movimento = -1, interazione = chiude il turno
 */
import type {
  Casella,
  MappaGriglia,
  PosizioneAvatar,
  StatoTurnoOverworld,
} from '@/types'

/** Tipi di casella considerati "interagibili". */
const TIPI_INTERAGIBILI = new Set<Casella['tipo']>([
  'cespuglio',
  'allenatore',
  'npc',
  'edificio',
  'uscita',
])

/** Restituisce la casella alla coordinata data, o null se fuori mappa. */
export function getCasella(
  mappa: MappaGriglia,
  x: number,
  y: number
): Casella | null {
  if (x < 0 || y < 0 || x >= mappa.larghezza || y >= mappa.altezza) return null
  return mappa.caselle[y]?.[x] ?? null
}

/** Le (fino a 4) coordinate adiacenti in mappa, escluse quelle fuori bordo. */
export function caselleAdiacenti(
  pos: PosizioneAvatar,
  mappa: MappaGriglia
): { x: number; y: number }[] {
  const candidate = [
    { x: pos.x, y: pos.y - 1 }, // N
    { x: pos.x, y: pos.y + 1 }, // S
    { x: pos.x + 1, y: pos.y }, // E
    { x: pos.x - 1, y: pos.y }, // O
  ]
  return candidate.filter(
    (c) => c.x >= 0 && c.y >= 0 && c.x < mappa.larghezza && c.y < mappa.altezza
  )
}

/**
 * `da` può muoversi su `a` se:
 *   - `a` è adiacente (4-direzionale)
 *   - `a` è dentro i bordi della mappa
 *   - la casella in `a` non è `ostacolo`
 */
export function puòMuoversi(
  da: PosizioneAvatar,
  a: { x: number; y: number },
  mappa: MappaGriglia
): boolean {
  if (da.mappaId !== mappa.id) return false
  const dx = Math.abs(a.x - da.x)
  const dy = Math.abs(a.y - da.y)
  if (dx + dy !== 1) return false
  const c = getCasella(mappa, a.x, a.y)
  if (!c) return false
  return c.tipo !== 'ostacolo'
}

/**
 * Genera la chiave persistente di una casella interagibile per il
 * tracciamento del consumo per giocatore (Set `caselleConsumate`).
 * Restituisce null per le caselle non interagibili.
 */
export function chiaveCasellaConsumata(
  mappaId: string,
  x: number,
  y: number,
  casella: Casella
): string | null {
  switch (casella.tipo) {
    case 'cespuglio':
      return `${mappaId}:${x},${y}:cespuglio:${casella.cespuglioId}`
    case 'allenatore':
      return `${mappaId}:${x},${y}:allenatore:${casella.allenatoreId}`
    case 'npc':
      return `${mappaId}:${x},${y}:npc:${casella.dialogoId}`
    default:
      return null
  }
}

/**
 * Stato minimo dello store consultato da `puòInteragire` e
 * `risultatoInterazione`. Tipato in modo strutturale per non legare
 * l'engine al `gameStore` Zustand.
 */
export interface StatoStoreOverworld {
  caselleConsumate: Set<string>
  allenatoriSconfitti: Set<number>
}

/**
 * `casella` è interagibile da `giocatoreId` se:
 *   - il suo tipo è in TIPI_INTERAGIBILI
 *   - non è già stata consumata da quel giocatore
 *   - se è un allenatore, non è già nei `allenatoriSconfitti`
 *
 * Le `uscita` ed `edificio` non vengono mai marcate consumate
 * (non si "esauriscono"); restano sempre interagibili.
 */
export function puòInteragire(
  mappaId: string,
  x: number,
  y: number,
  casella: Casella,
  stato: StatoStoreOverworld
): boolean {
  if (!TIPI_INTERAGIBILI.has(casella.tipo)) return false
  if (casella.tipo === 'allenatore' && stato.allenatoriSconfitti.has(casella.allenatoreId)) {
    return false
  }
  const chiave = chiaveCasellaConsumata(mappaId, x, y, casella)
  if (chiave && stato.caselleConsumate.has(chiave)) return false
  return true
}

/** Descrittore del risultato di una interazione, da consumare nello store/UI. */
export type RisultatoInterazione =
  | { tipo: 'no-op' }
  | { tipo: 'battaglia-selvatica'; cespuglioId: string; mappaId: string; x: number; y: number }
  | { tipo: 'battaglia-npc'; allenatoreId: number; mappaId: string; x: number; y: number }
  | { tipo: 'dialogo'; dialogoId: string; mappaId: string; x: number; y: number }
  | { tipo: 'edificio'; edificioId: 'centro' | 'palestra' | 'laboratorio' | 'deposito' }
  | { tipo: 'transizione-mappa'; versoMappaId: string; spawnX: number; spawnY: number }

/**
 * Calcola l'effetto di un'interazione su una casella, senza applicarlo.
 * Restituisce `no-op` se la casella non è interagibile dal giocatore corrente.
 */
export function risultatoInterazione(
  mappaId: string,
  x: number,
  y: number,
  casella: Casella,
  giocatoreId: 1 | 2,
  stato: StatoStoreOverworld
): RisultatoInterazione {
  void giocatoreId
  if (!puòInteragire(mappaId, x, y, casella, stato)) return { tipo: 'no-op' }
  switch (casella.tipo) {
    case 'cespuglio':
      return { tipo: 'battaglia-selvatica', cespuglioId: casella.cespuglioId, mappaId, x, y }
    case 'allenatore':
      return { tipo: 'battaglia-npc', allenatoreId: casella.allenatoreId, mappaId, x, y }
    case 'npc':
      return { tipo: 'dialogo', dialogoId: casella.dialogoId, mappaId, x, y }
    case 'edificio':
      return { tipo: 'edificio', edificioId: casella.edificioId }
    case 'uscita':
      return {
        tipo: 'transizione-mappa',
        versoMappaId: casella.versoMappaId,
        spawnX: casella.spawnX,
        spawnY: casella.spawnY,
      }
    default:
      return { tipo: 'no-op' }
  }
}

/**
 * Consuma azioni nel turno corrente.
 *   - `'movimento'`: -1 (clamp a 0)
 *   - `'interazione'`: chiude il turno (azioni → 0)
 *
 * Funzione pura: restituisce un nuovo stato, non muta l'input.
 */
export function consumaAzione(
  stato: StatoTurnoOverworld,
  tipo: 'movimento' | 'interazione'
): StatoTurnoOverworld {
  if (tipo === 'interazione') {
    return { ...stato, azioniRimaste: 0 }
  }
  return { ...stato, azioniRimaste: Math.max(0, stato.azioniRimaste - 1) }
}

/** Inizia un nuovo turno per l'altro giocatore con 2 azioni piene. */
export function nuovoTurno(giocatoreCorrente: 1 | 2): StatoTurnoOverworld {
  return {
    giocatoreAttivo: giocatoreCorrente === 1 ? 2 : 1,
    azioniRimaste: 2,
  }
}
