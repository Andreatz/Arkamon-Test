import { useRegiaStore } from '@/regia/regiaStore'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/store/gameStore'
import { GameDialog } from '@/components/ui/GameDialog'
import { GameButton } from '@/components/ui/GameButton'
import { exitChallenge } from './challengeRuntime'

/** Battle owns an explicit HUD slot; extended details never expand over the turn ribbon. */
export function ChallengeBanner({ embedded = false }: { embedded?: boolean }) {
  const busy = useRegiaStore(state => state.busy)
  const context = useGameStore((state) => state.challengeContext)
  const scene = useGameStore((state) => state.scenaCorrente.scena)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  if (!context || (!embedded && scene === 'battaglia')) return null
  const mode = context.session.mode === 'fanta' ? 'Fanta-Team' : 'Sfida a seed'
  const content = <>
    <aside aria-label="Sfida in corso" data-challenge-context className={embedded ? 'battle-challenge-context' : 'fixed bottom-4 left-4 z-[950] max-w-[min(40vw,32rem)]'}>
      <GameButton disabled={busy} onClick={() => { setConfirm(false); setOpen(true) }} className="w-full px-4 py-2 text-left">
        <span className="block truncate">{mode} · {context.session.seed}</span>
        <span className="block text-xs text-slate-300">Dettagli e ritorno alla campagna</span>
      </GameButton>
    </aside>
    {open && <GameDialog title={mode} onClose={() => setOpen(false)}>
      <p className="mb-4 text-xl">Seed {context.session.seed}</p>
      <p className="mb-4 text-slate-300">La campagna è conservata separatamente. Questa sfida usa {context.session.rulesVersion === 1 ? 'le regole classiche v1' : 'le regole aggiornate v2'}.</p>
      {confirm ? <div className="grid gap-4"><p>Abbandonare la sfida? Il tentativo non entra in classifica.</p>
        <GameButton disabled={busy} onClick={() => { const result = exitChallenge(); if (!result.ok) setError(result.message) }}>Conferma uscita</GameButton>
        <GameButton onClick={() => setConfirm(false)}>Continua la sfida</GameButton></div>
        : <GameButton onClick={() => setConfirm(true)}>Torna alla campagna</GameButton>}
      {error && <p role="alert">{error}</p>}
    </GameDialog>}
  </>
  return embedded ? content : createPortal(content, document.body)
}
