import { useEffect, useState } from 'react'
import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { assetUrl } from '@/utils/assetUrl'
import type { SceneId } from '@/types'
import { SceneTransitionOverlay } from './SceneTransitionOverlay'
import { getSceneTransitionProfile } from './sceneTransitionProfiles'
import './sceneTransitions.css'

type PreviewChoice = 'ordinary' | 'evolution' | 'battle'

const SCENARIOS: Record<PreviewChoice, { scena: SceneId; label: string; background: string }> = {
  ordinary: { scena: 'mappa-principale', label: 'Esplorazione', background: '/maps/Mappa-Finale.jpg' },
  evolution: { scena: 'evoluzione', label: 'Evoluzione', background: '/backgrounds/evolution.png' },
  battle: { scena: 'battaglia', label: 'Battaglia', background: '/backgrounds/battle_forest.jpg' },
}

interface PreviewRun {
  revision: number
  choice: PreviewChoice
  phase: 'cover' | 'reveal'
}

/** A development preview that never creates or changes a game session. */
export function SceneTransitionLab() {
  const { reducedMotion, speed } = useGameMotionPreferences()
  const [choice, setChoice] = useState<PreviewChoice>('ordinary')
  const [revision, setRevision] = useState(0)
  const [run, setRun] = useState<PreviewRun | null>(null)
  const [showDestination, setShowDestination] = useState(false)
  const active = run !== null && !reducedMotion
  const scenario = SCENARIOS[run?.choice ?? choice]

  useEffect(() => {
    if (!reducedMotion) return
    setRun(null)
    setShowDestination(true)
  }, [reducedMotion])

  const replay = () => {
    if (active) return
    if (reducedMotion) {
      setShowDestination(true)
      return
    }
    const nextRevision = revision + 1
    setRevision(nextRevision)
    setShowDestination(false)
    setRun({ revision: nextRevision, choice, phase: 'cover' })
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-slate-950 px-4 py-6 text-slate-100 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-red-300">Arkamon</p>
            <h1 className="text-2xl font-black sm:text-3xl">Anteprima transizioni</h1>
            <p className="text-sm leading-relaxed text-slate-300">Passaggi rapidi per il viaggio, D6 cremisi per l’evoluzione e video VS per la battaglia.</p>
          </div>
          <a href="#" className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300">Torna al gioco</a>
        </header>

        <div className="flex flex-wrap items-end gap-4">
          <label className="grid min-w-48 gap-2 text-sm font-semibold" htmlFor="transition-preview-scenario">
            Passaggio
            <select
              id="transition-preview-scenario"
              value={choice}
              disabled={active}
              onChange={(event) => {
                setChoice(event.target.value as PreviewChoice)
                setShowDestination(reducedMotion)
              }}
              className="rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300 disabled:opacity-60"
            >
              <option value="ordinary">Mappe e schermate</option>
              <option value="evolution">Evoluzione</option>
              <option value="battle">Ingresso in battaglia</option>
            </select>
          </label>
          <button
            type="button"
            onClick={replay}
            disabled={active}
            className="rounded-lg bg-red-700 px-5 py-2 font-bold text-white hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-300 disabled:cursor-wait disabled:opacity-60"
          >
            {reducedMotion ? 'Mostra la scena' : active ? 'In riproduzione…' : 'Riproduci'}
          </button>
          <p role="status" className="pb-2 text-xs text-slate-400">
            {reducedMotion ? 'Movimento ridotto attivo: anteprima statica.' : active ? 'Transizione in corso.' : showDestination ? 'Transizione completata. Puoi riprodurla di nuovo.' : 'Avvia l’anteprima quando vuoi.'}
          </p>
        </div>

        <div
          className="arka-transition-lab-stage relative aspect-video w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
          data-preview-scenario={run?.choice ?? choice}
          aria-label={`Anteprima: ${scenario.label}`}
          aria-busy={active}
        >
          <img src={assetUrl(scenario.background)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-slate-950/25" />
          {!active && !showDestination ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 p-4">
              <img src={assetUrl('/ui/logo_arkamon.png')} alt="Arkamon" className="h-auto w-52 max-w-[55%] object-contain sm:w-72" />
              {choice === 'battle' ? (
                <p className="px-4 py-6 text-5xl font-black italic text-red-300 sm:text-7xl">VS</p>
              ) : (
                <img src={assetUrl('/ui/transitions/arkamon-d6-closed.webp')} alt="Dado D6 cremisi e nero" className="h-auto w-36 max-w-[35%] object-contain sm:w-56" />
              )}
            </div>
          ) : (
            <div className="absolute bottom-0 left-0 right-0 space-y-1 p-5 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-red-200">La prossima tappa</p>
              <p className="text-xl font-black text-white sm:text-3xl">{scenario.label}</p>
            </div>
          )}
          {active && run !== null ? (
            <SceneTransitionOverlay
              key={run.revision}
              phase={run.phase}
              startCovered={false}
              profile={(() => { const profile = getSceneTransitionProfile({ scena: SCENARIOS[run.choice].scena }); return { ...profile, coverMs: profile.coverMs / speed, blendMs: profile.blendMs / speed, durationMs: profile.durationMs / speed, playbackRate: profile.playbackRate * speed } })()}
              onCovered={() => {
                setShowDestination(true)
                setRun((current) => current?.revision === run.revision ? { ...current, phase: 'reveal' } : current)
              }}
              onRevealed={() => setRun((current) => current?.revision === run.revision ? null : current)}
            />
          ) : null}
        </div>

        <p className="text-xs leading-relaxed text-slate-400">Il D6 custodisce la forza degli Arkamon e accompagna i momenti speciali. La navigazione ordinaria usa una dissolvenza breve. L’ingresso in battaglia usa esclusivamente il video VS dedicato, con una breve copertura scura durante il caricamento. L’anteprima non avvia una partita.</p>
      </div>
    </main>
  )
}
