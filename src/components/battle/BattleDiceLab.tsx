import { useEffect, useRef, useState } from 'react'
import { assetUrl } from '@/utils/assetUrl'
import { preloadVfxAssets } from '../vfx/preloadVfxAssets'
import { DiceRollOverlay, type DiceRollDisplay } from './DiceRollOverlay'
import { BATTLE_DICE_ASSET_IDS, BATTLE_DICE_ROLL_VISIBLE_MS } from './battleDiceAssets'

type PreviewRun = {
  roll: DiceRollDisplay
  forceFallback: boolean
}

const ALL_RESULTS = [1, 2, 3, 4, 5, 6]
const TWENTY_RESULTS = Array.from({ length: 20 }, (_, index) => ALL_RESULTS[index % ALL_RESULTS.length])

function previewResults(choice: string): number[] {
  if (choice === 'all') return [...ALL_RESULTS]
  if (choice === 'twenty') return [...TWENTY_RESULTS]
  return [Number(choice)]
}

/** Preview of the same dice overlay used by battles, without changing the save. */
export function BattleDiceLab() {
  const [choice, setChoice] = useState('all')
  const [side, setSide] = useState<'A' | 'B'>('A')
  const [forceFallback, setForceFallback] = useState(false)
  const [run, setRun] = useState<PreviewRun | null>(null)
  const [playing, setPlaying] = useState(false)
  const visibleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    preloadVfxAssets(Object.values(BATTLE_DICE_ASSET_IDS))
  }, [])

  useEffect(() => {
    return () => {
      if (visibleTimerRef.current !== null) window.clearTimeout(visibleTimerRef.current)
    }
  }, [])

  const diceVisible = () => {
    if (visibleTimerRef.current !== null) return
    visibleTimerRef.current = window.setTimeout(() => {
      visibleTimerRef.current = null
      setPlaying(false)
    }, BATTLE_DICE_ROLL_VISIBLE_MS)
  }

  const replay = () => {
    if (playing) return
    const rolls = previewResults(choice)
    const increment = 0
    setPlaying(true)
    setRun((current) => ({
      forceFallback,
      roll: {
        id: (current?.roll.id ?? 0) + 1,
        side,
        moveName: 'Prova dei dadi',
        rolls,
        increment,
        damage: rolls.reduce((sum, value) => sum + value, 0) + increment,
      },
    }))
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-slate-950 px-4 py-6 text-slate-100 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-300">Arkamon</p>
            <h1 className="text-2xl font-black sm:text-3xl">Anteprima dadi di battaglia</h1>
            <p className="text-sm leading-relaxed text-slate-300">Osserva il lancio, il bagliore del risultato e la faccia superiore del dado: i punti indicano il valore ottenuto.</p>
          </div>
          <a
            href="#"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
          >
            Torna al gioco
          </a>
        </header>

        <div className="flex flex-wrap items-end gap-4">
          <label className="grid min-w-48 gap-2 text-sm font-semibold" htmlFor="dice-preview-result">
            Risultati da mostrare
            <select
              id="dice-preview-result"
              value={choice}
              disabled={playing}
              onChange={(event) => setChoice(event.target.value)}
              className="rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 disabled:opacity-60"
            >
              {ALL_RESULTS.map((value) => <option key={value} value={value}>Un dado: {value}</option>)}
              <option value="all">Tutti i risultati: 1–6</option>
              <option value="twenty">20 dadi: risultati fissi</option>
            </select>
          </label>
          <label className="grid min-w-40 gap-2 text-sm font-semibold" htmlFor="dice-preview-side">
            Attaccante
            <select
              id="dice-preview-side"
              value={side}
              disabled={playing}
              onChange={(event) => setSide(event.target.value as 'A' | 'B')}
              className="rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 disabled:opacity-60"
            >
              <option value="A">Giocatore</option>
              <option value="B">Avversario</option>
            </select>
          </label>
          <button
            type="button"
            onClick={replay}
            disabled={playing}
            className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300 disabled:cursor-wait disabled:opacity-60"
          >
            {playing ? 'In riproduzione…' : run ? 'Riproduci di nuovo' : 'Riproduci'}
          </button>
          <p role="status" className="pb-2 text-xs text-slate-400">
            {playing ? 'Lancio in corso.' : run ? 'Risultato del lancio. Puoi riprodurlo di nuovo.' : 'Scegli i risultati e avvia il lancio.'}
          </p>
        </div>

        <label className="flex w-fit items-center gap-2 text-sm text-slate-300" htmlFor="dice-preview-fallback">
          <input
            id="dice-preview-fallback"
            type="checkbox"
            checked={forceFallback}
            disabled={playing}
            onChange={(event) => setForceFallback(event.target.checked)}
            className="h-4 w-4 accent-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
          />
          Simula immagini mancanti
        </label>

        <div
          className="relative aspect-video min-h-[500px] w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
          aria-label="Anteprima del lancio dei dadi"
          aria-busy={playing}
          data-dice-preview-state={playing ? 'playing' : run ? 'result' : 'idle'}
        >
          <img src={assetUrl('/backgrounds/battle_forest.jpg')} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/25" />
          {run ? (
            <DiceRollOverlay key={run.roll.id} roll={run.roll} forceFallback={run.forceFallback} onVisible={diceVisible} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <img src={assetUrl('/ui/logo_arkamon.png')} alt="Arkamon" className="h-auto w-64 max-w-[65%] object-contain" />
              <p className="rounded-lg bg-slate-950/80 px-4 py-3 text-sm text-slate-200">Premi Riproduci per vedere i dadi di battaglia.</p>
            </div>
          )}
        </div>

        <p className="text-xs leading-relaxed text-slate-400">I risultati sono prestabiliti: questa anteprima non lancia dadi casuali e non modifica la partita. Il danno mostrato serve solo a illustrare la somma dei dadi. Al termine il risultato resta visibile per facilitarne il confronto.</p>
      </div>
    </main>
  )
}
