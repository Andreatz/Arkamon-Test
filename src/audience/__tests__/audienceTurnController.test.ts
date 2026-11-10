import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudienceApiError } from '../audienceApi'
import { AudienceTurnController, audienceRoundMatchesRequest } from '../audienceTurnController'
import type { AudienceTurnDependencies, AudienceTurnState } from '../audienceTurnController'
import type { AudienceHostSnapshot } from '../types'
import { closedSnapshot, deferred, request, round, session, snapshot } from './fixtures'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(50_000) })
afterEach(() => vi.useRealTimers())

function setup(overrides: Partial<AudienceTurnDependencies> = {}) {
  const update = vi.fn<(state: AudienceTurnState) => void>()
  const accept = vi.fn()
  const ended = vi.fn()
  const dependencies: AudienceTurnDependencies = {
    open: vi.fn().mockResolvedValue(snapshot), get: vi.fn().mockResolvedValue(snapshot),
    control: vi.fn().mockResolvedValue(closedSnapshot()), now: Date.now, ...overrides,
  }
  const controller = new AudienceTurnController(session, request, update, accept, ended, dependencies)
  return { controller, dependencies, update, accept, ended, state: () => update.mock.calls[update.mock.calls.length - 1]?.[0] }
}

describe('votazione del turno avversario', () => {
  it('calcola il conto alla rovescia dal server e consegna la mossa vincitrice dopo la chiusura', async () => {
    const test = setup({ get: vi.fn().mockResolvedValue(closedSnapshot()) })
    await test.controller.start()
    expect(test.state()).toMatchObject({ status: 'open', remainingMs: 15_000, turnKey: request.turnKey })
    await vi.advanceTimersByTimeAsync(1000)
    expect(test.state()).toMatchObject({ status: 'closed', remainingMs: 0, round: { winnerIndex: 1 } })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(test.dependencies.get).toHaveBeenCalledTimes(1)
    test.controller.dispose()
  })
  it('alla ripresa usa la scadenza originale senza azzerare voti o tempo', async () => {
    const test = setup({ open: vi.fn().mockResolvedValue({ ...snapshot, serverNow: 210_000 }) })
    await test.controller.start()
    expect(test.state()).toMatchObject({ remainingMs: 5000, round: { counts: [1, 3, 0], deadlineAt: 215_000 } })
    expect(test.dependencies.open).toHaveBeenCalledWith(session, request, expect.any(AbortSignal))
    test.controller.dispose()
  })
  it('ignora una risposta tardiva dopo la sostituzione del turno o lo smontaggio', async () => {
    const pending = deferred<AudienceHostSnapshot>()
    const test = setup({ open: vi.fn().mockReturnValue(pending.promise) })
    const operation = test.controller.start()
    test.controller.dispose()
    pending.resolve(closedSnapshot())
    await operation
    expect(test.state()?.status).toBe('opening')
    expect(test.accept).not.toHaveBeenCalled()
    expect(test.dependencies.control).not.toHaveBeenCalled()
  })
  it('un retry supera una vecchia risposta senza alterare l’esito già ricevuto', async () => {
    const pending = deferred<AudienceHostSnapshot>()
    const opener = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(closedSnapshot(2))
    const test = setup({ open: opener })
    const first = test.controller.start()
    await test.controller.start()
    pending.resolve(snapshot)
    await first
    expect(test.state()).toMatchObject({ status: 'closed', round: { winnerIndex: 2 } })
    expect(test.accept).toHaveBeenCalledTimes(1)
    test.controller.dispose()
  })
  it.each([
    { ...round, turnKey: 'another-turn' },
    { ...round, pokemon: { ...round.pokemon, instanceId: 'another-pokemon' } },
    { ...round, channel: 'boss' as const },
    { ...round, options: round.options.map((move) => ({ ...move, moveId: move.moveId + 10 })) },
  ])('non applica una risposta di un altro turno, Arkamon, canale o insieme di mosse', async (other) => {
    const test = setup({ open: vi.fn().mockResolvedValue({ ...snapshot, round: other }) })
    await test.controller.start()
    expect(test.state()).toMatchObject({ status: 'error', round: null })
    expect(test.accept).not.toHaveBeenCalled()
    expect(audienceRoundMatchesRequest(other, request)).toBe(false)
    test.controller.dispose()
  })
  it('se il collegamento cade offre il retry e riprende la stessa votazione', async () => {
    const getter = vi.fn().mockRejectedValue(new AudienceApiError('Collegamento interrotto', 'NETWORK_ERROR'))
    const opener = vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, serverNow: 207_000 })
    const test = setup({ get: getter, open: opener })
    await test.controller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(test.state()?.status).toBe('error')
    await test.controller.start()
    expect(test.state()).toMatchObject({ status: 'open', remainingMs: 8000 })
    test.controller.dispose()
  })
  it('revoca il collegamento dopo la scadenza e non sceglie una mossa', async () => {
    const test = setup({ open: vi.fn().mockRejectedValue(new AudienceApiError('Scaduto', 'SESSION_EXPIRED', 410)) })
    await test.controller.start()
    expect(test.state()).toMatchObject({ status: 'error', round: null })
    expect(test.ended).toHaveBeenCalledOnce()
    test.controller.dispose()
  })
  it('chiudere in anticipo ignora un poll precedente ancora in viaggio', async () => {
    const late = deferred<AudienceHostSnapshot>()
    const test = setup({ get: vi.fn().mockReturnValue(late.promise) })
    await test.controller.start()
    await vi.advanceTimersByTimeAsync(1000)
    await test.controller.closeEarly()
    late.resolve(snapshot)
    await Promise.resolve(); await Promise.resolve()
    expect(test.dependencies.control).toHaveBeenCalledWith(session, 'close', round.id, expect.any(AbortSignal))
    expect(test.state()).toMatchObject({ status: 'closed', round: { winnerIndex: 1 } })
    test.controller.dispose()
  })
  it('impedisce richieste duplicate mentre la chiusura remota è ancora in viaggio', async () => {
    const closing = deferred<AudienceHostSnapshot>()
    const test = setup({ control: vi.fn().mockReturnValue(closing.promise) })
    await test.controller.start()
    const first = test.controller.closeEarly()
    expect(test.state()?.status).toBe('closing')
    await test.controller.closeEarly()
    expect(test.dependencies.control).toHaveBeenCalledTimes(1)
    closing.resolve(closedSnapshot())
    await first
    expect(test.state()).toMatchObject({ status: 'closed', round: { winnerIndex: 1 } })
    test.controller.dispose()
  })
  it('l’annullamento trova solo il ballot della richiesta originale', async () => {
    const test = setup({ get: vi.fn().mockResolvedValue({ ...snapshot, round: { ...round, turnKey: 'another-battle' } }) })
    await test.controller.cancel()
    expect(test.dependencies.control).not.toHaveBeenCalled()
    expect(test.state()?.status).toBe('idle')
    test.controller.dispose()
  })
  it('recupera una apertura senza risposta prima di annullare, senza ripartire la scadenza', async () => {
    const test = setup({ get: vi.fn().mockResolvedValue({ ...snapshot, round: null }), control: vi.fn().mockResolvedValue({ ...snapshot, round: { ...round, status: 'cancelled', closedAt: 201_000 } }) })
    await test.controller.cancel()
    expect(test.dependencies.open).toHaveBeenCalledWith(session, request, expect.any(AbortSignal))
    expect(test.dependencies.control).toHaveBeenCalledWith(session, 'cancel', round.id, expect.any(AbortSignal))
    expect(test.state()?.status).toBe('idle')
    test.controller.dispose()
  })
  it('annulla il turno remoto anche se il ripiego smonta la votazione durante il recupero dell’apertura', async () => {
    const opening = deferred<AudienceHostSnapshot>()
    const recovering = deferred<AudienceHostSnapshot>()
    const test = setup({
      open: vi.fn().mockReturnValue(opening.promise),
      get: vi.fn().mockImplementation((_session, signal?: AbortSignal) => {
        signal?.addEventListener('abort', () => recovering.reject(new AudienceApiError('Interrotto', 'ABORTED')), { once: true })
        return recovering.promise
      }),
      control: vi.fn().mockResolvedValue({ ...snapshot, round: { ...round, status: 'cancelled', closedAt: 201_000 } }),
    })
    const starting = test.controller.start()
    const cancelling = test.controller.cancel()
    test.controller.dispose()
    // The server may have accepted the opening even though its response was lost.
    recovering.resolve(snapshot)
    opening.resolve(snapshot)
    await Promise.all([starting, cancelling])
    expect(test.dependencies.control).toHaveBeenCalledWith(session, 'cancel', round.id, expect.any(AbortSignal))
    expect(test.accept).not.toHaveBeenCalled()
    expect(test.state()?.status).toBe('opening')
  })
})
