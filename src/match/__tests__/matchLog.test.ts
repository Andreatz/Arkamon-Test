import { describe, expect, it } from 'vitest'
import {
  MATCH_LOG_LIMIT, appendMatchEvent, emptyMatchLog, filterMatchEvents, matchEventsAsJson,
  matchEventsAsText, normalizeMatchLog,
} from '../matchLog'

describe('Campaign match register', () => {
  it('does not invent a history when importing legacy saves', () => {
    expect(normalizeMatchLog(undefined)).toEqual(emptyMatchLog())
    expect(normalizeMatchLog({ version: 99, events: [] })).toEqual(emptyMatchLog())
  })

  it('records events without mutating the previous log and deduplicates repeated battle settlements', () => {
    const initial = emptyMatchLog()
    const updated = appendMatchEvent(initial, { id: 'battle-7-outcome', kind: 'battle', playerId: 1, title: 'Vittoria', message: 'Allenatore sconfitto.', battleId: 'battle-7', amount: 200 }, 1000)
    expect(initial.events).toEqual([])
    expect(updated.nextSequence).toBe(2)
    expect(updated.events[0]).toMatchObject({ sequence: 1, at: 1000, battleId: 'battle-7', amount: 200 })
    expect(appendMatchEvent(updated, { id: 'battle-7-outcome', kind: 'battle', playerId: 1, title: 'Vittoria', message: 'Allenatore sconfitto.' }, 2000)).toBe(updated)
  })

  it('caps history while retaining monotonically increasing event numbers', () => {
    let log = emptyMatchLog()
    for (let index = 0; index < MATCH_LOG_LIMIT + 3; index++) log = appendMatchEvent(log, { kind: 'move', playerId: 1, title: 'Spostamento', message: 'Passaggio in città.' }, index)
    expect(log.events).toHaveLength(MATCH_LOG_LIMIT)
    expect(log.events[0].sequence).toBe(4)
    expect(log.events[log.events.length - 1].sequence).toBe(MATCH_LOG_LIMIT + 3)
    expect(log.nextSequence).toBe(MATCH_LOG_LIMIT + 4)
  })

  it('validates imported events and preserves their chronology', () => {
    const event = appendMatchEvent(emptyMatchLog(), { kind: 'start', title: 'Nuova partita', message: 'Campagna avviata.' }, 50).events[0]
    const normalized = normalizeMatchLog({ version: 1, nextSequence: 1, events: [
      { ...event, id: 'second', sequence: 2, at: 10 }, event, event,
      { ...event, id: 'invalid-player', playerId: 3, sequence: 3 },
      { ...event, id: 'invalid-time', at: Infinity, sequence: 4 },
      { ...event, id: 'invalid-kind', kind: 'password', sequence: 5 },
      { ...event, id: 'invalid-sequence', sequence: 1.2 },
    ] })
    expect(normalized.events.map((entry) => entry.id)).toEqual(['match-1', 'second'])
    expect(normalized.nextSequence).toBe(3)
  })

  it('bounds imported text and drops unsupported extra fields', () => {
    const normalized = normalizeMatchLog({ version: 1, events: [{ id: 'oversized', kind: 'shop', sequence: 1, at: 1, title: 'x'.repeat(1000), message: 'm'.repeat(10000), privateToken: 'secret', speciesId: 999, amount: NaN }] })
    expect(normalized.events[0].title).toHaveLength(180)
    expect(normalized.events[0].message).toHaveLength(1200)
    expect(normalized.events[0]).not.toHaveProperty('privateToken')
    expect(normalized.events[0]).not.toHaveProperty('speciesId')
    expect(normalized.events[0]).not.toHaveProperty('amount')
  })

  it('rejects invalid newly appended events without advancing the counter', () => {
    const initial = emptyMatchLog()
    expect(appendMatchEvent(initial, { kind: 'move', title: '', message: 'Not shown' }, 1)).toBe(initial)
    expect(appendMatchEvent(initial, { kind: 'move', title: 'Title', message: 'Message' }, NaN)).toBe(initial)
  })

  it('repairs corrupted unsafe counters and avoids imported IDs colliding with generated IDs', () => {
    expect(normalizeMatchLog({ version: 1, nextSequence: Number.MAX_SAFE_INTEGER, events: [] }).nextSequence).toBe(1)
    const existing = appendMatchEvent(emptyMatchLog(), { id: 'match-2', kind: 'start', title: 'Partita', message: 'Campagna avviata.' }, 1)
    const next = appendMatchEvent(existing, { kind: 'move', title: 'Spostamento', message: 'Percorso raggiunto.' }, 2)
    expect(next.events).toHaveLength(2)
    expect(next.events[1].id).toBe('match-2-1')
    expect(next.nextSequence).toBe(3)
  })

  it('keeps an imported boundary event and continues recording instead of freezing the register', () => {
    const prior = appendMatchEvent(emptyMatchLog(), { id: 'prior', kind: 'start', title: 'Partita', message: 'Campagna avviata.' }, 1).events[0]
    const restored = normalizeMatchLog({ version: 1, nextSequence: 1_000_000_000, events: [{ ...prior, sequence: 999_999_999 }] })
    const updated = appendMatchEvent(restored, { kind: 'move', title: 'Spostamento', message: 'Venezia raggiunta.' }, 2)
    expect(updated.events).toHaveLength(2)
    expect(updated.events[0]).toMatchObject({ id: 'prior', at: 1, title: 'Partita' })
    expect(updated.events[1]).toMatchObject({ kind: 'move', at: 2 })
    expect(updated.nextSequence).toBeGreaterThan(updated.events[1].sequence)
  })

  it('rolls over at the boundary without losing a newly committed event or its explicit identity', () => {
    const prior = appendMatchEvent(emptyMatchLog(), { id: 'prior', kind: 'start', title: 'Partita', message: 'Campagna avviata.' }, 1).events[0]
    const restored = normalizeMatchLog({ version: 1, nextSequence: 999_999_999, events: [{ ...prior, sequence: 999_999_998 }] })
    const first = appendMatchEvent(restored, { id: 'capture-final', kind: 'capture', title: 'Cattura', message: 'Arkamon ottenuto.' }, 2)
    const second = appendMatchEvent(first, { kind: 'move', title: 'Spostamento', message: 'Percorso raggiunto.' }, 3)
    expect(second.events.map((event) => event.id)).toEqual(['prior', 'capture-final', 'match-3'])
    expect(second.events.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(second.events.map((event) => event.at)).toEqual([1, 2, 3])
    expect(appendMatchEvent(second, { id: 'capture-final', kind: 'capture', title: 'Cattura', message: 'Replay dello stesso evento.' }, 4)).toBe(second)
  })

  it('includes campaign events in individual filters but never the other player actions', () => {
    let log = appendMatchEvent(emptyMatchLog(), { kind: 'start', title: 'Partita', message: 'Campagna avviata' }, 1)
    log = appendMatchEvent(log, { kind: 'move', playerId: 1, title: 'Venezia', message: 'Spostamento verso Piacenza', place: 'Percorso_1' }, 2)
    log = appendMatchEvent(log, { kind: 'shop', playerId: 2, title: 'Acquisto', message: 'Masterball acquistata' }, 3)
    expect(filterMatchEvents(log, { playerId: 1 }).map((event) => event.kind)).toEqual(['start', 'move'])
    expect(filterMatchEvents(log, { playerId: 2, kind: 'shop' })).toHaveLength(1)
    expect(filterMatchEvents(log, { search: ' percorso_1 ' })).toHaveLength(1)
  })

  it('exports stable event IDs, real dates and the selected history without other actions', () => {
    const log = appendMatchEvent(emptyMatchLog(), { id: 'capture-17', kind: 'capture', playerId: 2, title: 'Cattura', message: 'Arkamon ottenuto.', place: 'Percorso_1', speciesId: 17 }, Date.UTC(2026, 9, 10, 12))
    const text = matchEventsAsText(log.events)
    expect(text).toContain('2026-10-10T12:00:00.000Z')
    expect(text).toContain('Giocatore 2')
    expect(text).toContain('Percorso 1')
    const json = JSON.parse(matchEventsAsJson(log.events))
    expect(json.format).toBe('arkamon-match-register')
    expect(json.events).toEqual(log.events)
  })
})
