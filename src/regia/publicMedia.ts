import type { PublicSnapshot } from './publicSnapshot'
import type { PublicRelayConfiguration } from './publicRelayTransport'
import { PUBLIC_MEDIA_MAX_BYTES, PUBLIC_MEDIA_EXTENSIONS, publicMediaId } from '../../scripts/public-media-protocol.mjs'

export interface PublicImage { bytes: Uint8Array; mime: string }
interface PreparedImage extends PublicImage { id: string; uploaded: boolean }
type ImageReader = (source: string) => Promise<PublicImage>
const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))]
  .map(value => value.toString(16).padStart(2, '0')).join('')

/** A bounded cache of the three currently displayed slots, never the Studio library. */
export function createPublicImagePublisher(config: PublicRelayConfiguration, readImage: ImageReader = async source =>
  (await import('@/ui-studio/mediaStorage')).readPublicUiImage(source)) {
  const images = new Map<string, PreparedImage>()
  let closed = false
  const active = (signal: AbortSignal) => { if (closed || signal.aborted) throw new Error('Trasferimento immagine annullato.') }
  return {
    reset() { for (const image of images.values()) image.uploaded = false },
    close() { closed = true; images.clear() },
    async prepare(snapshot: PublicSnapshot, signal: AbortSignal): Promise<PublicSnapshot> {
      active(signal)
      const original = snapshot.battle?.appearance
      const selected = new Set([original?.enemyFrame?.source, original?.playerFrame?.source, original?.background]
        .filter((source): source is string => !!source?.startsWith('ui-media:')))
      for (const source of images.keys()) if (!selected.has(source)) images.delete(source)
      if (!selected.size || !snapshot.battle || !original) return snapshot
      for (const source of selected) {
        active(signal)
        if (!images.has(source)) {
          const image = await readImage(source)
          active(signal)
          if (!image.bytes.length || image.bytes.length > PUBLIC_MEDIA_MAX_BYTES || !Object.prototype.hasOwnProperty.call(PUBLIC_MEDIA_EXTENSIONS, image.mime)) throw new Error('Immagine pubblica oltre i limiti o non valida.')
          const id = await digest(image.bytes)
          active(signal)
          images.set(source, { ...image, id, uploaded: false })
        }
        const image = images.get(source)!
        if ([...images.values()].some(other => other.id === image.id && other.uploaded)) image.uploaded = true
        if (!image.uploaded) {
          const response = await fetch(`${config.origin}/media/${image.id}`, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
            headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': image.mime }, body: new Uint8Array(image.bytes).buffer, signal })
          if (!response.ok) throw new Error('Impossibile trasferire l’immagine alla regia.')
          active(signal)
          image.uploaded = true
        }
      }
      const source = (value: string) => value.startsWith('ui-media:') ? `public-media:${images.get(value)!.id}` : value
      return { ...snapshot, battle: { ...snapshot.battle, appearance: { ...original,
        enemyFrame: original.enemyFrame && { ...original.enemyFrame, source: source(original.enemyFrame.source) },
        playerFrame: original.playerFrame && { ...original.playerFrame, source: source(original.playerFrame.source) },
        background: original.background && source(original.background),
      } } }
    },
  }
}

/** Fetch through the read-only capability; the token never enters an image URL or storage. */
export async function fetchPublicRelayImage(config: PublicRelayConfiguration, source: string, signal: AbortSignal): Promise<string> {
  const id = publicMediaId(source)
  if (!id || config.mode !== 'viewer') throw new Error('Immagine pubblica non disponibile.')
  const response = await fetch(`${config.origin}/media/${id}`, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { Authorization: `Bearer ${config.token}` }, signal })
  const mime = response.headers.get('content-type') ?? ''
  const length = Number(response.headers.get('content-length'))
  if (!response.ok || !response.body || !Object.prototype.hasOwnProperty.call(PUBLIC_MEDIA_EXTENSIONS, mime) || !length || length > PUBLIC_MEDIA_MAX_BYTES) throw new Error('Immagine della regia non disponibile o oltre i limiti.')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > PUBLIC_MEDIA_MAX_BYTES || total > length) throw new Error('Immagine della regia oltre i limiti.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  if (total !== length || signal.aborted) throw new Error('Trasferimento immagine incompleto.')
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  if (await digest(bytes) !== id || signal.aborted) throw new Error('Impronta dell’immagine della regia non valida.')
  const { validatePublicUiImage } = await import('@/ui-studio/mediaStorage')
  validatePublicUiImage(bytes, mime)
  if (signal.aborted) throw new Error('Trasferimento immagine annullato.')
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}
