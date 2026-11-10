import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { BattleDie } from './DiceRollOverlay'
import { makeDialogBackgroundInert } from './modalFocus'

export function BattleOpeningOverlay({ kind, value, title, result, onContinue }: {
  kind: 'coin' | 'die'; value: number; title: string; result: string; onContinue: () => void
}) {
  const { reducedMotion: reduced, speed } = useGameMotionPreferences()
  const [ready, setReady] = useState(Boolean(reduced && kind === 'coin'))
  const dialogRef = useRef<HTMLDivElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)
  const releaseDialogRef = useRef<(() => void) | null>(null)
  const continuedRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const restoreBackground = makeDialogBackgroundInert(dialog)
    const focusDialog = () => {
      const button = continueRef.current
      const target = button && !button.disabled ? button : dialog
      target.focus({ preventScroll: true })
    }
    const trapFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusDialog()
    }
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      focusDialog()
    }
    dialog.focus({ preventScroll: true })
    document.addEventListener('focusin', trapFocus)
    document.addEventListener('keydown', trapTab, true)
    let released = false
    const releaseDialog = () => {
      if (released) return
      released = true
      document.removeEventListener('focusin', trapFocus)
      document.removeEventListener('keydown', trapTab, true)
      restoreBackground()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
    releaseDialogRef.current = releaseDialog
    return () => {
      releaseDialog()
      if (releaseDialogRef.current === releaseDialog) releaseDialogRef.current = null
    }
  }, [])

  useEffect(() => {
    if (ready) continueRef.current?.focus({ preventScroll: true })
  }, [ready])

  const continueOnce = () => {
    if (!ready || continuedRef.current) return
    continuedRef.current = true
    // Release this dialog before its continuation can mount the next one.
    releaseDialogRef.current?.()
    onContinue()
  }

  return <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="absolute inset-0 z-[900] flex items-center justify-center bg-slate-950/85 p-3 outline-none" onKeyDown={(e) => e.stopPropagation()}>
    <div className="flex max-h-full w-full max-w-lg flex-col items-center gap-4 overflow-y-auto rounded-2xl border border-amber-300 bg-slate-900 p-4 text-center text-white shadow-2xl sm:gap-6 sm:p-8 [&>*]:shrink-0">
      <h2 className="text-xl font-bold">{title}</h2>
      {kind === 'coin' ? <div style={{ perspective: 700 }}>
        <motion.div initial={{ rotateY: 0, y: 30 }} animate={{ rotateY: reduced ? 0 : 1800, y: reduced ? 0 : [30, -35, 0] }} transition={{ duration: reduced ? 0 : 2.2 / speed, ease: 'easeOut' }} onAnimationComplete={() => setReady(true)} className="flex h-32 w-32 items-center justify-center rounded-full border-8 border-amber-200 bg-gradient-to-br from-yellow-200 via-amber-500 to-yellow-800 text-5xl font-black text-amber-950 shadow-xl">{ready ? (value === 0 ? 'T' : 'C') : '✦'}</motion.div>
      </div> : <div className="w-32"><BattleDie value={value} forceFallback={false} onVisible={() => setReady(true)} /></div>}
      <p role="status" className="min-h-8 font-bold">{ready ? result : kind === 'coin' ? 'La moneta sta girando…' : 'Lancio del dado…'}</p>
      <button ref={continueRef} type="button" disabled={!ready} onClick={continueOnce} className="rounded-lg bg-amber-300 px-6 py-3 font-bold text-slate-950 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Continua</button>
    </div>
  </div>
}
