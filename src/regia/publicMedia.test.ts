import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, webcrypto } from 'node:crypto'
import { resolveObjectURL } from 'node:buffer'
import { createPublicImagePublisher, fetchPublicRelayImage, type PublicImage } from './publicMedia'
import { createPublicRelayPublisher, type PublicRelayConfiguration } from './publicRelayTransport'
import type { PublicSnapshot } from './publicSnapshot'

const { readSelectedImage } = vi.hoisted(() => ({ readSelectedImage: vi.fn() }))
vi.mock('@/ui-studio/mediaStorage', async importOriginal => ({
  ...await importOriginal<typeof import('@/ui-studio/mediaStorage')>(), readPublicUiImage: readSelectedImage,
}))

const encoder = new TextEncoder()
const svg = (label = 'frame') => encoder.encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><title>${label}</title><rect width="16" height="16" fill="#ff00ff"/></svg>`)
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6iCEAAAAASUVORK5CYII=', 'base64'))
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const publishConfig: PublicRelayConfiguration = { origin: 'http://127.0.0.1:3067', token: 'a'.repeat(64), mode: 'publish' }
const viewerConfig: PublicRelayConfiguration = { ...publishConfig, token: 'b'.repeat(64), mode: 'viewer' }
const closers: (() => void)[] = [], objectUrls: string[] = []

function snapshot(sources: string[] = []): PublicSnapshot {
  return { version: 1, at: 10, scene: 'battaglia', place: 'Venezia', active: 1, actions: 2, paused: false, players: [], nodes: {}, roads: {}, winner: null, leagueTotal: 4,
    battle: { appearance: { enemyFrame: sources[0] && { source: sources[0], fit: 'contain' }, playerFrame: sources[1] && { source: sources[1], fit: 'contain' }, background: sources[2] } },
  } as unknown as PublicSnapshot
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function response(bytes: Uint8Array, mime = 'image/svg+xml', length = bytes.length) {
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': mime, 'Content-Length': String(length) } })
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  readSelectedImage.mockReset().mockResolvedValue({ bytes: svg(), mime: 'image/svg+xml' })
})
afterEach(() => {
  for (const close of closers.splice(0)) close()
  for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url)
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('selected public image publication', () => {
  it('the default storage boundary reads one selected image record and refuses a selected font', async () => {
    const storage = await vi.importActual<typeof import('@/ui-studio/mediaStorage')>('@/ui-studio/mediaStorage')
    const bytes = svg(), gets: string[] = []
    const saved = new Map([
      ['frame', { id: 'frame', name: 'frame.svg', kind: 'image', mime: 'image/svg+xml', data: Buffer.from(bytes).toString('base64') }],
      ['font', { id: 'font', name: 'private.woff2', kind: 'font', mime: 'font/woff2', data: 'private-font' }],
      ['hidden', { id: 'hidden', name: 'unused.png', kind: 'image', mime: 'image/png', data: 'private-unused-image' }],
    ])
    const close = vi.fn()
    vi.stubGlobal('indexedDB', { open: () => {
      const request = { result: { close, transaction: () => ({ objectStore: () => ({ get: (id: string) => {
        gets.push(id)
        const item = { result: saved.get(id), onsuccess: undefined as (() => void) | undefined }
        queueMicrotask(() => item.onsuccess?.()); return item
      } }) }) }, onsuccess: undefined as (() => void) | undefined }
      queueMicrotask(() => request.onsuccess?.()); return request
    } })
    expect(await storage.readPublicUiImage('ui-media:frame')).toEqual({ bytes, mime: 'image/svg+xml' })
    await expect(storage.readPublicUiImage('ui-media:font')).rejects.toThrow('Solo le immagini selezionate')
    expect(gets).toEqual(['frame', 'font']); expect(close).toHaveBeenCalledTimes(2)
  })

  it('reads only the three active appearance slots and leaves the authoring library, fonts and campaign untouched', async () => {
    const read = vi.fn(async (source: string) => ({ bytes: svg(source), mime: 'image/svg+xml' }))
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 201 })); vi.stubGlobal('fetch', fetcher)
    const publisher = createPublicImagePublisher(publishConfig, read); closers.push(() => publisher.close())
    const value = snapshot(['ui-media:enemy', 'ui-media:player', 'ui-media:background'])
    const prepared = await publisher.prepare(value, new AbortController().signal)
    expect(read.mock.calls.map(([source]) => source)).toEqual(['ui-media:enemy', 'ui-media:player', 'ui-media:background'])
    expect(prepared.battle?.appearance?.enemyFrame?.source).toBe(`public-media:${hash(svg('ui-media:enemy'))}`)
    expect(prepared.battle?.appearance?.playerFrame?.source).toBe(`public-media:${hash(svg('ui-media:player'))}`)
    expect(prepared.battle?.appearance?.background).toBe(`public-media:${hash(svg('ui-media:background'))}`)
    expect(value.battle?.appearance?.enemyFrame?.source).toBe('ui-media:enemy')
    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:3067\/media\/[a-f0-9]{64}$/)
      expect(options).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${publishConfig.token}`, 'Content-Type': 'image/svg+xml' } })
      expect(new TextDecoder().decode(options.body)).not.toMatch(/private|unused-font|ui-media:hidden/)
    }
  })

  it('deduplicates shared frames and content hashes, caches only current slots and reuploads after reset', async () => {
    const read = vi.fn(async () => ({ bytes: svg(), mime: 'image/svg+xml' }))
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 201 })); vi.stubGlobal('fetch', fetcher)
    const publisher = createPublicImagePublisher(publishConfig, read); closers.push(() => publisher.close())
    const value = snapshot(['ui-media:same', 'ui-media:same', 'ui-media:other-id-same-bytes'])
    const prepared = await publisher.prepare(value, new AbortController().signal)
    expect(read).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(prepared.battle?.appearance?.background).toBe(prepared.battle?.appearance?.enemyFrame?.source)
    await publisher.prepare(value, new AbortController().signal)
    expect(read).toHaveBeenCalledTimes(2); expect(fetcher).toHaveBeenCalledTimes(1)
    publisher.reset()
    await publisher.prepare(value, new AbortController().signal)
    expect(read).toHaveBeenCalledTimes(2); expect(fetcher).toHaveBeenCalledTimes(2)
    await publisher.prepare(snapshot(), new AbortController().signal)
    await publisher.prepare(value, new AbortController().signal)
    expect(read).toHaveBeenCalledTimes(4); expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('keeps packaged artwork local and skips every read/upload when no imported slot is selected', async () => {
    const read = vi.fn(), fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const publisher = createPublicImagePublisher(publishConfig, read); closers.push(() => publisher.close())
    const value = snapshot(['/ui/frame.png', '/ui/other.png', '/backgrounds/world.webp'])
    expect(await publisher.prepare(value, new AbortController().signal)).toBe(value)
    expect(await publisher.prepare({ ...value, battle: null }, new AbortController().signal)).toEqual({ ...value, battle: null })
    expect(read).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { bytes: new Uint8Array(0), mime: 'image/png' },
    { bytes: new Uint8Array(12 * 1024 * 1024 + 1), mime: 'image/png' },
    { bytes: encoder.encode('wOF2-font'), mime: 'font/woff2' },
  ])('rejects an invalid selected payload before any upload: $mime, $bytes.length bytes', async image => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const publisher = createPublicImagePublisher(publishConfig, async () => image); closers.push(() => publisher.close())
    await expect(publisher.prepare(snapshot(['ui-media:selected']), new AbortController().signal)).rejects.toThrow('oltre i limiti o non valida')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('recovers from a relay restart by resetting upload knowledge after snapshot 409', async () => {
    let snapshots = 0
    const fetcher = vi.fn(async (url: string) => url.endsWith('/snapshot')
      ? new Response(null, { status: ++snapshots === 1 ? 409 : 202 }) : new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetcher)
    const publisher = createPublicRelayPublisher(publishConfig); closers.push(() => publisher.close())
    publisher.publish(snapshot(['ui-media:frame', 'ui-media:frame']))
    await vi.waitFor(() => expect(snapshots).toBe(2), { timeout: 2000 })
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/media/'))).toHaveLength(2)
    expect(readSelectedImage).toHaveBeenCalledTimes(1)
  })

  for (const stage of ['read', 'digest'] as const) it(`closing during an awaited ${stage} aborts the operation and prevents late image/snapshot publication`, async () => {
    const waitingRead = deferred<PublicImage>(), waitingDigest = deferred<ArrayBuffer>()
    const digest = vi.fn(() => waitingDigest.promise)
    if (stage === 'read') readSelectedImage.mockReturnValue(waitingRead.promise)
    else vi.stubGlobal('crypto', { subtle: { digest } })
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const publisher = createPublicRelayPublisher(publishConfig); closers.push(() => publisher.close())
    publisher.publish(snapshot(['ui-media:frame']))
    await vi.waitFor(() => stage === 'read' ? expect(readSelectedImage).toHaveBeenCalled() : expect(digest).toHaveBeenCalled())
    publisher.close()
    if (stage === 'read') waitingRead.resolve({ bytes: svg(), mime: 'image/svg+xml' })
    else waitingDigest.resolve(Uint8Array.from(Buffer.from(hash(svg()), 'hex')).buffer)
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('an aborted prepare does not turn a late image read into an upload', async () => {
    const waiting = deferred<PublicImage>(), read = vi.fn(() => waiting.promise), fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const publisher = createPublicImagePublisher(publishConfig, read); closers.push(() => publisher.close())
    const controller = new AbortController(), prepared = publisher.prepare(snapshot(['ui-media:frame']), controller.signal)
    const rejection = expect(prepared).rejects.toThrow('annullato')
    controller.abort(); waiting.resolve({ bytes: svg(), mime: 'image/svg+xml' })
    await rejection; expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('viewer image verification and URL ownership', () => {
  it.each([{ bytes: svg(), mime: 'image/svg+xml' }, { bytes: png, mime: 'image/png' }])('returns a revocable verified $mime blob, keeping capabilities outside URLs and storage', async ({ bytes, mime }) => {
    const fetcher = vi.fn().mockResolvedValue(response(bytes, mime)); vi.stubGlobal('fetch', fetcher)
    const url = await fetchPublicRelayImage(viewerConfig, `public-media:${hash(bytes)}`, new AbortController().signal); objectUrls.push(url)
    expect(fetcher).toHaveBeenCalledWith(`${viewerConfig.origin}/media/${hash(bytes)}`, expect.objectContaining({ credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${viewerConfig.token}` } }))
    expect(url).toMatch(/^blob:/); expect(url).not.toContain(viewerConfig.token)
    const owned = resolveObjectURL(url)
    expect(owned?.type).toBe(mime); expect(owned?.size).toBe(bytes.length)
    expect(new Uint8Array(await owned!.arrayBuffer())).toEqual(bytes)
    URL.revokeObjectURL(url)
    expect(resolveObjectURL(url)).toBeUndefined()
  })

  it.each(['ui-media:private', 'public-media:../file', `public-media:${'a'.repeat(63)}`])('rejects private or malformed source %s before network access', async source => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(fetchPublicRelayImage(viewerConfig, source, new AbortController().signal)).rejects.toThrow('non disponibile')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('a publisher capability cannot fetch viewer images', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(fetchPublicRelayImage(publishConfig, `public-media:${hash(svg())}`, new AbortController().signal)).rejects.toThrow('non disponibile')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { mime: 'font/woff2', length: 8 }, { mime: 'text/html', length: 8 }, { mime: 'image/svg+xml', length: 0 },
    { mime: 'image/svg+xml', length: 12 * 1024 * 1024 + 1 },
  ])('rejects an unsupported MIME or advertised size before creating a blob: $mime / $length', async ({ mime, length }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(svg(), mime, length)))
    const create = vi.spyOn(URL, 'createObjectURL')
    await expect(fetchPublicRelayImage(viewerConfig, `public-media:${hash(svg())}`, new AbortController().signal)).rejects.toThrow('non disponibile o oltre i limiti')
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects a dishonest stream length or SHA without retaining an object URL', async () => {
    const create = vi.spyOn(URL, 'createObjectURL')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(svg(), 'image/svg+xml', 1)))
    await expect(fetchPublicRelayImage(viewerConfig, `public-media:${hash(svg())}`, new AbortController().signal)).rejects.toThrow('oltre i limiti')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(svg(), 'image/svg+xml', svg().length + 1)))
    await expect(fetchPublicRelayImage(viewerConfig, `public-media:${hash(svg())}`, new AbortController().signal)).rejects.toThrow('incompleto')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(svg())))
    await expect(fetchPublicRelayImage(viewerConfig, `public-media:${'0'.repeat(64)}`, new AbortController().signal)).rejects.toThrow('Impronta')
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/private.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://example.com/private)"/></svg>',
  ])('rejects unsafe SVG even when the transport SHA matches: %s', async text => {
    const bytes = encoder.encode(text), create = vi.spyOn(URL, 'createObjectURL')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes)))
    await expect(fetchPublicRelayImage(viewerConfig, `public-media:${hash(bytes)}`, new AbortController().signal)).rejects.toThrow('SVG non accettato')
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects SVG bytes mislabeled as PNG despite a correct transport fingerprint', async () => {
    const bytes = svg(), create = vi.spyOn(URL, 'createObjectURL')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes, 'image/png')))
    await expect(fetchPublicRelayImage(viewerConfig, `public-media:${hash(bytes)}`, new AbortController().signal)).rejects.toThrow('Formato non riconosciuto')
    expect(create).not.toHaveBeenCalled()
  })

  it('an abort during digest prevents a late object URL allocation', async () => {
    const bytes = svg(), waiting = deferred<ArrayBuffer>(), digest = vi.fn(() => waiting.promise), create = vi.spyOn(URL, 'createObjectURL')
    vi.stubGlobal('crypto', { subtle: { digest } }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(bytes)))
    const controller = new AbortController(), fetched = fetchPublicRelayImage(viewerConfig, `public-media:${hash(bytes)}`, controller.signal)
    const rejection = expect(fetched).rejects.toThrow('Impronta')
    await vi.waitFor(() => expect(digest).toHaveBeenCalled())
    controller.abort(); waiting.resolve(Uint8Array.from(Buffer.from(hash(bytes), 'hex')).buffer)
    await rejection; expect(create).not.toHaveBeenCalled()
  })
})
