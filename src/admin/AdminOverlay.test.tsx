import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { AdminOverlay } from './AdminOverlay'

const adminState = vi.hoisted(() => ({ enabled: true, panelOpen: true, setPanelOpen: vi.fn() }))

vi.mock('react-dom', () => ({ createPortal: vi.fn((children: ReactNode) => children) }))
vi.mock('@store/adminStore', () => ({ useAdminStore: (selector: (state: typeof adminState) => unknown) => selector(adminState) }))
vi.mock('./useAdminHotkey', () => ({ useAdminHotkey: vi.fn() }))
vi.mock('./AdminPanel', () => ({ AdminPanel: () => <section id="arkamon-admin-panel">Controlli Admin</section> }))

describe('AdminOverlay', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(createPortal).mockClear()
    adminState.enabled = true
    adminState.panelOpen = true
  })

  afterEach(() => vi.unstubAllGlobals())

  it('non richiede DOM né portal durante il rendering sul server', () => {
    expect(renderToStaticMarkup(<AdminOverlay />)).toBe('')
    expect(createPortal).not.toHaveBeenCalled()
  })

  it('porta pulsante e pannello sul body con coordinate viewport anziché nella scena scalata', () => {
    const body = {} as HTMLElement
    vi.stubGlobal('document', { body })
    const markup = renderToStaticMarkup(<AdminOverlay />)
    expect(createPortal).toHaveBeenCalledWith(expect.anything(), body)
    expect(markup).toContain('data-admin-overlay="viewport"')
    expect(markup).toContain('class="fixed inset-0')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('aria-controls="arkamon-admin-panel"')
    expect(markup).toContain('Caricamento Admin')
  })

  it('lascia il pannello chiuso e non crea UI quando Admin è disabilitato', () => {
    vi.stubGlobal('document', { body: {} })
    adminState.enabled = false
    expect(renderToStaticMarkup(<AdminOverlay />)).toBe('')
    expect(createPortal).not.toHaveBeenCalled()
  })
})
