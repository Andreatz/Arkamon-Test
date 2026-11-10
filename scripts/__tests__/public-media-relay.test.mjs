import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { createPublicRelay, isPublicRelaySnapshot } from '../public-relay.mjs'
import { PUBLIC_MEDIA_MAX_BYTES, PUBLIC_MEDIA_BUFFER_BYTES, PUBLIC_MEDIA_BUFFER_FILES } from '../public-media-protocol.mjs'

const origin = 'http://127.0.0.1:3016'
const svg = label => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><title>${label}</title><rect width="16" height="16" fill="#ff00ff"/></svg>`)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6iCEAAAAASUVORK5CYII=', 'base64')
const hash = data => createHash('sha256').update(data).digest('hex')
const snapshot = (ids = []) => ({ version: 1, at: Date.now(), scene: 'battaglia', place: 'Venezia', active: 1, actions: 2, paused: false,
  players: [{ id: 1, name: 'Melia', place: 'Venezia', badges: 0, leagueWins: 0 }, { id: 2, name: 'Maggi', place: 'Venezia', badges: 0, leagueWins: 0 }],
  battle: { appearance: { enemyFrame: ids[0] && { source: `public-media:${ids[0]}`, fit: 'contain' }, playerFrame: ids[1] && { source: `public-media:${ids[1]}`, fit: 'contain' }, background: ids[2] && `public-media:${ids[2]}` } },
  management: null, nodes: {}, roads: {}, winner: null, leagueTotal: 4, motion: { speed: 2, reducedMotion: false } })

async function fixture(t) {
  const relay = createPublicRelay({ origin, port: 0 }), url = await relay.listen()
  t.after(() => relay.close())
  const headers = (token, type) => ({ Origin: origin, Authorization: `Bearer ${token}`, ...(type && { 'Content-Type': type }) })
  const upload = (data, mime = 'image/svg+xml', token = relay.publishToken, id = hash(data), from = origin) => fetch(`${url}/media/${id}`, {
    method: 'POST', headers: { ...headers(token, mime), Origin: from }, body: data,
  })
  const get = (id, token = relay.viewerToken, from = origin) => fetch(`${url}/media/${id}`, { headers: { ...headers(token), Origin: from } })
  const post = value => fetch(url + '/snapshot', { method: 'POST', headers: headers(relay.publishToken, 'application/json'), body: JSON.stringify(value) })
  return { relay, url, upload, get, post, headers }
}

test('media capabilities remain one-way and bound to the explicit game origin', async t => {
  const { relay, upload, get, post } = await fixture(t), data = svg('frame'), id = hash(data)
  assert.equal((await upload(data, 'image/svg+xml', relay.viewerToken)).status, 401)
  assert.equal((await upload(data, 'image/svg+xml', relay.publishToken, id, 'https://untrusted.invalid')).status, 403)
  assert.equal((await upload(data)).status, 201)
  assert.equal((await get(id)).status, 404, 'staging is not readable by viewers')
  assert.equal((await post(snapshot([id]))).status, 202)
  assert.equal((await get(id, relay.publishToken)).status, 401)
  assert.equal((await get(id, relay.viewerToken, 'https://untrusted.invalid')).status, 403)
  const visible = await get(id)
  assert.equal(visible.status, 200)
  assert.equal(visible.headers.get('content-type'), 'image/svg+xml')
  assert.equal(visible.headers.get('content-length'), String(data.length))
  assert.equal(visible.headers.get('cache-control'), 'no-store')
  assert.equal(visible.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(Buffer.from(await visible.arrayBuffer()), data)
})

test('incorrect fingerprints, fonts, empty payloads and oversize images cannot be staged', async t => {
  const { relay, url, headers, upload } = await fixture(t)
  assert.equal((await upload(svg('bad-hash'), 'image/svg+xml', relay.publishToken, '0'.repeat(64))).status, 422)
  assert.equal((await upload(Buffer.from('wOF2-test-font'), 'font/woff2')).status, 415)
  assert.equal((await upload(Buffer.alloc(0), 'image/png')).status, 422)
  const status = await new Promise((resolve, reject) => {
    const request = http.request(`${url}/media/${'1'.repeat(64)}`, { method: 'POST', headers: {
      ...headers(relay.publishToken, 'image/png'), 'Content-Length': PUBLIC_MEDIA_MAX_BYTES + 1, Connection: 'close',
    } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)) })
    request.on('error', reject); request.end()
  })
  assert.equal(status, 413, 'known oversize content is rejected before its body is collected')
  const streamedStatus = await new Promise((resolve, reject) => {
    const request = http.request(`${url}/media/${'2'.repeat(64)}`, { method: 'POST', headers: {
      ...headers(relay.publishToken, 'image/png'), Connection: 'close',
    } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)) })
    request.on('error', reject)
    request.write(png); request.end(Buffer.alloc(PUBLIC_MEDIA_MAX_BYTES))
  })
  assert.equal(streamedStatus, 413, 'chunked uploads cannot bypass the same byte bound')
  assert.equal((await upload(png, 'image/png')).status, 201, 'a rejected upload does not lock later valid uploads')
})

test('the six-file, 72 MiB staging bound preserves all current slots and prunes replacements on commit', async t => {
  const { upload, get, post } = await fixture(t)
  assert.equal(PUBLIC_MEDIA_BUFFER_FILES, 6)
  assert.equal(PUBLIC_MEDIA_BUFFER_BYTES, 72 * 1024 * 1024)
  const make = index => {
    // A real PNG plus legal trailing padding exercises the byte bound without
    // image-generation dependencies or nondeterministic compressed payloads.
    const data = Buffer.alloc(PUBLIC_MEDIA_MAX_BYTES)
    png.copy(data); data.writeUInt32BE(index, data.length - 4)
    return data
  }
  const ids = []
  for (let index = 0; index < 3; index++) {
    const data = make(index); ids.push(hash(data)); assert.equal((await upload(data, 'image/png')).status, 201)
  }
  assert.equal((await post(snapshot(ids))).status, 202)
  for (let index = 3; index < 7; index++) {
    const data = make(index); ids.push(hash(data)); assert.equal((await upload(data, 'image/png')).status, 201)
  }
  assert.equal((await post(snapshot([ids[3]]))).status, 409, 'the oldest inactive staging file was evicted')
  for (const id of ids.slice(0, 3)) {
    const response = await get(id); assert.equal(response.status, 200, 'a failed replacement retains every current slot'); await response.arrayBuffer()
  }
  for (const id of ids.slice(4)) assert.equal((await get(id)).status, 404, 'new staging is private until commit')
  assert.equal((await post(snapshot(ids.slice(4)))).status, 202)
  for (const id of ids.slice(0, 3)) assert.equal((await get(id)).status, 404, 'old public files disappear with the next snapshot')
  for (const id of ids.slice(4)) {
    const response = await get(id); assert.equal(response.status, 200); assert.equal(Number(response.headers.get('content-length')), PUBLIC_MEDIA_MAX_BYTES); await response.arrayBuffer()
  }
})

test('missing or malformed references never replace the last committed image set', async t => {
  const { upload, get, post } = await fixture(t), data = svg('current'), id = hash(data)
  await upload(data); assert.equal((await post(snapshot([id]))).status, 202)
  assert.equal((await post(snapshot([id, 'a'.repeat(64)]))).status, 409)
  const malformed = snapshot([id]); malformed.battle.appearance.background = 'public-media:../hidden'
  assert.equal((await post(malformed)).status, 422)
  const current = await get(id); assert.equal(current.status, 200); assert.deepEqual(Buffer.from(await current.arrayBuffer()), data)
  assert.equal((await post(snapshot())).status, 202)
  assert.equal((await get(id)).status, 404)
})

test('independent media payloads do not enlarge the 2 MiB public snapshot limit', async t => {
  const { post } = await fixture(t), value = snapshot(), limit = 2 * 1024 * 1024
  value.place = ''
  const overhead = Buffer.byteLength(JSON.stringify(value))
  value.place = 'a'.repeat(limit - overhead)
  assert.equal(Buffer.byteLength(JSON.stringify(value)), limit)
  assert.equal((await post(value)).status, 202)
  value.place += 'a'
  assert.equal((await post(value)).status, 413)
})

test('public motion accepts only speed/reducedMotion and rejects richer or private settings', async t => {
  const { post } = await fixture(t)
  for (const motion of [{ speed: 1, reducedMotion: true }, { speed: 2, reducedMotion: false }]) assert.equal((await post({ ...snapshot(), motion })).status, 202)
  for (const motion of [{ speed: 3, reducedMotion: false }, { speed: '2', reducedMotion: false }, { speed: 1, reducedMotion: 0 },
    { speed: 1, reducedMotion: false, musicVolume: 0 }, { speed: 1, reducedMotion: false, hostToken: 'private' }, null, false, 0, '']) {
    assert.equal(isPublicRelaySnapshot({ ...snapshot(), motion }), false)
    assert.equal((await post({ ...snapshot(), motion })).status, 422)
  }
  const legacy = snapshot(); delete legacy.motion
  assert.equal((await post(legacy)).status, 202)
})
