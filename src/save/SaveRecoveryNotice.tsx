import { useGameStore } from '@/store/gameStore'

/** Small global notice; the parent can open the tools menu on demand. */
export function SaveRecoveryNotice({ onOpenBackup }: { onOpenBackup: () => void }) {
  const warnings = useGameStore((s) => s.saveRecoveryWarnings)
  const dismiss = useGameStore((s) => s.dismissSaveRecoveryWarnings)
  if (!warnings.length) return null
  return <div role="status" className="fixed top-3 left-1/2 -translate-x-1/2 z-[1100] w-[min(24rem,calc(100%-1.5rem))] rounded bg-arka-bg p-3 text-arka-text shadow-lg border border-current">
    <p className="text-sm">Alcuni dati del salvataggio sono stati recuperati. Controlla gli avvisi prima di continuare.</p>
    <div className="mt-2 flex gap-3"><button type="button" className="text-sm underline" onClick={onOpenBackup}>Mostra dettagli</button><button type="button" className="text-sm underline" onClick={dismiss}>Chiudi</button></div>
  </div>
}
