import { useEffect, useRef } from 'react'
import { AudienceQrCode } from '@/audience/AudienceQrCode'
import type { AudienceRoundRequest, AudienceRound, AudienceTurnStatus } from '@/audience/types'
import { makeDialogBackgroundInert } from './modalFocus'
import './battleAudienceOverlay.css'

export function BattleAudienceOverlay({ request, round, status, remainingMs, error, joinUrl,
  onRetry, onCloseEarly, onFallback }: {
  request: AudienceRoundRequest
  round: AudienceRound | null
  status: AudienceTurnStatus
  remainingMs: number
  error: string | null
  joinUrl: string
  onRetry: () => void
  onCloseEarly: () => void | Promise<void>
  onFallback: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const firstButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!root.current) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const release = makeDialogBackgroundInert(root.current)
    // Opening disables the close command. Keep initial focus inside the dialog
    // instead of attempting to focus a disabled element in the inert background.
    if (firstButton.current && !firstButton.current.disabled) firstButton.current.focus()
    else root.current.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')]
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus() }
    }
    root.current.addEventListener('keydown', trap)
    const element = root.current
    return () => { element.removeEventListener('keydown', trap); release(); previous?.focus() }
  }, [])
  useEffect(() => {
    const dialog = root.current, command = firstButton.current
    if (!dialog || !command) return
    const focused = document.activeElement
    // Preserve a deliberate choice of the fallback button, but recover focus
    // when the formerly focused close command becomes disabled in flight.
    if (dialog.contains(focused) && focused !== dialog && focused !== command) return
    if (command.disabled) dialog.focus()
    else command.focus()
  }, [status])
  const counts = round?.turnKey === request.turnKey ? round.counts : [0, 0, 0]
  const total = counts.reduce((sum, value) => sum + value, 0)
  const guest = request.channel === 'boss'
  return <div ref={root} className="battle-audience-overlay" role="dialog" aria-modal="true" aria-label={guest ? 'Comando dell’ospite' : 'Votazione del pubblico'} tabIndex={-1}>
    <section className="battle-audience-card">
      <header><div><p className="battle-audience-channel">{guest ? 'Ospite · collegamento privato' : 'Pubblico NPC'}</p>
        <h2>{guest ? 'L’ospite sceglie la mossa' : 'Il pubblico sceglie la mossa'}</h2><p>{request.pokemon.name} · livello {request.pokemon.level} · {request.trainer.name}</p></div>
        <strong className="battle-audience-timer" role="timer" aria-label="Tempo di votazione">
          {status === 'opening' || status === 'closing' ? '…' : status === 'error' ? '!' : `${Math.max(0, Math.ceil(remainingMs / 1000))} s`}
        </strong></header>
      <div className="battle-audience-content"><div className="battle-audience-options">
        {request.options.map((option) => <div key={option.index} className="battle-audience-option">
          <div><strong>{option.name}</strong><span>{option.type} · {option.description}</span></div>
          {!guest && <b>{counts[option.index]} {counts[option.index] === 1 ? 'voto' : 'voti'}</b>}
        </div>)}
        <p role="status">{status === 'error' ? error ?? 'Collegamento interrotto. Riprova oppure continua senza votazione.'
          : status === 'opening' ? guest ? 'Collegamento all’ospite…' : 'Apertura della votazione…' : status === 'closing' ? 'Chiusura della votazione…' : guest ? 'In attesa del comando privato dell’ospite.' : `${total} ${total === 1 ? 'voto ricevuto' : 'voti ricevuti'}`}</p>
        <p className="battle-audience-rules">{guest ? 'Solo l’ospite invitato può scegliere. L’attesa non applica una mossa automatica; la regia decide come proseguire.' : 'Un voto per turno, modificabile fino alla chiusura. In parità si sorteggia fra le mosse più votate; senza voti sceglie il rivale.'}</p>
      </div>{!guest && joinUrl && <aside><AudienceQrCode url={joinUrl} label="Inquadra per votare dal telefono" /></aside>}</div>
      <footer>{status === 'error' ? <button ref={firstButton} className="arka-button" onClick={onRetry}>Riprova collegamento</button>
        : !guest && <button ref={firstButton} className="arka-button" disabled={status !== 'open'} onClick={() => void onCloseEarly()}>{status === 'closing' ? 'Chiusura in corso…' : 'Chiudi votazione'}</button>}
        <button className="arka-button-secondary" onClick={onFallback}>{guest ? 'Regia: usa la scelta automatica' : 'Continua senza votazione'}</button></footer>
    </section>
  </div>
}
