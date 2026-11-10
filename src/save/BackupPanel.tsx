import { useRef, useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import { gameBackupFilename, MAX_GAME_BACKUP_BYTES, serializeGameBackup, validateGameBackup, type GameBackupPreview } from './gameBackup'
import { downloadGameBackup, readPreviousGameBackup, restoreGameBackup } from './restoreGameBackup'
import { useInteractionStore } from '@/interactions/interactionStore'
import { interactionCatalogForBackup, useInteractionRecoveryStatus } from '@/interactions/interactionRecovery'
import { useBattleArchiveStore } from '@/components/battle/battleArchiveStore'
import { readRecoveryCopies, useSaveWriteStatus } from './durableWrites'

/** Render inside the common game tools menu; no scene navigation or Admin privileges required. */
export function BackupPanel() {
  const [preview, setPreview] = useState<GameBackupPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const fileReadRevision = useRef(0)
  const recoveryWarnings = useGameStore((s) => s.saveRecoveryWarnings)
  const dismissRecovery = useGameStore((s) => s.dismissSaveRecoveryWarnings)
  const [previousAvailable, setPreviousAvailable] = useState(() => readPreviousGameBackup() !== null)
  const backupWarning = useSaveWriteStatus(s => s.backupWarning)
  const catalogRecovery = useInteractionRecoveryStatus(s => s.recovery)
  const copies = readRecoveryCopies()
  const exportCurrent = () => {
    try {
      downloadGameBackup(serializeGameBackup(useGameStore.getState(), new Date(), interactionCatalogForBackup(useInteractionStore.getState().interactions), useBattleArchiveStore.getState()), gameBackupFilename())
      setMessage(catalogRecovery ? 'Backup della campagna scaricato senza catalogo danneggiato. Scarica separatamente l’originale da recuperare.' : 'Backup della partita scaricato. Conservalo anche fuori da questo computer.')
      setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Non riesco a scaricare il backup. Riprova dal browser.'); setMessage(null) }
  }
  const loadFile = async (file: File | undefined) => {
    const revision = ++fileReadRevision.current
    setPreview(null); setAccepted(false); setError(null); setMessage(null)
    if (!file) return
    if (file.size > MAX_GAME_BACKUP_BYTES) { setError('Il file supera il limite di 5 MB per un backup della partita.'); return }
    try {
      const content = await file.text()
      if (fileReadRevision.current !== revision) return
      const result = validateGameBackup(content)
      if (result.ok) setPreview(result.preview)
      else setError(result.error)
    } catch { if (fileReadRevision.current === revision) setError('Non riesco a leggere questo file. La partita attuale resta intatta.') }
  }
  const restore = () => {
    if (!preview || !accepted) return
    ++fileReadRevision.current
    const result = restoreGameBackup(preview)
    if (!result.ok) { setError(result.error); return }
    setPreviousAvailable(true); setPreview(null); setAccepted(false); setError(null)
    setMessage('Partita ripristinata. La partita precedente è conservata nel backup precedente scaricabile qui sotto.')
  }
  return <section aria-label="Backup della partita" className="pu-backup-screen space-y-4">
    <h2 className="text-lg font-bold">Backup della partita</h2>
    <p className="text-sm">Salva i progressi di entrambi i giocatori, squadre, deposito, mappe e battaglia. Il ripristino conserva HP e status; i codici QR e le impostazioni del pubblico restano separati.</p>
    <div className="pu-backup-overview">
    {catalogRecovery && <div role="alert"><p>Il catalogo interazioni richiede recupero. Il backup conserva la campagna e omette quel catalogo; l’originale resta intatto nel browser. Prima di sostituirlo, scaricalo separatamente e recuperalo dall’editor Interazioni.</p>
      <button type="button" disabled={catalogRecovery.raw === null} onClick={() => {
        try { downloadGameBackup(catalogRecovery.raw!, 'arkamon-interazioni-originale-da-recuperare.json'); setError(null) }
        catch { setError('Non riesco a scaricare il catalogo originale. Non cancellare i dati del browser e riprova.') }
      }}>Scarica originale da recuperare</button>
    </div>}
    {backupWarning && <p role="status" className="text-sm">{backupWarning}</p>}
    {copies.length > 0 && <div className="rounded border border-current p-3 text-sm">
      <p className="font-bold">Copie automatiche dei progressi precedenti</p>
      <p>Ogni copia conserva un punto già valido della campagna. Controlla l’anteprima prima del ripristino.</p>
      <div className="mt-2 flex flex-wrap gap-2">{copies.map((copy, index) => <button key={copy.createdAt + index} type="button" className="rounded border border-current px-3 py-2" onClick={() => {
        ++fileReadRevision.current
        const result = validateGameBackup(copy.backup)
        setAccepted(false); setError(null); setMessage(null)
        if (result.ok) setPreview(result.preview); else setError(result.error)
      }}>Controlla copia automatica {index + 1}</button>)}</div>
    </div>}
    {recoveryWarnings.length > 0 && <div role="status" className="rounded border border-current p-3 text-sm">
      <p className="font-bold">Recupero del salvataggio</p>
      <ul className="ml-4 list-disc">{recoveryWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      <button type="button" className="mt-2 underline" onClick={dismissRecovery}>Ho letto gli avvisi</button>
    </div>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="rounded border border-current px-3 py-2 font-semibold" onClick={exportCurrent}>Scarica backup partita</button>
      {previousAvailable && <button type="button" className="rounded border border-current px-3 py-2" onClick={() => {
        const previous = readPreviousGameBackup()
        if (previous) downloadGameBackup(previous, 'Arkamon-partita-precedente.json')
        else { setPreviousAvailable(false); setError('Il backup precedente non è disponibile.') }
      }}>Scarica backup precedente</button>}
    </div>
    <label className="block text-sm font-semibold">Importa una partita
      <input type="file" accept=".json,application/json" aria-label="Importa backup partita" className="mt-2 block max-w-full text-sm" onChange={(event) => {
        void loadFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''
      }} />
    </label>
    {error && <p role="alert" className="rounded border border-current p-2 text-sm">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    </div>
    {preview && <div className="space-y-3 rounded border border-current p-3" aria-label="Anteprima ripristino">
      <h3 className="font-bold">Anteprima del backup</h3>
      <p className="text-sm">Creato il {new Date(preview.createdAt).toLocaleString('it-IT')} · formato {preview.version}</p>
      {preview.players.map((player, i) => <p key={i} className="text-sm"><strong>{player.name}</strong>: {player.team} in squadra, {player.deposit} in deposito, {player.coins} monete, {player.defeatedTrainers} allenatori sconfitti. Luogo: {player.location.replace(/_/g, ' ')}.</p>)}
      <p className="text-sm">Schermata: {preview.scene}. {preview.battle ? 'Riprende la battaglia dall’ultimo turno salvato.' : 'Nessuna battaglia in corso.'}</p>
      <p className="text-sm">{preview.interactionCatalog ? `${preview.interactionCatalog.interactions.length} interazioni personalizzate incluse.` : 'Le interazioni configurate su questo computer restano invariate.'}</p>
      {preview.battleArchive && <p className="text-sm">{preview.battleArchive.matches.length} battaglie incluse nell’archivio replay.</p>}
      {preview.warnings.length > 0 && <div className="text-sm"><p className="font-bold">Campi recuperati da controllare prima di continuare:</p>
        <ul className="ml-4 list-disc">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>Confermo la sostituzione della partita attuale{preview.warnings.length ? ' e accetto i recuperi indicati' : ''}. Verrà conservato un backup della partita precedente.</span></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={!accepted} className="rounded border border-current px-3 py-2 font-semibold disabled:opacity-40" onClick={restore}>Ripristina questa partita</button>
        <button type="button" className="rounded border border-current px-3 py-2" onClick={() => { ++fileReadRevision.current; setPreview(null); setAccepted(false) }}>Annulla importazione</button></div>
    </div>}
  </section>
}
