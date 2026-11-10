import type { UiDesignDocument, UiElementDesign, UiExtraLayer, UiScreenDesign } from './types'

function mergeElement<T extends UiElementDesign>(base: T | undefined, view: T): T {
  return { ...base, ...view, ...((base?.font || view.font) ? { font: { ...base?.font, ...view.font } } : {}) }
}
/** A tab inherits the screen design, with its own overrides only where requested. */
export function resolvedScreenDesign(document: UiDesignDocument, screen: string): UiScreenDesign | undefined {
  const baseId = screen.split(':')[0], base = document.screens[baseId], view = document.screens[screen]
  if (baseId === screen || !base) return view
  if (!view) return base
  const elements: Record<string, UiElementDesign> = { ...base.elements }
  for (const [id, element] of Object.entries(view.elements)) elements[id] = mergeElement(elements[id], element)
  const layers = new Map<string, UiExtraLayer>(base.layers.map(layer => [layer.id, layer]))
  for (const layer of view.layers) layers.set(layer.id, mergeElement(layers.get(layer.id), layer))
  return { ...base, ...view, background: view.background ? { ...base.background, ...view.background } : base.background,
    typography: { body: { ...base.typography?.body, ...view.typography?.body }, heading: { ...base.typography?.heading, ...view.typography?.heading }, button: { ...base.typography?.button, ...view.typography?.button } }, elements, layers: [...layers.values()] }
}
