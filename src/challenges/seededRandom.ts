import type { SeededRandomState } from './types'

export const MAX_RANDOM_CURSOR = 1_000_000_000

/** Exact spelling is part of the challenge; whitespace around it is ignored. */
export function validateChallengeSeed(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Inserisci un seed di testo.')
  const seed = value.trim().normalize('NFC')
  if (!seed || seed.length > 64 || /[\u0000-\u001f\u007f]/u.test(seed)) {
    throw new Error('Il seed deve contenere da 1 a 64 caratteri, senza caratteri di controllo.')
  }
  return seed
}

/** FNV-1a over UTF-16 code units; constants are frozen by rules version 1. */
export function hashChallengeText(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

export function createSeededRandomState(seed: string, cursor = 0): SeededRandomState {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > MAX_RANDOM_CURSOR) {
    throw new Error('La posizione del generatore casuale non è valida.')
  }
  return { algorithm: 'arkamon-counter-v1', seed: validateChallengeSeed(seed), cursor }
}

/** Counter PRNG: any settled cursor can resume directly, without replaying earlier rolls. */
export function nextSeededRandom(state: SeededRandomState): { value: number; state: SeededRandomState } {
  if (state.algorithm !== 'arkamon-counter-v1') throw new Error('Versione del generatore non supportata.')
  const checked = createSeededRandomState(state.seed, state.cursor)
  if (checked.cursor === MAX_RANDOM_CURSOR) throw new Error('Limite dei tiri della sfida raggiunto.')
  let value = (hashChallengeText(checked.seed) + Math.imul(checked.cursor + 1, 0x9e3779b9)) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  value = (value ^ (value >>> 15)) >>> 0
  return { value: value / 4294967296, state: { ...checked, cursor: checked.cursor + 1 } }
}

/** Local preview stream. Battle rolls always use their separate persisted stream. */
export function seededRandom(seed: string): () => number {
  let state = createSeededRandomState(seed)
  return () => {
    const next = nextSeededRandom(state)
    state = next.state
    return next.value
  }
}
