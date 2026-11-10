import http from 'node:http'
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { PUBLIC_MEDIA_MAX_BYTES, PUBLIC_MEDIA_BUFFER_FILES, PUBLIC_MEDIA_BUFFER_BYTES, PUBLIC_MEDIA_EXTENSIONS, publicSnapshotMediaIds } from './public-media-protocol.mjs'

const LIMIT = 2 * 1024 * 1024
const rootKeys = new Set(['version', 'at', 'scene', 'place', 'active', 'actions', 'paused', 'players', 'battle', 'nodes', 'roads', 'winner', 'leagueTotal', 'management', 'motion'])
const privateKeys = new Set(['hostToken', 'guestToken', 'joinUrls', 'password', 'sessionId', 'inventario', 'deposito', 'istanzaId', 'challengeContext', 'arkamonSession'])
export function isPublicRelaySnapshot(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || !Number.isFinite(value.at)
    || !Array.isArray(value.players) || value.players.length !== 2 || ![1, 2].includes(value.active)
    || typeof value.scene !== 'string' || typeof value.place !== 'string' || typeof value.paused !== 'boolean'
    || Object.keys(value).some(key => !rootKeys.has(key))) return false
  const safe = entry => !entry || typeof entry !== 'object' || Object.entries(entry).every(([key, child]) => !privateKeys.has(key) && safe(child))
  return safe(value) && publicSnapshotMediaIds(value) !== null
    && (value.motion === undefined || value.motion !== null && typeof value.motion === 'object' && !Array.isArray(value.motion)
      && [1, 2].includes(value.motion.speed) && typeof value.motion.reducedMotion === 'boolean'
      && Object.keys(value.motion).every(key => ['speed', 'reducedMotion'].includes(key)))
}

/** A local, one-way public presentation relay. It has no game control endpoint. */
export function createPublicRelay({ origin, port = 3067, publishToken = randomBytes(32).toString('hex'), viewerToken = randomBytes(32).toString('hex') }) {
  const allowed = new URL(origin)
  if (!['127.0.0.1', 'localhost'].includes(allowed.hostname) || allowed.protocol !== 'http:' || allowed.origin !== origin) throw new Error('Use the explicit local HTTP game origin')
  if (![publishToken, viewerToken].every(token => /^[a-f0-9]{64}$/.test(token)) || publishToken === viewerToken) throw new Error('Distinct 256-bit publisher and viewer capabilities are required')
  const viewers = new Set()
  const media = new Map()
  let activeMedia = new Set(), mediaBytes = 0, uploadingMedia = false
  const removeMedia = id => { const file = media.get(id); if (file) { mediaBytes -= file.data.length; media.delete(id) } }
  const pruneMedia = (bytes = 0) => {
    // Only the current three public slots and one staged replacement can be held.
    for (const [id, file] of media) if (!activeMedia.has(id)
      && (Date.now() - file.at > 120_000 || media.size >= PUBLIC_MEDIA_BUFFER_FILES || mediaBytes + bytes > PUBLIC_MEDIA_BUFFER_BYTES)) removeMedia(id)
  }
  let last = null, receivedAt = 0
  const authorized = (request, token) => {
    const supplied = request.headers.authorization?.slice(7)
    return request.headers.authorization?.startsWith('Bearer ') && /^[a-f0-9]{64}$/.test(supplied ?? '') && timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(token, 'hex'))
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const address = server.address()
    if (request.headers.host !== `127.0.0.1:${address.port}`) { response.writeHead(403).end(); return }
    if (request.url === '/health' && request.method === 'GET') { response.writeHead(200).end('local public relay'); return }
    if (request.headers.origin !== origin) { response.writeHead(403).end(); return }
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return }
    const mediaId = /^\/media\/([a-f0-9]{64})$/.exec(request.url ?? '')?.[1]
    if (mediaId && request.method === 'GET') {
      if (!authorized(request, viewerToken)) { response.writeHead(401).end(); return }
      const file = activeMedia.has(mediaId) && media.get(mediaId)
      if (!file) { response.writeHead(404).end(); return }
      response.writeHead(200, { 'Content-Type': file.mime, 'Content-Length': file.data.length }).end(file.data)
      return
    }
    if (mediaId && request.method === 'POST') {
      if (!authorized(request, publishToken)) { response.writeHead(401).end(); return }
      const mime = request.headers['content-type']
      if (!Object.hasOwn(PUBLIC_MEDIA_EXTENSIONS, mime ?? '')) { response.writeHead(415).end(); return }
      if (uploadingMedia) { response.writeHead(429).end(); return }
      const length = Number(request.headers['content-length'])
      if (length > PUBLIC_MEDIA_MAX_BYTES) { response.writeHead(413).end(); return }
      uploadingMedia = true
      try {
        let bytes = 0
        const chunks = []
        for await (const chunk of request) {
          bytes += chunk.length
          if (bytes > PUBLIC_MEDIA_MAX_BYTES) { response.writeHead(413).end(); return }
          chunks.push(chunk)
        }
        const data = Buffer.concat(chunks)
        if (!bytes || createHash('sha256').update(data).digest('hex') !== mediaId) { response.writeHead(422).end(); return }
        if (!media.has(mediaId)) {
          pruneMedia(bytes)
          if (media.size >= PUBLIC_MEDIA_BUFFER_FILES || mediaBytes + bytes > PUBLIC_MEDIA_BUFFER_BYTES) { response.writeHead(413).end(); return }
          media.set(mediaId, { data, mime, at: Date.now() }); mediaBytes += bytes
        }
        response.writeHead(201).end()
      } catch { if (!response.writableEnded) response.writeHead(400).end() }
      finally { uploadingMedia = false }
      return
    }
    if (request.url === '/events' && request.method === 'GET') {
      if (!authorized(request, viewerToken)) { response.writeHead(401).end(); return }
      if (viewers.size >= 16) { response.writeHead(429).end(); return }
      response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
      response.write(': connected\n\n')
      viewers.add(response)
      if (last && Date.now() - receivedAt < 6500) response.write(`data: ${last}\n\n`)
      request.on('close', () => viewers.delete(response))
      return
    }
    if (request.url === '/snapshot' && request.method === 'POST') {
      if (!authorized(request, publishToken)) { response.writeHead(401).end(); return }
      if (!request.headers['content-type']?.startsWith('application/json')) { response.writeHead(415).end(); return }
      let bytes = 0
      const chunks = []
      try {
        for await (const chunk of request) {
          bytes += chunk.length
          if (bytes > LIMIT) { response.writeHead(413).end(); return }
          chunks.push(chunk)
        }
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!isPublicRelaySnapshot(value)) { response.writeHead(422).end(); return }
        const references = publicSnapshotMediaIds(value)
        if (references.some(id => !media.has(id))) { response.writeHead(409).end(); return }
        activeMedia = new Set(references)
        for (const id of media.keys()) if (!activeMedia.has(id)) removeMedia(id)
        last = JSON.stringify(value); receivedAt = Date.now()
        for (const viewer of viewers) {
          if (viewer.writableLength > LIMIT * 2) { viewer.destroy(); viewers.delete(viewer) }
          else viewer.write(`data: ${last}\n\n`)
        }
        response.writeHead(202).end()
      } catch { if (!response.writableEnded) response.writeHead(400).end() }
      return
    }
    response.writeHead(404).end()
  })
  server.requestTimeout = 5000
  return { server, publishToken, viewerToken,
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) }); return `http://127.0.0.1:${server.address().port}` },
    async close() { for (const viewer of viewers) viewer.end(); media.clear(); mediaBytes = 0; await new Promise(resolve => server.close(resolve)); server.closeAllConnections() },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const game = new URL(process.argv[2] ?? 'http://127.0.0.1:3000/')
  if (game.search || game.hash || game.username || game.password) throw new Error('Provide the local game URL without query, fragment or credentials')
  const relay = createPublicRelay({ origin: game.origin, port: Number(process.argv[3] ?? 3067) })
  const address = await relay.listen()
  const publisher = new URL(game); publisher.hash = new URLSearchParams({ publicRelay: new URL(address).host, publish: relay.publishToken }).toString()
  const viewer = new URL(game); viewer.searchParams.set('view', 'broadcast'); viewer.hash = new URLSearchParams({ publicRelay: new URL(address).host, viewer: relay.viewerToken }).toString()
  console.log('Relay pubblico locale avviato. I due collegamenti scadono alla chiusura del processo.\nConsole di gioco (privato):\n' + publisher + '\nBrowser Source OBS (sola lettura):\n' + viewer)
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void relay.close().then(() => process.exit(0)) })
}
