import { create } from 'zustand'
import {
  AudienceApiError, controlAudienceSession, createAudienceSession, getAudienceHost,
  normalizeAudienceDuration, normalizeAudienceServiceUrl, parseAudienceHostSession,
} from './audienceApi'
import type { AudienceHostSession, AudienceHostSnapshot } from './types'

export const AUDIENCE_STORAGE_KEY = 'arkamon-audience-v1'
export type AudienceConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface AudienceStoreState {
  enabled: boolean
  guestEnabled: boolean
  durationSeconds: number
  serviceUrl: string
  session: AudienceHostSession | null
  snapshot: AudienceHostSnapshot | null
  connectionStatus: AudienceConnectionStatus
  error: string | null
  disconnectFailed: boolean
  configureService(value: string): void
  setEnabled(value: boolean): void
  setGuestEnabled(value: boolean): void
  controlGuest(action: 'renew-guest' | 'revoke-guest'): Promise<void>
  setDuration(value: number): void
  connect(password: string): Promise<void>
  disconnect(): Promise<void>
  forgetLocalSession(): void
  refreshSnapshot(): Promise<void>
  acceptSnapshot(sessionId: string, snapshot: AudienceHostSnapshot): void
  expireSession(sessionId: string): void
}

function readPreferences(): Pick<AudienceStoreState, 'enabled' | 'guestEnabled' | 'durationSeconds' | 'serviceUrl' | 'session'> {
  const defaults = { enabled: false, guestEnabled: true, durationSeconds: 15, serviceUrl: '', session: null }
  try {
    if (typeof localStorage === 'undefined') return defaults
    const raw = JSON.parse(localStorage.getItem(AUDIENCE_STORAGE_KEY) ?? 'null') as Record<string, unknown> | null
    if (!raw || raw.version !== 1) return defaults
    const session = parseAudienceHostSession(raw.session)
    const serviceUrl = typeof raw.serviceUrl === 'string' && raw.serviceUrl ? normalizeAudienceServiceUrl(raw.serviceUrl) : ''
    return {
      enabled: Boolean(session && raw.enabled === true), session,
      guestEnabled: raw.guestEnabled !== false,
      durationSeconds: normalizeAudienceDuration(typeof raw.durationSeconds === 'number' ? raw.durationSeconds : 15), serviceUrl: session?.serviceUrl ?? serviceUrl,
    }
  } catch { return defaults }
}

export function audienceErrorMessage(error: unknown): string {
  return error instanceof AudienceApiError ? error.message : 'Il collegamento non risponde. Riprova oppure usa la scelta automatica.'
}

export function audienceSessionEnded(error: unknown): boolean {
  return error instanceof AudienceApiError && [401, 404, 410].includes(error.status)
}

let connectionRevision = 0
let connectionAbort: AbortController | null = null
const initial = readPreferences()

export const useAudienceStore = create<AudienceStoreState>((set, get) => ({
  ...initial, snapshot: null, connectionStatus: initial.session ? 'connected' : 'disconnected', error: null, disconnectFailed: false,
  configureService(value) {
    const serviceUrl = value.trim() ? normalizeAudienceServiceUrl(value) : ''
    if (get().session && serviceUrl !== get().serviceUrl) {
      throw new AudienceApiError('Chiudi il collegamento attuale prima di cambiare sito.', 'SESSION_ACTIVE')
    }
    set({ serviceUrl, error: null })
  },
  setEnabled(value) {
    const session = get().session
    if (value && (!session || session.expiresAt <= Date.now())) {
      set({ enabled: false, error: 'Avvia prima il collegamento con il pubblico.' })
      return
    }
    set({ enabled: value, error: null })
  },
  setGuestEnabled(value) { set({ guestEnabled: value, error: null }) },
  async controlGuest(action) {
    const session = get().session
    if (!session || get().connectionStatus === 'connecting') return
    const revision = connectionRevision
    const current = () => revision === connectionRevision && get().session?.sessionId === session.sessionId
    try {
      const snapshot = await controlAudienceSession(session, action)
      if (current()) get().acceptSnapshot(session.sessionId, snapshot)
    } catch (error) { if (current()) set({ error: audienceErrorMessage(error) }) }
  },
  setDuration(value) { set({ durationSeconds: normalizeAudienceDuration(value) }) },
  async connect(password) {
    const state = get()
    if (state.snapshot?.round?.status === 'open') {
      set({ error: 'Concludi la votazione in corso prima di avviare un nuovo collegamento.' })
      return
    }
    const revision = ++connectionRevision
    connectionAbort?.abort()
    connectionAbort = new AbortController()
    const signal = connectionAbort.signal
    set({ connectionStatus: 'connecting', enabled: false, error: null, disconnectFailed: false })
    try {
      const serviceUrl = normalizeAudienceServiceUrl(state.serviceUrl)
      if (state.session) {
        try { await controlAudienceSession(state.session, 'end', undefined, signal) }
        catch (error) { if (!audienceSessionEnded(error)) throw error }
        if (revision !== connectionRevision || signal.aborted) return
        set({ session: null, snapshot: null })
      }
      const response = await createAudienceSession(serviceUrl, password, signal)
      if (revision !== connectionRevision || signal.aborted) return
      const { hostToken, ...snapshot } = response
      set({ serviceUrl, session: { serviceUrl, sessionId: response.sessionId, hostToken, expiresAt: response.expiresAt, joinUrls: response.joinUrls,
        ...(snapshot.guest?.protocol ? { guestProtocol: snapshot.guest.protocol } : {}) },
        snapshot, connectionStatus: 'connected', enabled: false, error: null })
    } catch (error) {
      if (revision !== connectionRevision || signal.aborted) return
      set({ connectionStatus: 'error', error: audienceErrorMessage(error) })
    }
  },
  async disconnect() {
    const session = get().session
    ++connectionRevision
    connectionAbort?.abort()
    connectionAbort = null
    set({ enabled: false, connectionStatus: session ? 'connecting' : 'disconnected', error: null, disconnectFailed: false })
    if (!session) return
    try {
      await controlAudienceSession(session, 'end')
      if (get().session?.sessionId === session.sessionId) set({ session: null, snapshot: null, connectionStatus: 'disconnected', error: null })
    } catch (error) {
      if (get().session?.sessionId !== session.sessionId) return
      if (audienceSessionEnded(error)) set({ session: null, snapshot: null, connectionStatus: 'disconnected', error: null })
      else set({ connectionStatus: 'error', disconnectFailed: true, error: 'Non riesco a chiudere il collegamento sul sito. Le votazioni sono disattivate; riprova a chiuderlo quando la connessione torna disponibile.' })
    }
  },
  forgetLocalSession() {
    if (!get().disconnectFailed) return
    ++connectionRevision
    connectionAbort?.abort()
    connectionAbort = null
    set({ enabled: false, session: null, snapshot: null, connectionStatus: 'disconnected', disconnectFailed: false,
      error: 'Collegamento rimosso solo da questo computer. Il sito non è raggiungibile: i vecchi codici QR smetteranno di funzionare alla scadenza della sessione.' })
  },
  async refreshSnapshot() {
    const { session, connectionStatus } = get()
    if (!session || connectionStatus === 'connecting') return
    // A poll from before renewal/closure cannot update or expire that operation.
    const revision = connectionRevision
    try {
      const snapshot = await getAudienceHost(session)
      if (revision !== connectionRevision) return
      get().acceptSnapshot(session.sessionId, snapshot)
    } catch (error) {
      if (revision !== connectionRevision || get().session?.sessionId !== session.sessionId) return
      if (audienceSessionEnded(error)) get().expireSession(session.sessionId)
      else set({ connectionStatus: 'error', error: audienceErrorMessage(error) })
    }
  },
  acceptSnapshot(sessionId, snapshot) {
    const session = get().session
    if (!session || session.sessionId !== sessionId || snapshot.sessionId !== sessionId) return
    if (get().snapshot && snapshot.serverNow < get().snapshot!.serverNow) return
    if (snapshot.expiresAt <= snapshot.serverNow) { get().expireSession(sessionId); return }
    set({ session: { ...session, expiresAt: snapshot.expiresAt, joinUrls: snapshot.joinUrls, guestProtocol: snapshot.guest?.protocol }, snapshot, connectionStatus: 'connected', error: null, disconnectFailed: false })
  },
  expireSession(sessionId) {
    if (get().session?.sessionId !== sessionId) return
    ++connectionRevision
    connectionAbort?.abort()
    set({ enabled: false, session: null, snapshot: null, connectionStatus: 'disconnected', disconnectFailed: false, error: 'Il collegamento è scaduto o è stato chiuso. Avvia un nuovo collegamento per continuare a votare.' })
  },
}))

/** Deliberately excludes password, errors, ballots and fetched response bodies. */
useAudienceStore.subscribe((state) => {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(AUDIENCE_STORAGE_KEY, JSON.stringify({ version: 1, enabled: state.enabled, guestEnabled: state.guestEnabled, durationSeconds: state.durationSeconds, serviceUrl: state.serviceUrl, session: state.session }))
  } catch { /* Gameplay remains usable when organizer preferences cannot be saved. */ }
})
