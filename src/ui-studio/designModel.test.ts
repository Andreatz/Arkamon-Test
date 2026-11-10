import { describe, expect, it } from 'vitest'
import { createDefaultDesign, isSafeUiAssetSource, normalizeDesign, parseDesignJson } from './designModel'

describe('UI studio document validation', () => {
  it('uses Norwester without flattening the existing size hierarchy', () => {
    expect(createDefaultDesign().typography).toEqual({ body: { family: 'norwester' }, heading: { family: 'norwester' }, button: { family: 'norwester' } })
  })
  it('deep clones valid screen geometry, layer actions and typography', () => {
    const source = createDefaultDesign()
    source.screens.squadra = { elements: { 'team-slot-0': { rect: { x: 10, y: 20, w: 30, h: 40 }, font: { family: 'chela', size: 24 } } }, layers: [{ id: 'extra-1', kind: 'button', label: 'Apri squadra', rect: { x: 70, y: 90, w: 20, h: 7 }, actionTarget: 'nav-squadra' }] }
    const copy = normalizeDesign(source)
    copy.screens.squadra.elements['team-slot-0'].rect!.x = 20
    expect(source.screens.squadra.elements['team-slot-0'].rect!.x).toBe(10)
    expect(copy.screens.squadra.layers[0].actionTarget).toBe('nav-squadra')
  })
  it.each([NaN, Infinity, -1, 101])('rejects nonfinite or offcanvas geometry %s', x => {
    const design = createDefaultDesign()
    design.screens.titolo = { elements: { logo: { rect: { x, y: 0, w: 10, h: 10 } } }, layers: [] }
    expect(() => normalizeDesign(design)).toThrow()
  })
  it('rejects a rectangle whose right edge leaves the canvas', () => {
    const design = createDefaultDesign()
    design.screens.titolo = { elements: { logo: { rect: { x: 95, y: 0, w: 10, h: 10 } } }, layers: [] }
    expect(() => normalizeDesign(design)).toThrow('supera')
  })
  it('rejects executable properties and prototype keys at every mapped level', () => {
    expect(() => parseDesignJson('{"version":1,"screens":{"__proto__":{"elements":{},"layers":[]}}}')).toThrow()
    expect(() => normalizeDesign({ ...createDefaultDesign(), campaign: {} })).toThrow()
    const design = createDefaultDesign()
    design.screens.titolo = { elements: { button: { onClick: 'alert(1)' } as never }, layers: [] }
    expect(() => normalizeDesign(design)).toThrow('onClick')
  })
  it.each(['javascript:alert(1)', '//example.com/a.svg', 'https://example.com/a.svg', '/%2f%2fexample.com/a.svg', '/foo/../secret', '/foo%5cbar', '/a.svg";color:red'])('rejects unsafe asset source %s', value => {
    expect(isSafeUiAssetSource(value)).toBe(false)
  })
  it('accepts local assets and imported references', () => {
    expect(isSafeUiAssetSource('/ui/asset-kit/Scuro/bottone.svg')).toBe(true)
    expect(isSafeUiAssetSource('/backgrounds/Nuova mappa.png')).toBe(true)
    expect(isSafeUiAssetSource('ui-media:media-123')).toBe(true)
  })
  it('rejects duplicate layers and inconsistent media identifiers', () => {
    const layer = { id: 'layer-a', kind: 'text', label: 'A', rect: { x: 0, y: 0, w: 10, h: 10 } }
    expect(() => normalizeDesign({ ...createDefaultDesign(), screens: { titolo: { elements: {}, layers: [layer, layer] } } })).toThrow('duplicato')
    expect(() => normalizeDesign({ ...createDefaultDesign(), media: [{ id: 'one', name: 'A', source: 'ui-media:two', kind: 'image' }] })).toThrow('corrisponde')
  })
})
