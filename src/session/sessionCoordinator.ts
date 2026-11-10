/** Exclusive campaign writer plus optimistic checkpoint fencing.
 * Metadata lives in the same atomic localStorage value as the save itself.
 * Portable backups keep their existing schema and do not carry ownership.
 */
export const SESSION_LEASE_KEY = 'arkamon-session-writer-v1'
export const SESSION_LOCK_NAME = 'arkamon-campaign-writer-v1'
export const SESSION_CHANNEL_NAME = 'arkamon-session-control-v1'
export const SESSION_LEASE_MS = 12_000
export type SessionMode = 'unmanaged' | 'checking' | 'owner' | 'readonly' | 'conflict' | 'viewer'
export interface SessionOwnershipStatus { mode: SessionMode; writable: boolean; reason: string; revision: number }
interface Lease { version: 1; token: string; expiresAt: number }
interface SessionMetadata { version: 1; revision: number; writer: string }
type Disk = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export interface CampaignLocks {
  request(name: string, options: { ifAvailable: true }, callback: (lock: object | null) => Promise<void>): Promise<unknown>
}
interface CoordinatorOptions {
  storage: Disk
  token: string
  locks?: CampaignLocks
  viewer?: boolean
  now?: () => number
  settle?: () => Promise<void>
  announce?: (event: 'released' | 'acquired') => void
}
const messages = {
  checking: 'Preparazione della sessione…',
  owner: 'Questa finestra conduce la partita.',
  readonly: 'La partita è già aperta in un’altra finestra. Questa finestra è in sola lettura.',
  conflict: 'Il salvataggio è cambiato fuori da questa finestra. Ricarica lo stato più recente prima di continuare.',
  viewer: 'Vista pubblica in sola lettura.',
}
export class SessionWriteDenied extends Error {
  constructor(message: string) { super(message); this.name = 'SessionWriteDenied' }
}
function metadata(text: string | null): SessionMetadata | null {
  try {
    const value = JSON.parse(text ?? 'null')?.arkamonSession
    return value?.version === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.writer === 'string' ? value : null
  } catch { return null }
}
function lease(text: string | null): Lease | null {
  try {
    const value = JSON.parse(text ?? 'null')
    return value?.version === 1 && typeof value.token === 'string' && Number.isFinite(value.expiresAt) ? value : null
  } catch { return null }
}

export class SessionCoordinator {
  private state: SessionOwnershipStatus
  private listeners = new Set<() => void>()
  private expected = new Map<string, string | null>()
  private hydration: (() => Promise<void> | void) | null = null
  private holding = false
  private acquirePromise: Promise<boolean> | null = null
  private releaseWebLock: (() => void) | null = null
  private webLockTask: Promise<unknown> | null = null
  private releaseTask: Promise<void> | null = null
  private hydrationOwnsLock = false
  private generation = 0
  private stopped = false
  private now: () => number
  constructor(private options: CoordinatorOptions) {
    this.now = options.now ?? Date.now
    const mode = options.viewer ? 'viewer' : 'checking'
    this.state = { mode, writable: false, reason: messages[mode], revision: 0 }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  setHydration(hydrate: () => Promise<void> | void) { this.hydration = hydrate }
  private update(mode: Exclude<SessionMode, 'unmanaged'>, revision = this.state.revision) {
    if (this.state.mode === mode && this.state.revision === revision) return
    this.state = { mode, writable: mode === 'owner', reason: messages[mode], revision }
    for (const listener of this.listeners) listener()
  }
  read(key: string) {
    const text = this.options.storage.getItem(key)
    // A passive read must not accept an external write as the next baseline.
    if (this.state.mode === 'owner' && this.expected.has(key) && this.expected.get(key) !== text) this.update('conflict')
    else if (this.state.mode !== 'conflict') this.expected.set(key, text)
    return text
  }
  /** Used for hydration only. Reading must not legitimise an external checkpoint while owner. */
  observe(key: string) { return this.read(key) }
  canWrite() {
    if (!this.holding || this.state.mode !== 'owner') return false
    if (!this.options.locks) {
      let current: Lease | null
      try { current = lease(this.options.storage.getItem(SESSION_LEASE_KEY)) }
      catch { this.holding = false; this.update('readonly'); return false }
      if (current?.token !== this.options.token || current.expiresAt <= this.now()) {
        this.holding = false; this.update('readonly'); return false
      }
    }
    return true
  }
  assertWritable() {
    if (!this.canWrite()) throw new SessionWriteDenied(this.state.reason)
  }
  /** Check before a public integration setter can publish an in-memory change. */
  canCommit(key: string) {
    if (!this.canWrite()) return false
    try {
      if (this.options.storage.getItem(key) === (this.expected.get(key) ?? null)) return true
      this.update('conflict')
    } catch { this.holding = false; this.update('readonly') }
    return false
  }
  /** Only checkpoint normalisation inside lock-held hydration may use this path.
   * The public status remains checking, so game commands cannot run yet.
   */
  canRecover() {
    if (!this.hydrationOwnsLock || this.state.mode !== 'checking' || this.stopped) return false
    if (this.options.locks) return true
    try {
      const current = lease(this.options.storage.getItem(SESSION_LEASE_KEY))
      return current?.token === this.options.token && current.expiresAt > this.now()
    } catch { return false }
  }
  private assertAccess(recovery: boolean) {
    if (recovery ? !this.canRecover() : !this.canWrite()) throw new SessionWriteDenied(this.state.reason)
  }
  /** A single storage write contains checkpoint, monotonic revision and writer fence. */
  write(key: string, text: string) { return this.writeCheckpoint(key, text, false) }
  recoverWrite(key: string, text: string) { return this.writeCheckpoint(key, text, true) }
  private writeCheckpoint(key: string, text: string, recovery: boolean) {
    this.assertAccess(recovery)
    const current = this.options.storage.getItem(key)
    // New keys are enrolled during acquisition, or explicitly observed before use.
    if (!this.expected.has(key)) this.expected.set(key, null)
    if (current !== this.expected.get(key)) {
      this.update('conflict')
      throw new SessionWriteDenied(messages.conflict)
    }
    const revision = Math.max(this.state.revision, metadata(current)?.revision ?? 0) + 1
    const envelope = JSON.parse(text) as Record<string, unknown>
    const serialized = JSON.stringify({ ...envelope, arkamonSession: { version: 1, revision, writer: this.options.token } satisfies SessionMetadata })
    // canWrite rechecks the fallback lease immediately before touching durable progress.
    this.assertAccess(recovery)
    this.options.storage.setItem(key, serialized)
    this.expected.set(key, serialized)
    this.update(recovery ? 'checking' : 'owner', revision)
    return serialized
  }
  remove(key: string) { this.removeCheckpoint(key, false) }
  recoverRemove(key: string) { this.removeCheckpoint(key, true) }
  private removeCheckpoint(key: string, recovery: boolean) {
    this.assertAccess(recovery)
    if (this.options.storage.getItem(key) !== (this.expected.get(key) ?? null)) {
      this.update('conflict'); throw new SessionWriteDenied(messages.conflict)
    }
    this.options.storage.removeItem(key); this.expected.set(key, null)
  }
  /** Storage events catch changes even before a user attempts the next action. */
  storageChanged(key: string | null, text: string | null) {
    if (key === SESSION_LEASE_KEY && this.holding && !this.options.locks && lease(text)?.token !== this.options.token) {
      this.holding = false; this.update('readonly')
    } else if (this.state.mode === 'owner' && (key === null || this.expected.has(key)) && (key === null || this.expected.get(key) !== text)) {
      this.update('conflict')
    }
  }
  async acquire(): Promise<boolean> {
    if (this.options.viewer) return false
    if (this.releaseTask) await this.releaseTask
    this.stopped = false
    if (this.canWrite()) return true
    if (this.acquirePromise) return this.acquirePromise
    this.acquirePromise = this.acquireOnce().finally(() => { this.acquirePromise = null })
    return this.acquirePromise
  }
  private async prepare(generation: number) {
    if (generation !== this.generation || this.stopped) return false
    // Every ownership transfer hydrates the current disk checkpoint before commands are enabled.
    this.update('checking')
    for (const key of this.expected.keys()) this.expected.set(key, this.options.storage.getItem(key))
    this.hydrationOwnsLock = true
    try { await this.hydration?.() }
    finally { this.hydrationOwnsLock = false }
    if (generation !== this.generation || this.stopped) return false
    if (!this.options.locks) {
      const current = lease(this.options.storage.getItem(SESSION_LEASE_KEY))
      if (current?.token !== this.options.token || current.expiresAt <= this.now()) return false
    }
    this.holding = true
    const revision = Math.max(0, ...[...this.expected.values()].map(text => metadata(text)?.revision ?? 0))
    this.update('owner', revision)
    this.options.announce?.('acquired')
    return true
  }
  private acquireOnce(): Promise<boolean> {
    const generation = ++this.generation
    // Conflict recovery while still holding the Web Lock resynchronises rather than stealing a lock.
    if (this.holding && this.options.locks) return this.prepare(generation).catch(() => {
      // The existing lock is still held, but failed hydration cannot leave the
      // UI indefinitely checking or reject an unobserved recovery-button task.
      if (generation === this.generation && !this.stopped) this.update('conflict')
      return false
    })
    this.update('checking')
    if (this.options.locks) return new Promise<boolean>((resolve) => {
      this.webLockTask = this.options.locks!.request(SESSION_LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock || this.stopped || generation !== this.generation) {
          if (generation === this.generation) this.update('readonly')
          resolve(false); return
        }
        let release: () => void = () => {}
        const held = new Promise<void>(done => { release = done })
        this.releaseWebLock = release
        try {
          const acquired = await this.prepare(generation)
          resolve(acquired)
          if (acquired) await held
        } catch { this.holding = false; this.update('readonly'); resolve(false) }
        finally { if (this.releaseWebLock === release) this.releaseWebLock = null }
      }).catch(() => {
        if (generation === this.generation) { this.holding = false; this.update('readonly') }
        resolve(false)
      })
    })
    return this.acquireLease(generation)
  }
  private async acquireLease(generation: number) {
    try {
      this.holding = false
      const current = lease(this.options.storage.getItem(SESSION_LEASE_KEY))
      if (current && current.token !== this.options.token && current.expiresAt > this.now()) { this.update('readonly'); return false }
      this.options.storage.setItem(SESSION_LEASE_KEY, JSON.stringify({ version: 1, token: this.options.token, expiresAt: this.now() + SESSION_LEASE_MS } satisfies Lease))
      await (this.options.settle?.() ?? new Promise<void>(resolve => setTimeout(resolve, 140)))
      if (lease(this.options.storage.getItem(SESSION_LEASE_KEY))?.token !== this.options.token) { this.update('readonly'); return false }
      if (await this.prepare(generation)) return true
      this.update('readonly'); return false
    } catch { this.update('readonly'); return false }
  }
  heartbeat() {
    if (!this.canWrite()) return
    if (!this.options.locks) {
      try { this.options.storage.setItem(SESSION_LEASE_KEY, JSON.stringify({ version: 1, token: this.options.token, expiresAt: this.now() + SESSION_LEASE_MS } satisfies Lease)) }
      catch { this.holding = false; this.update('readonly') }
    }
  }
  release() {
    if (this.releaseTask) return this.releaseTask
    this.stopped = true; this.generation++; this.holding = false
    this.releaseWebLock?.(); this.releaseWebLock = null
    try {
      if (lease(this.options.storage.getItem(SESSION_LEASE_KEY))?.token === this.options.token) this.options.storage.removeItem(SESSION_LEASE_KEY)
    } catch { /* A released Web Lock still prevents stale writes if storage is unavailable. */ }
    this.update(this.options.viewer ? 'viewer' : 'readonly')
    // Web Locks release only after their callback has returned. Advertising
    // earlier makes an immediate ifAvailable takeover fail transiently.
    const finishing = this.webLockTask
    this.releaseTask = Promise.resolve(finishing).then(() => {
      this.options.announce?.('released')
    }).finally(() => { this.webLockTask = null; this.releaseTask = null })
    return this.releaseTask
  }
}
