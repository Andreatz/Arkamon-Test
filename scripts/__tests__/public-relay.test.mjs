import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicRelay } from '../public-relay.mjs'

const origin = 'http://127.0.0.1:3016'
const snapshot = () => ({ version: 1, at: Date.now(), scene: 'mappa-principale', place: 'Venezia', active: 1, actions: 2, paused: false,
  players: [{ id: 1, name: 'Melia', place: 'Venezia', badges: 0, leagueWins: 0 }, { id: 2, name: 'Maggi', place: 'Venezia', badges: 0, leagueWins: 0 }],
  battle: null, management: null, nodes: {}, roads: {}, winner: null, leagueTotal: 4 })
async function fixture(t) {
  const relay = createPublicRelay({ origin, port: 0 })
  const url = await relay.listen()
  t.after(() => relay.close())
  const post = (value, token = relay.publishToken, from = origin) => fetch(url + '/snapshot', { method: 'POST', headers: { Origin: from, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  return { relay, url, post }
}

test('a late viewer receives only the latest public snapshot without sharing browser storage', async t => {
  const { relay, url, post } = await fixture(t)
  const first = snapshot(); await post(first)
  const current = { ...first, active: 2, at: first.at + 1 }; assert.equal((await post(current)).status, 202)
  const abort = new AbortController(); t.after(() => abort.abort())
  const response = await fetch(url + '/events', { headers: { Origin: origin, Authorization: `Bearer ${relay.viewerToken}` }, signal: abort.signal })
  assert.equal(response.status, 200)
  const reader = response.body.getReader(), decoder = new TextDecoder(); let body = ''
  while (!body.includes('data: ')) body += decoder.decode((await reader.read()).value)
  assert.deepEqual(JSON.parse(body.split('data: ')[1].split('\n')[0]), current)
  abort.abort()
})

test('viewer capability cannot publish, publisher cannot read, and untrusted origins are refused', async t => {
  const { relay, url, post } = await fixture(t)
  assert.equal((await post(snapshot(), relay.viewerToken)).status, 401)
  assert.equal((await post(snapshot(), relay.publishToken, 'https://untrusted.invalid')).status, 403)
  assert.equal((await post(snapshot(), '0'.repeat(64))).status, 401)
  assert.equal((await fetch(url + '/events', { headers: { Origin: origin, Authorization: `Bearer ${relay.publishToken}` } })).status, 401)
  assert.equal((await fetch(url + '/snapshot?token=' + relay.publishToken, { method: 'POST', headers: { Origin: origin } })).status, 404)
})

test('private campaign fields and oversized requests never enter the stream', async t => {
  const { post } = await fixture(t)
  assert.equal((await post({ ...snapshot(), hostToken: 'PRIVATE' })).status, 422)
  const privateBattle = { ...snapshot(), battle: { pokemonA: { istanzaId: 'private-id', specieId: 1 } } }
  assert.equal((await post(privateBattle)).status, 422)
  assert.equal((await post({ ...snapshot(), place: 'a'.repeat(2 * 1024 * 1024) })).status, 413)
  assert.equal((await post(snapshot())).status, 202)
})

test('relay binding and capabilities cannot be broadened by configuration', () => {
  assert.throws(() => createPublicRelay({ origin: 'https://example.com' }), /local HTTP/)
  assert.throws(() => createPublicRelay({ origin: 'http://0.0.0.0:3000' }), /local HTTP/)
  assert.throws(() => createPublicRelay({ origin, publishToken: 'a'.repeat(64), viewerToken: 'a'.repeat(64) }), /Distinct/)
})
