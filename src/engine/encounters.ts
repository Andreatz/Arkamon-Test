/**
 * Encounters Engine - selezione pesata di incontri selvatici nei cespugli.
 *
 * Porting fedele di:
 * - Mod_Utilities.PesoCategoria  (60 / 30 / 10)
 * - Mod_Utilities.ScegliIndicePesato
 */
import type { IncontroSelvatico, Probabilita, PokemonIstanza } from '@/types'
import { creaIstanza } from './pokemonFactory'

// Porting di: PesoCategoria da old_files/Mod_Utilities.txt
export function pesoCategoria(categoria: Probabilita): number {
  switch (categoria) {
    case 'Comune':
      return 60
    case 'Medio':
      return 30
    case 'Difficile':
      return 10
  }
}

// Porting di: ScegliIndicePesato da old_files/Mod_Utilities.txt
export function scegliIncontroPesato(
  incontri: IncontroSelvatico[],
  rng: () => number = Math.random
): IncontroSelvatico | null {
  if (incontri.length === 0) return null

  const pesoTotale = incontri.reduce((sum, i) => sum + pesoCategoria(i.probabilita), 0)
  if (pesoTotale <= 0) return null

  const tiro = rng() * pesoTotale
  let cumulato = 0
  for (const incontro of incontri) {
    cumulato += pesoCategoria(incontro.probabilita)
    if (tiro < cumulato) return incontro
  }
  return incontri[incontri.length - 1]
}

/**
 * Genera l'istanza viva del Pokémon selvatico per un cespuglio.
 * Sceglie peso → seleziona livello uniforme nel range → crea PokemonIstanza.
 */
export function generaIncontroDaCespuglio(
  incontri: IncontroSelvatico[],
  rng: () => number = Math.random
): PokemonIstanza | null {
  const incontro = scegliIncontroPesato(incontri, rng)
  if (!incontro) return null

  const range = incontro.livelloMax - incontro.livelloMin + 1
  // A modulo of six biases ranges of four or five toward lower levels.
  const livello = incontro.livelloMin + Math.floor(rng() * range)

  return creaIstanza(incontro.pokemonId, livello)
}
