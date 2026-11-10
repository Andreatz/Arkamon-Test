import selections from '@/data/audio-selections.json'
import type { PresentationAudio } from '@/presentation/presentationRuntime'
import { parseAudioChoices, type AudioCatalog, type AudioChoices, type AudioEntry } from './audioCuration'

export function audioWorkspaceBaseline(catalog: AudioCatalog, applied: PresentationAudio | null, draft: string | null) {
  const files = new Map(catalog.files.map(file => [file.id, file]))
  const sounds = { ...(selections.sounds as Record<string, { src: string }>), ...applied?.sounds }
  for (const [id, entry] of Object.entries(applied?.sounds ?? {})) {
    const existing = files.get(id)
    if (existing) files.set(id, { ...existing, src: entry.src })
    else files.set(id, { id, src: entry.src, name: id, pack: 'Progetto visivo applicato', format: entry.src.split('.').pop() ?? 'audio', bytes: 0, tags: [], shortlist: false, reviewed: false, duration: null, error: null } satisfies AudioEntry)
  }
  const choices: AudioChoices = { ...(selections.choices as AudioChoices), ...applied?.choices,
    ...parseAudioChoices(draft, new Set([...files.keys(), ...Object.keys(sounds)])) }
  return { choices, sounds, files }
}
