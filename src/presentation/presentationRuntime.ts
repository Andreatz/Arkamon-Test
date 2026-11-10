import type { AudioChoice, AudioChoices } from '@/components/audio/audioCuration'

export const PRESENTATION_STORAGE_KEY = 'arkamon-presentation-project-v1'
export interface PresentationAudio { choices: AudioChoices; sounds: Record<string, { src: string }> }
let applied: PresentationAudio | null | undefined
export function setAppliedAudio(audio: PresentationAudio | null) { applied = audio }

export function normalizePresentationAudio(value: unknown): PresentationAudio {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Associazioni audio non valide.')
  const raw = value as Record<string, unknown>
  if (Object.keys(raw).some(key => !['choices', 'sounds'].includes(key)) || !raw.choices || typeof raw.choices !== 'object' || Array.isArray(raw.choices) || !raw.sounds || typeof raw.sounds !== 'object' || Array.isArray(raw.sounds)) throw new Error('Pacchetto audio non valido.')
  const sounds: PresentationAudio['sounds'] = {}, choices: AudioChoices = {}
  if (Object.keys(raw.sounds).length > 1000 || Object.keys(raw.choices).length > 2000) throw new Error('Troppe associazioni audio.')
  for (const [id, entry] of Object.entries(raw.sounds)) {
    if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || !entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Identificatore audio non valido.')
    const src = (entry as Record<string, unknown>).src
    if (Object.keys(entry).some(key => key !== 'src') || typeof src !== 'string' || !/^\/?(?:audio-lab|audio|sounds)\/[a-zA-Z0-9_./%() -]+\.(?:wav|mp3|ogg|m4a|aac|flac)$/i.test(src) || src.includes('..') || /%2e|%2f|%5c/i.test(src)) throw new Error('Percorso audio non consentito.')
    sounds[id] = { src }
  }
  for (const [key, entry] of Object.entries(raw.choices)) {
    if (!/^(move:\d+|event:[a-z-]+|vfx:[a-zA-Z0-9_.:-]+)$/.test(key) || !entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Destinazione audio non valida.')
    const e = entry as Record<string, unknown>
    if (Object.keys(e).some(key => !['soundId', 'volume', 'cue', 'delayMs', 'status'].includes(key)) || typeof e.soundId !== 'string' || !Object.prototype.hasOwnProperty.call(sounds, e.soundId)
      || typeof e.volume !== 'number' || !Number.isFinite(e.volume) || e.volume < 0 || e.volume > 1
      || typeof e.delayMs !== 'number' || !Number.isFinite(e.delayMs) || e.delayMs < 0 || e.delayMs > 2000
      || !['start', 'impact'].includes(String(e.cue)) || !['candidate', 'selected', 'confirmed'].includes(String(e.status))) throw new Error(`Associazione audio non valida: ${key}.`)
    choices[key] = { soundId: e.soundId, volume: e.volume, delayMs: e.delayMs, cue: e.cue as AudioChoice['cue'], status: e.status as AudioChoice['status'] }
  }
  return { choices, sounds }
}
/** Pure media lookup: no React/Admin imports in the playback scheduler. */
export function getAppliedAudioSelection(key: string): { choice: AudioChoice; src: string } | undefined {
  if (applied === undefined) {
    applied = null
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PRESENTATION_STORAGE_KEY)
      if (raw) { const data = JSON.parse(raw); if (data.version === 1 && data.applied?.audio) applied = normalizePresentationAudio(data.applied.audio) }
    } catch { /* A broken visual preference cannot prevent audio fallback or boot. */ }
  }
  const choice = applied?.choices[key], src = choice && applied?.sounds[choice.soundId]?.src
  return choice && src ? { choice, src } : undefined
}


/** Read-only authoring baseline: a new laboratory draft starts from the applied project. */
export function getAppliedAudioSnapshot(): PresentationAudio | null {
  getAppliedAudioSelection('event:click')
  return applied ?? null
}
