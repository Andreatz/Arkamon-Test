import { resolveAssetUrl } from '@/utils/assetUrl'
export interface AudioEntry {
  id: string
  name: string
  src: string
  pack: string
  format: string
  bytes: number
  tags: string[]
  shortlist: boolean
  reviewed: boolean
  duration: number | null
  error: string | null
  signal?: { peakDb?: number; rmsDb?: number; leadingSilenceMs?: number }
}
export interface AudioCatalog {
  total: number
  shortlistCount: number
  metadataErrors: number
  files: AudioEntry[]
}
export const AUDIO_TAGS: Record<string, string> = {
  fire: 'Fuoco', water: 'Acqua', electric: 'Elettro', earth: 'Terra', plant: 'Erba',
  dark: 'Oscurità', psychic: 'Psico', heal: 'Cura', status: 'Status', slash: 'Taglio',
  impact: 'Impatto', whoosh: 'Movimento', ui: 'Interfaccia', success: 'Successo', ko: 'KO', magic: 'Magia',
}
export const GAME_AUDIO_EVENTS = [
  { id: 'click', label: 'Pulsanti e conferme', tags: ['ui'] },
  { id: 'battle-start', label: 'Ingresso in battaglia', tags: ['whoosh', 'magic'] },
  { id: 'hit', label: 'Impatto generico', tags: ['impact'] },
  { id: 'ko', label: 'Arkamon KO', tags: ['ko', 'dark'] },
  { id: 'capture', label: 'Cattura', tags: ['magic', 'success'] },
  { id: 'victory', label: 'Vittoria', tags: ['success'] },
  { id: 'level-up', label: 'Salita di livello', tags: ['success', 'ui'] },
  { id: 'evolution', label: 'Evoluzione', tags: ['magic', 'success'] },
  { id: 'transition', label: 'Apertura dado / cambio scena', tags: ['psychic', 'whoosh'] },
  { id: 'dice', label: 'Lancio dei dadi', tags: ['ui', 'impact'] },
] as const
export interface AudioChoice {
  soundId: string
  volume: number
  cue: 'start' | 'impact'
  delayMs: number
  status: 'candidate' | 'confirmed' | 'selected'
}
export type AudioChoices = Record<string, AudioChoice>
export const AUDIO_CHOICES_KEY = 'arkamon-audio-lab-v1'
export function parseAudioChoices(raw: string | null, validIds: Set<string>): AudioChoices {
  if (!raw) return {}
  try {
    const data = JSON.parse(raw)
    if (data.version !== 1 || !data.choices || typeof data.choices !== 'object') return {}
    return Object.fromEntries(Object.entries(data.choices).filter(([key, value]) => {
      const choice = value as AudioChoice | null
      return /^(move:\d+|event:[a-z-]+|vfx:.+)$/.test(key) && choice && validIds.has(choice.soundId)
        && Number.isFinite(choice.volume) && choice.volume >= 0 && choice.volume <= 1
        && Number.isFinite(choice.delayMs) && choice.delayMs >= 0 && choice.delayMs <= 2000
        && ['start', 'impact'].includes(choice.cue) && ['candidate', 'confirmed', 'selected'].includes(choice.status)
    }) as [string, AudioChoice][])
  } catch { return {} }
}
export function audioSourceUrl(src: string, base: string): string {
  return resolveAssetUrl(src, base, import.meta.env.VITE_SPLIT_MEDIA ? import.meta.env.VITE_MEDIA_REVISION : undefined, import.meta.env.VITE_MEDIA_BASE_URL, true)
}
export function suggestedAudio(files: AudioEntry[], tags: readonly string[], durationMs = 1000): AudioEntry[] {
  return files.filter((file) => file.shortlist && !file.error && file.tags.some((tag) => tags.includes(tag)))
    .sort((a, b) => Math.abs((a.duration ?? 0) * 1000 - durationMs) - Math.abs((b.duration ?? 0) * 1000 - durationMs)
      || a.name.localeCompare(b.name)).slice(0, 8)
}
