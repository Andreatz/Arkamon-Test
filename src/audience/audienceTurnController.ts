import { AudienceApiError, controlAudienceSession, getAudienceHost, openAudienceRound, validateAudienceRoundRequest } from './audienceApi'
import { audienceErrorMessage, audienceSessionEnded } from './useAudienceStore'
import type { AudienceHostSession, AudienceHostSnapshot, AudienceRound, AudienceRoundRequest, AudienceTurnStatus } from './types'

export interface AudienceTurnState {
  round: AudienceRound | null
  status: AudienceTurnStatus
  remainingMs: number
  error: string | null
  turnKey: string | null
}

export const idleAudienceTurn: AudienceTurnState = { round: null, status: 'idle', remainingMs: 0, error: null, turnKey: null }

export function audienceRoundMatchesRequest(round: AudienceRound, request: AudienceRoundRequest): boolean {
  return round.turnKey === request.turnKey && round.channel === request.channel && round.pokemon.instanceId === request.pokemon.instanceId
    && round.pokemon.speciesId === request.pokemon.speciesId && round.pokemon.level === request.pokemon.level
    && round.trainer.kind === request.trainer.kind && round.trainer.name === request.trainer.name
    && round.options.length === request.options.length && request.options.every((option) => round.options.some((actual) => actual.index === option.index
      && actual.moveId === option.moveId && actual.name === option.name && actual.type === option.type && actual.description === option.description))
}

export interface AudienceTurnDependencies {
  open: typeof openAudienceRound
  get: typeof getAudienceHost
  control: typeof controlAudienceSession
  now(): number
}
const defaultDependencies: AudienceTurnDependencies = { open: openAudienceRound, get: getAudienceHost, control: controlAudienceSession, now: Date.now }

export async function cancelAudienceRequest(session: AudienceHostSession, request: AudienceRoundRequest): Promise<AudienceHostSnapshot> {
  let snapshot = await getAudienceHost(session)
  // Recover the exact idempotent ballot even when its opening response was lost.
  if (!snapshot.round || (snapshot.round.status !== 'open' && !audienceRoundMatchesRequest(snapshot.round, request))) {
    snapshot = await openAudienceRound(session, request)
  }
  if (snapshot.round && audienceRoundMatchesRequest(snapshot.round, request) && snapshot.round.status === 'open') {
    return controlAudienceSession(session, 'cancel', snapshot.round.id)
  }
  return snapshot
}

/** A disposable polling client. Disposing never cancels a ballot on the server. */
export class AudienceTurnController {
  private state: AudienceTurnState
  private disposed = false
  private revision = 0
  private abort: AbortController | null = null
  private nextPoll: ReturnType<typeof setTimeout> | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private clockOffset = 0

  constructor(
    private readonly session: AudienceHostSession,
    private readonly request: AudienceRoundRequest,
    private readonly update: (state: AudienceTurnState) => void,
    private readonly acceptSnapshot: (snapshot: AudienceHostSnapshot) => void,
    private readonly ended: () => void,
    private readonly dependencies = defaultDependencies,
  ) {
    this.state = { ...idleAudienceTurn, turnKey: request.turnKey }
  }

  private publish(patch: Partial<AudienceTurnState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.update(this.state)
  }
  private clearTimers() {
    if (this.nextPoll) clearTimeout(this.nextPoll)
    if (this.ticker) clearInterval(this.ticker)
    this.nextPoll = null
    this.ticker = null
  }
  private current(revision: number): boolean { return !this.disposed && revision === this.revision }
  private apply(snapshot: AudienceHostSnapshot) {
    if (snapshot.sessionId !== this.session.sessionId) throw new AudienceApiError('Il collegamento è cambiato. Riprendi dal turno corrente.', 'STALE_SESSION')
    if (snapshot.expiresAt <= snapshot.serverNow) throw new AudienceApiError('Il collegamento con il pubblico è scaduto.', 'SESSION_EXPIRED', 410)
    const round = snapshot.round
    if (!round || !audienceRoundMatchesRequest(round, this.request)) throw new AudienceApiError('Questa risposta appartiene a un altro turno. Riprova oppure usa la scelta automatica.', 'STALE_ROUND')
    this.clockOffset = snapshot.serverNow - this.dependencies.now()
    this.acceptSnapshot(snapshot)
    if (round.status === 'cancelled') throw new AudienceApiError(this.request.channel === 'boss'
      ? 'L’attesa dell’ospite è terminata o l’invito è stato revocato. La regia può scegliere esplicitamente come proseguire.'
      : 'La votazione è stata annullata. Puoi usare la scelta automatica.', 'ROUND_CANCELLED')
    this.publish({ round, status: round.status, remainingMs: round.status === 'open' ? Math.max(0, round.deadlineAt - snapshot.serverNow) : 0, error: null })
    this.clearTimers()
    if (round.status === 'open') {
      this.ticker = setInterval(() => this.publish({ remainingMs: Math.max(0, round.deadlineAt - this.dependencies.now() - this.clockOffset) }), 200)
      this.nextPoll = setTimeout(() => { void this.poll() }, 1000)
    }
  }
  private fail(error: unknown) {
    this.clearTimers()
    this.publish({ status: 'error', error: audienceErrorMessage(error) })
    if (audienceSessionEnded(error)) this.ended()
  }

  async start(): Promise<void> {
    const revision = ++this.revision
    this.abort?.abort()
    this.clearTimers()
    this.abort = new AbortController()
    this.publish({ status: 'opening', error: null })
    try {
      validateAudienceRoundRequest(this.request)
      const snapshot = await this.dependencies.open(this.session, this.request, this.abort.signal)
      if (this.current(revision)) this.apply(snapshot)
    } catch (error) { if (this.current(revision)) this.fail(error) }
  }

  private async poll(): Promise<void> {
    const revision = this.revision
    if (this.disposed) return
    try {
      const snapshot = await this.dependencies.get(this.session, this.abort?.signal)
      if (this.current(revision)) this.apply(snapshot)
    } catch (error) { if (this.current(revision)) this.fail(error) }
  }

  async closeEarly(): Promise<void> {
    if (this.state.status !== 'open' || !this.state.round) return
    const roundId = this.state.round.id
    const revision = ++this.revision
    this.abort?.abort()
    this.abort = new AbortController()
    this.clearTimers()
    // A slow response must not leave the close command active or send it twice.
    this.publish({ status: 'closing', error: null })
    try {
      const snapshot = await this.dependencies.control(this.session, 'close', roundId, this.abort.signal)
      if (this.current(revision)) this.apply(snapshot)
    } catch (error) { if (this.current(revision)) this.fail(error) }
  }

  async cancel(): Promise<void> {
    const roundId = this.state.round?.id
    const revision = ++this.revision
    this.abort?.abort()
    this.abort = null
    this.clearTimers()
    // Fallback immediately unmounts this client. The remote cancellation must
    // outlive that cleanup, while its response can no longer update a disposed UI.
    // API calls still have their own bounded network timeout.
    const cancellation = new AbortController()
    try {
      // Find an opening round before cancelling: never cancel another battle's ballot.
      const snapshot = roundId ? null : await this.dependencies.get(this.session, cancellation.signal)
      let round = snapshot?.round
      if (!roundId && (!round || (round.status !== 'open' && !audienceRoundMatchesRequest(round, this.request)))) {
        const recovered = await this.dependencies.open(this.session, this.request, cancellation.signal)
        round = recovered.round
      }
      const id = roundId ?? (round && audienceRoundMatchesRequest(round, this.request) ? round.id : undefined)
      if (id) {
        const result = await this.dependencies.control(this.session, 'cancel', id, cancellation.signal)
        if (this.current(revision)) this.acceptSnapshot(result)
      }
      if (this.current(revision)) this.publish({ ...idleAudienceTurn, turnKey: this.request.turnKey })
    } catch (error) { if (this.current(revision)) this.fail(error) }
  }

  dispose(): void {
    this.disposed = true
    ++this.revision
    this.abort?.abort()
    this.clearTimers()
  }
}
