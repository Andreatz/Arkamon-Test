import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useSessionOwnership, requestSessionControl, isCampaignStorageUnavailable } from './sessionOwnership'
import { isUiStudioPreview } from '@/ui-studio/previewMode'
import { recoverCampaignConfigurationImport } from '@/readiness/campaignApply'
import { recoverInterruptedBackupRestore, useBackupRestoreRecoveryStatus } from '@/save/restoreJournal'

const BroadcastView = lazy(() => import('@/regia/BroadcastView').then(module => ({ default: module.BroadcastView })))
/** Replicas never mount a game engine: a read-only screen cannot acknowledge a remote move. */
export function SessionGate({ children }: { children: ReactNode }) {
  const ownership = useSessionOwnership()
  const backupRecoveryError = useBackupRestoreRecoveryStatus(state => state.error)
  const [recovery, setRecovery] = useState<{ done: boolean; error: string }>({ done: false, error: '' })
  const preview = isUiStudioPreview()
  const viewer = new URLSearchParams(window.location.search).get('view') === 'broadcast'
  useEffect(() => {
    if (preview || !ownership.writable) { setRecovery({ done: false, error: '' }); return }
    // There can be no recoverable journal when storage is inaccessible. Keep
    // the title/backup and failed-write dialog available; commands still fail
    // before publishing any progress through the normal durable-write guard.
    if (isCampaignStorageUnavailable()) { setRecovery({ done: true, error: '' }); return }
    const result = recoverCampaignConfigurationImport()
    setRecovery({ done: result.ok, error: result.ok ? '' : result.message })
  }, [ownership.writable, preview])
  if (preview) return <>{children}</>
  if (!viewer && backupRecoveryError) return <main className="arka-configuration-recovery"><h1>Recupero della partita</h1><p role="alert">{backupRecoveryError}</p><p>Il ripristino interrotto deve essere recuperato prima di riattivare i comandi.</p><button onClick={() => { const result = recoverInterruptedBackupRestore(); if (result.ok) void requestSessionControl() }}>Riprova recupero</button><button onClick={() => void requestSessionControl()}>Rileggi la sessione</button></main>
  if (viewer || (!ownership.writable && ownership.mode !== 'checking')) return <Suspense fallback={<p role="status">Collegamento alla console…</p>}><BroadcastView publicOnly={viewer} /></Suspense>
  if (ownership.mode === 'checking') return <main className="arka-regia-readonly" role="status">Preparazione della sessione…</main>
  if (!recovery.done) return <main className="arka-configuration-recovery"><h1>Recupero della configurazione</h1><p role="status">{recovery.error || 'Verifica della configurazione…'}</p>{recovery.error && <button onClick={() => { const result = recoverCampaignConfigurationImport(); setRecovery({ done: result.ok, error: result.ok ? '' : result.message }) }}>Riprova recupero</button>}<button onClick={() => void requestSessionControl()}>Rileggi la sessione</button></main>
  return <>{children}</>
}
