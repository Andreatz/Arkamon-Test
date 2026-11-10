import type { SpritePage } from '@/components/vfx/spritePages'
import { assetUrl } from './assetUrl'

export interface SpritePagePixels {
  image: CanvasImageSource
  kind: 'bitmap' | 'image'
  dispose: () => void
}
interface CacheEntry {
  page: SpritePage
  references: number
  usedAt: number
  ready: Promise<SpritePagePixels>
  resolve: (pixels: SpritePagePixels) => void
  reject: (error: Error) => void
  pixels?: SpritePagePixels
  status: 'queued' | 'loading' | 'ready'
  controller: AbortController
  timeout?: ReturnType<typeof setTimeout>
}
export interface SpritePageLease { ready: Promise<SpritePagePixels>; pixels?: SpritePagePixels; release: () => void }
type PageLoader = (page: SpritePage, signal: AbortSignal) => Promise<SpritePagePixels>
const MIB = 1024 * 1024

/** One decoded page per URL, shared by every native renderer and its warm-up. */
export function createSpritePageCache(loader: PageLoader, initialBudget = 64 * MIB) {
  const entries = new Map<string, CacheEntry>()
  let budget = initialBudget, bytes = 0, peakBytes = 0, activeDecodes = 0, peakDecodes = 0
  const remove = (key: string, entry: CacheEntry) => {
    if (entries.get(key) !== entry) return
    entries.delete(key)
    clearTimeout(entry.timeout)
    if (entry.status !== 'queued') bytes -= entry.page.decodedBytes
    entry.pixels?.dispose()
  }
  const evict = (required: number) => {
    const available = [...entries.entries()].filter(([, entry]) => entry.references === 0 && entry.status === 'ready').sort((a, b) => a[1].usedAt - b[1].usedAt)
    for (const [key, entry] of available) {
      if (bytes + required <= budget) break
      remove(key, entry)
    }
    return bytes + required <= budget
  }
  const expire = (key: string, entry: CacheEntry) => {
    clearTimeout(entry.timeout)
    if (entry.references || entry.status !== 'ready') return
    entry.timeout = setTimeout(() => { if (!entry.references) remove(key, entry) }, 3000)
  }
  const pump = () => {
    const queued = [...entries.entries()].filter(([, entry]) => entry.status === 'queued').sort((a, b) => b[1].references - a[1].references)
    for (const [key, entry] of queued) {
      if (activeDecodes >= 2) break
      if (!evict(entry.page.decodedBytes)) {
        // Do not pin an impossible demand behind other active renderers indefinitely.
        if (activeDecodes === 0) { remove(key, entry); entry.reject(new Error('Native sprite memory budget reached')) }
        continue
      }
      entry.status = 'loading'
      bytes += entry.page.decodedBytes; peakBytes = Math.max(peakBytes, bytes)
      activeDecodes++; peakDecodes = Math.max(peakDecodes, activeDecodes)
      void loader(entry.page, entry.controller.signal).then(pixels => {
        if (entries.get(key) !== entry) { pixels.dispose(); return }
        entry.pixels = pixels; entry.status = 'ready'; entry.resolve(pixels); expire(key, entry)
      }, error => {
        remove(key, entry)
        entry.reject(error instanceof Error ? error : new Error('Native page decoding failed'))
      }).finally(() => { activeDecodes--; pump() })
    }
  }
  const acquire = (page: SpritePage): SpritePageLease => {
    if (page.decodedBytes < 1 || page.decodedBytes > 16 * MIB) return { ready: Promise.reject(new Error('Invalid native page size')), release: () => {} }
    const key = assetUrl(page.src)
    let entry = entries.get(key)
    if (!entry) {
      let resolve!: CacheEntry['resolve'], reject!: CacheEntry['reject']
      const ready = new Promise<SpritePagePixels>((accept, fail) => { resolve = accept; reject = fail })
      entry = { page: { ...page, src: key }, references: 0, usedAt: performance.now(), ready, resolve, reject, status: 'queued', controller: new AbortController() }
      entries.set(key, entry)
    }
    entry.references++; entry.usedAt = performance.now(); clearTimeout(entry.timeout)
    pump()
    let released = false
    return { ready: entry.ready, get pixels() { return entry!.pixels }, release: () => {
      if (released) return
      released = true
      entry!.references = Math.max(0, entry!.references - 1); entry!.usedAt = performance.now()
      if (entry!.status === 'queued' && !entry!.references) { remove(key, entry!); entry!.reject(new Error('Native page request released')) }
      else expire(key, entry!)
      pump()
    } }
  }
  return {
    acquire,
    async prepare(page: SpritePage) { const lease = acquire(page); try { await lease.ready } catch { /* The renderer owns its visible fallback. */ } finally { lease.release() } },
    setBudget(next: number) { budget = next; evict(0); pump() },
    stats() { return { budgetBytes: budget, decodedBytes: bytes, peakDecodedBytes: peakBytes, activeDecodes, peakDecodes, entries: entries.size, leasedPages: [...entries.values()].filter(entry => entry.references > 0).length } },
    clear() { for (const [key, entry] of entries) { entry.controller.abort(); remove(key, entry); if (entry.status !== 'ready') entry.reject(new Error('Native page cache cleared')) } },
  }
}

async function decodeNativePage(page: SpritePage, signal: AbortSignal): Promise<SpritePagePixels> {
  const controller = new AbortController()
  let rejectDeadline!: (error: Error) => void
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject })
  const cancel = () => { controller.abort(); rejectDeadline(new Error('Native sprite page cancelled or timed out')) }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const timeout = setTimeout(cancel, 15000)
  let url: string | undefined
  try {
    const decoding = async (): Promise<SpritePagePixels> => {
    const response = await fetch(page.src, { signal: controller.signal })
    if (!response.ok) throw new Error('Native sprite page unavailable')
    const blob = await response.blob()
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob)
      if (signal.aborted || controller.signal.aborted || bitmap.width !== page.width || bitmap.height !== page.height) {
        bitmap.close(); throw new Error('Invalid or cancelled native sprite page')
      }
      return { image: bitmap, kind: 'bitmap', dispose: () => bitmap.close() }
    }
    url = URL.createObjectURL(blob)
    const image = new Image()
    image.src = url
    await image.decode()
    if (signal.aborted || controller.signal.aborted || image.naturalWidth !== page.width || image.naturalHeight !== page.height) throw new Error('Invalid native sprite page')
    const sourceUrl = url; url = undefined
    return { image, kind: 'image', dispose: () => { image.src = ''; URL.revokeObjectURL(sourceUrl) } }
    }
    return await Promise.race([decoding(), deadline])
  } finally {
    clearTimeout(timeout); signal.removeEventListener('abort', cancel)
    if (url) URL.revokeObjectURL(url)
  }
}

export const nativeSpritePageCache = createSpritePageCache(decodeNativePage)

export type GraphicsMemoryMode = 'auto' | 'full' | 'low'
export function getNativeSpriteBudget(mode: GraphicsMemoryMode = 'auto', memory = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  compact = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 768px)').matches)) {
  return mode === 'low' || mode === 'auto' && (compact || memory !== undefined && memory <= 4) ? 32 * MIB : 64 * MIB
}
