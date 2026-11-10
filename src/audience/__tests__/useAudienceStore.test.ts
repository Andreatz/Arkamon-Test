import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred, hostToken, invitation, response, serviceUrl, session, sessionId, snapshot } from './fixtures'

const key = 'arkamon-audience-v1'
let storage: Map<string, string>
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers(); vi.setSystemTime(1000)
  storage = new Map()
  vi.stubGlobal('localStorage', { getItem: (name: string) => storage.get(name) ?? null, setItem: (name: string, value: string) => storage.set(name, value), removeItem: (name: string) => storage.delete(name) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const store = async () => (await import('../useAudienceStore')).useAudienceStore

describe('preferenze e collegamento del pubblico', () => {
  it.each(['success', 'failure'] as const)('ignores a guest command %s arriving during session replacement', async (outcome) => {
    const lateGuest = deferred<Response>()
    const ending = deferred<Response>()
    const nextId = 'session-renewed-123'
    const next = { ...snapshot, round: null, sessionId: nextId,
      joinUrls: { npc: invitation('npc', nextId), boss: invitation('boss', nextId) }, hostToken: 'd'.repeat(64) }
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(lateGuest.promise).mockReturnValueOnce(ending.promise).mockResolvedValueOnce(response(next)))
    const api = await store()
    api.setState({ session, snapshot: { ...snapshot, round: null }, serviceUrl, connectionStatus: 'connected' })
    const guest = api.getState().controlGuest('renew-guest')
    const renewal = api.getState().connect('new-password')
    lateGuest.resolve(outcome === 'success' ? response({ ...snapshot, round: null, serverNow: 220_000 })
      : response({ error: 'Vecchio invito non disponibile', code: 'SERVICE_ERROR' }, 503))
    await guest
    expect(api.getState()).toMatchObject({ session, connectionStatus: 'connecting', error: null })
    ending.resolve(response({ ...snapshot, round: null }))
    await renewal
    expect(api.getState()).toMatchObject({ session: { sessionId: nextId }, connectionStatus: 'connected', error: null })
  })

  it('parte disabilitato, con 15 secondi, e richiede prima una sessione', async () => {
    const api = await store()
    expect(api.getState()).toMatchObject({ enabled: false, durationSeconds: 15, session: null })
    api.getState().setEnabled(true)
    expect(api.getState().enabled).toBe(false)
    expect(api.getState().error).toContain('prima il collegamento')
  })
  it('riprende una capacità valida ma non una scaduta salvata sul computer', async () => {
    storage.set(key, JSON.stringify({ version: 1, enabled: true, durationSeconds: 30, serviceUrl, session }))
    const api = await store()
    expect(api.getState()).toMatchObject({ enabled: true, durationSeconds: 30, session })
    vi.resetModules()
    storage.set(key, JSON.stringify({ version: 1, enabled: true, durationSeconds: 30, serviceUrl, session: { ...session, expiresAt: 500 } }))
    const expired = await store()
    expect(expired.getState()).toMatchObject({ enabled: false, session: null })
  })
  it('non salva la password, i voti o errori; gli inviti non contengono la capacità host', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot, hostToken }))
    vi.stubGlobal('fetch', fetcher)
    const api = await store()
    api.getState().configureService(serviceUrl)
    await api.getState().connect('password-never-save')
    expect(api.getState()).toMatchObject({ enabled: false, connectionStatus: 'connected' })
    api.getState().setEnabled(true)
    const saved = storage.get(key)!
    expect(saved).not.toContain('password-never-save')
    expect(saved).not.toContain('counts')
    expect(saved).not.toContain('snapshot')
    expect(JSON.parse(saved).session.hostToken).toBe(hostToken)
    expect(JSON.stringify(JSON.parse(saved).session.joinUrls)).not.toContain(hostToken)
  })
  it('una risposta di un vecchio collegamento non sostituisce quella nuova', async () => {
    const late = deferred<Response>()
    const nextId = 'session-next-123'
    const next = { ...snapshot, sessionId: nextId, joinUrls: { npc: invitation('npc', nextId), boss: invitation('boss', nextId) }, hostToken: 'd'.repeat(64) }
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(late.promise).mockResolvedValueOnce(response(next)))
    const api = await store()
    api.getState().configureService(serviceUrl)
    const first = api.getState().connect('first-password')
    await api.getState().connect('second-password')
    late.resolve(response({ ...snapshot, hostToken }))
    await first
    expect(api.getState().session?.sessionId).toBe(nextId)
    expect(storage.get(key)).not.toContain('first-password')
  })
  it.each([
    { label: 'successo', body: { ...snapshot, round: null }, status: 200 },
    { label: 'scadenza', body: { error: 'Sessione terminata', code: 'SESSION_EXPIRED' }, status: 410 },
    { label: 'errore temporaneo', body: { error: 'Servizio non disponibile', code: 'SERVICE_ERROR' }, status: 503 },
  ])('il polling precedente con $label non interrompe il rinnovo del collegamento', async ({ body, status }) => {
    const oldRefresh = deferred<Response>()
    const ending = deferred<Response>()
    const nextId = 'session-renewed-123'
    const next = { ...snapshot, round: null, sessionId: nextId,
      joinUrls: { npc: invitation('npc', nextId), boss: invitation('boss', nextId) }, hostToken: 'd'.repeat(64) }
    const fetcher = vi.fn().mockReturnValueOnce(oldRefresh.promise).mockReturnValueOnce(ending.promise)
      .mockResolvedValueOnce(response(next))
    vi.stubGlobal('fetch', fetcher)
    const api = await store()
    api.setState({ session, snapshot: { ...snapshot, round: null }, serviceUrl, connectionStatus: 'connected' })
    const refreshing = api.getState().refreshSnapshot()
    const renewing = api.getState().connect('new-password')
    oldRefresh.resolve(response(body, status))
    await refreshing
    expect(api.getState()).toMatchObject({ session, connectionStatus: 'connecting', error: null })
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(false)
    await api.getState().refreshSnapshot()
    expect(fetcher).toHaveBeenCalledTimes(2)
    ending.resolve(response({ ...snapshot, round: null }))
    await renewing
    expect(fetcher.mock.calls[2][0]).toBe(`${serviceUrl}/api/arkamon-votes`)
    expect(api.getState()).toMatchObject({ session: { sessionId: nextId }, connectionStatus: 'connected', error: null })
    expect(JSON.parse(storage.get(key)!).session.sessionId).toBe(nextId)
  })
  it('il polling precedente non nasconde un errore del rinnovo già concluso', async () => {
    const oldRefresh = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(oldRefresh.promise)
      .mockResolvedValueOnce(response({ error: 'Revoca non disponibile', code: 'SERVICE_ERROR' }, 503)))
    const api = await store()
    api.setState({ session, snapshot: { ...snapshot, round: null }, serviceUrl, connectionStatus: 'connected' })
    const refreshing = api.getState().refreshSnapshot()
    await api.getState().connect('new-password')
    oldRefresh.resolve(response({ ...snapshot, round: null }))
    await refreshing
    expect(api.getState()).toMatchObject({ session, connectionStatus: 'error', error: 'Revoca non disponibile' })
  })
  it('non sostituisce una sessione mentre il pubblico sta votando', async () => {
    const api = await store()
    api.setState({ session, snapshot, serviceUrl, enabled: true })
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await api.getState().connect('another-password')
    expect(fetcher).not.toHaveBeenCalled()
    expect(api.getState().session?.sessionId).toBe(sessionId)
    expect(api.getState().error).toContain('Concludi la votazione')
  })
  it('la chiusura revoca la sessione remota e rimuove la capacità locale', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot, round: null }))
    vi.stubGlobal('fetch', fetcher)
    const api = await store()
    api.setState({ session, snapshot, serviceUrl, enabled: true })
    await api.getState().disconnect()
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ action: 'end' })
    expect(api.getState()).toMatchObject({ session: null, enabled: false, connectionStatus: 'disconnected' })
    expect(storage.get(key)).not.toContain(hostToken)
  })
  it('se la chiusura non raggiunge il sito disattiva il voto e permette di riprovare', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const api = await store()
    api.setState({ session, snapshot, serviceUrl, enabled: true })
    await api.getState().disconnect()
    expect(api.getState()).toMatchObject({ session, enabled: false, connectionStatus: 'error' })
    expect(api.getState().error).toContain('riprov')
  })
  it('consente la rimozione locale solo dopo una chiusura remota fallita e non dichiara revocati i QR', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    const api = await store()
    api.setState({ session, snapshot, serviceUrl, enabled: true })
    api.getState().forgetLocalSession()
    expect(api.getState().session).toEqual(session)
    await api.getState().disconnect()
    expect(api.getState().disconnectFailed).toBe(true)
    api.getState().forgetLocalSession()
    expect(api.getState()).toMatchObject({ session: null, enabled: false, disconnectFailed: false })
    expect(api.getState().error).toContain('solo da questo computer')
    expect(api.getState().error).toContain('alla scadenza')
    expect(storage.get(key)).not.toContain(hostToken)
    expect(fetcher).toHaveBeenCalledTimes(1)
    api.getState().configureService('https://another.example')
    expect(api.getState().serviceUrl).toBe('https://another.example')
  })
  it('l’errore di revoca o scadenza rimuove il token e non blocca il gioco', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Scaduto', code: 'SESSION_EXPIRED' }, 410)))
    const api = await store()
    api.setState({ session, snapshot, serviceUrl, enabled: true })
    await api.getState().refreshSnapshot()
    expect(api.getState()).toMatchObject({ session: null, enabled: false })
    expect(storage.get(key)).not.toContain(hostToken)
  })
  it('un’origine non autorizzata conserva il collegamento e permette di riprovare la chiusura', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: 'Origine non autorizzata.', code: 'INVALID_ORIGIN' }, 403))
    vi.stubGlobal('fetch', fetcher)
    const api = await store()
    api.setState({ session, snapshot, serviceUrl, enabled: true })
    await api.getState().refreshSnapshot()
    expect(api.getState()).toMatchObject({ session, connectionStatus: 'error' })
    expect(storage.get(key)).toContain(hostToken)
    await api.getState().disconnect()
    expect(api.getState()).toMatchObject({ session, enabled: false, disconnectFailed: true })
    fetcher.mockResolvedValue(response({ ...snapshot, round: null }))
    await api.getState().disconnect()
    expect(api.getState()).toMatchObject({ session: null, disconnectFailed: false })
  })
  it('ignora snapshot di sessioni precedenti o risposte più vecchie del risultato già ricevuto', async () => {
    const api = await store()
    const latest = { ...snapshot, serverNow: 220_000, round: { ...snapshot.round!, status: 'closed' as const, winnerIndex: 1 as const, closedAt: 215_000, resolution: 'majority' as const } }
    api.setState({ session, snapshot: latest, serviceUrl })
    api.getState().acceptSnapshot(sessionId, snapshot)
    api.getState().acceptSnapshot('older-session', { ...snapshot, sessionId: 'older-session', serverNow: 300_000 })
    expect(api.getState().snapshot).toEqual(latest)
  })
})
