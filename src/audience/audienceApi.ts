import type {
  AudienceCreateResponse, AudienceHostSession, AudienceHostSnapshot, AudienceMoveIndex,
  AudienceMoveOption, AudiencePokemon, AudienceRound, AudienceRoundRequest, AudienceTrainer,
} from './types'

export class AudienceApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 0) {
    super(message)
    this.name = 'AudienceApiError'
  }
}

const invalid = () => new AudienceApiError('La risposta del collegamento non è valida. Riprova oppure usa la scelta automatica.', 'INVALID_RESPONSE')
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
const text = (value: unknown, max = 256): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid()
  return value
}
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw invalid()
  return value
}
const index = (value: unknown): AudienceMoveIndex => integer(value, 0, 2) as AudienceMoveIndex
const channel = (value: unknown) => {
  if (value !== 'npc' && value !== 'boss') throw invalid()
  return value
}

export function normalizeAudienceServiceUrl(value: string): string {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new AudienceApiError('Inserisci l’indirizzo completo del sito, per esempio https://gioco.example.', 'INVALID_SERVICE_URL') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new AudienceApiError('Usa solo l’indirizzo del sito, senza password, percorsi o parametri.', 'INVALID_SERVICE_URL')
  }
  return url.origin
}

export function audienceConnectionIssue(value: string, pageProtocol = typeof window === 'undefined' ? '' : window.location.protocol): string | null {
  try {
    const url = new URL(normalizeAudienceServiceUrl(value))
    return pageProtocol === 'https:' && url.protocol === 'http:'
      ? 'Questa pagina del gioco usa HTTPS. Usa anche per il sito della votazione un indirizzo HTTPS: il browser blocca il collegamento HTTP.'
      : null
  } catch { return null }
}

export function audienceServiceWarning(value: string): string | null {
  try {
    const url = new URL(normalizeAudienceServiceUrl(value))
    const issue = audienceConnectionIssue(value)
    if (issue) return issue
    if (url.hostname === 'localhost' || url.hostname === '::1' || url.hostname === '[::1]' || /^127\./.test(url.hostname) || url.hostname === '0.0.0.0') {
      return 'Questo indirizzo funziona solo su questo computer. Per i telefoni usa un sito pubblico oppure l’indirizzo del computer sulla stessa rete Wi-Fi.'
    }
    if (url.protocol === 'http:') return 'I telefoni devono poter raggiungere questo indirizzo. Se usi la rete locale, collegali alla stessa rete Wi-Fi del computer.'
    return null
  } catch { return null }
}

export function normalizeAudienceDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(5, Math.min(120, Math.round(value))) : 15
}

function parseTrainer(value: unknown): AudienceTrainer {
  const v = object(value)
  if (!['NPC', 'Capopalestra', 'PVP', 'Superquattro', 'Campione'].includes(String(v.kind))) throw invalid()
  return { name: text(v.name, 200), kind: v.kind as AudienceTrainer['kind'] }
}
function parsePokemon(value: unknown): AudiencePokemon {
  const v = object(value)
  return { instanceId: text(v.instanceId, 200), speciesId: integer(v.speciesId, 1), name: text(v.name, 200), level: integer(v.level, 1, 100) }
}
function parseOptions(value: unknown): AudienceMoveOption[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw invalid()
  const options = value.map((item) => {
    const v = object(item)
    if (typeof v.description !== 'string' || v.description.length > 2000) throw invalid()
    return { index: index(v.index), moveId: integer(v.moveId, 1), name: text(v.name, 200), type: text(v.type, 100), description: v.description }
  })
  if (new Set(options.map((v) => v.index)).size !== options.length) throw invalid()
  return options
}

export function validateAudienceRoundRequest(value: AudienceRoundRequest): AudienceRoundRequest {
  const v = object(value)
  const options = parseOptions(v.options)
  const fallbackIndex = index(v.fallbackIndex)
  const trainer = parseTrainer(v.trainer)
  const c = channel(v.channel)
  if (!options.some((option) => option.index === fallbackIndex) || (c === 'npc') !== (trainer.kind === 'NPC')) throw invalid()
  return { turnKey: text(v.turnKey, 500), channel: c, durationSeconds: integer(v.durationSeconds, 5, 120), trainer, pokemon: parsePokemon(v.pokemon), options, fallbackIndex }
}

function parseRound(value: unknown): AudienceRound {
  const v = object(value)
  const options = parseOptions(v.options)
  const winnerIndex = v.winnerIndex === null ? null : index(v.winnerIndex)
  if (!['open', 'closed', 'cancelled'].includes(String(v.status)) || !Array.isArray(v.counts) || v.counts.length !== 3) throw invalid()
  if (v.resolution !== null && !['majority', 'tie', 'no-votes', 'guest'].includes(String(v.resolution))) throw invalid()
  if ((v.channel === 'npc' && v.resolution === 'guest') || (v.channel === 'boss' && v.status === 'closed' && v.resolution !== 'guest')) throw invalid()
  if (v.status === 'closed' && (winnerIndex === null || !options.some((option) => option.index === winnerIndex) || v.resolution === null)) throw invalid()
  if (v.status !== 'closed' && (winnerIndex !== null || v.resolution !== null)) throw invalid()
  const openedAt = integer(v.openedAt)
  const deadlineAt = integer(v.deadlineAt, openedAt)
  return {
    id: text(v.id), turnKey: text(v.turnKey, 500), channel: channel(v.channel), status: v.status as AudienceRound['status'],
    openedAt, deadlineAt, closedAt: v.closedAt === null ? null : integer(v.closedAt, openedAt), trainer: parseTrainer(v.trainer),
    pokemon: parsePokemon(v.pokemon), options, counts: v.counts.map((n) => integer(n)) as [number, number, number],
    winnerIndex, resolution: v.resolution as AudienceRound['resolution'],
  }
}

export function validateAudienceJoinUrl(value: unknown, serviceUrl: string, sessionId: string, expectedChannel: 'npc' | 'boss'): string {
  const raw = text(value, 2000)
  let url: URL
  try { url = new URL(raw) } catch { throw invalid() }
  const fragment = new URLSearchParams(url.hash.slice(1))
  if (url.origin !== normalizeAudienceServiceUrl(serviceUrl) || url.username || url.password || url.search
    || url.pathname !== `/giochi/arkamon/vota/${sessionId}` || fragment.get('canale') !== expectedChannel
    || !/^[a-f0-9]{64}$/i.test(fragment.get('invito') ?? '')
    || [...fragment.keys()].some((key) => key !== 'canale' && key !== 'invito')) throw invalid()
  return raw
}

export function parseAudienceHostSnapshot(value: unknown, serviceUrl: string, expectedId?: string): AudienceHostSnapshot {
  const v = object(value)
  const sessionId = text(v.sessionId, 128)
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId) || (expectedId && sessionId !== expectedId)) throw invalid()
  const urls = object(v.joinUrls)
  const participants = object(v.participants)
  const guest = v.guest === undefined ? undefined : object(v.guest)
  if (guest && (guest.protocol !== 'private-guest-v1' || typeof guest.claimed !== 'boolean' || typeof guest.revoked !== 'boolean')) throw invalid()
  if (guest && (integer(participants.boss, 0, 1) !== (guest.claimed ? 1 : 0) || guest.claimed && guest.revoked)) throw invalid()
  return {
    sessionId, serverNow: integer(v.serverNow), expiresAt: integer(v.expiresAt),
    joinUrls: { npc: validateAudienceJoinUrl(urls.npc, serviceUrl, sessionId, 'npc'), boss: validateAudienceJoinUrl(urls.boss, serviceUrl, sessionId, 'boss') },
    participants: { npc: integer(participants.npc), boss: integer(participants.boss) }, round: v.round === null ? null : parseRound(v.round),
    ...(guest ? { guest: { protocol: 'private-guest-v1' as const, claimed: guest.claimed as boolean, revoked: guest.revoked as boolean, expiresAt: integer(guest.expiresAt), generation: integer(guest.generation) } } : {}),
  }
}

export function parseAudienceHostSession(value: unknown): AudienceHostSession | null {
  try {
    const v = object(value)
    const serviceUrl = normalizeAudienceServiceUrl(text(v.serviceUrl, 1000))
    const sessionId = text(v.sessionId, 128)
    const hostToken = text(v.hostToken, 64)
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId) || !/^[a-f0-9]{64}$/i.test(hostToken)) return null
    const expiresAt = integer(v.expiresAt)
    if (expiresAt <= Date.now()) return null
    const urls = object(v.joinUrls)
    return { serviceUrl, sessionId, hostToken, expiresAt,
      ...(v.guestProtocol === 'private-guest-v1' ? { guestProtocol: 'private-guest-v1' as const } : {}), joinUrls: {
      npc: validateAudienceJoinUrl(urls.npc, serviceUrl, sessionId, 'npc'), boss: validateAudienceJoinUrl(urls.boss, serviceUrl, sessionId, 'boss'),
    } }
  } catch { return null }
}

async function call(serviceUrl: string, path: string, options: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const origin = normalizeAudienceServiceUrl(serviceUrl)
  const issue = audienceConnectionIssue(origin)
  if (issue) throw new AudienceApiError(issue, 'MIXED_CONTENT')
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 8000)
  try {
    const response = await fetch(`${origin}/api/arkamon-votes${path}`, {
      ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    let body: unknown
    try { body = await response.json() } catch { throw invalid() }
    if (!response.ok) {
      const v = object(body)
      throw new AudienceApiError(typeof v.error === 'string' ? v.error.slice(0, 200) : 'Il collegamento non risponde. Riprova.', typeof v.code === 'string' ? v.code : 'SERVICE_ERROR', response.status)
    }
    return body
  } catch (error) {
    if (error instanceof AudienceApiError) throw error
    throw new AudienceApiError('Collegamento interrotto. Puoi riprovare oppure usare la scelta automatica.', controller.signal.aborted ? 'ABORTED' : 'NETWORK_ERROR')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export async function createAudienceSession(serviceUrl: string, password: string, signal?: AbortSignal): Promise<AudienceCreateResponse> {
  const value = object(await call(serviceUrl, '', { method: 'POST', body: JSON.stringify({ password }) }, signal))
  const snapshot = parseAudienceHostSnapshot(value, serviceUrl)
  const hostToken = text(value.hostToken, 64)
  if (!/^[a-f0-9]{64}$/i.test(hostToken)) throw invalid()
  return { ...snapshot, hostToken }
}

export async function getAudienceHost(session: AudienceHostSession, signal?: AbortSignal): Promise<AudienceHostSnapshot> {
  return parseAudienceHostSnapshot(await call(session.serviceUrl, `/${encodeURIComponent(session.sessionId)}/host`, {
    method: 'GET', headers: { Authorization: `Bearer ${session.hostToken}` },
  }, signal), session.serviceUrl, session.sessionId)
}

export async function openAudienceRound(session: AudienceHostSession, request: AudienceRoundRequest, signal?: AbortSignal): Promise<AudienceHostSnapshot> {
  return parseAudienceHostSnapshot(await call(session.serviceUrl, `/${encodeURIComponent(session.sessionId)}/round`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.hostToken}` }, body: JSON.stringify(validateAudienceRoundRequest(request)),
  }, signal), session.serviceUrl, session.sessionId)
}

export async function controlAudienceSession(session: AudienceHostSession, action: 'close' | 'cancel' | 'end' | 'renew-guest' | 'revoke-guest', roundId?: string, signal?: AbortSignal): Promise<AudienceHostSnapshot> {
  return parseAudienceHostSnapshot(await call(session.serviceUrl, `/${encodeURIComponent(session.sessionId)}/host`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.hostToken}` }, body: JSON.stringify({ action, ...(roundId ? { roundId } : {}) }),
  }, signal), session.serviceUrl, session.sessionId)
}
