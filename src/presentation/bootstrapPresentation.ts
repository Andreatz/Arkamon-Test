import { recoverPresentationStorage } from './presentationTransaction'

// This side effect must precede App/store imports: synchronous stores then
// hydrate the recovered values, including the audio scheduler's first lookup.
export const presentationRecovery = recoverPresentationStorage()
