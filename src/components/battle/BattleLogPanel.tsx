import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BattleChronicle, BattleLogEvent } from '@/types'
import { chronicleText } from './battleChronicle'
import { makeDialogBackgroundInert } from './modalFocus'

function EventDetails({ event }: { event: BattleLogEvent }) {
  return <article className="rounded-xl border border-white/15 bg-slate-900 p-4" aria-label={event.title}>
    <h3 className="text-lg font-bold text-white">{event.title}</h3>
    {event.actor && <p className="mt-1 text-sm text-slate-300">{event.side === 'A' ? 'Giocatore' : event.side === 'B' ? 'Avversario' : 'Creatura'} · {event.actor.name} · livello {event.actor.level}</p>}
    {!!event.dice?.length && <p className="mt-3 rounded-lg bg-blue-950 p-3 font-semibold text-blue-100">Dadi reali: {event.dice.join(' + ')} = {event.diceSum ?? event.dice.reduce((sum, die) => sum + die, 0)}</p>}
    {event.baseDamage !== undefined && <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-200">
      <dt>Bonus della mossa</dt><dd>{event.increment ?? 0}</dd>
      <dt>Base prima dei tipi</dt><dd>{event.baseDamage}</dd>
      <dt>Efficacia del tipo</dt><dd>×{event.effectiveness ?? 1}</dd>
      <dt>Suprema</dt><dd>{event.supreme ? '×2 dopo l’arrotondamento del danno normale' : 'No'}</dd>
      <dt>Danno finale</dt><dd className="font-bold text-rose-200">{event.damage ?? 0}</dd>
    </dl>}
    {event.hpBefore !== undefined && <p className="mt-3 font-semibold text-emerald-200">HP: {event.hpBefore} → {event.hpAfter}</p>}
    {event.levelBefore !== undefined && <p className="mt-2 text-amber-200">Livello: {event.levelBefore} → {event.levelAfter}</p>}
    {event.messages.map((message, index) => <p key={index} className="mt-2 text-sm leading-relaxed text-slate-200">{message}</p>)}
  </article>
}

export function BattleLogDialog({ chronicle, onClose }: { chronicle: BattleChronicle; onClose: () => void }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIndex = Math.max(0, selectedId ? chronicle.events.findIndex((event) => event.id === selectedId) : chronicle.events.length - 1)
  const selected = chronicle.events[Math.max(0, selectedIndex)]
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const restore = makeDialogBackgroundInert(dialog)
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'))
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      event.preventDefault()
      const elements = focusables()
      const index = elements.findIndex((element) => element === document.activeElement)
      const next = event.shiftKey ? (index - 1 + elements.length) % elements.length : (index + 1) % elements.length
      ;(elements[next] ?? dialog).focus()
    }
    const focus = (event: FocusEvent) => { if (event.target instanceof Node && !dialog.contains(event.target)) dialog.focus() }
    document.addEventListener('keydown', key, true)
    document.addEventListener('focusin', focus)
    dialog.focus()
    return () => { restore(); document.removeEventListener('keydown', key, true); document.removeEventListener('focusin', focus); if (previous?.isConnected) previous.focus() }
  }, [])
  const download = (format: 'json' | 'txt') => {
    const blob = new Blob([format === 'json' ? JSON.stringify(chronicle, null, 2) : chronicleText(chronicle)], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `Arkamon-cronaca-${chronicle.battleId.replace(/[^a-zA-Z0-9_-]/g, '')}.${format}`
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return createPortal(<div data-battle-log-dialog className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/85 p-3 sm:p-6">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950 p-4 text-white shadow-2xl outline-none sm:p-6">
      <header className="flex shrink-0 items-start justify-between gap-4"><div><h2 id={titleId} className="text-xl font-bold">Cronaca della battaglia</h2><p className="mt-1 text-sm text-slate-300">Rivedi i risultati già rivelati. I dadi non vengono lanciati di nuovo.</p></div><button type="button" onClick={onClose} className="rounded-lg border border-white/30 px-3 py-2 hover:bg-white/10">Chiudi</button></header>
      {chronicle.omittedEvents > 0 && <p className="mt-3 text-sm text-amber-200">Sono conservati gli ultimi {chronicle.events.length} eventi; {chronicle.omittedEvents} precedenti sono stati omessi.</p>}
      {chronicle.events.length ? <div className="mt-4 grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[minmax(180px,1fr)_2fr]">
        <ol className="max-h-[32dvh] overflow-y-auto rounded-xl bg-slate-900/70 p-2 md:max-h-none" aria-label="Eventi rivelati">{chronicle.events.map((event, index) => <li key={event.id}><button type="button" aria-current={selected?.id === event.id ? 'step' : undefined} onClick={() => setSelectedId(event.id)} className={`mb-1 w-full rounded-lg p-3 text-left text-sm ${selected?.id === event.id ? 'bg-blue-700 text-white' : 'hover:bg-white/10'}`}>{index + 1}. {event.title}</button></li>)}</ol>
        <div className="min-w-0 space-y-3">{selected && <EventDetails event={selected} />}<nav aria-label="Rivedi la cronaca" className="flex flex-wrap gap-2"><button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedId(chronicle.events[selectedIndex - 1].id)} className="rounded-lg border border-white/30 px-3 py-2 disabled:opacity-40">Precedente</button><button type="button" disabled={selectedIndex >= chronicle.events.length - 1} onClick={() => setSelectedId(chronicle.events[selectedIndex + 1].id)} className="rounded-lg border border-white/30 px-3 py-2 disabled:opacity-40">Successivo</button><button type="button" onClick={() => setSelectedId(null)} className="rounded-lg border border-white/30 px-3 py-2">Ultimo evento</button></nav></div>
      </div> : <p className="my-6 text-slate-300">La cronaca si riempie quando vengono mostrati i risultati.</p>}
      <footer className="mt-4 flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => download('json')} className="rounded-lg bg-blue-700 px-3 py-2">Scarica replay JSON</button><button type="button" onClick={() => download('txt')} className="rounded-lg border border-white/30 px-3 py-2">Scarica cronaca di testo</button></footer>
    </section>
  </div>, document.body)
}

export function BattleLogPanel({ chronicle, busy = false }: { chronicle: BattleChronicle; busy?: boolean }) {
  const [open, setOpen] = useState(false)
  return <><button type="button" disabled={busy} onClick={() => setOpen(true)} data-battle-chronicle-command className="absolute right-3 top-3 z-30 rounded-lg border border-white/35 bg-slate-950/90 px-3 py-2 text-sm font-bold text-white shadow-lg hover:bg-slate-800 disabled:opacity-50">Cronaca · {chronicle.events.length}</button>{open && typeof document !== 'undefined' && <BattleLogDialog chronicle={chronicle} onClose={() => setOpen(false)} />}</>
}
