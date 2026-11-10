import { useState } from 'react'
import { useBattleArchiveStore, type ArchivedBattle } from './battleArchiveStore'
import { BattleLogDialog } from './BattleLogPanel'
import { HistoryPagination } from '@/components/ui/HistoryPagination'

/** Archive reading is completely separate from the battle engine and reward actions. */
export function BattleArchivePanel() {
  const matches = useBattleArchiveStore((state) => state.matches)
  const clearArchive = useBattleArchiveStore((state) => state.clearArchive)
  const storageWarning = useBattleArchiveStore((state) => state.storageWarning)
  const saveArchive = useBattleArchiveStore((state) => state.saveArchive)
  const [selected, setSelected] = useState<ArchivedBattle | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [player, setPlayer] = useState<'all' | 1 | 2>('all')
  const [page, setPage] = useState(0)
  const visible = matches.filter((match) => player === 'all' || match.playerId === player)
  const pageSize = 4, currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / pageSize) - 1))
  return <section className="pu-battle-archive space-y-4 text-white" aria-label="Cronache delle battaglie">
    <div><h2 className="text-xl font-bold">Cronache</h2><p className="mt-1 text-sm text-slate-300">Le ultime 20 battaglie concluse, con i dadi reali e i risultati rivelati. Consultarle non modifica la partita.</p></div>
    {storageWarning && <div role="alert" className="rounded-xl border border-amber-400/70 bg-amber-950 p-4 text-amber-100"><p className="text-sm">{storageWarning}</p><button type="button" onClick={() => { saveArchive() }} className="mt-3 rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold">Salva le cronache disponibili</button></div>}
    <label className="flex flex-wrap items-center gap-3 text-sm">Giocatore<select value={player} onChange={(event) => setPlayer(event.target.value === 'all' ? 'all' : Number(event.target.value) as 1 | 2)} className="rounded-lg border border-white/30 bg-slate-900 p-2"><option value="all">Entrambi</option><option value="1">Giocatore 1</option><option value="2">Giocatore 2</option></select></label>
    {!visible.length && <p className="rounded-xl bg-white/5 p-4 text-slate-300">Concludi una battaglia per conservarne qui la cronaca.</p>}
    <ol className="space-y-3">{visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((match) => <li key={match.id} className="rounded-xl border border-white/15 bg-slate-900 p-4"><h3 className="font-bold">{match.title}</h3><p className="mt-1 text-sm text-slate-300">{new Date(match.completedAt).toLocaleString('it-IT')} · Giocatore {match.playerId} · {match.outcome === 'vittoria' ? 'Vittoria' : 'Sconfitta'}</p><button type="button" onClick={() => setSelected(match)} className="mt-3 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold">Rivedi cronaca e dadi</button></li>)}</ol>
    <HistoryPagination page={currentPage} count={visible.length} pageSize={pageSize} onPageChange={setPage} label="Pagine delle cronache delle battaglie" />
    {matches.length > 0 && <div className="border-t border-white/15 pt-4">{confirmClear ? <div className="flex flex-wrap items-center gap-2"><span className="text-sm">Eliminare tutte le cronache? La partita resta salvata.</span><button type="button" onClick={() => { if (clearArchive().ok) setConfirmClear(false) }} className="rounded-lg bg-red-800 px-3 py-2">Elimina cronache</button><button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg border border-white/30 px-3 py-2">Annulla</button></div> : <button type="button" onClick={() => setConfirmClear(true)} className="rounded-lg border border-white/30 px-3 py-2 text-sm">Svuota archivio cronache</button>}</div>}
    {selected && typeof document !== 'undefined' && <BattleLogDialog chronicle={selected.chronicle} onClose={() => setSelected(null)} />}
  </section>
}
