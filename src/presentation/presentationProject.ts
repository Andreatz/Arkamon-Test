import { create } from 'zustand'
import selections from '@/data/audio-selections.json'
import { useAdminStore } from '@/store/adminStore'
import { useVfxAdminStore, type AdminMoveVfxOverride } from '@/store/vfxAdminStore'
import { parseThemeJson } from '@/theme/parseAdminTheme'
import { normalizeDesign } from '@/ui-studio/designModel'
import { exportUiDesign, importUiDesign } from '@/ui-studio/mediaStorage'
import { AUDIO_CHOICES_KEY, parseAudioChoices, type AudioCatalog, type AudioChoices } from '@/components/audio/audioCuration'
import { assetUrl } from '@/utils/assetUrl'
import type { AdminTheme } from '@/theme/adminThemeTypes'
import type { UiDesignDocument } from '@/ui-studio/types'
import { normalizeVfxOverrides } from './vfxValidation'
import { normalizePresentationAudio, PRESENTATION_STORAGE_KEY, setAppliedAudio, type PresentationAudio } from './presentationRuntime'
import { assertVisualStorageWritable, prepareVisualTransaction, rollbackVisualTransaction, withVisualTransactionWrites, VISUAL_JOURNAL_KEY, type VisualEntry } from './presentationTransaction'
import { presentationRecovery } from './bootstrapPresentation'

export interface PresentationProject { version: 1; name: string; theme: AdminTheme; vfx: Record<number, AdminMoveVfxOverride>; audio: PresentationAudio }
interface ProjectHistory { version: 1; draft: PresentationProject | null; applied: PresentationProject | null; previous: PresentationProject | null; originals: string[] }
const empty = (): ProjectHistory => ({ version: 1, draft: null, applied: null, previous: null, originals: [] })
export function normalizePresentationProject(raw: unknown): PresentationProject {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Progetto visivo non valido.')
  const e = raw as Record<string, unknown>
  if (e.version !== 1 || Object.keys(e).some(key => !['version', 'name', 'theme', 'vfx', 'audio'].includes(key)) || typeof e.name !== 'string' || e.name.length > 120 || !e.name.trim()) throw new Error('Nome o versione del progetto visivo non validi.')
  const theme = parseThemeJson(JSON.stringify(e.theme))
  if (!theme.theme) throw new Error(theme.error)
  return { version: 1, name: e.name.trim(), theme: theme.theme, vfx: normalizeVfxOverrides(e.vfx), audio: normalizePresentationAudio(e.audio) }
}
export function readPresentationHistory(): ProjectHistory {
  let text: string | null = null
  try {
    text = typeof localStorage === 'undefined' ? null : localStorage.getItem(PRESENTATION_STORAGE_KEY)
    if (!text) return empty()
    const e = JSON.parse(text)
    if (!e || e.version !== 1) throw new Error('Storico non supportato.')
    const history = empty()
    let damaged = false
    if (e.originals !== undefined) {
      if (!Array.isArray(e.originals) || e.originals.some((value: unknown) => typeof value !== 'string')) damaged = true
      else history.originals = [...e.originals]
    }
    // One damaged draft must not discard a valid applied project or restore point.
    for (const slot of ['draft', 'applied', 'previous'] as const) {
      try { history[slot] = e[slot] == null ? null : normalizePresentationProject(e[slot]) }
      catch { damaged = true }
    }
    if (damaged && !history.originals.includes(text)) history.originals.push(text)
    return history
  } catch { return { ...empty(), originals: text === null ? [] : [text] } }
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function persist(history: ProjectHistory, transaction = false) {
  if (!transaction) assertVisualStorageWritable()
  if (typeof localStorage !== 'undefined') localStorage.setItem(PRESENTATION_STORAGE_KEY, JSON.stringify(history))
}
function currentProject(name: string): PresentationProject {
  return normalizePresentationProject({ version: 1, name, theme: useAdminStore.getState().theme, vfx: useVfxAdminStore.getState().overrides, audio: { choices: selections.choices, sounds: Object.fromEntries(Object.entries(selections.sounds).map(([id, value]) => [id, { src: value.src }])) } })
}
interface ProjectState extends ProjectHistory {
  error: string | null
  stage: (project: PresentationProject) => boolean
  discard: () => boolean
  clearOriginals: () => boolean
  apply: () => boolean
  rollback: () => boolean
}
function commit(project: PresentationProject, history: ProjectHistory): void {
  const oldTheme = clone(useAdminStore.getState().theme)
  const oldVfx = clone(useVfxAdminStore.getState().overrides), oldDraft = clone(useVfxAdminStore.getState().draftOverrides)
  let entries: VisualEntry[] | undefined
  try {
    if (typeof localStorage !== 'undefined') {
      const nextTheme = JSON.stringify({ state: { ...useAdminStore.getState(), theme: project.theme, layoutUndoStack: [] }, version: 0 })
      const nextVfx = JSON.stringify({ version: 1, overrides: project.vfx, draftOverrides: project.vfx })
      entries = prepareVisualTransaction(localStorage, [nextTheme, nextVfx, JSON.stringify(history)])
      localStorage.setItem(entries[0].key, entries[0].after)
    }
    withVisualTransactionWrites(() => {
      useAdminStore.getState().importTheme(project.theme)
      if (!useVfxAdminStore.getState().replaceOverrides(project.vfx)) throw new Error(useVfxAdminStore.getState().error ?? 'Impossibile applicare gli effetti.')
      // The complete envelope is the commit marker, after the UI/VFX writes.
      persist(history, true)
    })
    if (typeof localStorage !== 'undefined') localStorage.removeItem(VISUAL_JOURNAL_KEY)
    setAppliedAudio(project.audio)
  } catch (error) {
    // Restore memory without publishing a third disk value before journal rollback.
    const adminStorage = useAdminStore.persist.getOptions().storage
    try {
      if (adminStorage) useAdminStore.persist.setOptions({ storage: { ...adminStorage, setItem: () => undefined } })
      withVisualTransactionWrites(() => useAdminStore.getState().importTheme(oldTheme))
    } finally { if (adminStorage) useAdminStore.persist.setOptions({ storage: adminStorage }) }
    useVfxAdminStore.setState({ overrides: oldVfx, draftOverrides: oldDraft })
    if (entries) { try { rollbackVisualTransaction(localStorage, entries) } catch { /* Startup recovers the retained journal before stores hydrate. */ } }
    throw error
  }
}
export const usePresentationProject = create<ProjectState>((set, get) => ({
  ...readPresentationHistory(), error: presentationRecovery.error,
  stage: raw => {
    try { const draft = normalizePresentationProject(raw); const { applied, previous, originals } = get(); persist({ version: 1, draft, applied, previous, originals }); set({ draft, error: null }); return true }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Bozza non salvata.' }); return false }
  },
  discard: () => {
    try { const { applied, previous, originals } = get(); persist({ version: 1, draft: null, applied, previous, originals }); set({ draft: null, error: null }); return true }
    catch { set({ error: 'Impossibile scartare la bozza nello spazio del browser.' }); return false }
  },
  clearOriginals: () => {
    try { const { draft, applied, previous } = get(); persist({ version: 1, draft, applied, previous, originals: [] }); set({ originals: [], error: null }); return true }
    catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Originali non rimossi.' }); return false }
  },
  apply: () => {
    const state = get()
    if (!state.draft) return false
    try {
      const applied = normalizePresentationProject(state.draft), previous = currentProject(state.applied?.name ?? 'Prima dell’applicazione')
      // Keep the currently applied custom audio in the restore point.
      if (state.applied) previous.audio = clone(state.applied.audio)
      const next: ProjectHistory = { version: 1, draft: null, applied, previous, originals: state.originals }
      commit(applied, next); set({ ...next, error: null }); return true
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Progetto non applicato.' }); return false }
  },
  rollback: () => {
    const state = get()
    if (!state.previous) return false
    try { const next: ProjectHistory = { version: 1, draft: null, applied: state.previous, previous: state.applied, originals: state.originals }; commit(state.previous, next); set({ ...next, error: null }); return true }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Ripristino visivo non riuscito.' }); return false }
  },
}))

/** Capture current UI and persistent media drafts, not campaign or phone data. */
export async function capturePresentationProject(name: string, design?: UiDesignDocument): Promise<PresentationProject> {
  const project = currentProject(name)
  const applied = usePresentationProject.getState().applied
  if (applied) project.audio = clone(applied.audio)
  if (design) project.theme.design = normalizeDesign(design)
  project.vfx = normalizeVfxOverrides(useVfxAdminStore.getState().draftOverrides)
  const text = typeof localStorage === 'undefined' ? null : localStorage.getItem(AUDIO_CHOICES_KEY)
  if (text) {
    const response = await fetch(assetUrl('audio-lab/catalog.json'))
    if (!response.ok) throw new Error('Catalogo audio non disponibile: bozza non acquisita.')
    const catalog = await response.json() as AudioCatalog
    if (!Array.isArray(catalog.files)) throw new Error('Catalogo audio non valido.')
    const files = new Map(catalog.files.filter(file => !file.error).map(file => [file.id, file]))
    const local = parseAudioChoices(text, new Set(files.keys()))
    const choices: AudioChoices = { ...project.audio.choices, ...local }
    const sounds = { ...project.audio.sounds }
    for (const value of Object.values(local)) { const file = files.get(value.soundId); if (file) sounds[value.soundId] = { src: file.src } }
    project.audio = normalizePresentationAudio({ choices, sounds })
  }
  return normalizePresentationProject(project)
}
export async function exportPresentationProject(project: PresentationProject): Promise<string> {
  const clean = normalizePresentationProject(project)
  const ui = JSON.parse(await exportUiDesign(normalizeDesign(clean.theme.design))) as unknown
  return JSON.stringify({ format: 'arkamon-presentation', version: 1, project: clean, ui }, null, 2)
}
export async function importPresentationProject(text: string): Promise<PresentationProject> {
  if (text.length > 95 * 1024 * 1024) throw new Error('Pacchetto visivo troppo grande.')
  const e = JSON.parse(text) as Record<string, unknown>
  if (!e || e.format !== 'arkamon-presentation' || e.version !== 1 || Object.keys(e).some(key => !['format', 'version', 'project', 'ui'].includes(key))) throw new Error('Formato del pacchetto visivo non riconosciuto.')
  const project = normalizePresentationProject(e.project)
  // UI import validates embedded files and remaps collisions without replacing applied files.
  project.theme.design = await importUiDesign(JSON.stringify(e.ui))
  return project
}
export function presentationSummary(project: PresentationProject | null) {
  return project ? { screens: Object.keys(project.theme.design?.screens ?? {}).length, effects: Object.keys(project.vfx).length, sounds: Object.keys(project.audio.choices).length } : null
}
