import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdminStore } from '@/store/adminStore'
import { cloneAdminTheme, defaultAdminTheme } from '@/theme/defaultAdminTheme'
import { createDefaultDesign } from './designModel'
import { useUiStudioStore } from './studioStore'

describe('UI studio draft and history', () => {
  beforeEach(() => {
    useAdminStore.setState({ theme: cloneAdminTheme(defaultAdminTheme) })
    useUiStudioStore.getState().load()
  })
  afterEach(() => { vi.unstubAllGlobals() })
  it('edits an isolated draft, supports undo and redo, and only applies on save', () => {
    const next = createDefaultDesign()
    next.typography.heading.size = 32
    useUiStudioStore.getState().setDraft(next)
    next.typography.heading.size = 80
    expect(useUiStudioStore.getState().draft.typography.heading.size).toBe(32)
    expect(useAdminStore.getState().theme.design).toBeUndefined()
    useUiStudioStore.getState().undo()
    expect(useUiStudioStore.getState().draft.typography.heading.size).toBeUndefined()
    useUiStudioStore.getState().redo()
    expect(useUiStudioStore.getState().draft.typography.heading.size).toBe(32)
    expect(useUiStudioStore.getState().save()).toBe(true)
    expect(useAdminStore.getState().theme.design?.typography.heading.size).toBe(32)
  })
  it('clears redo when making a new edit and discards unsaved changes', () => {
    const next = createDefaultDesign(); next.typography.body.size = 22
    useUiStudioStore.getState().setDraft(next)
    useUiStudioStore.getState().undo()
    next.typography.body.size = 24
    useUiStudioStore.getState().setDraft(next)
    expect(useUiStudioStore.getState().redoStack).toHaveLength(0)
    useUiStudioStore.getState().discard()
    expect(useUiStudioStore.getState().draft.typography.body.size).toBeUndefined()
  })
  it('preserves the draft when validation fails', () => {
    const before = useUiStudioStore.getState().draft
    const next = createDefaultDesign(); next.typography.body.size = Infinity
    useUiStudioStore.getState().setDraft(next)
    expect(useUiStudioStore.getState().draft).toEqual(before)
    expect(useUiStudioStore.getState().error).toBeTruthy()
  })
  it('reports storage failure and keeps the saved theme unchanged', () => {
    const before = cloneAdminTheme(useAdminStore.getState().theme)
    const next = createDefaultDesign(); next.typography.heading.size = 32
    useUiStudioStore.getState().setDraft(next)
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('QuotaExceededError') } })
    expect(useUiStudioStore.getState().save()).toBe(false)
    expect(useAdminStore.getState().theme).toEqual(before)
    expect(useUiStudioStore.getState().error).toContain('Salvataggio non riuscito')
  })
})
