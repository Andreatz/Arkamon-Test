/**
 * Deposito Engine - logica pura di scambio squadra ↔ deposito.
 *
 * Porting di Mod_Deposito.bas (EseguiScambioDati, GetIstanzaDaSlot).
 *
 * Convenzioni:
 * - `squadra` è un array compatto (no holes) di lunghezza 0..6.
 * - `deposito` è una mappa sparsa con chiavi "box:slot" (es. "1:5").
 * - Uno slot squadra "vuoto" è un indice >= squadra.length (ammesso solo
 *   come target, non come source).
 * - Uno slot deposito vuoto è semplicemente una chiave non presente nel
 *   record.
 */
import type { PokemonIstanza } from '@/types'

export const BOX_COUNT = 30
export const SLOT_PER_BOX = 35
export const SQUADRA_MAX = 6

export type SlotRef =
  | { tipo: 'squadra'; indice: number }
  | { tipo: 'deposito'; chiave: string }

/** Codifica una chiave deposito da box+slot (1-indexed, come VBA). */
export function chiaveDeposito(box: number, slot: number): string {
  return `${box}:${slot}`
}

/** Ritorna l'istanza in un dato slot, o undefined se vuoto. */
export function getInSlot(
  squadra: PokemonIstanza[],
  deposito: Record<string, PokemonIstanza>,
  ref: SlotRef
): PokemonIstanza | undefined {
  if (ref.tipo === 'squadra') return squadra[ref.indice]
  return deposito[ref.chiave]
}

/**
 * Scambia/sposta il contenuto tra due slot. Funzione PURA: ritorna
 * sempre nuove istanze di squadra/deposito senza mutare gli input.
 *
 * Casi gestiti:
 * - source pieno, target pieno → swap dei due
 * - source pieno, target vuoto → move (sorgente svuotata)
 * - source vuoto → no-op (non si trascina dal vuoto)
 * - source === target → no-op
 *
 * Se il target è uno slot squadra inesistente (indice >= length):
 * il pokemon viene appeso alla fine (se squadra.length < SQUADRA_MAX)
 * o l'operazione viene rifiutata (no-op).
 */
export function scambia(
  squadra: PokemonIstanza[],
  deposito: Record<string, PokemonIstanza>,
  source: SlotRef,
  target: SlotRef
): {
  squadra: PokemonIstanza[]
  deposito: Record<string, PokemonIstanza>
} {
  const src = getInSlot(squadra, deposito, source)
  if (!src) return { squadra, deposito } // no-op
  if (sameRef(source, target)) return { squadra, deposito }

  const tgt = getInSlot(squadra, deposito, target)

  // Caso speciale: target = squadra slot oltre la fine (append) e source da deposito
  const targetIsAppend =
    target.tipo === 'squadra' && target.indice >= squadra.length
  if (targetIsAppend && squadra.length >= SQUADRA_MAX) {
    return { squadra, deposito } // squadra piena: rifiutato
  }

  let nuovaSquadra = [...squadra]
  const nuovoDeposito = { ...deposito }

  // Step 1: rimuovi src dalla sorgente
  if (source.tipo === 'squadra') {
    if (tgt) {
      // swap: src verrà sostituito da tgt sotto, niente splice
    } else {
      // move: rimuovi src dalla squadra (compatta)
      nuovaSquadra.splice(source.indice, 1)
    }
  } else {
    delete nuovoDeposito[source.chiave]
  }

  // Step 2: piazza src nel target
  if (target.tipo === 'squadra') {
    if (tgt) {
      // swap: target.indice ora ha src
      // Se source era squadra, sostituisci anche source.indice con tgt
      if (source.tipo === 'squadra') {
        nuovaSquadra[source.indice] = tgt
        nuovaSquadra[target.indice] = src
      } else {
        nuovaSquadra[target.indice] = src
        // tgt va dove era src (deposito): aggiungi
        nuovoDeposito[source.chiave] = tgt
      }
    } else {
      // move su squadra: append (se entro limite) o sostituisci a indice valido
      if (target.indice < nuovaSquadra.length) {
        nuovaSquadra[target.indice] = src
      } else {
        nuovaSquadra.push(src)
      }
    }
  } else {
    // target deposito
    if (tgt) {
      // swap
      nuovoDeposito[target.chiave] = src
      // tgt va dove era src
      if (source.tipo === 'squadra') {
        nuovaSquadra[source.indice] = tgt
      } else {
        nuovoDeposito[source.chiave] = tgt
      }
    } else {
      // move
      nuovoDeposito[target.chiave] = src
    }
  }

  return { squadra: nuovaSquadra, deposito: nuovoDeposito }
}

function sameRef(a: SlotRef, b: SlotRef): boolean {
  if (a.tipo !== b.tipo) return false
  if (a.tipo === 'squadra' && b.tipo === 'squadra') return a.indice === b.indice
  if (a.tipo === 'deposito' && b.tipo === 'deposito') return a.chiave === b.chiave
  return false
}
