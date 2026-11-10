import { GameDialog } from '@/components/ui/GameDialog'
import { GameButton } from '@/components/ui/GameButton'
import { useGameStore } from '@/store/gameStore'
import { useSaveWriteStatus } from './durableWrites'
import { serializeGameBackup, gameBackupFilename } from './gameBackup'
import { downloadGameBackup } from './restoreGameBackup'
import { useInteractionStore } from '@/interactions/interactionStore'
import { interactionCatalogForBackup, useInteractionRecoveryStatus } from '@/interactions/interactionRecovery'
import { useBattleArchiveStore } from '@/components/battle/battleArchiveStore'
import { useState } from 'react'

export function SaveFailureNotice() {
  const [downloadError, setDownloadError] = useState('')
  const error = useSaveWriteStatus(s => s.error)
  const retry = useSaveWriteStatus(s => s.retry)
  const local = useSaveWriteStatus(s => s.local)
  const clear = useSaveWriteStatus(s => s.clear)
  const cancel = useSaveWriteStatus(s => s.cancel)
  const challengeContext = useGameStore(s => s.challengeContext)
  const catalogRecovery = useInteractionRecoveryStatus(s => s.recovery)
  const discard = () => { cancel?.(); clear() }
  const download = () => {
    try {
      downloadGameBackup(serializeGameBackup(useGameStore.getState(), new Date(), interactionCatalogForBackup(useInteractionStore.getState().interactions), useBattleArchiveStore.getState()), gameBackupFilename())
      setDownloadError('')
    } catch (cause) { setDownloadError(cause instanceof Error ? cause.message : 'Il download non è riuscito. Riprova senza cancellare i dati del browser.') }
  }
  if (!error || local) return null
  return <GameDialog title="Salvataggio da completare" onClose={discard} showCloseButton={false}>
    <p role="alert">{error}</p>
    <p className="mt-3 text-sm">Libera spazio per i dati del browser, poi riprova. Puoi scaricare una copia dei progressi conservati prima di continuare.</p>
    {challengeContext && <p className="mt-3 text-sm">Il download conserva la campagna dei due giocatori. La sfida a seed o Fanta-Team resta nel suo salvataggio separato.</p>}
    {catalogRecovery && <p className="mt-3 text-sm">Il catalogo interazioni richiede recupero e resta escluso dal backup della campagna. L’originale è conservato nell’editor Interazioni e nel pannello Backup.</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <GameButton tone="primary" onClick={() => retry?.()}>Riprova salvataggio</GameButton>
      <GameButton onClick={download}>Scarica progressi conservati</GameButton>
      <GameButton onClick={discard}>Annulla operazione</GameButton>
    </div>
    {downloadError && <p role="alert" className="mt-3">{downloadError}</p>}
  </GameDialog>
}
