import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultDesign } from './designModel'
import { exportUiDesign, importUiDesign, importUiMedia, resolveUiMediaSource } from './mediaStorage'

function mockIndexedDatabase() {
  const saved = new Map<string, unknown>()
  const database = {
    objectStoreNames: { contains: () => true }, createObjectStore: () => undefined, close: () => undefined,
    transaction: () => {
      let scheduled = false
      const transaction = { oncomplete: undefined as (() => void) | undefined, onerror: undefined, onabort: undefined,
        objectStore: () => ({
          get: (id: string) => {
            const request = { result: saved.get(id), onsuccess: undefined as (() => void) | undefined, onerror: undefined }
            queueMicrotask(() => request.onsuccess?.())
            return request
          },
          put: (value: { id: string }) => {
            saved.set(value.id, structuredClone(value))
            if (!scheduled) { scheduled = true; queueMicrotask(() => transaction.oncomplete?.()) }
          },
        }),
      }
      return transaction
    },
  }
  vi.stubGlobal('indexedDB', { open: () => {
    const request = { result: database, onsuccess: undefined as (() => void) | undefined, onerror: undefined, onblocked: undefined, onupgradeneeded: undefined }
    queueMicrotask(() => request.onsuccess?.())
    return request
  } })
}
function file(name: string, content: string): File {
  const bytes = new TextEncoder().encode(content)
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer } as File
}
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="a"><stop stop-color="#ffffff"/></linearGradient></defs><circle cx="50" cy="50" r="40" fill="url(#a)"/></svg>'

describe('UI media storage and portable packages', () => {
  beforeEach(() => { mockIndexedDatabase() })
  afterEach(() => { vi.unstubAllGlobals() })
  it('imports a static SVG preserving its bytes and exports its data in the portable package', async () => {
    const media = await importUiMedia(file('circle.svg', svg))
    expect(media.kind).toBe('image')
    expect(await resolveUiMediaSource(media.source)).toContain('data:image/svg+xml;base64,')
    const design = createDefaultDesign(); design.media.push(media)
    design.screens.titolo = { elements: { logo: { asset: media.source } }, layers: [] }
    const bundle = await exportUiDesign(design)
    expect(JSON.parse(bundle).files).toHaveLength(1)
    mockIndexedDatabase()
    const imported = await importUiDesign(bundle)
    expect(imported).toEqual(design)
    expect(await resolveUiMediaSource(media.source)).toContain(btoa(svg))
  })
  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:url(https://example.com/a)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///secret">]><svg>&a;</svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://example.com/"><use href="#a"/></svg>',
  ])('rejects active or externally dependent SVG: %s', async content => {
    await expect(importUiMedia(file('bad.svg', content))).rejects.toThrow('SVG non accettato')
  })
  it('rejects a renamed executable and a missing package upload', async () => {
    await expect(importUiMedia(file('image.png', '<html><script></script></html>'))).rejects.toThrow('Formato non riconosciuto')
    const design = createDefaultDesign(); design.media = [{ id: 'missing', kind: 'image', name: 'missing.svg', source: 'ui-media:missing' }]
    await expect(importUiDesign(JSON.stringify({ format: 'arkamon-ui-design', version: 1, design, files: [] }))).rejects.toThrow('non trovato')
  })
  it('rejects bundle MIME spoofing and leaves external URLs unresolved', async () => {
    const design = createDefaultDesign()
    await expect(importUiDesign(JSON.stringify({ format: 'arkamon-ui-design', version: 1, design, files: [{ id: 'spoof', name: 'a.svg', kind: 'image', mime: 'image/png', data: btoa(svg) }] }))).rejects.toThrow('Formato dichiarato')
    await expect(resolveUiMediaSource('https://example.com/a.svg')).rejects.toThrow('non valido')
  })
  it('never overwrites media belonging to the applied project when a package ID collides', async () => {
    const media = await importUiMedia(file('circle.svg', svg))
    const changed = svg.replace('r="40"', 'r="20"')
    const design = createDefaultDesign(); design.media = [media]; design.typography.heading.family = media.id
    const imported = await importUiDesign(JSON.stringify({ format: 'arkamon-ui-design', version: 1, design, files: [{ id: media.id, name: media.name, kind: 'image', mime: 'image/svg+xml', data: btoa(changed) }] }))
    expect(imported.media[0].id).not.toBe(media.id)
    expect(imported.typography.heading.family).toBe(imported.media[0].id)
    expect(await resolveUiMediaSource(media.source)).toContain(btoa(svg))
    expect(await resolveUiMediaSource(imported.media[0].source)).toContain(btoa(changed))
  })
  it('works with historical UI JSON without media files', async () => {
    const design = createDefaultDesign()
    expect(await importUiDesign(JSON.stringify(design))).toEqual(design)
  })
})
