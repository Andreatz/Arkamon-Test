import { describe, expect, it } from 'vitest'
import { createDefaultDesign } from './designModel'
import { resolvedScreenDesign } from './runtimeDesign'

describe('screen and named view design inheritance', () => {
  it('inherits geometry, global screen font and layers without altering the saved base', () => {
    const document = createDefaultDesign()
    document.screens.analisi = { elements: { detail: { rect: { x: 40, y: 20, w: 55, h: 65 }, opacity: .9, font: { family: 'norwester', size: 18 } } }, typography: { body: { size: 16 } }, layers: [{ id: 'note', kind: 'text', label: 'Nota', rect: { x: 5, y: 5, w: 20, h: 5 }, text: 'Base' }] }
    document.screens['analisi:mosse'] = { elements: { detail: { opacity: .7, font: { color: '#ffcc00' } } }, typography: { body: { color: '#ffffff' } }, layers: [] }
    const before = JSON.stringify(document)
    const result = resolvedScreenDesign(document, 'analisi:mosse')!
    expect(result.elements.detail).toEqual({ rect: { x: 40, y: 20, w: 55, h: 65 }, opacity: .7, font: { family: 'norwester', size: 18, color: '#ffcc00' } })
    expect(result.typography?.body).toEqual({ size: 16, color: '#ffffff' })
    expect(result.layers).toHaveLength(1)
    expect(JSON.stringify(document)).toBe(before)
    expect(resolvedScreenDesign(document, 'analisi:status')).toBe(document.screens.analisi)
  })
})
