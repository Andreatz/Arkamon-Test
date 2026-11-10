import { create } from 'zustand'
import { normalizeVfxOverrides } from '@/presentation/vfxValidation'
import { assertVisualStorageWritable } from '@/presentation/presentationTransaction'
import type { MoveVfxAssetId } from '@/components/vfx/vfxManifest'
import type {
  VfxAnchor,
  VfxBlendMode,
  VfxLayer,
} from '@/components/vfx/types'

export interface AdminMoveVfxOverride {
  moveId: number
  assetId: MoveVfxAssetId
  scale: number
  offsetX: number
  offsetY: number
  durationMs: number
  anchor: VfxAnchor
  layer: VfxLayer
  mirrorForEnemy: boolean
  blendMode: VfxBlendMode
}

interface VfxAdminState {
  overrides: Record<number, AdminMoveVfxOverride>
  draftOverrides: Record<number, AdminMoveVfxOverride>
  error: string | null
  setDraftOverride: (override: AdminMoveVfxOverride) => void
  removeDraftOverride: (moveId: number) => void
  resetDraftOverrides: () => void
  replaceOverrides: (overrides: Record<number, AdminMoveVfxOverride>) => boolean
  setOverride: (override: AdminMoveVfxOverride) => void
  removeOverride: (moveId: number) => void
  resetOverrides: () => void
}

const VFX_KEY = 'arkamon-vfx-authoring-v1'
function readSaved() {
  try { const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(VFX_KEY); if (raw) { const data = JSON.parse(raw); if (data.version === 1) return { overrides: normalizeVfxOverrides(data.overrides), draftOverrides: normalizeVfxOverrides(data.draftOverrides ?? data.overrides) } } } catch { /* Invalid preferences never prevent the campaign opening. */ }
  return { overrides: {}, draftOverrides: {} }
}
export const useVfxAdminStore = create<VfxAdminState>((set, get) => ({
  ...readSaved(), error: null,
  setDraftOverride: override => {
    try { assertVisualStorageWritable(); const draftOverrides = normalizeVfxOverrides({ ...get().draftOverrides, [override.moveId]: override }); if (typeof localStorage !== 'undefined') localStorage.setItem(VFX_KEY, JSON.stringify({ version: 1, overrides: get().overrides, draftOverrides })); set({ draftOverrides, error: null }) }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Salvataggio bozza VFX non riuscito.' }) }
  },
  removeDraftOverride: moveId => {
    const draftOverrides = { ...get().draftOverrides }; delete draftOverrides[moveId]
    try { assertVisualStorageWritable(); if (typeof localStorage !== 'undefined') localStorage.setItem(VFX_KEY, JSON.stringify({ version: 1, overrides: get().overrides, draftOverrides })); set({ draftOverrides, error: null }) }
    catch { set({ error: 'Spazio del browser non disponibile: bozza non modificata.' }) }
  },
  resetDraftOverrides: () => { try { assertVisualStorageWritable(); if (typeof localStorage !== 'undefined') localStorage.setItem(VFX_KEY, JSON.stringify({ version: 1, overrides: get().overrides, draftOverrides: {} })); set({ draftOverrides: {}, error: null }) } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Impossibile salvare la bozza.' }) } },
  replaceOverrides: value => {
    try { assertVisualStorageWritable(); const overrides = normalizeVfxOverrides(value); if (typeof localStorage !== 'undefined') localStorage.setItem(VFX_KEY, JSON.stringify({ version: 1, overrides, draftOverrides: overrides })); set({ overrides, draftOverrides: overrides, error: null }); return true }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Applicazione VFX non riuscita.' }); return false }
  },
  setOverride: (override) => {
    try { assertVisualStorageWritable() } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Progetto visivo in recupero.' }); return }
    set((state) => ({
      overrides: {
        ...state.overrides,
        [override.moveId]: override,
      },
    }))
  },
  removeOverride: (moveId) => {
    try { assertVisualStorageWritable() } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Progetto visivo in recupero.' }); return }
    set((state) => {
      const overrides = { ...state.overrides }
      delete overrides[moveId]
      return { overrides }
    })
  },
  resetOverrides: () => { try { assertVisualStorageWritable(); set({ overrides: {} }) } catch (cause) { set({ error: cause instanceof Error ? cause.message : 'Progetto visivo in recupero.' }) } },
}))

export function getAdminMoveVfxOverride(moveId: number): AdminMoveVfxOverride | undefined {
  return useVfxAdminStore.getState().overrides[moveId]
}
