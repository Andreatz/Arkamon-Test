import { getAppliedAudioSnapshot } from '@/presentation/presentationRuntime'
import { audioWorkspaceBaseline } from './audioWorkspaceModel'
import { scheduleAudioClip } from '@/utils/soundManager'
import selections from '@/data/audio-selections.json'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MoveVfx, type MoveVfxEvent } from '../MoveVfx'
import { MOVE_VFX_ASSIGNMENTS, VFX_MOVE_PREVIEWS } from '../vfx/moveVfxAssignments'
import { getMoveVfxDurationMs } from '../vfx/resolveMoveVfxAsset'
import { assetUrl } from '@/utils/assetUrl'
import {
  AUDIO_CHOICES_KEY, AUDIO_TAGS, GAME_AUDIO_EVENTS, audioSourceUrl, suggestedAudio,
  type AudioCatalog, type AudioChoice, type AudioChoices, type AudioEntry,
} from './audioCuration'

const CONTROL = 'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300'
const ELEMENT_TAGS: Record<string, string[]> = {
  Normale: ['impact', 'slash', 'whoosh'], Fuoco: ['fire'], Acqua: ['water'], Elettro: ['electric'],
  Erba: ['plant'], Terra: ['earth'], Psico: ['psychic', 'magic'], Oscurità: ['dark'],
}

export function AudioLab() {
  const [catalog, setCatalog] = useState<AudioCatalog | null>(null)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void fetch(assetUrl('audio-lab/catalog.json'), { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Catalogo non disponibile'); return response.json() })
      .then(setCatalog).catch((error: Error) => { if (error.name !== 'AbortError') setLoadError(error.message) })
    return () => controller.abort()
  }, [])
  if (!catalog) return <main className="h-full bg-slate-950 p-8 text-white" role="status">{loadError || 'Caricamento della libreria audio…'}</main>
  return <AudioWorkspace catalog={catalog} />
}

function AudioWorkspace({ catalog }: { catalog: AudioCatalog }) {
  const [baseline] = useState(() => {
    let draft: string | null = null
    try { draft = localStorage.getItem(AUDIO_CHOICES_KEY) } catch { /* Applied choices remain usable without storage. */ }
    return audioWorkspaceBaseline(catalog, getAppliedAudioSnapshot(), draft)
  })
  const byId = baseline.files
  const [choices, setChoices] = useState<AudioChoices>(baseline.choices)
  const [target, setTarget] = useState('move:1')
  const [moveSearch, setMoveSearch] = useState('')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('all')
  const [shortlistOnly, setShortlistOnly] = useState(true)
  const [page, setPage] = useState(0)
  const [soundId, setSoundId] = useState(choices['move:1']?.soundId ?? '')
  const [volume, setVolume] = useState(choices['move:1']?.volume ?? 0.45)
  const [cue, setCue] = useState<'start' | 'impact'>(choices['move:1']?.cue ?? 'impact')
  const [delayMs, setDelayMs] = useState(choices['move:1']?.delayMs ?? 0)
  const [message, setMessage] = useState('Scegli una mossa o un evento, poi ascolta i candidati.')
  const [playing, setPlaying] = useState(false)
  const [playedIds, setPlayedIds] = useState<Set<string>>(() => new Set())
  const [effect, setEffect] = useState<MoveVfxEvent | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scheduledAudio = useRef<(() => void) | null>(null)
  const runId = useRef(0)
  const originalSound = byId.get(soundId)
  const normalized = baseline.sounds[soundId]
  const sound = originalSound && normalized ? { ...originalSound, src: normalized.src } : originalSound
  const assignment = MOVE_VFX_ASSIGNMENTS.find((entry) => `move:${entry.sourceMoveId}` === target)
  const move = assignment ? VFX_MOVE_PREVIEWS[MOVE_VFX_ASSIGNMENTS.indexOf(assignment)] : undefined
  const event = GAME_AUDIO_EVENTS.find((entry) => `event:${entry.id}` === target)
  const targetLabel = assignment ? `${assignment.name} · ${assignment.element} · ${assignment.tier}` : event?.label ?? ''
  const tags = assignment ? (assignment.type.includes('Recupero') || assignment.type.includes('Cura') ? ['heal']
    : assignment.tier === 'status' ? ['status', ...(ELEMENT_TAGS[assignment.element] ?? [])] : ELEMENT_TAGS[assignment.element] ?? []) : event?.tags ?? []
  const duration = move ? getMoveVfxDurationMs(move) : 1000
  const suggestions = suggestedAudio(catalog.files, tags, duration)
  const filtered = useMemo(() => {
    const words = query.toLocaleLowerCase('it').trim().split(/\s+/).filter(Boolean)
    return catalog.files.filter((file) => (!shortlistOnly || file.shortlist) && (tag === 'all' || file.tags.includes(tag))
      && words.every((word) => `${file.name} ${file.pack} ${file.tags.join(' ')}`.toLocaleLowerCase('it').includes(word)))
  }, [catalog, query, tag, shortlistOnly])
  const shown = filtered.slice(page * 40, (page + 1) * 40)
  const visibleMoves = MOVE_VFX_ASSIGNMENTS.filter((entry) => `${entry.sourceMoveId} ${entry.name} ${entry.element} ${entry.arkamon.map((p) => p.name).join(' ')}`.toLocaleLowerCase('it').includes(moveSearch.toLocaleLowerCase('it')))
  const selectedChoice = choices[target]

  useEffect(() => () => {
    runId.current++
    scheduledAudio.current?.()
    audioRef.current?.pause()
  }, [])

  function stop() {
    runId.current++
    scheduledAudio.current?.()
    scheduledAudio.current = null
    audioRef.current?.pause()
    setPlaying(false)
    setEffect(null)
  }
  function selectSound(id: string) { stop(); setSoundId(id); setMessage('Candidato da ascoltare.') }
  function selectTarget(value: string) {
    stop(); setTarget(value)
    const choice = choices[value]
    if (choice) { setSoundId(choice.soundId); setVolume(choice.volume); setCue(choice.cue); setDelayMs(choice.delayMs) }
    setMessage(choice ? 'Scelta salvata caricata.' : 'Nessuna scelta salvata per questa destinazione.')
  }
  async function play(combined: boolean) {
    if (!sound || !audioRef.current) return
    stop()
    const id = runId.current
    const player = audioRef.current
    player.volume = volume
    player.currentTime = 0
    const startAudio = () => {
      if (runId.current !== id) return
      scheduledAudio.current = scheduleAudioClip({ src: sound.src, volume, channel: 'preview',
        delayMs: combined ? delayMs : 0,
        onStart: () => { if (runId.current === id) { setMessage('Ascolto in corso.'); setPlayedIds(ids => new Set([...ids, sound.id])) } },
        onEnd: () => { if (runId.current === id) { setPlaying(false); setMessage('Ascolto terminato.') } },
        onError: () => { if (runId.current === id) { setPlaying(false); setEffect(null); setMessage('Riproduzione non riuscita: prova il lettore audio oppure un altro formato.') } },
      })
    }
    setPlaying(true)
    setMessage(combined && move ? 'Preparazione del VFX…' : 'Preparazione audio…')
    if (combined && move) {
      // The VFX reports its prepared start/impact, so slow image loads cannot anticipate audio.
      pendingAudio.current = { id, cue, start: startAudio }
      setEffect({ id, move, side: 'A' })
    } else startAudio()
  }
  const pendingAudio = useRef<{ id: number; cue: 'start' | 'impact'; start: () => void } | null>(null)
  function vfxCue(point: 'start' | 'impact') {
    const pending = pendingAudio.current
    if (pending && pending.id === runId.current && pending.cue === point) { pendingAudio.current = null; pending.start() }
  }
  function save(status: AudioChoice['status']) {
    if (!sound) return
    const next = { ...choices, [target]: { soundId, volume, cue, delayMs, status } }
    setChoices(next)
    try { localStorage.setItem(AUDIO_CHOICES_KEY, JSON.stringify({ version: 1, choices: next })); setMessage(status === 'confirmed' ? 'Scelta confermata nel laboratorio. Il gioco non è stato modificato.' : 'Candidato salvato nel laboratorio.') }
    catch { setMessage('Memoria del browser non disponibile. Esporta le scelte per conservarle.'); }
  }
  function removeChoice() {
    stop()
    const next = { ...choices }
    next[target] = (selections.choices as AudioChoices)[target]
    setChoices(next)
    const reset = next[target]
    if (reset) { setSoundId(reset.soundId); setVolume(reset.volume); setCue(reset.cue); setDelayMs(reset.delayMs) }
    try { localStorage.setItem(AUDIO_CHOICES_KEY, JSON.stringify({ version: 1, choices: next })); setMessage('Scelta di Codex ripristinata.') }
    catch { setMessage('Rimozione valida solo per questa sessione: memoria del browser non disponibile.') }
  }
  function exportChoices() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), previewOnly: true, choices,
      sounds: Object.fromEntries(Object.values(choices).map((choice) => [choice.soundId, baseline.sounds[choice.soundId]?.src ?? byId.get(choice.soundId)?.src])) }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = 'arkamon-audio-scelte.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const soundButton = (file: AudioEntry) => <button key={file.id} type="button" onClick={() => selectSound(file.id)} aria-pressed={soundId === file.id}
    className={`w-full rounded-lg border p-3 text-left text-xs ${soundId === file.id ? 'border-amber-300 bg-amber-300/10' : 'border-slate-700 bg-slate-900 hover:bg-slate-800'}`}>
    <span className="block break-words font-bold">{file.name}</span>
    <span className="mt-1 block text-slate-400">{file.duration === null ? 'Durata non disponibile' : `${file.duration.toFixed(2)} s`} · {file.format.toUpperCase()} · {file.shortlist ? 'Proposta da ascoltare' : 'Libreria'}</span>
    <span className="block break-words text-slate-500">{file.pack}</span>
    {file.error ? <span className="block text-rose-300">Da verificare: metadati non leggibili</span> : null}
  </button>

  return <main className="h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 sm:p-6">
    <header className="mx-auto mb-6 max-w-7xl space-y-3">
      <p className="text-xs tracking-widest text-amber-300">ARKAMON · AUDIO LAB</p>
      <h1 className="text-3xl font-black">Scegli il suono di ogni effetto</h1>
      <p className="max-w-4xl text-sm text-slate-300">{catalog.total.toLocaleString('it')} suoni · {catalog.shortlistCount} candidati · 276 mosse. 286 abbinamenti scelti da Codex sono già attivi nel gioco. Scelte semantiche, senza revisione all’ascolto. Qui puoi confrontarle; le tue modifiche restano una bozza. Apri Admin → Progetto visivo per applicarle al gioco.</p>
      <div className="flex flex-wrap gap-3"><a className={CONTROL} href="#">Torna al gioco</a><button className={CONTROL} onClick={exportChoices}>Esporta scelte ({Object.keys(choices).length})</button></div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="space-y-3 rounded-xl border border-slate-700 p-4">
        <h2 className="font-bold text-amber-300">1. Destinazione</h2>
        <label className="grid gap-1 text-xs">Cerca mossa o Arkamon<input className={CONTROL} value={moveSearch} onChange={(e) => setMoveSearch(e.target.value)} /></label>
        <label className="grid gap-1 text-xs">Mossa<select className={CONTROL} value={assignment ? target : ''} onChange={(e) => selectTarget(e.target.value)}>
          <option value="" disabled>Scegli una mossa</option>
          {assignment && !visibleMoves.includes(assignment) ? <option value={target}>{assignment.name} (selezionata)</option> : null}
          {visibleMoves.map((entry) => <option key={entry.sourceMoveId} value={`move:${entry.sourceMoveId}`}>#{entry.sourceMoveId} {entry.name} · {entry.element}</option>)}
        </select></label>
        <label className="grid gap-1 text-xs">Evento del gioco<select className={CONTROL} value={event ? target : ''} onChange={(e) => selectTarget(e.target.value)}><option value="" disabled>Scegli un evento</option>{GAME_AUDIO_EVENTS.map((entry) => <option key={entry.id} value={`event:${entry.id}`}>{entry.label}</option>)}</select></label>
        <p className="text-sm font-bold">{targetLabel}</p>
        {assignment ? <p className="text-xs text-slate-400">{assignment.arkamon.map((p) => p.name).join(', ')}</p> : null}
        <h3 className="pt-3 text-sm font-bold">Candidati per questa destinazione</h3>
        <p className="text-xs text-slate-400">Somiglianza di nome e durata; non una valutazione all’ascolto.</p>
        <div className="max-h-96 space-y-2 overflow-y-auto">{suggestions.map(soundButton)}{!suggestions.length ? <p className="text-sm">Nessuna proposta: esplora la libreria.</p> : null}</div>
      </aside>
      <section className="min-w-0 space-y-4">
        <h2 className="font-bold text-amber-300">2. Ascolta e confronta</h2>
        <div aria-label="Anteprima audio e VFX" className="relative isolate h-80 overflow-hidden rounded-xl border border-slate-700 bg-cover bg-center" style={{ backgroundImage: `url(${assetUrl('backgrounds/battle_forest.jpg')})` }}>
          <span className="absolute bottom-10 left-12 rounded-full border border-emerald-300 bg-slate-950/80 p-5">A</span><span className="absolute right-12 top-10 rounded-full border border-rose-300 bg-slate-950/80 p-5">B</span>
          {effect ? <MoveVfx key={effect.id} effect={effect} onStart={() => vfxCue('start')} onImpact={() => vfxCue('impact')} /> : <div className="absolute inset-x-4 top-1/2 rounded bg-slate-950/80 p-4 text-center text-sm">{move ? 'Riproduci insieme per confrontare suono e VFX.' : `Evento: ${event?.label}`}</div>}
        </div>
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h3 className="break-words font-bold">{sound?.name ?? 'Seleziona un suono'}</h3>
          <p className="break-all text-xs text-slate-400">{sound?.src}</p>
          {sound ? <audio key={sound.id} ref={audioRef} controls preload="metadata" className="w-full" src={audioSourceUrl(sound.src, import.meta.env.BASE_URL)} onLoadedMetadata={(e) => { e.currentTarget.volume = volume }} onPlay={() => { setPlaying(true); setPlayedIds((ids) => new Set([...ids, sound.id])) }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setMessage('Ascolto terminato.') }} onError={() => { setPlaying(false); setEffect(null); setMessage('Il browser non può riprodurre questo file. Scegli un altro candidato.') }} /> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs">Volume {Math.round(volume * 100)}%<input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => { const value = Number(e.target.value); setVolume(value); if (audioRef.current) audioRef.current.volume = value }} /></label>
            <label className="grid gap-1 text-xs">Avvio del suono<select className={CONTROL} value={cue} onChange={(e) => { stop(); setCue(e.target.value as 'start' | 'impact') }}><option value="start">Inizio VFX</option><option value="impact">Impatto VFX</option></select></label>
            <label className="grid gap-1 text-xs">Ritardo aggiuntivo (ms)<input className={CONTROL} type="number" min="0" max="2000" step="50" value={delayMs} onChange={(e) => { stop(); setDelayMs(Math.max(0, Math.min(2000, Number(e.target.value) || 0))) }} /></label>
          </div>
          <div className="flex flex-wrap gap-2"><button className={CONTROL} disabled={!sound} onClick={() => void play(false)}>Ascolta suono</button><button className={`${CONTROL} border-amber-300 text-amber-200`} disabled={!sound || !move} onClick={() => void play(true)}>Riproduci insieme</button><button className={CONTROL} onClick={stop}>Ferma</button></div>
          <p role="status" className="text-sm text-amber-200" data-audio-playing={playing}>{message}</p>
          {sound?.signal ? <p className="text-xs text-slate-400">File originale: picco {sound.signal.peakDb} dB · RMS {sound.signal.rmsDb} dB · silenzio iniziale {sound.signal.leadingSilenceMs} ms. Valori misurati, non giudizi sul timbro.</p> : null}
        </div>
        <div className="space-y-3 rounded-xl border border-slate-700 p-4"><h2 className="font-bold text-amber-300">3. Conserva la scelta</h2>
          <p className="text-xs text-slate-400">{selectedChoice ? `Salvato: ${byId.get(selectedChoice.soundId)?.name} · ${selectedChoice.status === 'confirmed' ? 'confermato da te' : selectedChoice.status === 'selected' ? 'scelto da Codex' : 'candidato'}` : 'Nessuna scelta salvata.'}</p>
          <div className="flex flex-wrap gap-2"><button className={CONTROL} disabled={!sound} onClick={() => save('candidate')}>Salva candidato</button><button className={CONTROL} disabled={!sound || !playedIds.has(sound.id)} onClick={() => save('confirmed')}>Conferma dopo ascolto</button><button className={CONTROL} disabled={!selectedChoice} onClick={removeChoice}>Ripristina scelta di Codex</button></div>
        </div>
      </section>
      <aside className="min-w-0 space-y-3 rounded-xl border border-slate-700 p-4">
        <h2 className="font-bold text-amber-300">Libreria audio</h2>
        <label className="grid gap-1 text-xs">Cerca suono<input className={CONTROL} type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} placeholder="Nome o cartella…" /></label>
        <label className="grid gap-1 text-xs">Categoria<select className={CONTROL} value={tag} onChange={(e) => { setTag(e.target.value); setPage(0) }}><option value="all">Tutte</option>{Object.entries(AUDIO_TAGS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shortlistOnly} onChange={(e) => { setShortlistOnly(e.target.checked); setPage(0) }} />Solo selezione iniziale</label>
        <p className="text-xs text-slate-400">{filtered.length} risultati · pagina {page + 1} di {Math.max(1, Math.ceil(filtered.length / 40))}</p>
        <div className="max-h-[640px] space-y-2 overflow-y-auto">{shown.map(soundButton)}{!shown.length ? <p>Nessun risultato.</p> : null}</div>
        <div className="flex gap-2"><button className={CONTROL} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Precedenti</button><button className={CONTROL} disabled={(page + 1) * 40 >= filtered.length} onClick={() => setPage((p) => p + 1)}>Successivi</button></div>
        <p className="text-xs text-slate-500">{catalog.metadataErrors} file hanno metadati non leggibili e sono esclusi dalle proposte. I file WMA possono richiedere conversione per il browser.</p>
      </aside>
    </div>
  </main>
}
