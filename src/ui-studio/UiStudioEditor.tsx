import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { UI_BUILTIN_ASSETS } from './assetCatalog'
import { createDefaultDesign } from './designModel'
import { exportUiDesign, importUiDesign, importUiMedia, resolveUiMediaSource } from './mediaStorage'
import { useUiStudioStore } from './studioStore'
import { resolvedScreenDesign } from './runtimeDesign'
import { listenToStudioPointerDrag } from './studioPointerDrag'
import { UI_STUDIO_SCREENS, UI_STUDIO_SCREEN_VIEWS } from './types'
import type { UiBuiltinAsset, UiDesignDocument, UiElementDesign, UiElementInfo, UiExtraLayer, UiPreviewMessage, UiRect, UiScreenDesign, UiStudioMessage, UiTypography } from './types'
import './uiStudio.css'
import { PresentationProjectPanel } from '@/presentation/PresentationProjectPanel'
import { VisualRecoveryNotice } from '@/presentation/VisualRecoveryNotice'

const WIDTH = 1920
const HEIGHT = 1080
const ASSET_PAGE_SIZE = 24
const FONT_NAMES = [['norwester', 'Norwester'], ['chela', 'Chela One · precedente'], ['azonix', 'Azonix · se installato'], ['system', 'Sistema · leggibile']] as const
const EMPTY_SCREEN: UiScreenDesign = { elements: {}, layers: [] }
const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = typeof HANDLE_NAMES[number] | 'move'
type InspectorTab = 'element' | 'screen' | 'fonts' | 'menus' | 'project'
type LibraryTarget = 'element' | 'background'
type DisplayElement = UiElementInfo & { custom?: UiExtraLayer; actionable?: boolean; reorderable?: boolean; reorderGroupId?: string }

function cloneDesign(document: UiDesignDocument): UiDesignDocument {
  return JSON.parse(JSON.stringify(document)) as UiDesignDocument
}
function mediaIsUsed(document: UiDesignDocument, id: string): boolean {
  const search = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false
    return Object.entries(value).some(([key, item]) => (key === 'asset' && item === `ui-media:${id}`) || (key === 'family' && item === id) || search(item))
  }
  return search(document.typography) || search(document.screens)
}
function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)) }
function screenOf(document: UiDesignDocument, id: string): UiScreenDesign { return document.screens[id] ?? EMPTY_SCREEN }
function editScreen(document: UiDesignDocument, id: string): UiScreenDesign {
  return document.screens[id] ?? (document.screens[id] = { elements: {}, layers: [] })
}
function overrideOf(screen: UiScreenDesign, element: DisplayElement | undefined): UiElementDesign {
  if (!element) return {}
  return element.custom ? screen.layers.find(layer => layer.id === element.id) ?? element.custom : screen.elements[element.id] ?? {}
}
function safeRect(rect: UiRect): UiRect {
  const x = clamp(rect.x, 0, 99.9), y = clamp(rect.y, 0, 99.9)
  return { x, y, w: clamp(rect.w, .1, 100 - x), h: clamp(rect.h, .1, 100 - y) }
}
function setElement(document: UiDesignDocument, screenId: string, element: DisplayElement, patch: Partial<UiElementDesign>): void {
  const screen = editScreen(document, screenId)
  if (element.custom) {
    const index = screen.layers.findIndex(layer => layer.id === element.id)
    if (index >= 0) screen.layers[index] = { ...screen.layers[index], ...patch }
    else screen.layers.push({ ...cloneLayer(element.custom), ...patch })
  } else screen.elements[element.id] = { ...screen.elements[element.id], ...patch }
}
function cloneLayer(layer: UiExtraLayer): UiExtraLayer { return JSON.parse(JSON.stringify(layer)) as UiExtraLayer }
function editableLayer(document: UiDesignDocument, screenId: string, element: DisplayElement): UiExtraLayer | undefined {
  if (!element.custom) return undefined
  const screen = editScreen(document, screenId)
  let layer = screen.layers.find(item => item.id === element.id)
  if (!layer) { layer = cloneLayer(element.custom); screen.layers.push(layer) }
  return layer
}
function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function NumberField({ label, value, onChange, min, max, step = 1, suffix }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string
}) {
  return <label className="uis-field"><span>{label}{suffix ? <small>{suffix}</small> : null}</span><input type="number" aria-label={label} value={Number(value.toFixed(2))} min={min} max={max} step={step} onChange={event => {
    if (event.target.value === '') return
    const next = Number(event.target.value)
    if (Number.isFinite(next)) onChange(clamp(next, min ?? -Infinity, max ?? Infinity))
  }} /></label>
}
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="uis-check"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span>{label}</span></label>
}
function MediaImage({ source, alt, className = '' }: { source?: string; alt: string; className?: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true
    setUrl('')
    if (source) void resolveUiMediaSource(source).then(result => { if (active) setUrl(result) }).catch(() => { if (active) setUrl('') })
    return () => { active = false }
  }, [source])
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : <span className={`uis-image-empty ${className}`}>Nessuna immagine</span>
}
function TypographyFields({ value, update, fonts }: { value: UiTypography; update: (patch: Partial<UiTypography>) => void; fonts: { id: string; name: string }[] }) {
  return <>
    <label className="uis-field"><span>Carattere</span><select value={value.family ?? ''} onChange={event => update({ family: event.target.value || undefined })}><option value="">Eredita</option>{fonts.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</select></label>
    <div className="uis-fields-two"><NumberField label="Dimensione" suffix="px" value={value.size ?? 20} min={6} max={192} onChange={size => update({ size })} /><NumberField label="Peso" value={value.weight ?? 400} min={100} max={900} step={100} onChange={weight => update({ weight })} /></div>
    <div className="uis-fields-two"><NumberField label="Interlinea" value={value.lineHeight ?? 1.2} min={.5} max={4} step={.05} onChange={lineHeight => update({ lineHeight })} /><NumberField label="Spaziatura" suffix="px" value={value.letterSpacing ?? 0} min={-10} max={40} step={.1} onChange={letterSpacing => update({ letterSpacing })} /></div>
    <label className="uis-field"><span>Colore del testo</span><div className="uis-color-row"><input type="color" aria-label="Scegli colore del testo" value={/^#[0-9a-f]{6}$/i.test(value.color ?? '') ? value.color : '#ffffff'} onChange={event => update({ color: event.target.value })} /><input aria-label="Codice colore testo" value={value.color ?? ''} placeholder="Eredita" onChange={event => { const color = event.target.value; if (/^#[0-9a-f]{6}$/i.test(color)) update({ color }) }} /></div></label>
    <div className="uis-fields-two"><label className="uis-field"><span>Allineamento</span><select value={value.align ?? 'left'} onChange={event => update({ align: event.target.value as UiTypography['align'] })}><option value="left">Sinistra</option><option value="center">Centro</option><option value="right">Destra</option></select></label><label className="uis-field"><span>Maiuscole</span><select value={value.transform ?? 'none'} onChange={event => update({ transform: event.target.value as UiTypography['transform'] })}><option value="none">Originali</option><option value="uppercase">Maiuscolo</option><option value="lowercase">Minuscolo</option></select></label></div>
  </>
}
function MenuGroup({ name, commands, screen, onSelect, onChange, onMove }: {
  name: string; commands: DisplayElement[]; screen: UiScreenDesign
  onSelect: (id: string) => void; onChange: (command: DisplayElement, patch: Partial<UiElementDesign>) => void
  onMove: (commands: DisplayElement[], index: number, offset: -1 | 1) => void
}) {
  return <section className="uis-menu-group"><h3>{name}</h3>{commands.map((menu, index) => <div className="uis-menu-item" data-testid={`ui-studio-command-${menu.id}`} key={menu.id}>
    <button type="button" className="uis-menu-select" onClick={() => onSelect(menu.id)}>{menu.label}</button>
    <label className="uis-field"><span className="uis-sr-only">Etichetta {menu.label}</span><input aria-label={`Etichetta ${menu.label}`} value={screen.elements[menu.id]?.text ?? menu.text ?? menu.label} onChange={event => onChange(menu, { text: event.target.value })} /></label>
    <div className="uis-menu-controls"><CheckField label="Visibile" checked={!screen.elements[menu.id]?.hidden} onChange={visible => onChange(menu, { hidden: !visible })} />
      <button type="button" disabled={!index || menu.reorderable !== true || commands[index - 1]?.reorderable !== true || !!screen.elements[menu.id]?.rect || !!screen.elements[commands[index - 1]?.id]?.rect} aria-label={`Sposta prima ${menu.label}`} title="Sposta nel suo gruppo · disponibile per elementi nel layout automatico" onClick={() => onMove(commands, index, -1)}>↑</button>
      <button type="button" disabled={index === commands.length - 1 || menu.reorderable !== true || commands[index + 1]?.reorderable !== true || !!screen.elements[menu.id]?.rect || !!screen.elements[commands[index + 1]?.id]?.rect} aria-label={`Sposta dopo ${menu.label}`} title="Sposta nel suo gruppo · disponibile per elementi nel layout automatico" onClick={() => onMove(commands, index, 1)}>↓</button>
    </div>
  </div>)}</section>
}
function ImportedFiles({ document, onRemove }: { document: UiDesignDocument; onRemove: (id: string) => void }) {
  return <details className="uis-imported-files"><summary>File importati · {document.media.length}</summary><p className="uis-help">Rimuovi i file inutilizzati dalla bozza per alleggerire l’esportazione. I file del layout applicato restano conservati.</p>{document.media.length ? document.media.map(media => {
    const used = mediaIsUsed(document, media.id)
    return <div className="uis-imported-file" key={media.id}><div><strong title={media.name}>{media.name}</strong><small>{media.kind === 'font' ? 'Font' : 'Immagine'}{used ? ' · in uso' : ' · inutilizzato'}</small></div><button type="button" aria-label={`Rimuovi ${media.name}`} title={used ? 'Il file è usato nel layout. Sostituiscilo prima di rimuoverlo.' : 'Rimuovi dalla bozza'} disabled={used} onClick={() => onRemove(media.id)}>Rimuovi</button></div>
  }) : <p className="uis-help">Non hai ancora importato file.</p>}</details>
}

export default function UiStudioEditor({ onClose }: { onClose?: () => void }) {
  const { draft, undoStack, redoStack, error, load, setDraft, undo, redo, save, discard } = useUiStudioStore()
  const [screenId, setScreenId] = useState<string>('menu')
  const [snapshot, setSnapshot] = useState<UiElementInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspector, setInspector] = useState<InspectorTab>('element')
  const [layerSearch, setLayerSearch] = useState('')
  const [libraryTarget, setLibraryTarget] = useState<LibraryTarget | null>(null)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryCategory, setLibraryCategory] = useState('all')
  const [libraryPage, setLibraryPage] = useState(0)
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState(.5)
  const [snap, setSnap] = useState(true)
  const [grid, setGrid] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const operationRevision = useRef(0)
  const [savedSignature, setSavedSignature] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<HTMLInputElement>(null)
  const fontRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLElement>(null)
  const draftRef = useRef(draft)
  const screenRef = useRef(screenId)
  const dragRef = useRef<{ pointerId: number; element: DisplayElement; start: UiRect; x: number; y: number; handle: Handle; document: UiDesignDocument; didMove: boolean; scale: number; screen: string } | null>(null)
  draftRef.current = draft
  screenRef.current = screenId
  const [baseScreenId, internalView = 'default'] = screenId.split(':')
  const availableViews = UI_STUDIO_SCREEN_VIEWS[baseScreenId]
  const screenLabel = UI_STUDIO_SCREENS.find(([id]) => id === baseScreenId)?.[1] ?? baseScreenId
  const signature = useMemo(() => JSON.stringify(draft), [draft])
  const dirty = savedSignature !== '' && savedSignature !== signature
  const screen = resolvedScreenDesign(draft, screenId) ?? EMPTY_SCREEN
  const elements = useMemo<DisplayElement[]>(() => {
    const extras = new Set(screen.layers.map(layer => layer.id))
    return [...snapshot.filter(element => !extras.has(element.id)), ...screen.layers.map(layer => ({ id: layer.id, label: layer.label, kind: layer.kind === 'panel' ? 'group' as const : layer.kind, rect: layer.rect, text: layer.text, asset: layer.asset, custom: layer }))]
  }, [snapshot, screen.layers])
  const selected = elements.find(element => element.id === selectedId)
  const override = overrideOf(screen, selected)
  const rect = override.rect ?? selected?.rect
  const fonts = useMemo(() => [...FONT_NAMES.map(([id, name]) => ({ id, name })), ...draft.media.filter(media => media.kind === 'font').map(media => ({ id: media.id, name: media.name }))], [draft.media])
  const allAssets = useMemo<UiBuiltinAsset[]>(() => [...UI_BUILTIN_ASSETS.filter(asset => asset.kind === 'image'), ...draft.media.filter(media => media.kind === 'image').map(media => ({ id: media.id, name: media.name, source: `ui-media:${media.id}`, category: 'Importati', kind: 'image' as const }))], [draft.media])
  const categories = useMemo(() => [...new Set(allAssets.map(asset => asset.category))].sort(), [allAssets])
  const matchingAssets = allAssets.filter(asset => (libraryCategory === 'all' || asset.category === libraryCategory) && `${asset.name} ${asset.category}`.toLocaleLowerCase('it').includes(librarySearch.toLocaleLowerCase('it')))
  const libraryPageCount = Math.max(1, Math.ceil(matchingAssets.length / ASSET_PAGE_SIZE))
  const currentLibraryPage = Math.min(libraryPage, libraryPageCount - 1)
  const pageAssets = matchingAssets.slice(currentLibraryPage * ASSET_PAGE_SIZE, (currentLibraryPage + 1) * ASSET_PAGE_SIZE)
  useEffect(() => { setLibraryPage(0) }, [libraryCategory, librarySearch, libraryTarget])
  const menus = elements.filter(element => element.kind === 'button' && !element.custom && element.actionable === true).sort((a, b) => (screen.elements[a.id]?.order ?? 0) - (screen.elements[b.id]?.order ?? 0))
  const menuGroups = new Map<string, DisplayElement[]>()
  for (const menu of menus) {
    const key = menu.reorderGroupId ?? menu.parentId ?? 'screen-commands'
    if (!menuGroups.has(key)) menuGroups.set(key, [])
    menuGroups.get(key)!.push(menu)
  }
  const previewUrl = `${import.meta.env.BASE_URL}?uiStudioPreview=1#ui-studio-preview`
  const send = useCallback((payload: UiStudioMessage) => iframeRef.current?.contentWindow?.postMessage(payload, window.location.origin), [])
  const cancelPendingOperations = () => {
    operationRevision.current += 1
    setBusy(false)
    for (const input of [importRef.current, mediaRef.current, fontRef.current]) if (input) input.value = ''
  }
  useEffect(() => () => { operationRevision.current += 1 }, [])

  useEffect(() => { load(); setSavedSignature(JSON.stringify(useUiStudioStore.getState().draft)) }, [load])
  useEffect(() => {
    const listener = (event: MessageEvent<UiPreviewMessage>) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow || event.data?.source !== 'arkamon-ui-preview') return
      if (event.data.type === 'ready') {
        setReady(true)
        send({ source: 'arkamon-ui-studio', type: 'design', design: draftRef.current })
        send({ source: 'arkamon-ui-studio', type: 'screen', screen: screenRef.current })
      } else if (event.data.type === 'snapshot' && event.data.snapshot.screenId === screenRef.current) setSnapshot(event.data.snapshot.elements)
      else if (event.data.type === 'select') { setSelectedId(event.data.id); setInspector('element') }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [send])
  useEffect(() => { if (ready) send({ source: 'arkamon-ui-studio', type: 'design', design: draft }) }, [draft, ready, send])
  useEffect(() => {
    setSnapshot([])
    setSelectedId(null)
    if (ready) send({ source: 'arkamon-ui-studio', type: 'screen', screen: screenId })
  }, [screenId, ready, send])
  useEffect(() => { if (ready) send({ source: 'arkamon-ui-studio', type: 'select', id: selectedId }) }, [selectedId, ready, send])
  useEffect(() => {
    const node = canvasHostRef.current
    if (!node) return
    const resize = () => { const box = node.getBoundingClientRect(); setScale(Math.max(.05, Math.min((box.width - 48) / WIDTH, (box.height - 64) / HEIGHT))) }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!dirty) return
    const listener = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [dirty])
  useEffect(() => {
    if (!libraryTarget) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setLibraryTarget(null); return }
      if (event.key !== 'Tab') return
      const controls = Array.from(libraryRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', listener)
    return () => { document.removeEventListener('keydown', listener); previousFocus?.focus() }
  }, [libraryTarget])

  const patchSelected = (patch: Partial<UiElementDesign>, recordHistory = true) => {
    if (!selected) return
    const next = cloneDesign(draftRef.current)
    setElement(next, screenId, selected, patch)
    setDraft(next, recordHistory)
    setMessage('')
  }
  const patchRect = (key: keyof UiRect, value: number) => {
    if (!rect) return
    const percent = value / (key === 'x' || key === 'w' ? WIDTH : HEIGHT) * 100
    const next = { ...rect, [key]: percent }
    if (key === 'x') next.x = clamp(next.x, 0, 100 - next.w)
    if (key === 'y') next.y = clamp(next.y, 0, 100 - next.h)
    patchSelected({ rect: safeRect(next) })
  }
  const patchScreen = (patch: Partial<UiScreenDesign>) => {
    const next = cloneDesign(draftRef.current)
    next.screens[screenId] = { ...editScreen(next, screenId), ...patch }
    setDraft(next)
    setMessage('')
  }
  const chooseAsset = (source: string) => {
    if (libraryTarget === 'background') patchScreen({ background: { ...screen.background, asset: source } })
    else patchSelected({ asset: source })
    setLibraryTarget(null)
  }
  const beginDrag = (event: ReactPointerEvent, handle: Handle) => {
    if (dragRef.current || !selected || !rect || override.locked || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { pointerId: event.pointerId, element: selected, start: { ...rect }, x: event.clientX, y: event.clientY, handle, document: cloneDesign(draftRef.current), didMove: false, scale, screen: screenId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = (event.clientX - drag.x) / drag.scale / WIDTH * 100, dy = (event.clientY - drag.y) / drag.scale / HEIGHT * 100
      if (!drag.didMove && Math.abs(dx) + Math.abs(dy) < .05) return
      const roundX = (value: number) => snap && !event.altKey ? Math.round(value * WIDTH / 100 / 8) * 8 / WIDTH * 100 : value
      const roundY = (value: number) => snap && !event.altKey ? Math.round(value * HEIGHT / 100 / 8) * 8 / HEIGHT * 100 : value
      const start = drag.start
      let result: UiRect
      if (drag.handle === 'move') result = { ...start, x: clamp(roundX(start.x + dx), 0, 100 - start.w), y: clamp(roundY(start.y + dy), 0, 100 - start.h) }
      else {
        let left = start.x, right = start.x + start.w, top = start.y, bottom = start.y + start.h
        if (drag.handle.includes('w')) left = clamp(roundX(start.x + dx), 0, right - .2)
        if (drag.handle.includes('e')) right = clamp(roundX(start.x + start.w + dx), left + .2, 100)
        if (drag.handle.includes('n')) top = clamp(roundY(start.y + dy), 0, bottom - .2)
        if (drag.handle.includes('s')) bottom = clamp(roundY(start.y + start.h + dy), top + .2, 100)
        result = { x: left, y: top, w: right - left, h: bottom - top }
      }
      const next = cloneDesign(drag.document)
      setElement(next, drag.screen, drag.element, { rect: safeRect(result) })
      if (!drag.didMove && JSON.stringify(drag.document) === JSON.stringify(next)) return
      setDraft(next, !drag.didMove)
      drag.didMove = true
    }
    const end = () => { dragRef.current = null }
    return listenToStudioPointerDrag(() => dragRef.current?.pointerId, move, end)
  }, [snap, setDraft])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.defaultPrevented || target.closest('input,textarea,select,button,a,[role="tab"],[role="tabpanel"],[contenteditable="true"]') || libraryTarget) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
      if (!selected || !rect || override.locked) return
      const amount = event.shiftKey ? 8 : 1
      const changed = { ...rect }
      if (event.key === 'ArrowLeft') changed.x -= amount / WIDTH * 100
      else if (event.key === 'ArrowRight') changed.x += amount / WIDTH * 100
      else if (event.key === 'ArrowUp') changed.y -= amount / HEIGHT * 100
      else if (event.key === 'ArrowDown') changed.y += amount / HEIGHT * 100
      else return
      event.preventDefault()
      patchSelected({ rect: { ...rect, x: clamp(changed.x, 0, 100 - rect.w), y: clamp(changed.y, 0, 100 - rect.h) } })
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  const addLayer = (kind: UiExtraLayer['kind']) => {
    const id = `layer-${crypto.randomUUID()}`
    const next = cloneDesign(draftRef.current)
    const layer: UiExtraLayer = { id, kind, label: ({ image: 'Immagine', text: 'Testo', panel: 'Pannello', button: 'Pulsante' })[kind], rect: { x: 35, y: 35, w: 25, h: kind === 'text' || kind === 'button' ? 8 : 25 }, zIndex: 100, fit: 'contain', ...(kind === 'text' || kind === 'button' ? { text: kind === 'text' ? 'Nuovo testo' : 'Nuovo pulsante', font: { family: 'norwester', size: 28, color: '#ffffff', align: 'center' as const } } : {}) }
    editScreen(next, screenId).layers.push(layer)
    setDraft(next)
    setSelectedId(id)
    setInspector('element')
  }
  const duplicateLayer = () => {
    if (!selected?.custom) return
    const next = cloneDesign(draftRef.current)
    const source = resolvedScreenDesign(next, screenId)?.layers.find(layer => layer.id === selected.id)
    if (!source) return
    const id = `layer-${crypto.randomUUID()}`
    editScreen(next, screenId).layers.push({ ...source, id, label: `${source.label} · copia`, rect: safeRect({ ...source.rect, x: Math.min(source.rect.x + 1, 100 - source.rect.w), y: Math.min(source.rect.y + 1, 100 - source.rect.h) }) })
    setDraft(next)
    setSelectedId(id)
  }
  const resetSelected = () => {
    if (!selected) return
    const next = cloneDesign(draftRef.current)
    if (selected.custom) {
      const inherited = baseScreenId !== screenId && next.screens[baseScreenId]?.layers.some(layer => layer.id === selected.id)
      if (inherited) setElement(next, screenId, selected, { hidden: true })
      else editScreen(next, screenId).layers = screenOf(next, screenId).layers.filter(layer => layer.id !== selected.id)
    }
    else delete editScreen(next, screenId).elements[selected.id]
    setDraft(next)
    if (selected.custom) setSelectedId(null)
    send({ source: 'arkamon-ui-studio', type: 'request-snapshot' })
  }
  const upload = async (files: FileList | null, kind: 'image' | 'font') => {
    if (!files?.length) return
    const revision = ++operationRevision.current, before = useUiStudioStore.getState().draft
    const current = () => revision === operationRevision.current && useUiStudioStore.getState().draft === before
    setBusy(true)
    try {
      const entries = []
      for (const file of Array.from(files)) {
        const media = await importUiMedia(file)
        if (!current()) return
        if (media.kind !== kind) throw new Error(`Seleziona un file ${kind === 'font' ? 'font' : 'immagine'}.`)
        entries.push(media)
      }
      if (!current()) return
      const next = cloneDesign(before)
      for (const entry of entries) { if (!next.media.some(media => media.id === entry.id)) next.media.push(entry) }
      setDraft(next)
      setMessage(`${entries.length} ${kind === 'font' ? 'font importati' : 'immagini importate'}.`)
      if (kind === 'image') setLibraryCategory('Importati')
    } catch (cause) { if (current()) setMessage(cause instanceof Error ? cause.message : 'Importazione non riuscita.') }
    finally { if (revision === operationRevision.current) { setBusy(false); if (mediaRef.current) mediaRef.current.value = ''; if (fontRef.current) fontRef.current.value = '' } }
  }
  const importDocument = async (file: File | undefined) => {
    if (!file) return
    const revision = ++operationRevision.current, before = useUiStudioStore.getState().draft
    const current = () => revision === operationRevision.current && useUiStudioStore.getState().draft === before
    setBusy(true)
    try {
      const text = await file.text()
      if (!current()) return
      const document = await importUiDesign(text)
      if (!current()) return
      setDraft(document); setMessage('Layout importato nella bozza. Applica per usarlo nel gioco.'); setSelectedId(null)
    }
    catch (cause) { if (current()) setMessage(cause instanceof Error ? cause.message : 'Il file non è valido.') }
    finally { if (revision === operationRevision.current) { setBusy(false); if (importRef.current) importRef.current.value = '' } }
  }
  const exportDocument = async () => {
    const revision = ++operationRevision.current
    setBusy(true)
    try { const text = await exportUiDesign(draftRef.current); if (revision !== operationRevision.current) return; downloadText(text, 'arkamon-layout-ui.json'); setMessage('Layout esportato con i file importati.') }
    catch (cause) { if (revision === operationRevision.current) setMessage(cause instanceof Error ? cause.message : 'Esportazione non riuscita.') }
    finally { if (revision === operationRevision.current) setBusy(false) }
  }
  const apply = () => { if (save()) { setSavedSignature(JSON.stringify(useUiStudioStore.getState().draft)); setMessage('Layout applicato e salvato in questo browser.') } }
  const removeImportedFile = (id: string) => {
    if (mediaIsUsed(draftRef.current, id)) return
    const next = cloneDesign(draftRef.current)
    next.media = next.media.filter(media => media.id !== id)
    setDraft(next)
    setMessage('File rimosso dalla libreria della bozza. Puoi annullare la modifica.')
  }
  const changeCommand = (command: DisplayElement, patch: Partial<UiElementDesign>) => {
    const next = cloneDesign(draftRef.current)
    setElement(next, screenId, command, patch)
    setDraft(next)
  }
  const moveCommand = (commands: DisplayElement[], index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= commands.length || commands[index].reorderable !== true || commands[target].reorderable !== true || screen.elements[commands[index].id]?.rect || screen.elements[commands[target].id]?.rect) return
    const order = commands.map(command => command.id)
    ;[order[index], order[target]] = [order[target], order[index]]
    const next = cloneDesign(draftRef.current), configuration = editScreen(next, screenId)
    order.forEach((id, position) => { configuration.elements[id] = { ...configuration.elements[id], order: position } })
    setDraft(next)
  }
  const resetScreen = () => { const next = cloneDesign(draftRef.current); delete next.screens[screenId]; setDraft(next); setSelectedId(null); setMessage('Schermata ripristinata nella bozza.'); send({ source: 'arkamon-ui-studio', type: 'request-snapshot' }) }
  const close = () => { if (dirty && !window.confirm('Ci sono modifiche non applicate. Vuoi uscire senza applicarle al gioco?')) return; cancelPendingOperations(); if (onClose) onClose(); else window.location.hash = '' }

  return <div id="ui-studio" className="uis-root">
    <VisualRecoveryNotice />
    <header className="uis-toolbar">
      <div className="uis-brand"><strong>ARKAMON</strong><span>Studio interfaccia</span></div>
      <label className="uis-screen-picker"><span className="uis-sr-only">Schermata da modificare</span><select aria-label="Schermata da modificare" value={baseScreenId} onChange={event => setScreenId(event.target.value)}>{UI_STUDIO_SCREENS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {availableViews ? <label className="uis-view-picker"><span className="uis-sr-only">Vista interna</span><select aria-label="Vista interna" value={internalView} onChange={event => setScreenId(event.target.value === 'default' ? baseScreenId : `${baseScreenId}:${event.target.value}`)}>{availableViews.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label> : null}
      <div className="uis-toolbar-actions"><button type="button" title="Annulla · Ctrl+Z" disabled={!undoStack.length} onClick={undo}>↶ Annulla</button><button type="button" title="Ripeti · Ctrl+Shift+Z" disabled={!redoStack.length} onClick={redo}>↷ Ripeti</button><span className="uis-toolbar-separator" /><button type="button" disabled={busy} onClick={() => importRef.current?.click()}>Importa</button><button type="button" disabled={busy} onClick={() => void exportDocument()}>Esporta</button><button type="button" onClick={() => { cancelPendingOperations(); discard(); setSavedSignature(JSON.stringify(useUiStudioStore.getState().draft)); setMessage('Modifiche scartate.'); setSelectedId(null) }}>Scarta</button><button type="button" className="uis-primary" disabled={busy} onClick={apply}>Applica al gioco</button><button type="button" onClick={close}>Esci</button></div>
    </header>
    <div className="uis-workspace">
      <aside className="uis-sidebar uis-layers" aria-label="Elementi della schermata">
        <div className="uis-panel-heading"><h2>Elementi</h2><span>{elements.length}</span></div>
        <p className="uis-help">Seleziona un elemento nell’anteprima o nell’elenco.</p>
        <label className="uis-field"><span className="uis-sr-only">Cerca elemento</span><input type="search" placeholder="Cerca elemento…" aria-label="Cerca elemento" value={layerSearch} onChange={event => setLayerSearch(event.target.value)} /></label>
        <div className="uis-add-row" aria-label="Aggiungi elemento">{(['image', 'text', 'panel', 'button'] as const).map(kind => <button key={kind} type="button" onClick={() => addLayer(kind)} title={`Aggiungi ${kind === 'image' ? 'immagine' : kind === 'text' ? 'testo' : kind === 'panel' ? 'pannello' : 'pulsante'}`}>{({ image: '+ Immagine', text: '+ Testo', panel: '+ Pannello', button: '+ Pulsante' })[kind]}</button>)}</div>
        <div className="uis-layer-list">{elements.filter(element => `${element.label} ${element.id}`.toLocaleLowerCase('it').includes(layerSearch.toLocaleLowerCase('it'))).map(element => {
          const design = overrideOf(screen, element)
          return <button type="button" className={`uis-layer ${selectedId === element.id ? 'is-selected' : ''} ${design.hidden ? 'is-hidden' : ''}`} data-ui-element-id={element.id} key={element.id} onClick={() => { setSelectedId(element.id); setInspector('element') }}><span className="uis-layer-kind" aria-hidden="true">{({ image: '▧', text: 'T', button: '▣', group: '▤' })[element.kind]}</span><span><strong>{element.label || element.text || element.id}</strong><small>{element.custom ? 'Aggiunto' : element.kind === 'group' ? 'Gruppo' : element.kind === 'button' ? 'Comando' : element.kind === 'image' ? 'Immagine' : 'Testo'}{design.hidden ? ' · nascosto' : ''}{design.locked ? ' · bloccato' : ''}</small></span></button>
        })}{!elements.length ? <p className="uis-empty">{ready ? 'Preparazione degli elementi…' : 'Caricamento dell’anteprima…'}</p> : null}</div>
        <div className="uis-sidebar-bottom"><button type="button" onClick={() => { setInspector('screen'); setSelectedId(null) }}>Sfondo e schermata</button><button type="button" onClick={() => setInspector('fonts')}>Font di tutto il gioco</button></div>
      </aside>
      <main className="uis-center" aria-label="Area di progettazione">
        <div className="uis-canvas-toolbar"><span>1920 × 1080 <b>{Math.round(scale * 100)}%</b></span><div><CheckField label="Griglia" checked={grid} onChange={setGrid} /><CheckField label="Aggancio 8 px" checked={snap} onChange={setSnap} /><button type="button" onClick={() => send({ source: 'arkamon-ui-studio', type: 'request-snapshot' })}>Aggiorna elementi</button></div></div>
        <div className="uis-canvas-host" ref={canvasHostRef}><div className="uis-canvas-sized" style={{ width: WIDTH * scale, height: HEIGHT * scale }}><div className="uis-canvas" style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})` }}><iframe ref={iframeRef} src={previewUrl} title="Anteprima Arkamon 1920 per 1080" tabIndex={-1} />{grid ? <div className="uis-grid" aria-hidden="true" /> : null}</div>
          {selected && rect && !override.hidden ? <div className={`uis-selection ${override.locked ? 'is-locked' : ''}`} data-testid="ui-studio-selection" style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` } as CSSProperties} onPointerDown={event => beginDrag(event, 'move')}><span className="uis-selection-label">{selected.label} · {Math.round(rect.w * WIDTH / 100)} × {Math.round(rect.h * HEIGHT / 100)}{override.locked ? ' · bloccato' : ''}</span>{!override.locked ? HANDLE_NAMES.map(handle => <button type="button" className={`uis-resize uis-resize-${handle}`} key={handle} aria-label={`Ridimensiona ${handle}`} onPointerDown={event => beginDrag(event, handle)} />) : null}</div> : null}
        </div>{!ready ? <span className="uis-loading">Caricamento dell’anteprima del gioco…</span> : null}</div>
        <div className="uis-canvas-note"><span>Trascina per spostare · maniglie per ridimensionare · frecce per 1 px · Maiusc per 8 px · Alt ignora l’aggancio</span><span className={dirty ? 'uis-dirty' : ''}>{dirty ? 'Bozza non applicata' : 'Layout salvato'}</span></div>
      </main>
      <aside className="uis-sidebar uis-inspector" aria-label="Proprietà del layout">
        <div className="uis-inspector-tabs" role="tablist" aria-label="Proprietà">{([['element', 'Elemento'], ['screen', 'Schermata'], ['fonts', 'Font'], ['menus', 'Menù'], ['project', 'Progetto']] as const).map(([id, label], index, tabs) => <button type="button" role="tab" id={`uis-tab-${id}`} aria-controls={inspector === id ? `uis-panel-${id}` : undefined} aria-selected={inspector === id} tabIndex={inspector === id ? 0 : -1} key={id} className={inspector === id ? 'is-active' : ''} onClick={() => setInspector(id)} onKeyDown={event => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1
          if (next < 0) return
          event.preventDefault(); setInspector(tabs[next][0]); document.getElementById(`uis-tab-${tabs[next][0]}`)?.focus()
        }}>{label}</button>)}</div>
        <div className="uis-inspector-content" role="tabpanel" id={`uis-panel-${inspector}`} aria-labelledby={`uis-tab-${inspector}`}>
          {inspector === 'project' && <PresentationProjectPanel design={draft} onApplied={() => { useUiStudioStore.getState().load(); setSavedSignature(JSON.stringify(useUiStudioStore.getState().draft)); setMessage('Progetto visivo applicato.'); setSelectedId(null) }} />}
          {inspector === 'element' ? selected ? <>
            <div className="uis-panel-heading"><h2>{selected.label}</h2></div><p className="uis-element-id">{selected.id}</p>
            {selected.custom ? <label className="uis-field"><span>Nome nell’elenco</span><input value={selected.custom.label} onChange={event => { const next = cloneDesign(draftRef.current); const layer = editableLayer(next, screenId, selected); if (layer) layer.label = event.target.value; setDraft(next) }} /></label> : null}
            <section><h3>Posizione e dimensione</h3><div className="uis-fields-two">{rect ? (['x', 'y', 'w', 'h'] as const).map(key => <NumberField key={key} label={({ x: 'X', y: 'Y', w: 'Larghezza', h: 'Altezza' })[key]} suffix="px" value={rect[key] * (key === 'x' || key === 'w' ? WIDTH : HEIGHT) / 100} min={key === 'w' || key === 'h' ? 2 : 0} max={key === 'x' || key === 'w' ? WIDTH : HEIGHT} onChange={value => patchRect(key, value)} />) : null}</div><div className="uis-fields-two"><NumberField label="Opacità" suffix="%" value={(override.opacity ?? 1) * 100} min={0} max={100} onChange={value => patchSelected({ opacity: value / 100 })} /><NumberField label="Livello" value={override.zIndex ?? 0} min={-100} max={900} onChange={zIndex => patchSelected({ zIndex })} /></div><div className="uis-check-row"><CheckField label="Nascosto" checked={override.hidden ?? false} onChange={hidden => patchSelected({ hidden })} /><CheckField label="Blocca posizione" checked={override.locked ?? false} onChange={locked => patchSelected({ locked })} /></div></section>
            <section><h3>Grafica</h3><p className="uis-help">Sostituisce la grafica dell’elemento. Testi, indicatori e comandi restano attivi. Per aggiungere una decorazione separata usa «+ Immagine».</p><div className="uis-current-asset"><MediaImage source={override.asset ?? selected.asset} alt="Asset selezionato" /><span>{allAssets.find(asset => asset.source === (override.asset ?? selected.asset))?.name ?? (override.asset ? 'Immagine personalizzata' : 'Grafica originale')}</span></div><div className="uis-button-row"><button type="button" onClick={() => setLibraryTarget('element')}>Scegli asset</button><button type="button" onClick={() => patchSelected({ asset: undefined })}>Originale</button></div><label className="uis-field"><span>Adattamento immagine</span><select value={override.fit ?? 'contain'} onChange={event => patchSelected({ fit: event.target.value as UiElementDesign['fit'] })}><option value="contain">Intera · proporzioni originali</option><option value="cover">Riempi · ritaglio</option><option value="fill">Estendi all’area</option></select></label></section>
            <section><h3>Testo e carattere</h3><label className="uis-field"><span>{selected.kind === 'button' ? 'Etichetta del pulsante' : 'Testo visualizzato'}</span><textarea rows={2} value={override.text ?? selected.text ?? ''} placeholder="Testo originale" onChange={event => patchSelected({ text: event.target.value })} /></label><TypographyFields fonts={fonts} value={override.font ?? {}} update={patch => patchSelected({ font: { ...override.font, ...patch } })} /><button type="button" className="uis-subtle" onClick={() => patchSelected({ font: undefined, text: undefined })}>Ripristina testo e font ereditati</button></section>
            {selected.custom?.kind === 'button' ? <section><h3>Azione del pulsante</h3><label className="uis-field"><span>Comando già presente nella schermata</span><select value={selected.custom.actionTarget ?? ''} onChange={event => { const next = cloneDesign(draftRef.current); const layer = editableLayer(next, screenId, selected); if (layer) layer.actionTarget = event.target.value || undefined; setDraft(next) }}><option value="">Solo grafica</option>{menus.map(menu => <option value={menu.id} key={menu.id}>{menu.label}</option>)}</select></label><p className="uis-help">Il pulsante richiama un comando esistente e ne rispetta i blocchi del gioco.</p></section> : null}
            <div className="uis-button-row">{selected.custom ? <button type="button" onClick={duplicateLayer}>Duplica</button> : null}<button type="button" className={selected.custom ? 'uis-danger' : ''} onClick={resetSelected}>{selected.custom ? 'Elimina elemento' : 'Ripristina elemento'}</button></div>
          </> : <div className="uis-empty"><strong>Seleziona un elemento</strong><p>Puoi spostare, ridimensionare, cambiare grafica e personalizzare i testi direttamente nell’anteprima.</p><button type="button" onClick={() => setInspector('screen')}>Modifica lo sfondo</button></div> : null}
          {inspector === 'screen' ? <>
            <h2>Sfondo della schermata</h2><p className="uis-help">Le impostazioni valgono per {screenLabel}{internalView !== 'default' ? ` · ${availableViews?.find(([id]) => id === internalView)?.[1] ?? internalView}` : ''}.</p><div className="uis-current-asset uis-background-preview"><MediaImage source={screen.background?.asset} alt="Sfondo della schermata" /></div><div className="uis-button-row"><button type="button" onClick={() => setLibraryTarget('background')}>Scegli sfondo</button><button type="button" onClick={() => patchScreen({ background: undefined })}>Originale</button></div><label className="uis-field"><span>Adattamento dello sfondo</span><select value={screen.background?.fit ?? 'cover'} onChange={event => patchScreen({ background: { ...screen.background, fit: event.target.value as 'cover' | 'contain' | 'fill' } })}><option value="cover">Riempi lo schermo</option><option value="contain">Mostra tutto</option><option value="fill">Estendi</option></select></label><NumberField label="Opacità dello sfondo" suffix="%" value={(screen.background?.opacity ?? 1) * 100} min={0} max={100} onChange={value => patchScreen({ background: { ...screen.background, opacity: value / 100 } })} /><label className="uis-field"><span>Colore di fondo</span><input type="color" value={screen.background?.color && /^#[0-9a-f]{6}$/i.test(screen.background.color) ? screen.background.color : '#101b2d'} onChange={event => patchScreen({ background: { ...screen.background, color: event.target.value } })} /></label><div className="uis-fields-two"><NumberField label="Centro orizzontale" suffix="%" value={screen.background?.x ?? 50} min={0} max={100} onChange={x => patchScreen({ background: { ...screen.background, x } })} /><NumberField label="Centro verticale" suffix="%" value={screen.background?.y ?? 50} min={0} max={100} onChange={y => patchScreen({ background: { ...screen.background, y } })} /></div>
            <section><h3>Font della schermata</h3>{(['body', 'heading', 'button'] as const).map(category => <details key={category}><summary>{({ body: 'Testi', heading: 'Titoli', button: 'Pulsanti' })[category]}</summary><TypographyFields fonts={fonts} value={screen.typography?.[category] ?? {}} update={patch => patchScreen({ typography: { ...screen.typography, [category]: { ...screen.typography?.[category], ...patch } } })} /></details>)}</section><button type="button" className="uis-danger" onClick={resetScreen}>Ripristina questa schermata</button>
          </> : null}
          {inspector === 'fonts' ? <>
            <h2>Font di tutto il gioco</h2><p className="uis-help">Norwester è il nuovo carattere principale. Puoi differenziare testi, titoli e pulsanti; le scelte dei singoli elementi hanno precedenza.</p><button type="button" disabled={busy} onClick={() => fontRef.current?.click()}>Importa font OTF / TTF / WOFF</button><ImportedFiles document={draft} onRemove={removeImportedFile} />{(['body', 'heading', 'button'] as const).map(category => <section key={category}><h3>{({ body: 'Testi', heading: 'Titoli', button: 'Pulsanti' })[category]}</h3><TypographyFields fonts={fonts} value={draft.typography[category]} update={patch => { const next = cloneDesign(draftRef.current); next.typography[category] = { ...next.typography[category], ...patch }; setDraft(next) }} /></section>)}<button type="button" onClick={() => { const next = cloneDesign(draftRef.current); next.typography = createDefaultDesign().typography; setDraft(next) }}>Ripristina font predefiniti</button>
          </> : null}
          {inspector === 'menus' ? <>
            <h2>Comandi della schermata</h2><p className="uis-help">Personalizza etichette e visibilità. Le frecce cambiano l’ordine all’interno dello stesso gruppo nel layout automatico. Per i comandi posizionati liberamente usa X e Y.</p>{menus.length ? Array.from(menuGroups, ([parentId, commands]) => <MenuGroup key={parentId} name={elements.find(element => element.id === parentId)?.label ?? elements.find(element => element.id === commands[0]?.parentId)?.label ?? 'Comandi generali'} commands={commands} screen={screen} onSelect={id => { setSelectedId(id); setInspector('element') }} onChange={changeCommand} onMove={moveCommand} />) : <p className="uis-empty">Nessun comando in questa schermata.</p>}
          </> : null}
        </div>
      </aside>
    </div>
    <footer className="uis-status" role="status"><span className={error ? 'uis-error' : ''}>{error ?? (message || 'Le modifiche restano nell’anteprima finché non scegli «Applica al gioco».')}</span><span>Anteprima con partita dimostrativa · salvataggio locale</span></footer>
    <input ref={importRef} type="file" accept=".json,application/json" className="uis-sr-only" aria-label="Importa layout JSON" onChange={event => void importDocument(event.target.files?.[0])} />
    <input ref={mediaRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="uis-sr-only" aria-label="Importa immagini" onChange={event => void upload(event.target.files, 'image')} />
    <input ref={fontRef} type="file" accept=".otf,.ttf,.woff,.woff2" multiple className="uis-sr-only" aria-label="Importa caratteri" onChange={event => void upload(event.target.files, 'font')} />
    {libraryTarget ? <div className="uis-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setLibraryTarget(null) }}><section ref={libraryRef} className="uis-library" role="dialog" aria-modal="true" aria-label={libraryTarget === 'background' ? 'Scegli sfondo' : 'Scegli asset'}><header><div><h2>{libraryTarget === 'background' ? 'Scegli uno sfondo' : 'Libreria degli asset'}</h2><p>Scuro, Blu, componenti comuni e immagini del gioco.</p></div><button type="button" aria-label="Chiudi libreria asset" onClick={() => setLibraryTarget(null)}>Chiudi ×</button></header><div className="uis-library-tools"><input type="search" aria-label="Cerca asset" placeholder="Cerca asset…" value={librarySearch} onChange={event => setLibrarySearch(event.target.value)} autoFocus /><select aria-label="Categoria asset" value={libraryCategory} onChange={event => setLibraryCategory(event.target.value)}><option value="all">Tutte le categorie</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select><button type="button" disabled={busy} onClick={() => mediaRef.current?.click()}>Importa immagini</button></div><div className="uis-asset-grid">{pageAssets.map(asset => <button type="button" key={asset.id} onClick={() => chooseAsset(asset.source)} title={asset.name}><MediaImage source={asset.source} alt="" /><strong>{asset.name}</strong><small>{asset.category}</small></button>)}{!matchingAssets.length ? <p>Nessun asset corrisponde alla ricerca.</p> : null}</div><footer><nav aria-label="Pagine della libreria asset" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}><button type="button" disabled={currentLibraryPage === 0} onClick={() => setLibraryPage(page => page - 1)}>Asset precedenti</button><span role="status">Pagina {currentLibraryPage + 1} / {libraryPageCount} · {matchingAssets.length} asset</span><button type="button" disabled={currentLibraryPage + 1 >= libraryPageCount} onClick={() => setLibraryPage(page => page + 1)}>Asset successivi</button></nav><span>SVG e immagini mantengono il file originale.</span><ImportedFiles document={draft} onRemove={removeImportedFile} /></footer></section></div> : null}
  </div>
}

export { UiStudioEditor }
