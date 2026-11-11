import { useMemo, useSyncExternalStore } from 'react'
import { battleProfiler } from './battleProfiler'
import { summarizeBattleShots } from './battleShotBenchmark'

const MIB = 1024 * 1024
const number = (value: number, digits = 1) => value.toFixed(digits)
const mib = (bytes: number) => number(bytes / MIB)

function FrameChart({ samples }: { samples: readonly { atMs: number; frames: { fps: number } }[] }) {
  const recent = samples.filter(sample => sample.frames.fps > 0).slice(-60)
  if (recent.length < 2) return <p className="text-xs text-slate-400">Il grafico apparirà dopo i primi campioni.</p>
  const width = 440, height = 110, pad = 10
  const x = (index: number) => pad + index / Math.max(1, recent.length - 1) * (width - 2 * pad)
  const y = (fps: number) => Math.max(pad, Math.min(height - pad, height - pad - Math.min(120, fps) / 120 * (height - 2 * pad)))
  const points = recent.map((sample, i) => x(i).toFixed(1) + ',' + y(sample.frames.fps).toFixed(1)).join(' ')
  return <figure className="min-w-0" aria-label="Andamento della frequenza dei callback di animazione">
    <svg viewBox="0 0 440 110" role="img" aria-label="FPS stimati negli ultimi 60 campioni" className="h-28 w-full rounded-lg bg-slate-950/60">
      <line x1={pad} x2={width - pad} y1={y(60)} y2={y(60)} stroke="#64748b" strokeDasharray="5 5" />
      <polyline points={points} fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="14" y={y(60) - 5} fill="#cbd5e1" fontSize="10">60 Hz</text>
    </svg>
    <figcaption className="mt-1 text-[11px] text-slate-400">Campioni ogni 500 ms · linea tratteggiata: riferimento 60 Hz</figcaption>
  </figure>
}

export function BattlePerformanceLab() {
  const state = useSyncExternalStore(battleProfiler.subscribe, battleProfiler.getSnapshot, battleProfiler.getSnapshot)
  const report = useMemo(() => battleProfiler.report(), [state.sampleCount, state.eventCount, state.shotCount, state.status])
  const shotSummary = useMemo(() => summarizeBattleShots(report?.shots ?? []), [report])
  const recent = report?.samples.slice(-8).reverse() ?? []
  const last = state.lastSample
  const recording = state.status === 'recording'

  return <section id="arkamon-performance-lab" aria-label="Laboratorio prestazioni battaglia" className="space-y-4 text-sm text-[var(--arka-text)]">
    <header className="space-y-1">
      <h3 className="text-lg font-bold">Laboratorio prestazioni</h3>
      <p className="text-xs text-[var(--arka-text-muted)]">Profiler locale della battaglia, senza modifiche al gameplay. Registra soltanto quando scegli Avvia.</p>
    </header>
    <div className="flex flex-wrap items-center gap-2" aria-label="Controlli registrazione">
      <button type="button" disabled={recording} onClick={() => battleProfiler.start()}
        className="rounded-md border border-amber-400 bg-amber-400 px-3 py-2 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
        Avvia registrazione
      </button>
      <button type="button" disabled={!recording} onClick={() => battleProfiler.stop()}
        className="rounded-md border border-[var(--arka-border)] px-3 py-2 font-semibold disabled:opacity-40">
        Termina
      </button>
      <button type="button" onClick={() => battleProfiler.reset()} className="rounded-md border border-[var(--arka-border)] px-3 py-2">Azzera</button>
    </div>
    <p role="status" data-profiler-status={state.status} className="text-xs">
      {state.error ?? (recording ? 'Registrazione attiva: puoi chiudere Admin e giocare normalmente.' :
        state.status === 'stopped' ? 'Registrazione terminata. Esporta i risultati.' : 'Apri una battaglia e avvia la registrazione da questa scheda.')}
    </p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {[
        { label: 'FPS stimati (rAF)', value: last?.frames.count ? number(last.frames.fps) : '—' },
        { label: 'Frame time p95', value: last?.frames.count ? number(last.frames.p95Ms) + ' ms' : '—' },
        { label: 'Frame tardivi / finestra', value: last?.frames.lateFrames ?? 0 },
        { label: 'Gap 60 Hz stimati', value: last?.frames.estimatedMissed60HzFrames ?? 0 },
        { label: 'VFX decodificati', value: last ? mib(last.vfxBytes) + ' / ' + mib(last.vfxBudgetBytes) + ' MiB' : '—' },
        { label: 'Preparazione VFX', value: last?.vfxPrepareLastMs != null ? number(last.vfxPrepareLastMs) + ' ms' : '—' },
        { label: 'Caricamento pagina nativa', value: last?.nativeLoadLastMs != null ? number(last.nativeLoadLastMs) + ' ms' : '—' },
        { label: 'Sprite nativi', value: last ? mib(last.nativeBytes) + ' / ' + mib(last.nativeBudgetBytes) + ' MiB' : '—' },
      ].map(card => <div key={card.label} className="rounded-lg border border-[var(--arka-border)] bg-[var(--arka-surface-hover)] p-2">
        <p className="text-[11px] text-[var(--arka-text-muted)]">{card.label}</p>
        <strong className="block text-base tabular-nums">{card.value}</strong>
      </div>)}
    </div>
    <div className="space-y-1 rounded-lg border border-[var(--arka-border)] p-3">
      <h4 className="font-semibold">Andamento dei frame</h4>
      <FrameChart samples={report?.samples ?? []} />
      <p className="text-xs text-[var(--arka-text-muted)]">Battaglia rilevata: {state.battlePresent ? 'sì' : 'no'} · Durata {number(state.durationMs / 1000)} s · Campioni {state.sampleCount}</p>
      {last && <p className="text-xs text-[var(--arka-text-muted)]">
        Canvas: {last.pagedRenderers} paginati, {last.atlasRenderers} atlanti · caricamenti nativi/VFX {last.nativeLoads}/{last.vfxPrepares} · ultimo disegno {last.lastCanvasDrawMs === null ? 'n.d.' : number(last.lastCanvasDrawMs, 2) + ' ms'} · decodifiche attive {last.nativeDecodes} · long task {last.longTasks}
      </p>}
    </div>
    <section aria-label="Benchmark per attacco" className="space-y-2 rounded-lg border border-[var(--arka-border)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">Benchmark per attacco</h4>
        <span data-profiler-shot-count={state.shotCount} className="text-xs text-[var(--arka-text-muted)]">
          {state.shotCount} sequenze registrate
        </span>
      </div>
      <p className="text-xs text-[var(--arka-text-muted)]">
        Misure sui singoli frame dell'attacco, dalla preparazione al completamento visivo.
        Confronta gli stessi ID di specie e mossa; l'ordine prima/ripetizione non certifica che la cache sia fredda o calda.
      </p>
      {shotSummary.length === 0
        ? <p className="text-xs">Nessun attacco completo misurato. Avvia la registrazione, chiudi Admin ed esegui una mossa.</p>
        : <div className="overflow-x-auto">
          <table className="w-full min-w-[390px] text-left text-xs tabular-nums" data-profiler-comparison>
            <thead><tr>
              <th className="p-1">Animazione</th><th className="p-1">Prove</th>
              <th className="p-1">p95 prima</th><th className="p-1">p95 ultima</th><th className="p-1">Δ p95</th>
            </tr></thead>
            <tbody>{shotSummary.map(group => <tr key={group.speciesId + '-' + group.moveId + '-' + group.view + '-' + group.choreography}
              className="border-t border-[var(--arka-border)]">
              <td className="p-1">Specie #{group.speciesId} · Mossa #{group.moveId}
                <small className="block text-[var(--arka-text-muted)]">{group.view} · {group.choreography}</small>
              </td>
              <td className="p-1">{group.attempts}</td>
              <td className="p-1">{group.firstP95Ms === null ? 'n.d.' : number(group.firstP95Ms) + ' ms'}</td>
              <td className="p-1">{group.latestP95Ms === null ? 'n.d.' : number(group.latestP95Ms) + ' ms'}</td>
              <td className="p-1">{group.changeP95Ms === null ? '—' : (group.changeP95Ms > 0 ? '+' : '') + number(group.changeP95Ms) + ' ms'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      <details className="text-xs">
        <summary className="cursor-pointer">Dettaglio sequenze, memoria e caricamenti</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left tabular-nums">
            <thead><tr><th>Specie/Mossa</th><th>Tentativo</th><th>Esito</th><th>p95</th><th>Picco cache</th><th>Caricamenti</th></tr></thead>
            <tbody>{report?.shots.slice(-20).reverse().map(shot => <tr key={shot.sequence + '-' + shot.startedAtMs}
              className="border-t border-[var(--arka-border)]">
              <td>{shot.speciesId}/{shot.moveId}</td><td>{shot.attempt} ({shot.repetition})</td><td>{shot.outcome}</td>
              <td>{shot.frames.count ? number(shot.frames.p95Ms) + ' ms' : 'n.d.'}</td>
              <td>{mib(shot.nativePeakBytes + shot.vfxPeakBytes)} MiB</td>
              <td>{shot.nativeLoads} native / {shot.vfxPrepares} VFX</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
    <div className="space-y-2">
      <h4 className="font-semibold">Esporta la sessione</h4>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!report?.samples.length} onClick={() => battleProfiler.download('json')}
          className="rounded-md border border-[var(--arka-border)] px-3 py-2 font-medium disabled:opacity-40">Scarica JSON</button>
        <button type="button" disabled={!report?.samples.length} onClick={() => battleProfiler.download('csv')}
          className="rounded-md border border-[var(--arka-border)] px-3 py-2 font-medium disabled:opacity-40">Scarica CSV</button>
        <button type="button" disabled={!report?.shots.length} onClick={() => battleProfiler.download('shots-csv')}
          className="rounded-md border border-[var(--arka-border)] px-3 py-2 font-medium disabled:opacity-40">Scarica attacchi CSV</button>
      </div>
      <p className="text-[11px] text-[var(--arka-text-muted)]">Nessun salvataggio, nome dei giocatori o URL degli asset nell'export; i soli identificativi sono ID numerici del catalogo delle specie e delle mosse. La registrazione è conservata soltanto nella memoria di questa scheda del browser, fino al suo aggiornamento.</p>
    </div>
    <details className="rounded-lg border border-[var(--arka-border)] p-3">
      <summary className="cursor-pointer font-semibold">Cronologia tecnica ({report?.events.length ?? 0} eventi)</summary>
      <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
        {report?.events.slice(-25).map((event, i) => <li key={event.atMs + '-' + i}>
          {number(event.atMs / 1000)}s · {event.phase} · {event.cameraBeat} · {event.choreography}
        </li>)}
      </ol>
    </details>
    <details className="rounded-lg border border-[var(--arka-border)] p-3">
      <summary className="cursor-pointer font-semibold">Ultime finestre di campionamento</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[350px] text-left text-xs tabular-nums">
          <thead><tr><th className="p-1">Tempo</th><th className="p-1">FPS</th><th className="p-1">p95</th><th className="p-1">VFX MiB</th></tr></thead>
          <tbody>{recent.map(sample => <tr key={sample.atMs} className="border-t border-[var(--arka-border)]">
            <td className="p-1">{number(sample.atMs / 1000)}s</td><td className="p-1">{number(sample.frames.fps)}</td>
            <td className="p-1">{number(sample.frames.p95Ms)}ms</td><td className="p-1">{mib(sample.vfxBytes)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
    <p className="border-t border-[var(--arka-border)] pt-3 text-[11px] text-[var(--arka-text-muted)]">
      Questi sono callback requestAnimationFrame, non FPS reali della GPU. Il conteggio dei frame mancati è una stima rispetto a 60 Hz; le schede in background sono escluse. Le cache misurano immagini decodificate trattenute, non tutta la memoria VRAM.
    </p>
  </section>
}
