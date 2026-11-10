import { useEffect, useId, useRef } from 'react'
import { èMossaCura, èMossaSoloStato } from '@/engine/battleEngine'
import type { MossaDef } from '@/types'
import { makeDialogBackgroundInert } from './modalFocus'

interface SupremeMoveDialogProps {
  moves: { mossa: MossaDef; idx: 0 | 1 | 2 }[]
  level: number
  recoil: number
  pokemonName: string
  onChoose: (idx: 0 | 1 | 2) => void
  onClose: () => void
}

/** Selects an attack; the battle scene still resolves status, damage and recoil. */
export function SupremeMoveDialog({ moves, level, recoil, pokemonName, onChoose, onClose }: SupremeMoveDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const releaseDialogRef = useRef<(() => void) | null>(null)
  const dismissedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const attacks = moves.filter(({ mossa }) => !èMossaCura(mossa) && !èMossaSoloStato(mossa))

  const dismiss = () => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    releaseDialogRef.current?.()
    onCloseRef.current()
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const restoreBackground = makeDialogBackgroundInert(dialog)
    let released = false
    const buttons = () => Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
    const focusFirst = () => (buttons()[0] ?? dialog).focus()
    const trapFocus = (event: FocusEvent) => {
      if (!released && event.target instanceof Node && !dialog.contains(event.target)) focusFirst()
    }
    const trapKeyboard = (event: KeyboardEvent) => {
      if (released) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismiss()
        return
      }
      if (event.key !== 'Tab') return
      event.preventDefault()
      event.stopPropagation()
      const choices = buttons()
      if (choices.length === 0) {
        dialog.focus({ preventScroll: true })
        return
      }
      const current = choices.findIndex((button) => button === document.activeElement)
      const next = current < 0
        ? event.shiftKey ? choices.length - 1 : 0
        : (current + (event.shiftKey ? -1 : 1) + choices.length) % choices.length
      // Let keyboard focus reveal an off-screen choice inside the scrollable panel.
      choices[next].focus()
    }
    document.addEventListener('focusin', trapFocus)
    document.addEventListener('keydown', trapKeyboard, true)
    const releaseDialog = () => {
      if (released) return
      released = true
      document.removeEventListener('focusin', trapFocus)
      document.removeEventListener('keydown', trapKeyboard, true)
      restoreBackground()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
    releaseDialogRef.current = releaseDialog
    // Keep the cost and title visible on opening; Tab reveals the first attack.
    dialog.focus({ preventScroll: true })
    return () => {
      releaseDialog()
      if (releaseDialogRef.current === releaseDialog) releaseDialogRef.current = null
    }
    // Callback refs keep Escape current without replaying background/focus isolation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (idx: 0 | 1 | 2) => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    // Release before the action can open its status die or another modal.
    releaseDialogRef.current?.()
    onChoose(idx)
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="absolute inset-0 z-[900] flex items-center justify-center bg-slate-950/85 p-3 outline-none"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-amber-300 bg-slate-900 p-4 text-center text-white shadow-2xl sm:gap-6 sm:p-8 [&>*]:shrink-0">
        <h2 id={titleId} className="text-xl font-bold">Mossa Suprema</h2>
        <p id={descriptionId} className="text-sm leading-relaxed sm:text-base">
          Scegli l’attacco: danno ×2. Contraccolpo: {recoil} HP al livello attuale (50% degli HP massimi).
        </p>
        <p className="text-xs leading-relaxed text-slate-300">
          Se il bersaglio va KO, {pokemonName} guadagna prima esperienza e livelli. Il contraccolpo si calcola poi sugli HP massimi aggiornati.
        </p>
        <p className="text-sm text-slate-300">{pokemonName} · Livello {level}</p>
        <div className="grid gap-2">
          {attacks.map(({ mossa, idx }) => (
            <button
              key={idx}
              type="button"
              className="min-h-11 rounded-lg border border-amber-200/60 bg-amber-300 px-4 py-3 font-bold text-slate-950 transition hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={() => choose(idx)}
            >
              {mossa.nome}
            </button>
          ))}
          {attacks.length === 0 && <p role="status" className="text-sm text-slate-300">Nessun attacco disponibile.</p>}
        </div>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-slate-500 bg-slate-800 px-4 py-3 font-bold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={dismiss}
        >
          Annulla
        </button>
      </div>
    </div>
  )
}
