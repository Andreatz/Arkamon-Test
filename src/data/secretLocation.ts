import { ALLENATORI } from '@data/index'
import type { PosizioneAvatar, StatoGiocatore } from '@/types'

export const SECRET_LOCATION_ID = 'Percorso_15'
export const SECRET_LOCATION_ORIGIN = 'Roma'

/** The unlock follows the actual gym roster, including the final gym in Rome. */
export const SECRET_LOCATION_GYM_IDS = ALLENATORI
  .filter((allenatore) => allenatore.tipo === 'Capopalestra')
  .map((allenatore) => allenatore.id)

export function hasUnlockedSecretLocation(giocatore: Pick<StatoGiocatore, 'allenatoriSconfitti'>): boolean {
  return SECRET_LOCATION_GYM_IDS.length > 0
    && SECRET_LOCATION_GYM_IDS.every((id) => giocatore.allenatoriSconfitti.has(id))
}

export function isSecretLocationPosition(posizione: PosizioneAvatar): boolean {
  return posizione.mappaId === 'mappa-principale' && posizione.luogo === SECRET_LOCATION_ID
}

/** This hidden edge has no arbitrary coordinate on the illustrated world map. */
export function isSecretLocationConnection(from: string, to: string): boolean {
  return (from === SECRET_LOCATION_ORIGIN && to === SECRET_LOCATION_ID)
    || (from === SECRET_LOCATION_ID && to === SECRET_LOCATION_ORIGIN)
}

export function canAccessSecretLocation(
  giocatore: Pick<StatoGiocatore, 'allenatoriSconfitti'>,
  posizione: PosizioneAvatar,
): boolean {
  return hasUnlockedSecretLocation(giocatore) && isSecretLocationPosition(posizione)
}
