import { describe, expect, it } from 'vitest'
import { SessionCoordinator, SESSION_LEASE_KEY, SESSION_LEASE_MS, SessionWriteDenied, type CampaignLocks } from './sessionCoordinator'

function memoryDisk() {
  const values = new Map<string, string>()
  let blocked = false
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (blocked) throw new Error('Quota exceeded'); values.set(key, value) },
    removeItem: (key: string) => { if (blocked) throw new Error('Quota exceeded'); values.delete(key) },
    block: (value: boolean) => { blocked = value },
  }
}
function webLocks(): CampaignLocks {
  let owner = false
  return { request: async (_name, _options, callback) => {
    if (owner) { await callback(null); return }
    owner = true
    try { await callback({}) } finally { owner = false }
  } }
}
const key = 'arkamon-save'
const envelope = (name: string, coins = 0) => JSON.stringify({ state: { name, coins }, version: 0 })
const settle = () => Promise.resolve()
function coordinator(disk: ReturnType<typeof memoryDisk>, token: string, locks?: CampaignLocks, extra = {}) {
  const session = new SessionCoordinator({ storage: disk, token, locks, settle, ...extra })
  session.setHydration(() => { session.read(key); session.read('challenge') })
  return session
}

describe('exclusive campaign writer and durable revision fencing', () => {
  it('allows only one owner and prevents a stale tab from overwriting newer progress', async () => {
    const disk = memoryDisk(), locks = webLocks()
    disk.setItem(key, envelope('Originale'))
    const a = coordinator(disk, 'a', locks), b = coordinator(disk, 'b', locks)
    expect(await a.acquire()).toBe(true)
    expect(await b.acquire()).toBe(false)
    a.write(key, envelope('Nome aggiornato', 50))
    const saved = disk.getItem(key)
    expect(() => b.write(key, envelope('Originale', 100))).toThrow(SessionWriteDenied)
    expect(disk.getItem(key)).toBe(saved)
    expect(b.getSnapshot().mode).toBe('readonly')
    a.release(); b.release()
  })
  it('hydrates the latest checkpoint before enabling a new owner after release', async () => {
    const disk = memoryDisk(), locks = webLocks()
    disk.setItem(key, envelope('Initial'))
    const a = coordinator(disk, 'a', locks), b = coordinator(disk, 'b', locks)
    await a.acquire(); a.write(key, envelope('Latest', 234)); await a.release()
    let hydrated: string | null = null, writableDuringHydration = true
    b.setHydration(() => { hydrated = b.read(key); writableDuringHydration = b.canWrite() })
    expect(await b.acquire()).toBe(true)
    expect(JSON.parse(hydrated!).state).toEqual({ name: 'Latest', coins: 234 })
    expect(writableDuringHydration).toBe(false)
    b.write(key, envelope('Latest', 235))
    expect(JSON.parse(disk.getItem(key)!).arkamonSession).toMatchObject({ revision: 2, writer: 'b' })
    expect(() => a.write(key, envelope('Initial'))).toThrow(SessionWriteDenied)
    b.release()
  })
  it('atomically fences external checkpoint changes and requires explicit resynchronisation', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    await session.acquire(); session.write(key, envelope('Local'))
    disk.setItem(key, envelope('External', 72))
    expect(() => session.write(key, envelope('Stale'))).toThrow(SessionWriteDenied)
    expect(session.getSnapshot().mode).toBe('conflict')
    expect(JSON.parse(disk.getItem(key)!).state.name).toBe('External')
    expect(await session.acquire()).toBe(true)
    session.write(key, envelope('External', 73))
    expect(JSON.parse(disk.getItem(key)!).state.coins).toBe(73)
    session.release()
  })
  it('does not advance the revision when the disk fails, so the same durable action can retry', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    await session.acquire(); disk.block(true)
    expect(() => session.write(key, envelope('Retry'))).toThrow('Quota exceeded')
    expect(session.getSnapshot().revision).toBe(0)
    disk.block(false); session.write(key, envelope('Retry'))
    expect(JSON.parse(disk.getItem(key)!).arkamonSession.revision).toBe(1)
    session.release()
  })
  it('preserves old envelopes and fences recovery/removal of a separately stored challenge', async () => {
    const disk = memoryDisk(); disk.setItem(key, envelope('Legacy')); disk.setItem('challenge', envelope('Attempt'))
    const session = coordinator(disk, 'owner', webLocks())
    await session.acquire()
    expect(disk.getItem(key)).toBe(envelope('Legacy'))
    session.write('challenge', envelope('Attempt', 1)); session.remove('challenge')
    expect(disk.getItem('challenge')).toBeNull()
    disk.setItem('challenge', envelope('Unexpected attempt'))
    expect(() => session.remove('challenge')).toThrow(SessionWriteDenied)
    expect(disk.getItem('challenge')).not.toBeNull()
    session.release()
  })
  it('never grants a broadcast view a write lock', async () => {
    const disk = memoryDisk(), locks = webLocks(), viewer = coordinator(disk, 'viewer', locks, { viewer: true })
    expect(await viewer.acquire()).toBe(false)
    expect(viewer.getSnapshot()).toMatchObject({ mode: 'viewer', writable: false })
    expect(() => viewer.write(key, envelope('Forbidden'))).toThrow(SessionWriteDenied)
    const owner = coordinator(disk, 'owner', locks)
    expect(await owner.acquire()).toBe(true)
    owner.release()
  })
  it('revokes permissions immediately on storage events before the next action', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    await session.acquire()
    session.storageChanged(key, envelope('Another writer'))
    expect(session.canWrite()).toBe(false)
    expect(session.getSnapshot().mode).toBe('conflict')
    session.release()
  })
  it('renews the fallback lease, recovers a crashed owner and rejects its late commands', async () => {
    const disk = memoryDisk(); let now = 1000
    const a = coordinator(disk, 'a', undefined, { now: () => now }), b = coordinator(disk, 'b', undefined, { now: () => now })
    expect(await a.acquire()).toBe(true)
    a.write(key, envelope('Owner A', 10))
    expect(await b.acquire()).toBe(false)
    now += SESSION_LEASE_MS - 1; a.heartbeat()
    expect(await b.acquire()).toBe(false)
    now += SESSION_LEASE_MS + 1
    expect(await b.acquire()).toBe(true)
    b.write(key, envelope('Owner B', 20))
    expect(() => a.write(key, envelope('Stale A'))).toThrow(SessionWriteDenied)
    expect(JSON.parse(disk.getItem(key)!).state.name).toBe('Owner B')
    a.release()
    expect(JSON.parse(disk.getItem(SESSION_LEASE_KEY)!).token).toBe('b')
    b.release()
  })
  it('settles simultaneous fallback claims before either accepts commands', async () => {
    const disk = memoryDisk(), pending: Array<() => void> = []
    const settleClaims = () => new Promise<void>(resolve => { pending.push(resolve) })
    const a = coordinator(disk, 'a', undefined, { settle: settleClaims })
    const first = a.acquire()
    // Simulate a contender that read the expired lease before A claimed it.
    disk.removeItem(SESSION_LEASE_KEY)
    const b = coordinator(disk, 'b', undefined, { settle: settleClaims }), second = b.acquire()
    expect(a.canWrite()).toBe(false); expect(b.canWrite()).toBe(false)
    pending.forEach(resolve => resolve())
    expect(await first).toBe(false); expect(await second).toBe(true)
    expect(() => a.write(key, envelope('A'))).toThrow(SessionWriteDenied)
    b.write(key, envelope('B')); a.release(); b.release()
  })
  it('does not enable a window closed while it is still hydrating', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    let finish: () => void = () => {}
    session.setHydration(() => new Promise<void>(resolve => { finish = resolve }))
    const acquiring = session.acquire()
    session.release(); finish()
    expect(await acquiring).toBe(false)
    expect(session.canWrite()).toBe(false)
  })
  it('announces release only after the lock is actually available to the next window', async () => {
    const disk = memoryDisk(), locks = webLocks(), events: string[] = []
    const a = coordinator(disk, 'a', locks, { announce: (event: string) => events.push(event) })
    const b = coordinator(disk, 'b', locks)
    await a.acquire()
    const released = a.release()
    expect(events).toEqual(['acquired'])
    await released
    expect(events).toEqual(['acquired', 'released'])
    expect(await b.acquire()).toBe(true)
    await b.release()
  })
  it('hydrates exactly once and never hydrates an already active owner again', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    let hydrations = 0
    session.setHydration(() => { hydrations++; session.read(key) })
    expect(await session.acquire()).toBe(true)
    session.write(key, envelope('New command'))
    expect(await session.acquire()).toBe(true)
    expect(hydrations).toBe(1)
    expect(JSON.parse(disk.getItem(key)!).state.name).toBe('New command')
    await session.release()
  })
  it('recovers an invalid checkpoint during one lock-held hydration while game commands stay blocked', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    disk.setItem('challenge', envelope('Invalid RNG'))
    session.setHydration(() => {
      session.read(key); session.read('challenge')
      expect(session.getSnapshot().mode).toBe('checking')
      expect(session.canWrite()).toBe(false)
      expect(session.canRecover()).toBe(true)
      expect(() => session.write(key, envelope('Command'))).toThrow(SessionWriteDenied)
      session.recoverWrite(key, envelope('Recovered campaign'))
      session.recoverRemove('challenge')
    })
    expect(session.canRecover()).toBe(false)
    expect(await session.acquire()).toBe(true)
    expect(session.canRecover()).toBe(false)
    expect(disk.getItem('challenge')).toBeNull()
    expect(JSON.parse(disk.getItem(key)!).state.name).toBe('Recovered campaign')
    expect(() => session.recoverWrite(key, envelope('Later bypass'))).toThrow(SessionWriteDenied)
    await session.release()
  })
  it('does not let an ordinary read legitimise an unexpected external checkpoint', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    await session.acquire(); session.write(key, envelope('Local'))
    disk.setItem(key, envelope('External'))
    expect(session.read(key)).toBe(envelope('External'))
    expect(session.getSnapshot().mode).toBe('conflict')
    expect(() => session.write(key, envelope('Stale action'))).toThrow(SessionWriteDenied)
    await session.release()
  })
  it('rejects an expired fallback lease when hydration takes longer than its lifetime', async () => {
    const disk = memoryDisk(); let now = 1000
    const session = coordinator(disk, 'owner', undefined, { now: () => now })
    session.setHydration(() => { session.read(key); now += SESSION_LEASE_MS + 1 })
    expect(await session.acquire()).toBe(false)
    expect(session.canWrite()).toBe(false)
    await session.release()
  })
  it('fails closed if a fallback lease can no longer be read', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner')
    await session.acquire()
    disk.getItem = () => { throw new Error('Storage disabled') }
    expect(session.canWrite()).toBe(false)
    expect(session.getSnapshot().mode).toBe('readonly')
    await session.release()
  })
  it('checks the durable baseline before an external setter can publish a mutation', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    await session.acquire()
    expect(session.canCommit(key)).toBe(true)
    disk.setItem(key, envelope('External checkpoint'))
    expect(session.canCommit(key)).toBe(false)
    expect(session.getSnapshot().mode).toBe('conflict')
    expect(disk.getItem(key)).toBe(envelope('External checkpoint'))
    await session.release()
  })
  it('keeps conflict recovery retryable if rereading under an already-held Web Lock fails', async () => {
    const disk = memoryDisk(), session = coordinator(disk, 'owner', webLocks())
    await session.acquire()
    disk.setItem(key, envelope('External checkpoint', 42))
    expect(session.canCommit(key)).toBe(false)
    session.setHydration(() => { throw new Error('Checkpoint read temporarily unavailable') })
    try {
      await expect(session.acquire()).resolves.toBe(false)
      expect(session.getSnapshot().mode).toBe('conflict')
      expect(session.canWrite()).toBe(false)
      expect(disk.getItem(key)).toBe(envelope('External checkpoint', 42))
      session.setHydration(() => { session.read(key) })
      expect(await session.acquire()).toBe(true)
      session.write(key, envelope('Recovered', 43))
      expect(JSON.parse(disk.getItem(key)!).state.coins).toBe(43)
    } finally { await session.release() }
  })
})
