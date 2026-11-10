import { create } from 'zustand'
import type { InteractionDefinition } from './types'

export interface InteractionCatalogRecovery { error: string; raw: string | null }
/** Diagnostics and original bytes never become executable or persisted catalog data. */
export const useInteractionRecoveryStatus = create<{ recovery: InteractionCatalogRecovery | null }>(() => ({ recovery: null }))
export const interactionRecoveryMessage = 'Il catalogo salvato richiede recupero. Scarica l’originale nell’editor delle interazioni e scegli esplicitamente un catalogo valido prima di sostituirlo.'
/** A campaign backup remains usable, without misrepresenting a quarantined catalog as empty. */
export function interactionCatalogForBackup(interactions: InteractionDefinition[]): InteractionDefinition[] | undefined {
  return useInteractionRecoveryStatus.getState().recovery ? undefined : interactions
}
