import { create } from 'zustand'
import { useAdminStore } from '@/store/adminStore'
import { createDefaultDesign, normalizeDesign } from './designModel'
import type { UiDesignDocument } from './types'

const MAX_HISTORY = 60
interface UiStudioState {
  draft: UiDesignDocument
  undoStack: UiDesignDocument[]
  redoStack: UiDesignDocument[]
  error: string | null
  load: () => void
  setDraft: (next: UiDesignDocument, recordHistory?: boolean) => void
  undo: () => void
  redo: () => void
  save: () => boolean
  discard: () => void
}
const freshSavedDesign = () => normalizeDesign(useAdminStore.getState().theme.design)
export const useUiStudioStore = create<UiStudioState>((set, get) => ({
  draft: createDefaultDesign(), undoStack: [], redoStack: [], error: null,
  load: () => {
    try { set({ draft: freshSavedDesign(), undoStack: [], redoStack: [], error: null }) }
    catch (error) { set({ error: error instanceof Error ? error.message : 'Impossibile caricare il progetto UI.' }) }
  },
  setDraft: (next, recordHistory = true) => {
    try {
      const draft = normalizeDesign(next)
      const current = get()
      if (JSON.stringify(current.draft) === JSON.stringify(draft)) { set({ error: null }); return }
      set({ draft, undoStack: recordHistory ? [...current.undoStack.slice(-(MAX_HISTORY - 1)), normalizeDesign(current.draft)] : current.undoStack, redoStack: [], error: null })
    } catch (error) { set({ error: error instanceof Error ? error.message : 'Modifica UI non valida.' }) }
  },
  undo: () => {
    const state = get(), previous = state.undoStack[state.undoStack.length - 1]
    if (!previous) return
    set({ draft: normalizeDesign(previous), undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack.slice(-(MAX_HISTORY - 1)), normalizeDesign(state.draft)], error: null })
  },
  redo: () => {
    const state = get(), next = state.redoStack[state.redoStack.length - 1]
    if (!next) return
    set({ draft: normalizeDesign(next), redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack.slice(-(MAX_HISTORY - 1)), normalizeDesign(state.draft)], error: null })
  },
  save: () => {
    try {
      const design = normalizeDesign(get().draft)
      if (!useAdminStore.getState().updateDesign(design)) {
        set({ error: 'Salvataggio non riuscito: lo spazio del browser potrebbe essere esaurito o non disponibile. Esporta il progetto per conservarlo.' })
        return false
      }
      set({ error: null })
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Salvataggio del progetto UI non riuscito.' })
      return false
    }
  },
  discard: () => get().load(),
}))
