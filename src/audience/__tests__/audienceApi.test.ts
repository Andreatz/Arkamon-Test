import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AudienceApiError, audienceConnectionIssue, audienceServiceWarning, controlAudienceSession, createAudienceSession, getAudienceHost,
  normalizeAudienceDuration, normalizeAudienceServiceUrl, openAudienceRound, parseAudienceHostSession,
  parseAudienceHostSnapshot, validateAudienceJoinUrl, validateAudienceRoundRequest,
} from '../audienceApi'
import { closedSnapshot, hostToken, invitation, request, response, round, serviceUrl, session, sessionId, snapshot } from './fixtures'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('indirizzi e richieste di voto', () => {
  it('normalizza l’indirizzo del sito senza trasportare dati riservati', () => {
    expect(normalizeAudienceServiceUrl(' https://VOTA.example:443/ ')).toBe(serviceUrl)
    expect(normalizeAudienceServiceUrl('http://192.168.1.20:8080')).toBe('http://192.168.1.20:8080')
    for (const invalid of ['javascript:alert(1)', 'https://user:secret@vota.example', 'https://vota.example/path', 'https://vota.example?hostToken=abc', 'https://vota.example/#password=abc']) {
      expect(() => normalizeAudienceServiceUrl(invalid)).toThrow(AudienceApiError)
    }
  })
  it('segnala che localhost non è un invito raggiungibile dai telefoni', () => {
    for (const address of ['http://localhost:3004', 'http://127.0.0.1:3004', 'http://[::1]:3004']) {
      expect(audienceServiceWarning(address)).toContain('solo su questo computer')
    }
    expect(audienceServiceWarning(serviceUrl)).toBeNull()
    expect(audienceServiceWarning('http://192.168.1.20')).toContain('stessa rete Wi-Fi')
  })
  it('blocca HTTP da una pagina HTTPS prima dell’invio della password, mantenendo disponibili le prove HTTP locali', async () => {
    expect(audienceConnectionIssue('http://192.168.1.20:3004', 'http:')).toBeNull()
    expect(audienceConnectionIssue(serviceUrl, 'https:')).toBeNull()
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(audienceServiceWarning('http://192.168.1.20:3004')).toContain('browser blocca')
    await expect(createAudienceSession('http://192.168.1.20:3004', 'private-password')).rejects.toMatchObject({ code: 'MIXED_CONTENT' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('mantiene durate intere tra 5 e 120 secondi e un default di 15', () => {
    expect([0, 5, 15.7, 120, 999, NaN].map(normalizeAudienceDuration)).toEqual([5, 5, 16, 120, 120, 15])
    expect(() => validateAudienceRoundRequest({ ...request, durationSeconds: 4 })).toThrow()
  })
  it('accetta solo opzioni esistenti e indicizzate una volta', () => {
    expect(validateAudienceRoundRequest(request)).toEqual(request)
    expect(() => validateAudienceRoundRequest({ ...request, options: [request.options[0], request.options[0]] })).toThrow()
    expect(() => validateAudienceRoundRequest({ ...request, options: [request.options[1]], fallbackIndex: 0 })).toThrow()
    expect(() => validateAudienceRoundRequest({ ...request, trainer: { name: 'Capopalestra', kind: 'Capopalestra' } })).toThrow()
    expect(() => validateAudienceRoundRequest({ ...request, options: [] })).toThrow()
  })
  it('rifiuta risultati chiusi con una mossa non disponibile e identità di sessione diversa', () => {
    expect(parseAudienceHostSnapshot(closedSnapshot(), serviceUrl, sessionId).round?.winnerIndex).toBe(1)
    expect(() => parseAudienceHostSnapshot({ ...closedSnapshot(), round: { ...closedSnapshot().round, options: [request.options[0]] } }, serviceUrl)).toThrow()
    expect(() => parseAudienceHostSnapshot(snapshot, serviceUrl, 'another-session')).toThrow()
    expect(() => parseAudienceHostSnapshot({ ...snapshot, round: { ...round, winnerIndex: 1 } }, serviceUrl)).toThrow()
  })
  it('accetta solo un comando ospite privato, mai un vecchio risultato a maggioranza sul canale boss', () => {
    const guest = { protocol: 'private-guest-v1', claimed: true, revoked: false, expiresAt: snapshot.expiresAt, generation: 1 }
    const bossRound = { ...closedSnapshot().round!, channel: 'boss', trainer: { name: 'Ospite', kind: 'Superquattro' }, resolution: 'guest' }
    const value = { ...snapshot, participants: { npc: 4, boss: 1 }, guest, round: bossRound }
    expect(parseAudienceHostSnapshot(value, serviceUrl).round?.resolution).toBe('guest')
    expect(() => parseAudienceHostSnapshot({ ...value, round: { ...bossRound, resolution: 'majority' } }, serviceUrl)).toThrow()
    expect(() => parseAudienceHostSnapshot({ ...value, participants: { npc: 4, boss: 2 } }, serviceUrl)).toThrow()
    expect(() => parseAudienceHostSnapshot({ ...value, guest: { ...guest, revoked: true } }, serviceUrl)).toThrow()
  })
  it('gli inviti contengono solo il canale e la capacità pubblica prevista nel frammento', () => {
    expect(validateAudienceJoinUrl(invitation('npc'), serviceUrl, sessionId, 'npc')).toBe(invitation('npc'))
    for (const url of [invitation('boss'), invitation('npc').replace(serviceUrl, 'https://other.example'), `${invitation('npc')}&hostToken=${hostToken}`, invitation('npc').replace('#', `?hostToken=${hostToken}#`)]) {
      expect(() => validateAudienceJoinUrl(url, serviceUrl, sessionId, 'npc')).toThrow()
    }
  })
  it('ignora password e campi privati estranei nelle risposte e scarta token persistiti scaduti', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    const result = parseAudienceHostSnapshot({ ...snapshot, password: 'private', votes: ['member-id'], hostToken }, serviceUrl)
    expect(JSON.stringify(result)).not.toContain('private')
    expect(JSON.stringify(result)).not.toContain(hostToken)
    expect(parseAudienceHostSession({ ...session, password: 'private' })).toEqual(session)
    expect(parseAudienceHostSession({ ...session, expiresAt: 500 })).toBeNull()
    expect(parseAudienceHostSession({ ...session, hostToken: 'too-short' })).toBeNull()
  })
})

describe('accesso del computer della regia', () => {
  it('crea una sessione e conserva la password soltanto nel corpo della richiesta iniziale', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot, hostToken }))
    vi.stubGlobal('fetch', fetcher)
    expect((await createAudienceSession(serviceUrl, 'regia-password')).hostToken).toBe(hostToken)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe(`${serviceUrl}/api/arkamon-votes`)
    expect(init.credentials).toBe('omit')
    expect(init.body).toBe(JSON.stringify({ password: 'regia-password' }))
    expect(init.headers.Authorization).toBeUndefined()
  })
  it('usa la capacità host soltanto nell’header e non in URL o inviti', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(snapshot)))
    vi.stubGlobal('fetch', fetcher)
    await getAudienceHost(session)
    await openAudienceRound(session, request)
    await controlAudienceSession(session, 'close', round.id)
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).not.toContain(hostToken)
      expect(url).not.toContain('?')
      expect(init.headers.Authorization).toBe(`Bearer ${hostToken}`)
      expect(init.cache).toBe('no-store')
      expect(init.credentials).toBe('omit')
    }
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ action: 'close', roundId: round.id })
  })
  it('non invia richieste con opzioni non valide e riporta la revoca della sessione', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: 'Collegamento scaduto', code: 'SESSION_EXPIRED' }, 410))
    vi.stubGlobal('fetch', fetcher)
    await expect(openAudienceRound(session, { ...request, options: [] })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    await expect(getAudienceHost(session)).rejects.toMatchObject({ status: 410, code: 'SESSION_EXPIRED' })
  })
})
