import { assetUrl } from '@/utils/assetUrl'
import { isSafeDesignId, isSafeUiAssetSource, normalizeDesign } from './designModel'
import type { UiDesignDocument, UiMediaEntry } from './types'
import { PUBLIC_MEDIA_EXTENSIONS } from '../../scripts/public-media-protocol.mjs'

const DATABASE = 'arkamon-ui-media'
const TABLE = 'files'
const IMAGE_LIMIT = 12 * 1024 * 1024
const FONT_LIMIT = 4 * 1024 * 1024
const SVG_LIMIT = 3 * 1024 * 1024
const BUNDLE_LIMIT = 64 * 1024 * 1024
interface StoredMedia { id: string; mime: string; data: string; name: string; kind: 'image' | 'font' }
interface MediaBundle { format: 'arkamon-ui-design'; version: 1; design: UiDesignDocument; files: StoredMedia[] }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Archivio media non disponibile in questo browser.')); return }
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(TABLE)) request.result.createObjectStore(TABLE, { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Impossibile aprire l’archivio dei media.'))
    request.onblocked = () => reject(new Error('Archivio media occupato: chiudi le altre schede del gioco e riprova.'))
  })
}
async function readStored(id: string): Promise<StoredMedia> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(TABLE, 'readonly').objectStore(TABLE).get(id)
      request.onsuccess = () => request.result ? resolve(request.result as StoredMedia) : reject(new Error(`File importato non trovato (${id}). Importa il pacchetto UI completo.`))
      request.onerror = () => reject(new Error('Impossibile leggere il file importato.'))
    })
  } finally { database.close() }
}
async function writeStored(files: StoredMedia[]): Promise<void> {
  if (!files.length) return
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(TABLE, 'readwrite')
      const table = transaction.objectStore(TABLE)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error('Salvataggio media non riuscito. Lo spazio del browser potrebbe essere esaurito.'))
      transaction.onabort = () => reject(new Error('Salvataggio media annullato: nessun file del pacchetto è stato importato.'))
      for (const file of files) table.put(file)
    })
  } finally { database.close() }
}
function encode(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768))
  return btoa(binary)
}
function decode(value: string): Uint8Array {
  if (value.length > Math.ceil(IMAGE_LIMIT * 4 / 3) + 8 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error('Dati del file non validi nel pacchetto UI.')
  try { return Uint8Array.from(atob(value), character => character.charCodeAt(0)) } catch { throw new Error('File codificato in modo non valido.') }
}
function safeSvg(text: string): boolean {
  // External resources, HTML, scripting and mutable links are not UI artwork.
  if (!/<svg(?:\s|>)/i.test(text) || /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|audio|video|animate|set|animateTransform|animateMotion)\b|\son[a-z]+\s*=|\bxml:base\s*=|@import|javascript\s*:|vbscript\s*:|expression\s*\(/i.test(text)) return false
  if (/\b(?:href|xlink:href)\s*=\s*([^\s"'=<>`]+)/i.test(text)) return false
  const hrefs = text.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gis)
  for (const match of hrefs) if (!/^#[a-zA-Z_][\w:.-]*$/.test(match[2])) return false
  const urls = text.matchAll(/url\s*\(\s*([^)]+)\)/gi)
  for (const match of urls) if (!/^['"]?#[a-zA-Z_][\w:.-]*['"]?$/.test(match[1].trim())) return false
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml')
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') return false
    for (const node of Array.from(parsed.querySelectorAll('*'))) {
      if (['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'animate', 'set', 'animatetransform', 'animatemotion'].includes(node.localName.toLowerCase())) return false
      for (const attribute of Array.from(node.attributes)) {
        if (/^on/i.test(attribute.name) || /^(?:href|xlink:href)$/i.test(attribute.name) && !/^#[a-zA-Z_][\w:.-]*$/.test(attribute.value)) return false
        if (/url\s*\(/i.test(attribute.value) && Array.from(attribute.value.matchAll(/url\s*\(\s*([^)]+)\)/gi)).some(match => !/^['"]?#[a-zA-Z_][\w:.-]*['"]?$/.test(match[1].trim()))) return false
        if (attribute.name === 'style' && /\\|@import|expression\s*\(/i.test(attribute.value)) return false
      }
      if (node.localName === 'style' && /\\|@import|expression\s*\(/i.test(node.textContent ?? '')) return false
    }
  }
  return true
}
function inspectFile(name: string, bytes: Uint8Array): { mime: string; kind: 'image' | 'font' } {
  const extension = name.split('.').pop()?.toLowerCase()
  const header = String.fromCharCode(...bytes.subarray(0, 12))
  let mime = '', kind: 'image' | 'font' = 'image'
  if (extension === 'svg') {
    if (bytes.length > SVG_LIMIT || !safeSvg(new TextDecoder().decode(bytes))) throw new Error('SVG non accettato: usa geometrie statiche senza script, collegamenti o risorse esterne (massimo 3 MB).')
    mime = 'image/svg+xml'
  } else if (extension === 'png' && bytes[0] === 137 && header.slice(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10) mime = 'image/png'
  else if (['jpg', 'jpeg'].includes(extension ?? '') && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg'
  else if (extension === 'webp' && header.startsWith('RIFF') && header.slice(8) === 'WEBP') mime = 'image/webp'
  else if (extension === 'gif' && /^GIF8[79]a/.test(header)) mime = 'image/gif'
  else if (extension === 'otf' && header.startsWith('OTTO')) { mime = 'font/otf'; kind = 'font' }
  else if (extension === 'ttf' && bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) { mime = 'font/ttf'; kind = 'font' }
  else if (extension === 'woff' && header.startsWith('wOFF')) { mime = 'font/woff'; kind = 'font' }
  else if (extension === 'woff2' && header.startsWith('wOF2')) { mime = 'font/woff2'; kind = 'font' }
  else throw new Error('Formato non riconosciuto. Scegli SVG, PNG, JPEG, WebP, GIF oppure OTF, TTF, WOFF o WOFF2.')
  if (!bytes.length || bytes.length > (kind === 'font' ? FONT_LIMIT : IMAGE_LIMIT)) throw new Error(kind === 'font' ? 'Il font supera 4 MB.' : 'L’immagine supera 12 MB.')
  if (kind === 'font' && bytes.length < 28) throw new Error('File font incompleto o non valido.')
  return { mime, kind }
}
export async function importUiMedia(file: File): Promise<UiMediaEntry> {
  if (!file.name || file.name.length > 200) throw new Error('Nome file non valido.')
  if (file.size > IMAGE_LIMIT) throw new Error('Il file supera 12 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const inspected = inspectFile(file.name, bytes)
  const id = `media-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
  await writeStored([{ id, name: file.name, ...inspected, data: encode(bytes) }])
  return { id, name: file.name, ...inspected, source: `ui-media:${id}` }
}
export async function resolveUiMediaSource(source: string): Promise<string> {
  if (!isSafeUiAssetSource(source)) throw new Error('Riferimento media non valido.')
  if (!source.startsWith('ui-media:')) return assetUrl(source)
  const stored = await readStored(source.slice(9))
  return `data:${stored.mime};base64,${stored.data}`
}
/** Only a selected public image is transferable; font files and the authoring archive stay private. */
export function validatePublicUiImage(bytes: Uint8Array, mime: string): void {
  const extension = PUBLIC_MEDIA_EXTENSIONS[mime]
  if (!extension) throw new Error('Formato immagine pubblico non valido.')
  const inspected = inspectFile(`public.${extension}`, bytes)
  if (inspected.kind !== 'image' || inspected.mime !== mime) throw new Error('Il contenuto dell’immagine pubblica non corrisponde al formato dichiarato.')
}
export async function readPublicUiImage(source: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!source.startsWith('ui-media:') || !isSafeUiAssetSource(source)) throw new Error('Riferimento immagine pubblico non valido.')
  const stored = await readStored(source.slice(9))
  if (stored.kind !== 'image') throw new Error('Solo le immagini selezionate possono essere mostrate nella regia.')
  const bytes = decode(stored.data)
  validatePublicUiImage(bytes, stored.mime)
  return { bytes, mime: stored.mime }
}
function referencedMedia(design: UiDesignDocument): Set<string> {
  const ids = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string' && value.startsWith('ui-media:')) ids.add(value.slice(9))
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(design)
  return ids
}
export async function exportUiDesign(document: UiDesignDocument): Promise<string> {
  const design = normalizeDesign(document)
  const files: StoredMedia[] = []
  let size = 0
  for (const id of referencedMedia(design)) {
    const file = await readStored(id)
    size += file.data.length * .75
    if (size > BUNDLE_LIMIT) throw new Error('Il pacchetto UI supera 64 MB. Rimuovi gli upload inutilizzati.')
    files.push(file)
  }
  const bundle: MediaBundle = { format: 'arkamon-ui-design', version: 1, design, files }
  return JSON.stringify(bundle, null, 2)
}
export async function importUiDesign(text: string): Promise<UiDesignDocument> {
  if (text.length > BUNDLE_LIMIT * 1.4 + 4 * 1024 * 1024) throw new Error('Il pacchetto UI supera la dimensione massima di 64 MB di media.')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('JSON del progetto UI non valido.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Pacchetto UI non valido.')
  const input = parsed as Record<string, unknown>
  const bundled = input.format === 'arkamon-ui-design'
  if (bundled && (input.version !== 1 || Object.keys(input).some(key => !['format', 'version', 'design', 'files'].includes(key)))) throw new Error('Versione o proprietà del pacchetto UI non valide.')
  let design = normalizeDesign(bundled ? input.design : input)
  const files: StoredMedia[] = []
  const seen = new Set<string>()
  let size = 0
  if (bundled) {
    if (!Array.isArray(input.files) || input.files.length > 200) throw new Error('L’elenco dei file del pacchetto UI non è valido.')
    for (const raw of input.files) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('File del pacchetto UI non valido.')
      const file = raw as Record<string, unknown>
      if (Object.keys(file).some(key => !['id', 'mime', 'data', 'name', 'kind'].includes(key)) || !isSafeDesignId(file.id) || seen.has(file.id) || typeof file.name !== 'string' || file.name.length > 200 || typeof file.data !== 'string') throw new Error('Metadati dei file non validi o duplicati.')
      const bytes = decode(file.data)
      const inspected = inspectFile(file.name, bytes)
      if (file.mime !== inspected.mime || file.kind !== inspected.kind) throw new Error(`Formato dichiarato non corrispondente al file ${file.name}.`)
      size += bytes.length
      if (size > BUNDLE_LIMIT) throw new Error('Il pacchetto UI supera 64 MB.')
      seen.add(file.id)
      files.push({ id: file.id, name: file.name, data: file.data, ...inspected })
    }
  }
  for (const id of referencedMedia(design)) {
    if (!seen.has(id)) await readStored(id)
  }
  // Importing a draft must not replace media used by the currently applied UI.
  // UUIDs normally prevent collisions, but packages may come from another machine.
  const remapped = new Map<string, string>()
  for (const file of files) {
    let existing: StoredMedia | undefined
    try { existing = await readStored(file.id) } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('File importato non trovato')) throw error
    }
    if (existing && (existing.data !== file.data || existing.mime !== file.mime)) {
      const nextId = `media-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
      remapped.set(file.id, nextId)
      file.id = nextId
    }
  }
  if (remapped.size) {
    const rewrite = (value: unknown, field = ''): unknown => {
      if (typeof value === 'string') {
        if (value.startsWith('ui-media:') && remapped.has(value.slice(9))) return `ui-media:${remapped.get(value.slice(9))}`
        if ((field === 'id' || field === 'family') && remapped.has(value)) return remapped.get(value)
        return value
      }
      if (Array.isArray(value)) return value.map(entry => rewrite(entry))
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewrite(entry, key)]))
      return value
    }
    design = normalizeDesign(rewrite(design))
  }
  await writeStored(files)
  return design
}
