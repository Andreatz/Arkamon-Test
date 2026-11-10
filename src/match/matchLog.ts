export const MATCH_LOG_LIMIT = 600
// A corrupted imported counter must never reach unsafe integer arithmetic.
const MAX_MATCH_SEQUENCE = 1_000_000_000
export const MATCH_EVENT_KINDS = ['start', 'starter', 'move', 'interaction', 'battle', 'capture', 'evolution', 'shop', 'deposit', 'level', 'team', 'challenge'] as const
export type MatchEventKind = typeof MATCH_EVENT_KINDS[number]

export interface MatchEvent {
  id: string
  sequence: number
  /** Unix milliseconds: portable dates independent of the importing device's locale. */
  at: number
  kind: MatchEventKind
  playerId?: 1 | 2
  title: string
  message: string
  place?: string
  speciesId?: number
  battleId?: string
  amount?: number
}
export interface MatchLog { version: 1; nextSequence: number; events: MatchEvent[] }
export type MatchEventInput = Omit<MatchEvent, 'id' | 'sequence' | 'at'> & { id?: string }

export const MATCH_EVENT_LABELS: Record<MatchEventKind, string> = {
  start: 'Partita', starter: 'Starter', move: 'Spostamento', interaction: 'Interazione', battle: 'Battaglia',
  capture: 'Cattura', evolution: 'Evoluzione', shop: 'Arkastore', deposit: 'Deposito', level: 'Livello', team: 'Squadra', challenge: 'Sfida',
}

export function emptyMatchLog(): MatchLog { return { version: 1, nextSequence: 1, events: [] } }

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
const shortText = (value: unknown, limit: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : undefined
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Damaged or older saves have an empty log; historical actions are never fabricated. */
export function normalizeMatchLog(value: unknown): MatchLog {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.events)) return emptyMatchLog()
  const events: MatchEvent[] = [], usedIds = new Set<string>(), usedSequences = new Set<number>()
  // Bound the work even for an oversized imported history.
  for (const raw of value.events.slice(-MATCH_LOG_LIMIT * 2)) {
    if (!record(raw)) continue
    const id = shortText(raw.id, 160), title = shortText(raw.title, 180), message = shortText(raw.message, 1200)
    if (!id || !title || !message || !finite(raw.sequence) || !Number.isSafeInteger(raw.sequence) || raw.sequence < 1 || raw.sequence >= MAX_MATCH_SEQUENCE
      || !finite(raw.at) || raw.at < 0 || raw.at > 8.64e15 || !MATCH_EVENT_KINDS.includes(raw.kind as MatchEventKind)
      || raw.playerId !== undefined && raw.playerId !== 1 && raw.playerId !== 2 || usedIds.has(id) || usedSequences.has(raw.sequence)) continue
    usedIds.add(id); usedSequences.add(raw.sequence)
    const place = shortText(raw.place, 100), battleId = shortText(raw.battleId, 160)
    events.push({ id, sequence: raw.sequence, at: raw.at, kind: raw.kind as MatchEventKind, title, message,
      ...(raw.playerId === undefined ? {} : { playerId: raw.playerId as 1 | 2 }),
      ...(place ? { place } : {}), ...(battleId ? { battleId } : {}),
      ...(finite(raw.speciesId) && Number.isInteger(raw.speciesId) && raw.speciesId >= 1 && raw.speciesId <= 110 ? { speciesId: raw.speciesId } : {}),
      ...(finite(raw.amount) ? { amount: raw.amount } : {}),
    })
  }
  events.sort((a, b) => a.sequence - b.sequence)
  const latestSequence = events[events.length - 1]?.sequence ?? 0
  const nextSequence = finite(value.nextSequence) && Number.isSafeInteger(value.nextSequence) && value.nextSequence > latestSequence && value.nextSequence < MAX_MATCH_SEQUENCE
    ? value.nextSequence : latestSequence + 1
  const retained = events.slice(-MATCH_LOG_LIMIT)
  // A valid final sequence at the import limit must not strand the register.
  // Preserve identity, chronology and event contents while restarting ordinals.
  if (nextSequence >= MAX_MATCH_SEQUENCE) return {
    version: 1, nextSequence: retained.length + 1,
    events: retained.map((event, index) => ({ ...event, sequence: index + 1 })),
  }
  return { version: 1, nextSequence, events: retained }
}

/** Explicit IDs make repeated settlement/checkpoint writes harmless. Never uses gameplay RNG. */
export function appendMatchEvent(log: MatchLog, input: MatchEventInput, at = Date.now()): MatchLog {
  if (input.id && log.events.some((event) => event.id === input.id)) return log
  const source = !Number.isSafeInteger(log.nextSequence) || log.nextSequence < 1 || log.nextSequence >= MAX_MATCH_SEQUENCE
    ? normalizeMatchLog(log) : log
  const sequence = source.nextSequence
  let generatedId = `match-${sequence}`
  let suffix = 0
  while (!input.id && source.events.some((event) => event.id === generatedId)) generatedId = `match-${sequence}-${++suffix}`
  const event = { ...input, id: input.id ?? generatedId, sequence, at }
  const normalized = normalizeMatchLog({ version: 1, nextSequence: sequence + 1, events: [...source.events, event] })
  return normalized.events.some((entry) => entry.id === event.id) ? normalized : log
}

export function filterMatchEvents(log: MatchLog, options: {
  playerId?: 1 | 2 | 'all'; kind?: MatchEventKind | 'all'; search?: string
} = {}): MatchEvent[] {
  const search = options.search?.trim().toLocaleLowerCase('it-IT') ?? ''
  return log.events.filter((event) => (!options.playerId || options.playerId === 'all' || event.playerId === undefined || event.playerId === options.playerId)
    && (!options.kind || options.kind === 'all' || event.kind === options.kind)
    && (!search || `${event.title} ${event.message} ${event.place ?? ''}`.toLocaleLowerCase('it-IT').includes(search)))
}

export function matchEventsAsText(events: MatchEvent[]): string {
  return ['Registro del match · Arkamon', ...events.map((event) =>
    `\n#${event.sequence} · ${new Date(event.at).toISOString()} · ${event.playerId ? `Giocatore ${event.playerId}` : 'Partita'} · ${MATCH_EVENT_LABELS[event.kind]}\n${event.title}${event.place ? ` · ${event.place.replace(/_/g, ' ')}` : ''}\n${event.message}`)].join('\n')
}

export function matchEventsAsJson(events: MatchEvent[]): string {
  return JSON.stringify({ format: 'arkamon-match-register', version: 1, events }, null, 2)
}
