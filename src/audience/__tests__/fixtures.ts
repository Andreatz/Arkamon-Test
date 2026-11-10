import type { AudienceHostSession, AudienceHostSnapshot, AudienceRound, AudienceRoundRequest } from '../types'

export const serviceUrl = 'https://vota.example'
export const hostToken = 'a'.repeat(64)
export const sessionId = 'session-12345678'
export const invitation = (channel: 'npc' | 'boss', id = sessionId) => `${serviceUrl}/giochi/arkamon/vota/${id}#canale=${channel}&invito=${(channel === 'npc' ? 'b' : 'c').repeat(64)}`
export const joinUrls = { npc: invitation('npc'), boss: invitation('boss') }
export const session: AudienceHostSession = { serviceUrl, sessionId, hostToken, expiresAt: 86_600_000, joinUrls }
export const request: AudienceRoundRequest = {
  turnKey: 'battle-123:turn-1:arkamon-1', channel: 'npc', durationSeconds: 15,
  trainer: { name: 'Allenatore rivale', kind: 'NPC' }, pokemon: { instanceId: 'arkamon-1', speciesId: 8, name: 'Vyrath', level: 6 },
  options: [
    { index: 0, moveId: 1, name: 'Artiglio', type: 'Normale', description: 'Attacco fisico' },
    { index: 1, moveId: 2, name: 'Fiammata', type: 'Fuoco', description: 'Attacco di fuoco' },
    { index: 2, moveId: 3, name: 'Veleno', type: 'Veleno', description: 'Applica veleno' },
  ], fallbackIndex: 0,
}
export const round: AudienceRound = {
  id: 'round-123', turnKey: request.turnKey, channel: 'npc', status: 'open', openedAt: 200_000, deadlineAt: 215_000,
  closedAt: null, trainer: request.trainer, pokemon: request.pokemon, options: request.options, counts: [1, 3, 0], winnerIndex: null, resolution: null,
}
export const snapshot: AudienceHostSnapshot = { sessionId, serverNow: 200_000, expiresAt: session.expiresAt, joinUrls, participants: { npc: 4, boss: 2 }, round }
export function closedSnapshot(winnerIndex: 0 | 1 | 2 = 1): AudienceHostSnapshot {
  return { ...snapshot, serverNow: 215_000, round: { ...round, status: 'closed', closedAt: 215_000, winnerIndex, resolution: 'majority' } }
}
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
export function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
