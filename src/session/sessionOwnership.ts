import { useSyncExternalStore } from 'react'
import { isUiStudioPreview } from '@/ui-studio/previewMode'
import { SessionCoordinator, SESSION_CHANNEL_NAME, SESSION_LEASE_KEY, type SessionOwnershipStatus } from './sessionCoordinator'

const unmanaged: SessionOwnershipStatus = { mode: 'unmanaged', writable: true, reason: '', revision: 0 }
// In private/embedded contexts even reading the localStorage getter may throw.
// Keep the existing save-failure UI usable when no durable storage exists.
const browserStorage = (() => {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test' || isUiStudioPreview()) return null
  try { return window.localStorage } catch { return null }
})()
const browserManaged = browserStorage !== null
/** A denied storage getter must use the existing failed-save flow, not recovery writes. */
export function isCampaignStorageUnavailable(): boolean {
  return typeof window !== 'undefined' && import.meta.env.MODE !== 'test' && !isUiStudioPreview() && browserStorage === null
}
const viewer = typeof window !== 'undefined' && new URLSearchParams(window.location?.search ?? '').get('view') === 'broadcast'
const channel = browserManaged && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SESSION_CHANNEL_NAME) : null
let disposed = false
const coordinator = browserManaged ? new SessionCoordinator({
  storage: browserStorage!,
  token: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  locks: typeof navigator.locks?.request === 'function' ? navigator.locks : undefined,
  viewer,
  announce: event => { if (!disposed) channel?.postMessage({ event }) },
}) : null

/** UI-only diagnostic state. Campaign commands independently enforce the same fence. */
export function useSessionOwnership(): SessionOwnershipStatus {
  return useSyncExternalStore(coordinator?.subscribe ?? (() => () => {}), coordinator?.getSnapshot ?? (() => unmanaged), () => unmanaged)
}
export const getSessionOwnership = () => coordinator?.getSnapshot() ?? unmanaged
export function isCampaignWritable(): boolean { return coordinator?.canWrite() ?? true }
export function isCampaignCheckpointCurrent(key: string): boolean { return coordinator?.canCommit(key) ?? true }
export function sessionOwnershipMessage(): string { return coordinator?.getSnapshot().reason ?? '' }
export function requestSessionControl(): Promise<boolean> { return coordinator?.acquire() ?? Promise.resolve(true) }
/** Raw save access shared by normal writes, challenge transitions and backup restoration. */
export function readCampaignCheckpoint(key: string): string | null {
  if (isUiStudioPreview()) return null
  return coordinator?.read(key) ?? localStorage.getItem(key)
}
export function writeCampaignCheckpoint(key: string, text: string): void {
  if (isUiStudioPreview()) return
  if (coordinator) coordinator.write(key, text)
  else localStorage.setItem(key, text)
}
export function removeCampaignCheckpoint(key: string): void {
  if (isUiStudioPreview()) return
  if (coordinator) coordinator.remove(key)
  else localStorage.removeItem(key)
}
/** Recovery is allowed only inside the coordinator's lock-held hydration.
 * These helpers do not grant application commands ownership.
 */
export function canRecoverCampaignCheckpoint(): boolean { return coordinator?.canRecover() ?? true }
export function recoverCampaignCheckpoint(key: string, text: string): void {
  if (isUiStudioPreview()) return
  if (coordinator) coordinator.recoverWrite(key, text)
  else localStorage.setItem(key, text)
}
export function retireRecoveredCampaignCheckpoint(key: string): void {
  if (isUiStudioPreview()) return
  if (coordinator) coordinator.recoverRemove(key)
  else localStorage.removeItem(key)
}
/** Register after the store exists; startup is deferred so synchronous hydration remains safe. */
export function configureSessionHydration(hydrate: () => Promise<void> | void) {
  coordinator?.setHydration(hydrate)
  if (coordinator) queueMicrotask(() => { void requestSessionControl() })
}
if (coordinator) {
  const retry = () => {
    if (!viewer && coordinator.getSnapshot().mode === 'readonly' && document.visibilityState !== 'hidden') void requestSessionControl()
  }
  const storageChanged = (event: StorageEvent) => {
    coordinator.storageChanged(event.key, event.newValue)
    if (event.key === SESSION_LEASE_KEY) retry()
  }
  const pageHidden = () => { void coordinator.release() }
  const pageShown = () => { if (!viewer) void requestSessionControl() }
  const controlMessage = (event: MessageEvent) => { if (event.data?.event === 'released') retry() }
  window.addEventListener('storage', storageChanged)
  window.addEventListener('pagehide', pageHidden)
  window.addEventListener('pageshow', pageShown)
  window.addEventListener('focus', retry)
  channel?.addEventListener('message', controlMessage)
  // A closed/crashed tab releases Web Locks automatically. A fallback lease expires after 12 s.
  const timer = window.setInterval(() => { coordinator.heartbeat(); retry() }, 2_000)
  import.meta.hot?.dispose(() => {
    disposed = true
    window.clearInterval(timer)
    window.removeEventListener('storage', storageChanged)
    window.removeEventListener('pagehide', pageHidden)
    window.removeEventListener('pageshow', pageShown)
    window.removeEventListener('focus', retry)
    channel?.removeEventListener('message', controlMessage)
    channel?.close()
    void coordinator.release()
  })
  // Ownership and its hydrated stores form one lifetime. Hot-swapping this
  // module alone can leave preserved stores attached to a retired coordinator.
  import.meta.hot?.accept(() => { window.location.reload() })
}
