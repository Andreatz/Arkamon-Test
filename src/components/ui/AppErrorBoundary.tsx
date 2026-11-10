import { Component, useEffect, useRef, type ReactNode } from 'react'
import { GameButton } from './GameButton'

/** A failed lazy view must leave a recovery command instead of a blank stream. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (!this.state.failed) return this.props.children
    return <GameRecoveryScreen />
  }
}

function GameRecoveryScreen() {
  const heading = useRef<HTMLHeadingElement>(null)
  // Focus after the failed dialog's effect cleanup restores its previous focus.
  useEffect(() => { heading.current?.focus() }, [])
  return <main className="fixed inset-0 flex items-center justify-center overflow-auto bg-arka-bg p-6 text-arka-text">
      <section role="alert" aria-labelledby="game-recovery-title" className="arka-panel w-full max-w-xl p-6">
        <h1 id="game-recovery-title" ref={heading} tabIndex={-1} className="text-2xl font-bold">Questa schermata non è disponibile</h1>
        <p className="mt-4">Il caricamento si è interrotto oppure la schermata ha incontrato un errore.</p>
        <p className="mt-3">Ricarica il gioco per riprendere dall’ultimo salvataggio. I dati del browser non vengono cancellati.</p>
        <GameButton tone="primary" className="mt-6" onClick={() => window.location.reload()}>Ricarica il gioco</GameButton>
      </section>
    </main>
}
