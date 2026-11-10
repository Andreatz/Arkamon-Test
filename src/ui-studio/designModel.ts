import type { UiBackground, UiDesignDocument, UiElementDesign, UiExtraLayer, UiMediaEntry, UiRect, UiScreenDesign, UiTypography } from './types'

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
const categories = ['body', 'heading', 'button'] as const
const fits = ['contain', 'cover', 'fill'] as const
export const UI_DESIGN_MAX_MEDIA = 200

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label}: serve un oggetto.`)
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  for (const key of Object.keys(value)) if (forbidden.has(key) || !allowed.includes(key)) throw new Error(`${label}: proprietà non riconosciuta (${key}).`)
}
export function isSafeDesignId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value) && !forbidden.has(value)
}
function id(value: unknown, label: string): string {
  if (!isSafeDesignId(value)) throw new Error(`${label}: identificatore non valido.`)
  return value
}
function string(value: unknown, label: string, limit = 1000): string {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`${label}: testo non valido.`)
  return value
}
function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}: valore compreso fra ${min} e ${max} richiesto.`)
  return value
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label}: valore sì/no richiesto.`)
  return value
}
function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label}: scelta non valida.`)
  return value as T
}
export function isSafeUiAssetSource(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\\"'<>]/.test(value)) return false
  if (value.startsWith('ui-media:')) return isSafeDesignId(value.slice(9))
  if (!value.startsWith('/') || value.startsWith('//')) return false
  try {
    const decoded = decodeURIComponent(value)
    return !decoded.startsWith('//') && !/[\u0000-\u001f\\"'<>]/.test(decoded) && !decoded.split(/[/?#]/).includes('..')
  } catch { return false }
}
function source(value: unknown, label: string): string {
  if (!isSafeUiAssetSource(value)) throw new Error(`${label}: usa un asset locale o un file importato.`)
  return value
}
function color(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent)$/i.test(value)) throw new Error(`${label}: colore non valido.`)
  return value
}
function rect(value: unknown, label: string): UiRect {
  const input = record(value, label)
  keys(input, ['x', 'y', 'w', 'h'], label)
  const result = { x: number(input.x, 0, 99.99, `${label} X`), y: number(input.y, 0, 99.99, `${label} Y`), w: number(input.w, .01, 100, `${label} larghezza`), h: number(input.h, .01, 100, `${label} altezza`) }
  if (result.x + result.w > 100.001 || result.y + result.h > 100.001) throw new Error(`${label}: l’elemento supera l’area 1920 × 1080.`)
  return result
}
function typography(value: unknown, label: string): UiTypography {
  const input = record(value, label)
  keys(input, ['family', 'size', 'weight', 'lineHeight', 'letterSpacing', 'color', 'align', 'transform'], label)
  const result: UiTypography = {}
  if (input.family !== undefined) result.family = id(input.family, `${label} font`)
  if (input.size !== undefined) result.size = number(input.size, 6, 192, `${label} dimensione`)
  if (input.weight !== undefined) result.weight = number(input.weight, 100, 900, `${label} peso`)
  if (input.lineHeight !== undefined) result.lineHeight = number(input.lineHeight, .5, 4, `${label} interlinea`)
  if (input.letterSpacing !== undefined) result.letterSpacing = number(input.letterSpacing, -10, 40, `${label} spaziatura`)
  if (input.color !== undefined) result.color = color(input.color, `${label} colore`)
  if (input.align !== undefined) result.align = choice(input.align, ['left', 'center', 'right'] as const, label)
  if (input.transform !== undefined) result.transform = choice(input.transform, ['none', 'uppercase', 'lowercase'] as const, label)
  return result
}
function element(value: unknown, label: string, extra = false): UiElementDesign {
  const input = record(value, label)
  keys(input, ['rect', 'asset', 'fit', 'opacity', 'zIndex', 'hidden', 'locked', 'text', 'order', 'font', ...(extra ? ['id', 'kind', 'label', 'actionTarget'] : [])], label)
  const result: UiElementDesign = {}
  if (input.rect !== undefined) result.rect = rect(input.rect, label)
  if (input.asset !== undefined) result.asset = source(input.asset, `${label} asset`)
  if (input.fit !== undefined) result.fit = choice(input.fit, fits, label)
  if (input.opacity !== undefined) result.opacity = number(input.opacity, 0, 1, `${label} opacità`)
  if (input.zIndex !== undefined) result.zIndex = number(input.zIndex, -100, 900, `${label} livello`)
  if (input.order !== undefined) result.order = number(input.order, -100, 1000, `${label} ordine`)
  if (input.hidden !== undefined) result.hidden = boolean(input.hidden, label)
  if (input.locked !== undefined) result.locked = boolean(input.locked, label)
  if (input.text !== undefined) result.text = string(input.text, `${label} testo`, 2000)
  if (input.font !== undefined) result.font = typography(input.font, label)
  return result
}
function background(value: unknown, label: string): UiBackground {
  const input = record(value, label)
  keys(input, ['asset', 'fit', 'opacity', 'color', 'x', 'y'], label)
  const result: UiBackground = {}
  if (input.asset !== undefined) result.asset = source(input.asset, label)
  if (input.fit !== undefined) result.fit = choice(input.fit, fits, label)
  if (input.opacity !== undefined) result.opacity = number(input.opacity, 0, 1, label)
  if (input.color !== undefined) result.color = color(input.color, label)
  if (input.x !== undefined) result.x = number(input.x, 0, 100, label)
  if (input.y !== undefined) result.y = number(input.y, 0, 100, label)
  return result
}
export function createDefaultDesign(): UiDesignDocument {
  return { version: 1, typography: { body: { family: 'norwester' }, heading: { family: 'norwester' }, button: { family: 'norwester' } }, screens: {}, media: [] }
}
export function normalizeDesign(value: unknown): UiDesignDocument {
  if (value === undefined || value === null) return createDefaultDesign()
  const input = record(value, 'Progetto UI')
  keys(input, ['version', 'typography', 'screens', 'media'], 'Progetto UI')
  if (input.version !== 1) throw new Error('Versione del progetto UI non supportata.')
  const result = createDefaultDesign()
  if (input.typography !== undefined) {
    const fonts = record(input.typography, 'Font globali'); keys(fonts, categories, 'Font globali')
    for (const category of categories) if (fonts[category] !== undefined) result.typography[category] = typography(fonts[category], `Font ${category}`)
  }
  if (input.screens !== undefined) {
    const screens = record(input.screens, 'Schermate')
    if (Object.keys(screens).length > 128) throw new Error('Il progetto contiene troppe schermate.')
    for (const [screenId, raw] of Object.entries(screens)) {
      id(screenId, 'Schermata')
      const screen = record(raw, screenId); keys(screen, ['background', 'typography', 'elements', 'layers'], screenId)
      const next: UiScreenDesign = { elements: {}, layers: [] }
      if (screen.background !== undefined) next.background = background(screen.background, `${screenId} sfondo`)
      if (screen.typography !== undefined) {
        const fonts = record(screen.typography, `${screenId} font`); keys(fonts, categories, `${screenId} font`)
        next.typography = {}
        for (const category of categories) if (fonts[category] !== undefined) next.typography[category] = typography(fonts[category], `${screenId} font ${category}`)
      }
      if (screen.elements !== undefined) {
        const elements = record(screen.elements, `${screenId} elementi`)
        if (Object.keys(elements).length > 1000) throw new Error(`${screenId}: troppi elementi.`)
        for (const [elementId, rawElement] of Object.entries(elements)) next.elements[id(elementId, 'Elemento')] = element(rawElement, `${screenId} ${elementId}`)
      }
      if (screen.layers !== undefined) {
        if (!Array.isArray(screen.layers) || screen.layers.length > 100) throw new Error(`${screenId}: elenco livelli non valido.`)
        const seen = new Set<string>()
        next.layers = screen.layers.map(rawLayer => {
          const layer = record(rawLayer, 'Livello')
          const layerId = id(layer.id, 'Livello')
          if (seen.has(layerId) || own(next.elements, layerId)) throw new Error(`${screenId}: identificatore livello duplicato (${layerId}).`)
          seen.add(layerId)
          const parsed: UiExtraLayer = { ...element(layer, `${screenId} ${layerId}`, true), id: layerId, kind: choice(layer.kind, ['image', 'text', 'panel', 'button'], 'Tipo livello'), label: string(layer.label, 'Nome livello', 120), rect: rect(layer.rect, 'Livello') }
          if (layer.actionTarget !== undefined) parsed.actionTarget = id(layer.actionTarget, 'Destinazione pulsante')
          return parsed
        })
      }
      result.screens[screenId] = next
    }
  }
  if (input.media !== undefined) {
    if (!Array.isArray(input.media) || input.media.length > UI_DESIGN_MAX_MEDIA) throw new Error('Libreria media non valida o troppo grande.')
    const seen = new Set<string>()
    result.media = input.media.map(raw => {
      const media = record(raw, 'Media'); keys(media, ['id', 'name', 'kind', 'source', 'mime'], 'Media')
      const mediaId = id(media.id, 'Media')
      if (seen.has(mediaId)) throw new Error(`Media duplicato (${mediaId}).`)
      seen.add(mediaId)
      const next: UiMediaEntry = { id: mediaId, name: string(media.name, 'Nome media', 200), kind: choice(media.kind, ['image', 'font'], 'Tipo media'), source: source(media.source, 'File media') }
      if (next.source.startsWith('ui-media:') && next.source !== `ui-media:${mediaId}`) throw new Error('Il riferimento del media non corrisponde al suo identificatore.')
      if (media.mime !== undefined) next.mime = string(media.mime, 'Formato media', 100)
      return next
    })
  }
  return result
}
export function parseDesignJson(text: string): UiDesignDocument {
  if (text.length > 4 * 1024 * 1024) throw new Error('Il progetto UI supera 4 MB; usa un pacchetto con file multimediali separati.')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('JSON del progetto UI non valido.') }
  return normalizeDesign(parsed)
}
