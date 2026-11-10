import { useRef, useState } from 'react'
import { BattleOpeningOverlay } from './BattleOpeningOverlay'
import { StatusToken } from './StatusToken'
import { applicaStato, applicaMossaCura, risolviStatoInizioTurno } from '@/engine/battleEngine'
import { getMossa } from '@/data'
import type { PokemonIstanza } from '@/types'

// A separate 100-HP demonstration makes the percentages directly readable.
const pokemon: PokemonIstanza = { istanzaId: 'lab', specieId: 1, nome: 'Arkamon', livello: 5, hp: 100, xp: 0 }
type Demo = { id: number; kind: 'coin' | 'die'; value: number; title: string; result: string; settle?: () => void }

export function BattleRulesLab() {
  const [demo, setDemo] = useState<Demo | null>(null)
  const sequence = useRef(0)
  const [paralysis, setParalysis] = useState(() => applicaStato(pokemon, 'Paralizzato'))
  const [sleep, setSleep] = useState(() => applicaStato(pokemon, 'Addormentato'))
  const [poison, setPoison] = useState(() => applicaStato(pokemon, 'Avvelenato'))
  const [poisonLog, setPoisonLog] = useState('Prima applicazione: prossimo turno 10%.')
  const [paralysisLog, setParalysisLog] = useState('La paralisi resta finché non viene curata.')
  const [sleepLog, setSleepLog] = useState('Primo turno: sonno obbligatorio, senza tiro di risveglio.')
  const attempt = (target: PokemonIstanza, settle: (value: PokemonIstanza) => void, setLog: (message: string) => void) => {
    const result = risolviStatoInizioTurno(target, 100)
    const finish = () => { settle(result.istanza); setLog(result.messaggi.join(' ')) }
    if (result.tiroStato === undefined) { finish(); return }
    setDemo({ id: ++sequence.current, kind: 'die', value: result.tiroStato,
      title: target.stato?.tipo === 'Paralizzato' ? 'Paralisi: attacchi con 3–6 (66,7%)' : 'Sonno: svegliati con 4–6 (50%)',
      result: result.messaggi.join(' '), settle: finish })
  }
  return (
    <main className="relative h-full overflow-y-auto bg-slate-950 p-4 text-white sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 pr-14">
        <h1 className="text-2xl">Moneta e status</h1>
        <a href="#" className="rounded border px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">Torna al gioco</a>
      </header>
      <p className="mb-5">Prove isolate: non modificano la partita. La dimostrazione del veleno usa 100 HP massimi.</p>
      <button className="mb-6 rounded border p-3" onClick={() => {
        const value = Math.random() < 0.5 ? 0 : 1
        setDemo({ id: ++sequence.current, kind: 'coin', value, title: 'Stesso livello: decide la moneta', result: value === 0 ? 'Testa · Inizia A' : 'Croce · Inizia B' })
      }}>Lancia moneta</button>
      <div className="grid gap-4 md:grid-cols-3">
        <section aria-label="Paralisi" className="rounded-xl border border-amber-500/50 bg-amber-950/20 p-4">
          <h2 className="mb-3 text-lg font-bold">Paralizzato</h2>
          {paralysis.stato ? <StatusToken stato={paralysis.stato} /> : <p role="status">Paralisi terminata.</p>}
          <p className="my-3 text-sm">Agisci per secondo. Un d6 per attaccare: con 1–2 fallisci, con 3–6 attacchi (66,7%). La paralisi guarisce solo con una cura.</p>
          <p role="status" className="mb-3 text-sm">{paralysisLog}</p>
          <button className="rounded border px-3 py-2 disabled:opacity-40" disabled={!paralysis.stato} onClick={() => attempt(paralysis, setParalysis, setParalysisLog)}>Prova paralisi</button>
          <button className="ml-2 rounded border px-3 py-2 disabled:opacity-40" disabled={!paralysis.stato} onClick={() => {
            const result = applicaMossaCura(paralysis, getMossa(59)!, 100)
            setParalysis(result.istanza); setParalysisLog(result.messaggi.join(' '))
          }}>Cura paralisi</button>
          <button className="mt-2 rounded border px-3 py-2" onClick={() => { setParalysis(applicaStato(pokemon, 'Paralizzato')); setParalysisLog('La paralisi resta finché non viene curata.') }}>Reimposta paralisi</button>
        </section>
        <section aria-label="Sonno" className="rounded-xl border border-sky-500/50 bg-sky-950/20 p-4">
          <h2 className="mb-3 text-lg font-bold">Addormentato</h2>
          {sleep.stato ? <StatusToken stato={sleep.stato} /> : <p role="status">Sonno terminato.</p>}
          <p className="my-3 text-sm">Il primo turno si dorme sempre, senza dado. Dal secondo, con 4–6 ti svegli e puoi agire (50%). Massimo tre turni.</p>
          <p role="status" className="mb-3 text-sm">{sleepLog}</p>
          <button className="rounded border px-3 py-2 disabled:opacity-40" disabled={!sleep.stato} onClick={() => attempt(sleep, setSleep, setSleepLog)}>Prova sonno</button>
          <button className="ml-2 rounded border px-3 py-2" onClick={() => { setSleep(applicaStato(pokemon, 'Addormentato')); setSleepLog('Primo turno: sonno obbligatorio, senza tiro di risveglio.') }}>Reimposta sonno</button>
        </section>
        <section aria-label="Veleno" className="rounded-xl border border-violet-500/50 bg-violet-950/20 p-4">
          <h2 className="mb-3 text-lg font-bold">Avvelenato</h2>
          {poison.stato && <StatusToken stato={poison.stato} />}
          <p className="my-3 text-sm">Danno fisso senza dado: 10%, poi 20%, 30%… degli HP massimi.</p>
          <p className="mb-3 font-bold">HP: {poison.hp}/100</p>
          <p role="status" className="mb-3 text-sm">{poisonLog}</p>
          <button className="rounded border px-3 py-2 disabled:opacity-40" disabled={poison.hp <= 0} onClick={() => {
            const result = risolviStatoInizioTurno(poison, 100)
            setPoison(result.istanza)
            setPoisonLog(result.messaggi.join(' '))
          }}>Avanza turno veleno</button>
          <button className="ml-2 rounded border px-3 py-2" onClick={() => { setPoison(applicaStato(pokemon, 'Avvelenato')); setPoisonLog('Prima applicazione: prossimo turno 10%.') }}>Reimposta veleno</button>
        </section>
      </div>
      {demo && <BattleOpeningOverlay key={demo.id} {...demo} onContinue={() => { demo.settle?.(); setDemo(null) }} />}
    </main>
  )
}
