import { useEffect, useRef } from 'react'
import { useAdminStore } from '@/store/adminStore'
import { useGameStore } from '@/store/gameStore'
import { assetUrl } from '@/utils/assetUrl'
import { createDefaultDesign } from './designModel'
import { resolveUiMediaSource } from './mediaStorage'
import { getUiFontFamily } from './fontFamily'
import { resolvedScreenDesign } from './runtimeDesign'
import { getUiSkinDependents, getUiSkinSurface } from './skinSlots'
import { uiAssetSurface } from './assetSurface'
import { hpAssetArea, hpAssetSkin } from './hpAssetSkin'
import { collectUiElements, findUiScreenRoot, uiRect, type RegisteredUiElement } from './screenRegistry'
import type { UiDesignDocument, UiElementDesign, UiPreviewMessage, UiScreenSnapshot, UiTypography } from './types'
import { hasRuntimeDesign, requiresElementPass } from './runtimePolicy'

const defaults = createDefaultDesign()
const send = (message: UiPreviewMessage) => { if (window.parent !== window) window.parent.postMessage(message, window.location.origin) }
function declarations(font: UiTypography = {}): string {
  const parts: string[] = []
  if (font.family) parts.push(`font-family:${getUiFontFamily(font.family)}`)
  if (font.size !== undefined) parts.push(`font-size:${font.size}px`)
  if (font.weight !== undefined) parts.push(`font-weight:${font.weight}`)
  if (font.lineHeight !== undefined) parts.push(`line-height:${font.lineHeight}`)
  if (font.letterSpacing !== undefined) parts.push(`letter-spacing:${font.letterSpacing}px`)
  if (font.color) parts.push(`color:${font.color}`)
  if (font.align) parts.push(`text-align:${font.align}`)
  if (font.transform) parts.push(`text-transform:${font.transform}`)
  return parts.map(part => `${part}!important`).join(';')
}
type SavedProperty = { value: string; priority: string; applied: string }
/** Runtime owns only its overrides, leaving React's DOM and event handlers intact. */
export function UiDesignRuntime({ preview = false, design: suppliedDesign, screen: suppliedScreen, onSnapshot, onSelect }: {
  preview?: boolean; design?: UiDesignDocument; screen?: string; onSnapshot?: (snapshot: UiScreenSnapshot) => void; onSelect?: (id: string) => void
}) {
  const savedDesign = useAdminStore(state => state.theme.design)
  const gameScene = useGameStore(state => state.scenaCorrente.scena)
  const design = suppliedDesign ?? savedDesign ?? defaults
  const enabled = preview || hasRuntimeDesign(design)
  const latest = useRef({ design, screen: suppliedScreen ?? gameScene, onSnapshot, onSelect })
  latest.current = { design, screen: suppliedScreen ?? gameScene, onSnapshot, onSelect }
  const queueRef = useRef<(() => void) | null>(null)
  useEffect(() => { queueRef.current?.() }, [design, suppliedScreen, gameScene])
  useEffect(() => {
    if (!enabled) return
    const changed = new Map<HTMLElement | SVGElement, Map<string, SavedProperty>>()
    const texts = new Map<Text, { original: string; applied: string }>(), sources = new Map<HTMLImageElement, string | null>()
    const svgSources = new Map<SVGImageElement, Record<string, string | null>>()
    const owned = new Set<HTMLElement | SVGElement>(), urls = new Map<string, string>(), fonts = new Map<string, FontFace>()
    let currentRoot: HTMLElement | null = null, currentScreen = '', entries: RegisteredUiElement[] = []
    let frame = 0, stopped = false, running = false
    const set = (element: HTMLElement | SVGElement, property: string, value: string) => {
      if (!changed.has(element)) changed.set(element, new Map())
      const properties = changed.get(element)!
      if (!properties.has(property)) properties.set(property, { value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property), applied: value })
      if (element.style.getPropertyValue(property) !== value || element.style.getPropertyPriority(property) !== 'important') element.style.setProperty(property, value, 'important')
      properties.get(property)!.applied = element.style.getPropertyValue(property)
    }
    const restore = () => {
      for (const [element, properties] of changed) for (const [key, previous] of properties) {
        if (previous.value) element.style.setProperty(key, previous.value, previous.priority)
        else element.style.removeProperty(key)
      }
      changed.clear()
      for (const [node, value] of texts) if (node.isConnected && node.nodeValue === value.applied) node.nodeValue = value.original
      texts.clear()
      for (const [element, source] of sources) if (element.isConnected) source === null ? element.removeAttribute('src') : element.setAttribute('src', source)
      sources.clear()
      for (const [element, attributes] of svgSources) if (element.isConnected) for (const [name, value] of Object.entries(attributes)) value === null ? element.removeAttribute(name) : element.setAttribute(name, value)
      svgSources.clear()
      owned.forEach(element => element.remove()); owned.clear()
    }
    const suspendedMenuAsset = (root: Element, source?: string) => root.matches('.pu-shell[data-ui-concept]')
      && !!source && /^\/ui\/(?:studio|player-kit)\/.*\.svg$/i.test(source)
    const mediaUrl = (source: string): string | undefined => {
      if (urls.has(source)) return urls.get(source)
      if (!source.startsWith('ui-media:')) { const url = assetUrl(source); urls.set(source, url); return url }
      urls.set(source, '')
      void resolveUiMediaSource(source).then(url => { if (!stopped) { urls.set(source, url); queue() } }).catch(() => { /* Missing imports retain the original artwork. */ })
      return undefined
    }
    const typography = (root: HTMLElement, document: UiDesignDocument, screen: string) => {
      const screenDesign = resolvedScreenDesign(document, screen)
      const scoped = screenDesign?.typography
      const body = { ...document.typography.body, ...scoped?.body }, heading = { ...document.typography.heading, ...scoped?.heading }, button = { ...document.typography.button, ...scoped?.button }
      const style = window.document.createElement('style'); style.dataset.uiRuntimeOwned = 'fonts'
      style.textContent = `[data-ui-runtime-root="active"],[data-ui-runtime-root="active"] :where(p,span,small,strong,label,output,input,select,textarea,div,dt,dd,li){${declarations(body)}}[data-ui-runtime-root="active"] :is(h1,h2,h3,h4,.arka-readable-title),[data-ui-runtime-root="active"] :is(h1,h2,h3,h4,.arka-readable-title) *{${declarations(heading)}}[data-ui-runtime-root="active"] :is(button,a,button span,button strong,button small){${declarations(button)}}`
      window.document.head.append(style); owned.add(style)
      root.setAttribute('data-ui-runtime-root', 'active')
      const references = new Set([...Object.values(document.typography), ...Object.values(scoped ?? {}), ...Object.values(screenDesign?.elements ?? {}).map(entry => entry.font), ...(screenDesign?.layers ?? []).map(entry => entry.font)].map(font => font?.family).filter(Boolean))
      for (const entry of document.media.filter(entry => entry.kind === 'font' && references.has(entry.id))) {
        if (fonts.has(entry.id)) continue
        const url = mediaUrl(entry.source)
        if (!url) continue
        const font = new FontFace(`UiUploaded_${entry.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`, `url("${url}")`)
        fonts.set(entry.id, font)
        void font.load().then(loaded => { if (!stopped) { window.document.fonts.add(loaded); queue() } }).catch(() => {})
      }
    }
    const geometry = (element: HTMLElement | SVGElement, config: UiElementDesign, root: HTMLElement) => {
      if (!config.rect) return
      // Battle rectangles are resolved before rendering, including the VFX anchors.
      if (element.getAttribute('data-ui-layout-owner') === 'battle') return
      const bounds = root.getBoundingClientRect(), rect = config.rect
      const html = element as HTMLElement
      const computed = getComputedStyle(element)
      // Keep the original flow slot: moving the header must not pull its siblings upwards.
      if (element instanceof HTMLElement && computed.position !== 'absolute' && computed.position !== 'fixed') {
        const placeholder = window.document.createElement('div')
        placeholder.dataset.uiRuntimeOwned = 'flow-slot'
        placeholder.setAttribute('aria-hidden', 'true')
        for (const property of ['display', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'grid-area', 'order', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left']) placeholder.style.setProperty(property, computed.getPropertyValue(property))
        placeholder.style.visibility = 'hidden'; placeholder.style.pointerEvents = 'none'
        if (computed.display === 'inline') placeholder.style.display = 'inline-block'
        element.before(placeholder); owned.add(placeholder)
      }
      set(element, 'position', 'absolute'); set(element, 'margin', '0'); set(element, 'transform', 'none')
      const parent = html.offsetParent instanceof HTMLElement ? html.offsetParent : root
      const parentBounds = parent.getBoundingClientRect(), sx = parentBounds.width / Math.max(parent.offsetWidth, 1), sy = parentBounds.height / Math.max(parent.offsetHeight, 1)
      set(element, 'left', `${(bounds.left + bounds.width * rect.x / 100 - parentBounds.left) / (sx || 1) - parent.clientLeft + parent.scrollLeft}px`)
      set(element, 'top', `${(bounds.top + bounds.height * rect.y / 100 - parentBounds.top) / (sy || 1) - parent.clientTop + parent.scrollTop}px`)
      set(element, 'width', `${bounds.width * rect.w / 100 / (sx || 1)}px`); set(element, 'height', `${bounds.height * rect.h / 100 / (sy || 1)}px`)
      set(element, 'min-width', '0'); set(element, 'min-height', '0'); set(element, 'max-width', 'none'); set(element, 'max-height', 'none'); set(element, 'box-sizing', 'border-box')
    }
    const replaceAsset = (selected: HTMLElement | SVGElement, config: UiElementDesign) => {
      if (!config.asset) return
      // Archived menu skins stay suspended in the current compositions. This
      // does not disable new PNG/imported artwork or the rest of an edit.
      if (suspendedMenuAsset(selected.closest('.pu-shell') ?? selected, config.asset)) return
      const element = getUiSkinSurface(uiAssetSurface(selected))
      const hpSkin = element.matches('[data-battle-hp-side]') ? hpAssetSkin(config.asset) : undefined
      const url = hpSkin ?? mediaUrl(config.asset)
      if (!url) return
      if (element instanceof HTMLImageElement) {
        if (!sources.has(element)) sources.set(element, element.getAttribute('src'))
        element.src = url; set(element, 'object-fit', config.fit ?? 'contain'); return
      }
      if (element instanceof SVGSVGElement) {
        let image = element.querySelector('image')
        if (!image) {
          image = window.document.createElementNS('http://www.w3.org/2000/svg', 'image')
          image.dataset.uiRuntimeOwned = 'asset'; element.append(image); owned.add(image)
        } else {
          const originalImage = image
          if (!svgSources.has(originalImage)) svgSources.set(originalImage, Object.fromEntries(['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'].map(name => [name, originalImage.getAttribute(name)])))
        }
        // Native SVG primitives paint above a CSS background too; replace their artwork.
        for (const primitive of element.querySelectorAll<SVGElement>('path,rect,circle,ellipse,line,polygon,polyline,text,use,image,foreignObject')) {
          if (primitive !== image && !primitive.closest('defs,clipPath,mask,pattern,marker,symbol')) set(primitive, 'visibility', 'hidden')
        }
        const viewBox = element.viewBox.baseVal
        image.setAttribute('href', url); image.setAttribute('x', String(viewBox.x)); image.setAttribute('y', String(viewBox.y)); image.setAttribute('width', String(viewBox.width || element.clientWidth)); image.setAttribute('height', String(viewBox.height || element.clientHeight)); image.setAttribute('preserveAspectRatio', config.fit === 'fill' ? 'none' : config.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet')
        return
      }
      const image = element.matches('.pu-kit-icon') ? element.querySelector<HTMLImageElement>('img') : null
      if (image) { if (!sources.has(image)) sources.set(image, image.getAttribute('src')); image.src = url; set(image, 'object-fit', config.fit ?? 'contain'); return }
      // The border shorthand would also erase border-image-source before it is saved.
      if (element.matches('.pu-frame,.game-button-frame')) set(element, 'border-width', '0')
      set(element, 'border-image-source', 'none'); set(element, 'border-color', 'transparent'); set(element, 'box-shadow', 'none'); set(element, 'background-color', 'transparent')
      if (element.matches('.pu-hero-column,.pu-dex-hero') && element.dataset.uiId) {
        const style = window.document.createElement('style'); style.dataset.uiRuntimeOwned = 'asset-decoration'
        style.textContent = `[data-ui-runtime-root="active"] [data-ui-id="${CSS.escape(element.dataset.uiId)}"]::before{visibility:hidden!important}`
        window.document.head.append(style); owned.add(style)
      }
      // Only explicitly decorative overlays belong to the skin. Live fills, icons,
      // names, status and nested commands remain mounted and keep updating normally.
      for (const decoration of getUiSkinDependents(element)) set(decoration, 'visibility', 'hidden')
      element.querySelectorAll<HTMLElement>('[data-ui-asset-decoration]').forEach(decoration => {
        if (decoration.closest('[data-ui-asset-surface]') === element) set(decoration, 'visibility', 'hidden')
      })
      if (hpSkin) {
        const area = hpAssetArea(element.clientWidth, element.clientHeight, config.fit)
        const position = (selector: string, x: number, y: number, w: number, h?: number) => {
          const content = element.querySelector<HTMLElement>(selector)
          if (!content) return
          set(content, 'left', `${area.x + area.w * x / 100}%`); set(content, 'top', `${area.y + area.h * y / 100}%`)
          set(content, 'right', 'auto'); set(content, 'width', `${area.w * w / 100}%`)
          if (h !== undefined) set(content, 'height', `${area.h * h / 100}%`)
        }
        position('[data-ui-hp-labels]', 16, 35.5, 76.5)
        position('[data-ui-hp-track]', 12.35, 66.8, 57.65, 15.45)
        position('[data-ui-hp-value]', 12.35, 66.8, 57.65, 15.45)
      }
      set(element, 'background-image', `url("${url}")`); set(element, 'background-size', config.fit === 'fill' ? '100% 100%' : config.fit ?? 'contain'); set(element, 'background-position', 'center'); set(element, 'background-repeat', 'no-repeat')
    }
    const apply = (entry: RegisteredUiElement, config: UiElementDesign, root: HTMLElement) => {
      const { element } = entry
      geometry(element, config, root); replaceAsset(element, config)
      if (config.hidden) set(element, 'visibility', 'hidden')
      if (config.opacity !== undefined) set(element, 'opacity', String(config.opacity))
      if (config.zIndex !== undefined) { if (getComputedStyle(element).position === 'static') set(element, 'position', 'relative'); set(element, 'z-index', String(config.zIndex)) }
      if (config.order !== undefined) set(element, 'order', String(config.order))
      if (config.font) {
        const style = window.document.createElement('style'); style.dataset.uiRuntimeOwned = 'element-font'
        const escaped = CSS.escape(entry.id)
        style.textContent = `[data-ui-runtime-root="active"] [data-ui-id="${escaped}"],[data-ui-runtime-root="active"] [data-ui-id="${escaped}"] *{${declarations(config.font)}}`
        window.document.head.append(style); owned.add(style)
      }
      if (config.text !== undefined && !element.matches('input,select,textarea,svg,img')) {
        const walker = window.document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const nodes: Text[] = []; let node: Node | null
        while ((node = walker.nextNode())) if (node.nodeValue?.trim() && !node.parentElement?.closest('svg,style,script,[aria-hidden="true"]')) nodes.push(node as Text)
        nodes.forEach((text, index) => { const applied = index === 0 ? config.text! : ''; if (!texts.has(text)) texts.set(text, { original: text.nodeValue || '', applied }); text.nodeValue = applied })
      }
    }
    const snapshot = (root: HTMLElement, screen: string) => {
      const bounds = root.getBoundingClientRect()
      const reorderGroups = new Map<Element, string>()
      for (const entry of entries) {
        const parent = entry.element.parentElement
        if (parent && entry.element.matches('button,a[href]') && /^(inline-)?(flex|grid)$/.test(getComputedStyle(parent).display) && !reorderGroups.has(parent)) reorderGroups.set(parent, parent.getAttribute('data-ui-id') ?? `commands.group.${reorderGroups.size + 1}`)
      }
      const result: UiScreenSnapshot = { screenId: screen, label: screen, width: root.clientWidth || bounds.width, height: root.clientHeight || bounds.height, elements: entries.map(entry => ({ id: entry.id, label: entry.label, kind: entry.kind, parentId: entry.parentId, actionable: entry.element.matches('button,a[href]'), reorderable: !!entry.element.parentElement && reorderGroups.has(entry.element.parentElement), reorderGroupId: entry.element.parentElement ? reorderGroups.get(entry.element.parentElement) : undefined, rect: uiRect(entry.element, root), text: entry.element.matches('input,select') ? undefined : entry.element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200), asset: entry.element instanceof HTMLImageElement ? entry.element.getAttribute('src') ?? undefined : undefined })).filter(entry => entry.rect.w > 0 && entry.rect.h > 0) }
      latest.current.onSnapshot?.(result); if (preview) send({ source: 'arkamon-ui-preview', type: 'snapshot', snapshot: result })
    }
    const update = () => {
      frame = 0
      if (stopped || running) return
      running = true
      observer.disconnect(); restore()
      const found = findUiScreenRoot(latest.current.screen, preview)
      if (!found && currentRoot) {
        currentRoot.removeAttribute('data-ui-runtime-root')
        currentRoot = null; entries = []
      }
      if (found) {
        if (currentRoot && currentRoot !== found.root) currentRoot.removeAttribute('data-ui-runtime-root')
        currentRoot = found.root; currentScreen = found.screen
        const root = found.root, document = latest.current.design, configuration = resolvedScreenDesign(document, currentScreen)
        typography(root, document, currentScreen)
        entries = preview || requiresElementPass(configuration) ? collectUiElements(root, currentScreen) : []
        if (configuration?.background) {
          const background = configuration.background
          set(root, 'position', getComputedStyle(root).position === 'static' ? 'relative' : getComputedStyle(root).position)
          if (background.color) set(root, 'background-color', background.color)
          const url = background.asset && !suspendedMenuAsset(root, background.asset) ? mediaUrl(background.asset) : undefined
          if (url || background.color) {
            set(root, 'background-image', 'none')
            root.querySelectorAll<HTMLElement>(':scope>video,:scope>img.absolute.inset-0').forEach(element => set(element, 'visibility', 'hidden'))
            const layer = window.document.createElement('div'); layer.dataset.uiRuntimeOwned = 'background'; layer.setAttribute('aria-hidden', 'true')
            layer.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:0;background-color:${background.color ?? 'transparent'};background-image:${url ? `url("${url}")` : 'none'};background-size:${background.fit === 'fill' ? '100% 100%' : background.fit ?? 'cover'};background-position:${background.x ?? 50}% ${background.y ?? 50}%;background-repeat:no-repeat;opacity:${background.opacity ?? 1}`
            root.prepend(layer); owned.add(layer)
            root.querySelectorAll<HTMLElement>(':scope>*:not([data-ui-runtime-owned])').forEach(element => { if (getComputedStyle(element).position === 'static') set(element, 'position', 'relative') })
          }
        }
        for (const entry of entries) if (configuration?.elements[entry.id]) apply(entry, configuration.elements[entry.id], root)
        const actionEntries = [...entries]
        for (const baseLayer of configuration?.layers ?? []) {
          const override = configuration?.elements[baseLayer.id]
          const layer = override ? { ...baseLayer, ...override, font: { ...baseLayer.font, ...override.font } } : baseLayer
          const element = window.document.createElement(layer.kind === 'button' ? 'button' : 'div')
          element.dataset.uiRuntimeOwned = 'layer'; element.dataset.uiId = layer.id; element.setAttribute('aria-label', layer.label)
          if (element instanceof HTMLButtonElement) { element.type = 'button'; element.onclick = () => { if (preview) return; const target = actionEntries.find(entry => entry.id === layer.actionTarget)?.element; if (target instanceof HTMLElement && target.matches('button,a[href]') && !target.hasAttribute('disabled') && target.getAttribute('aria-disabled') !== 'true' && !target.closest('[hidden]')) target.click() } }
          element.style.cssText = `position:absolute;box-sizing:border-box;z-index:${layer.zIndex ?? 60};${layer.kind === 'panel' ? 'background:#11243e;border:1px solid #6fa5cf;border-radius:8px;' : ''}${layer.kind === 'button' ? 'background:#153655;border:1px solid #7db6dc;color:white;cursor:pointer;' : ''}`
          if (layer.text) element.textContent = layer.text
          root.append(element); owned.add(element)
          const entry: RegisteredUiElement = { id: layer.id, label: layer.label, kind: layer.kind === 'text' ? 'text' : layer.kind === 'button' ? 'button' : layer.kind === 'image' ? 'image' : 'group', element }
          apply(entry, layer, root); entries.push(entry)
        }
        if (preview || latest.current.onSnapshot) snapshot(root, currentScreen)
      }
      running = false
      if (currentRoot) observer.observe(currentRoot, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'href', 'style', 'data-ui-view'] })
      // Top-level portalled tools change the active root. Other subtrees are ignored.
      observer.observe(window.document.body, { childList: true })
    }
    function queue() { if (!stopped && !frame) frame = requestAnimationFrame(update) }
    const observer = new MutationObserver(records => {
      let external = false
      for (const record of records) {
        const owner = record.target instanceof Element ? record.target : record.target.parentElement
        if (owner?.closest('[data-ui-runtime-owned]')) continue
        if (record.type === 'attributes' && record.attributeName === 'style') {
          const target = record.target as HTMLElement
          const properties = changed.get(target)
          if (properties) for (const [property, previous] of properties) {
            const currentValue = target.style.getPropertyValue(property), currentPriority = target.style.getPropertyPriority(property)
            if (currentValue !== previous.applied || currentPriority !== 'important') {
              previous.value = currentValue; previous.priority = currentPriority; external = true
            }
          }
          continue
        }
        if (record.type === 'attributes' && record.target instanceof HTMLImageElement && sources.has(record.target)) sources.set(record.target, record.target.getAttribute('src'))
        if (record.type === 'attributes' && record.target instanceof SVGImageElement && svgSources.has(record.target)) {
          const previous = svgSources.get(record.target)!
          previous[record.attributeName!] = record.target.getAttribute(record.attributeName!)
        }
        if (record.type === 'characterData' || record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => !(node instanceof HTMLElement && node.dataset.uiRuntimeOwned))) external = true
      }
      if (external) queue()
    })
    const select = (event: Event) => {
      if (!preview || !currentRoot) return
      if (!(event.target instanceof Element) || !currentRoot.contains(event.target)) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.type !== 'pointerdown') return
      const target = event.target.closest('[data-ui-id]')
      const id = target?.getAttribute('data-ui-id')
      if (id && !resolvedScreenDesign(latest.current.design, currentScreen)?.elements[id]?.locked) { latest.current.onSelect?.(id); send({ source: 'arkamon-ui-preview', type: 'select', id }) }
    }
    queueRef.current = queue
    window.addEventListener('resize', queue)
    window.document.fonts.addEventListener('loadingdone', queue)
    const imageLoaded = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLImageElement || target instanceof SVGImageElement) || target.closest('[data-ui-runtime-owned]')) return
      // Overridden sources are restored/reapplied in a batch; their load events must not feed it back.
      if ((target instanceof HTMLImageElement && sources.has(target)) || (target instanceof SVGImageElement && svgSources.has(target))) return
      queue()
    }
    window.document.addEventListener('load', imageLoaded, true)
    if (preview) { window.addEventListener('pointerdown', select, true); window.addEventListener('click', select, true); window.addEventListener('submit', select, true) }
    queue()
    return () => {
      stopped = true; observer.disconnect(); cancelAnimationFrame(frame); restore(); currentRoot?.removeAttribute('data-ui-runtime-root')
      fonts.forEach(font => window.document.fonts.delete(font))
      window.removeEventListener('resize', queue); window.removeEventListener('pointerdown', select, true); window.removeEventListener('click', select, true); window.removeEventListener('submit', select, true)
      window.document.fonts.removeEventListener('loadingdone', queue)
      window.document.removeEventListener('load', imageLoaded, true)
      queueRef.current = null
    }
  }, [preview, enabled])
  return null
}
