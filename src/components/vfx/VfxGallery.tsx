import { useGameMotionPreferences } from '@/settings/gamePreferences'
import { useEffect, useMemo, useState } from 'react'
import { VfxPreviewPanel, type VfxPreviewBackground } from './VfxPreviewPanel'
import type { VfxAnchor, VfxPlaybackKind } from './types'
import { MOVE_VFX_ASSETS, type MoveVfxAssetId } from './vfxManifest'
import {
  filterVfxAssetIds,
  getVfxCuration,
  getVfxReviewLabel,
  VFX_CURATION_CATEGORIES,
  type VfxCurationCategory,
} from './vfxCuration'

type KindFilter = 'all' | VfxPlaybackKind

const ANCHORS: VfxAnchor[] = ['attacker', 'target', 'self', 'center', 'screen']
const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const CONTROL_CLASS = 'min-w-0 rounded bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-300'
export function VfxGallery() {
  const [selectedId, setSelectedId] = useState<MoveVfxAssetId>('generated:direction-img_effect_skill_spark_0-images_nested_sheet')
  const [referenceId, setReferenceId] = useState<MoveVfxAssetId | null>(null)
  const [replayId, setReplayId] = useState(1)
  const [side, setSide] = useState<'A' | 'B'>('A')
  const [anchor, setAnchor] = useState<VfxAnchor | 'default'>('default')
  const [scale, setScale] = useState<number | 'default'>('default')
  const [background, setBackground] = useState<VfxPreviewBackground>('battle')
  const [repeat, setRepeat] = useState(false)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [assetSearch, setAssetSearch] = useState('')
  const [category, setCategory] = useState<VfxCurationCategory | 'all'>('all')
  const [curatedOnly, setCuratedOnly] = useState(false)
  const [recommendedOnly, setRecommendedOnly] = useState(true)
  const { reducedMotion: reduceMotion, speed } = useGameMotionPreferences()
  const asset = MOVE_VFX_ASSETS[selectedId]
  const reference = referenceId ? MOVE_VFX_ASSETS[referenceId] : undefined
  const visibleAssetIds = useMemo(() => filterVfxAssetIds(MOVE_VFX_ASSETS, {
    search: assetSearch,
    category,
    curatedOnly,
    recommendedOnly,
  }).filter((id) => kindFilter === 'all' || MOVE_VFX_ASSETS[id].kind === kindFilter), [assetSearch, category, curatedOnly, recommendedOnly, kindFilter])
  const selectedIndex = visibleAssetIds.indexOf(selectedId)
  const playbackKey = `${selectedId}-${referenceId}-${replayId}-${side}-${anchor}-${scale}-${background}-${reduceMotion}`
  const repeatDelay = Math.max(asset.durationMs, reference?.durationMs ?? 0) / speed + 500

  useEffect(() => {
    if (!repeat || reduceMotion) return
    // Both panels restart together, after the longer effect has finished.
    const timer = window.setTimeout(() => setReplayId((value) => value + 1), repeatDelay)
    return () => window.clearTimeout(timer)
  }, [repeat, reduceMotion, repeatDelay, playbackKey])

  const selectAsset = (id: MoveVfxAssetId) => {
    setSelectedId(id)
    setReplayId((value) => value + 1)
  }

  const resetFilters = () => {
    setAssetSearch('')
    setCategory('all')
    setCuratedOnly(false)
    setRecommendedOnly(false)
    setKindFilter('all')
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-slate-950 text-slate-100 md:flex-row md:overflow-hidden">
      <aside className="w-full shrink-0 space-y-3 border-b border-white/10 p-4 md:w-72 md:overflow-y-auto md:border-b-0 md:border-r">
        <h1 className="text-xl font-black text-amber-300">VFX Lab</h1>
        <p className="text-xs text-slate-400">Confronta i candidati prima di assegnarli alle mosse.</p>
        <a href="#" className="inline-block text-xs text-amber-300 underline">Torna al gioco</a>
        <label className="grid gap-1 text-xs">
          Cerca VFX
          <input type="search" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Nome, tipo o categoria..." className={CONTROL_CLASS} />
        </label>
        <label className="grid gap-1 text-xs">
          Categoria
          <select value={category} onChange={(event) => setCategory(event.target.value as VfxCurationCategory | 'all')} className={CONTROL_CLASS}>
            <option value="all">Tutte</option>
            {VFX_CURATION_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={recommendedOnly} onChange={(event) => setRecommendedOnly(event.target.checked)} />
          Solo selezione consigliata
        </label>
        <p className="text-[10px] text-slate-400">Confermato = scelto da te. Proposta = selezionato dopo la scrematura, da confermare.</p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={curatedOnly} onChange={(event) => setCuratedOnly(event.target.checked)} />
          Solo candidati
        </label>
        <label className="grid gap-1 text-xs">
          Formato
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as KindFilter)} className={CONTROL_CLASS}>
            <option value="all">Tutti i formati</option>
            <option value="sprite-sheet">Sprite sheet</option>
            <option value="gif">GIF</option>
            <option value="static-image">Immagini statiche</option>
          </select>
        </label>
        <button type="button" onClick={resetFilters} className={`${CONTROL_CLASS} w-full`}>Azzera filtri</button>
        <p role="status" className="text-xs text-slate-400">
          {visibleAssetIds.length} di {Object.keys(MOVE_VFX_ASSETS).length} effetti
          {selectedIndex < 0 ? '. Anteprima selezionata fuori filtro.' : ''}
        </p>
        <div className="max-h-56 space-y-1 overflow-y-auto md:max-h-none md:overflow-visible">
          {visibleAssetIds.length === 0 && <p className="text-xs text-slate-400">Nessun effetto corrisponde ai filtri.</p>}
          {visibleAssetIds.map((id) => {
            const entry = MOVE_VFX_ASSETS[id]
            const curation = getVfxCuration(id)
            return (
              <button
                key={id}
                type="button"
                aria-pressed={id === selectedId}
                onClick={() => selectAsset(id)}
                className={`w-full break-words rounded px-3 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${id === selectedId ? 'bg-amber-400 font-black text-slate-950' : 'bg-slate-900 hover:bg-slate-800'}`}
              >
                {entry.label}
                <span className="mt-1 block text-[10px] opacity-70">{curation ? `${curation.categories.join(' · ')} · ${curation.priority ?? 'candidate'}` : entry.kind}</span>
                {curation && <span className="mt-1 block text-[10px]">{getVfxReviewLabel(curation)}{curation.intensity ? ` · ${curation.intensity}` : ''}</span>}
              </button>
            )
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col md:overflow-y-auto">
        <div className="space-y-3 border-b border-white/10 bg-slate-900 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded bg-amber-400 px-4 py-2 text-xs font-black text-slate-950" onClick={() => setReplayId((value) => value + 1)}>Replay sincronizzato</button>
            <button type="button" disabled={selectedIndex <= 0} onClick={() => selectAsset(visibleAssetIds[selectedIndex - 1])} className={`${CONTROL_CLASS} disabled:opacity-40`}>Precedente</button>
            <button type="button" disabled={visibleAssetIds.length === 0 || selectedIndex === visibleAssetIds.length - 1} onClick={() => selectAsset(visibleAssetIds[selectedIndex + 1])} className={`${CONTROL_CLASS} disabled:opacity-40`}>Successivo</button>
            <button type="button" disabled={referenceId === selectedId} onClick={() => { setReferenceId(selectedId); setReplayId((value) => value + 1) }} className={`${CONTROL_CLASS} disabled:opacity-40`}>Fissa come riferimento</button>
            {reference && <button type="button" onClick={() => { setReferenceId(null); setReplayId((value) => value + 1) }} className={CONTROL_CLASS}>Rimuovi riferimento</button>}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs">
              Lato attaccante
              <select value={side} onChange={(event) => setSide(event.target.value as 'A' | 'B')} className={CONTROL_CLASS}>
                <option value="A">A</option><option value="B">B</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Posizione
              <select value={anchor} onChange={(event) => setAnchor(event.target.value as VfxAnchor | 'default')} className={CONTROL_CLASS}>
                <option value="default">Salvata / originale</option>
                {ANCHORS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Scala di confronto
              <select value={scale} onChange={(event) => setScale(event.target.value === 'default' ? 'default' : Number(event.target.value))} className={CONTROL_CLASS}>
                <option value="default">Salvata / originale</option>
                {SCALES.map((value) => <option key={value} value={value}>{value}×</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Sfondo
              <select value={background} onChange={(event) => setBackground(event.target.value as VfxPreviewBackground)} className={CONTROL_CLASS}>
                <option value="battle">Battaglia</option><option value="dark">Scuro</option><option value="light">Chiaro</option>
              </select>
            </label>
            <label className="flex items-center gap-2 py-2 text-xs">
              <input type="checkbox" checked={repeat && !reduceMotion} disabled={!!reduceMotion} onChange={(event) => setRepeat(event.target.checked)} />
              Ripeti automaticamente
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Fissa un riferimento, poi scegli un altro effetto. “Salvata / originale” usa le regolazioni del catalogo, se presenti. Le scelte manuali sostituiscono quelle salvate; 1× mostra la scala originale.
            {reduceMotion ? ' Ripetizione disattivata dalle preferenze di movimento ridotto.' : ''}
          </p>
        </div>
        <div className={`grid flex-1 gap-3 p-3 ${reference ? 'lg:grid-cols-2' : ''}`}>
          {reference && (
            <VfxPreviewPanel title="Riferimento" asset={reference} replayId={replayId} playbackKey={playbackKey} side={side} anchor={anchor} scale={scale} background={background} />
          )}
          <VfxPreviewPanel title="Candidato" asset={asset} replayId={replayId} playbackKey={playbackKey} side={side} anchor={anchor} scale={scale} background={background} />
        </div>
        <p className="px-3 pb-3 text-[11px] text-slate-400">La selezione e il riferimento restano in questa sessione. Il confronto non modifica le associazioni delle mosse.</p>
      </main>
    </div>
  )
}
