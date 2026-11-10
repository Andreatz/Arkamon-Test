import { useMemo, useState } from 'react'
import {
  VFX_MOVE_PREVIEWS,
  getMoveVfxAssignment,
  MOVE_VFX_ASSIGNMENT_COUNTS,
} from '@/components/vfx/moveVfxAssignments'
import { SpriteMoveVfx } from '@/components/vfx/SpriteMoveVfx'
import {
  getMoveVfxDurationMs,
  getMoveVfxImpactDelayMs,
  resolveMoveVfxAsset,
  resolveMoveVfxRecipe,
} from '@/components/vfx/resolveMoveVfxAsset'
import { resolveMoveVfxProfile } from '@/components/vfx/moveVfxProfiles'
import {
  filterVfxAssetIds,
  getVfxCuration,
  getVfxCurationPreviewAsset,
  VFX_CURATION_CATEGORIES,
  type VfxCurationCategory,
} from '@/components/vfx/vfxCuration'
import {
  MOVE_VFX_ASSETS,
  type MoveVfxAssetId,
} from '@/components/vfx/vfxManifest'
import {
  useVfxAdminStore,
  type AdminMoveVfxOverride,
} from '@store/vfxAdminStore'
import type { MoveVfxAsset, VfxAnchor, VfxBlendMode, VfxLayer } from '@/components/vfx/types'

const assetIds = Object.keys(MOVE_VFX_ASSETS) as MoveVfxAssetId[]
const anchors: VfxAnchor[] = ['attacker', 'target', 'self', 'center', 'screen']
const layers: VfxLayer[] = ['behind-pokemon', 'over-pokemon', 'front-ui']
const blendModes: VfxBlendMode[] = ['normal', 'screen', 'lighten', 'plus-lighter']

function toOverride(moveId: number, asset: MoveVfxAsset): AdminMoveVfxOverride {
  return {
    moveId,
    assetId: asset.id as MoveVfxAssetId,
    scale: asset.scale ?? 1,
    offsetX: asset.offsetX ?? 0,
    offsetY: asset.offsetY ?? 0,
    durationMs: asset.durationMs,
    anchor: asset.anchor,
    layer: asset.layer,
    mirrorForEnemy: asset.mirrorForEnemy ?? false,
    blendMode: asset.blendMode ?? 'normal',
  }
}

function NumericField({
  label,
  value,
  min,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-1 text-[11px] font-bold text-[var(--arka-text-muted)]">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => {
          const nextValue = Number(event.target.value)
          if (Number.isFinite(nextValue)) onChange(nextValue)
        }}
        className="h-8 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)] outline-none focus:border-[var(--arka-primary)]"
      />
    </label>
  )
}

export function AdminVfxEditor() {
  const [selectedMoveId, setSelectedMoveId] = useState(VFX_MOVE_PREVIEWS[0]?.id ?? 0)
  const [previewSide, setPreviewSide] = useState<'A' | 'B'>('A')
  const [replayId, setReplayId] = useState(1)
  const [assetSearch, setAssetSearch] = useState('')
  const [curationCategory, setCurationCategory] = useState<VfxCurationCategory | 'all'>('all')
  const [curatedOnly, setCuratedOnly] = useState(false)
  const overrides = useVfxAdminStore((state) => state.draftOverrides)
  const setOverride = useVfxAdminStore((state) => state.setDraftOverride)
  const removeOverride = useVfxAdminStore((state) => state.removeDraftOverride)
  const resetOverrides = useVfxAdminStore((state) => state.resetDraftOverrides)
  const saveError = useVfxAdminStore(state => state.error)
  const selectedMove = VFX_MOVE_PREVIEWS.find((move) => move.id === selectedMoveId) ?? VFX_MOVE_PREVIEWS[0]
  const assignment = selectedMove ? getMoveVfxAssignment(selectedMove) : undefined
  const resolvedAsset = selectedMove ? resolveMoveVfxAsset(selectedMove) : MOVE_VFX_ASSETS.punch
  const resolvedProfile = selectedMove ? resolveMoveVfxProfile(selectedMove) : null
  const resolvedRecipe = selectedMove ? resolveMoveVfxRecipe(selectedMove) : undefined
  const resolvedDurationMs = selectedMove ? getMoveVfxDurationMs(selectedMove) : resolvedAsset.durationMs
  const resolvedImpactMs = selectedMove ? getMoveVfxImpactDelayMs(selectedMove) : resolvedAsset.impactAtMs ?? 0
  const draft = overrides[selectedMoveId] ?? toOverride(selectedMoveId, resolvedAsset)
  const selectedCuration = getVfxCuration(draft.assetId)
  const exportJson = useMemo(
    () => JSON.stringify(Object.values(overrides).sort((a, b) => a.moveId - b.moveId), null, 2),
    [overrides]
  )
  const filteredAssetIds = useMemo(() => filterVfxAssetIds(MOVE_VFX_ASSETS, {
    search: assetSearch,
    category: curationCategory,
    curatedOnly,
  }), [assetSearch, curationCategory, curatedOnly])
  const selectedAssetMatchesFilters = filteredAssetIds.includes(draft.assetId)
  const visibleAssetIds = selectedAssetMatchesFilters
    ? filteredAssetIds
    : [draft.assetId, ...filteredAssetIds]

  const update = (patch: Partial<AdminMoveVfxOverride>) => {
    setOverride({ ...draft, ...patch, moveId: selectedMoveId })
    setReplayId((value) => value + 1)
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-3 py-2 text-xs text-[var(--arka-text-muted)]">
        Bozza VFX salvata su questo browser. La prova qui sotto usa la bozza; per applicarla al gioco o trasferirla usa Admin → Progetto visivo.
      </p>
      {saveError && <p role="alert">{saveError}</p>}
      <p className="text-xs text-[var(--arka-text-muted)]">
        Moveset: {MOVE_VFX_ASSIGNMENT_COUNTS.total} mosse · {MOVE_VFX_ASSIGNMENT_COUNTS.assigned} VFX distinti riservati
        {' · '}{MOVE_VFX_ASSIGNMENT_COUNTS.missing} da creare · {MOVE_VFX_ASSIGNMENT_COUNTS.needsAdaptation} da adattare.
      </p>
      {import.meta.env.DEV && (
        <a
          href={`${window.location.pathname}${window.location.search}#vfx-lab`}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-md border border-[var(--arka-primary)] px-3 py-2 text-xs font-bold text-[var(--arka-primary-hover)]"
        >
          Confronta effetti nel VFX Lab ↗
        </a>
      )}

      <label className="grid gap-1 text-xs font-bold text-[var(--arka-text-muted)]">
        Mossa
        <select
          value={selectedMoveId}
          onChange={(event) => setSelectedMoveId(Number(event.target.value))}
          className="h-9 min-w-0 w-full rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)] outline-none focus:border-[var(--arka-primary)]"
        >
          {VFX_MOVE_PREVIEWS.map((move) => {
            const entry = getMoveVfxAssignment(move)
            return (
              <option key={move.id} value={move.id}>
                #{entry?.sourceMoveId ?? move.id} {move.nome}{entry?.assetId ? '' : ' — VFX mancante'}
              </option>
            )
          })}
        </select>
      </label>

      {assignment && (
        <div className="rounded-md border border-[var(--arka-border)] px-3 py-2 text-xs text-[var(--arka-text-muted)]" role="status">
          <p className="font-bold">
            {assignment.assetId ? assignment.review === 'needs-adaptation' ? 'VFX riservato — da adattare' : 'VFX specifico assegnato'
              : 'VFX specifico mancante — anteprima con effetto generico'}
            {overrides[selectedMoveId] ? ' · Bozza salvata, non applicata' : ''}
          </p>
          <p>{assignment.type} · {assignment.tier === 'status' ? 'Status / danno fisso' : { light: 'Leggera', medium: 'Media', heavy: 'Forte' }[assignment.tier]}</p>
          <p>{assignment.notes}</p>
          {assignment.gameMoveId === null && <p>Disponibile per il confronto visivo; mossa ancora da integrare nel gioco.</p>}
          {assignment.gameMoveId !== null && assignment.gameMoveId !== assignment.sourceMoveId && (
            <p>ID nel moveset: {assignment.sourceMoveId} · ID nel gioco: {assignment.gameMoveId} (riconciliati per nome).</p>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)]">
        <div className="relative h-48 overflow-hidden bg-[radial-gradient(circle_at_center,#294d68,#102538_72%)]">
          {selectedMove ? (
            <SpriteMoveVfx
              key={`${selectedMove.id}-${previewSide}-${replayId}`}
              effect={{ id: replayId, move: selectedMove, side: previewSide }}
              assetOverride={{ ...MOVE_VFX_ASSETS[draft.assetId], ...draft, id: draft.assetId }}
            />
          ) : null}
          <div className="absolute bottom-3 left-5 h-12 w-12 rounded-full border-2 border-white/60 bg-cyan-400/50" />
          <div className="absolute right-5 top-5 h-12 w-12 rounded-full border-2 border-white/60 bg-red-400/50" />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--arka-border)] px-3 py-2">
          <span className="truncate text-[11px] font-bold text-[var(--arka-text-muted)]">
            {resolvedAsset.label} · {resolvedAsset.kind}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPreviewSide((side) => (side === 'A' ? 'B' : 'A'))}
              className="rounded border border-[var(--arka-border)] px-2 py-1 text-[10px] font-bold"
            >
              Lato {previewSide}
            </button>
            <button
              type="button"
              onClick={() => setReplayId((value) => value + 1)}
              className="rounded border border-[var(--arka-primary)] px-2 py-1 text-[10px] font-bold text-[var(--arka-primary-hover)]"
            >
              Replay
            </button>
          </div>
        </div>
        {selectedCuration && (
          <div className="space-y-1 border-t border-[var(--arka-border)] px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {selectedCuration.categories.map((category) => (
                <span key={category} className="rounded border border-[var(--arka-border)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--arka-text-muted)]">
                  {category}
                </span>
              ))}
              {selectedCuration.priority && (
                <span className="text-[10px] text-[var(--arka-text-muted)]">
                  Priorità: {selectedCuration.priority}
                </span>
              )}
            </div>
            {selectedCuration.notes && (
              <p className="text-[10px] text-[var(--arka-text-muted)]">{selectedCuration.notes}</p>
            )}
          </div>
        )}
      </section>

      {resolvedProfile && (
        <section className="grid grid-cols-2 gap-2 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] p-3 text-[11px]">
          <div>
            <span className="font-bold text-[var(--arka-text-muted)]">Archetipo</span>
            <p className="mt-0.5 font-black text-[var(--arka-text)]">{resolvedProfile.archetype}</p>
          </div>
          <div>
            <span className="font-bold text-[var(--arka-text-muted)]">Intensità</span>
            <p className="mt-0.5 font-black text-[var(--arka-text)]">{resolvedProfile.intensity}</p>
          </div>
          <div>
            <span className="font-bold text-[var(--arka-text-muted)]">Classificazione</span>
            <p className="mt-0.5 font-black text-[var(--arka-text)]">{resolvedProfile.source}</p>
          </div>
          <div>
            <span className="font-bold text-[var(--arka-text-muted)]">Recipe</span>
            <p className="mt-0.5 truncate font-black text-[var(--arka-text)]">
              {resolvedRecipe?.id ?? 'single-asset'}
            </p>
          </div>
          <div>
            <span className="font-bold text-[var(--arka-text-muted)]">Durata</span>
            <p className="mt-0.5 font-black text-[var(--arka-text)]">{resolvedDurationMs} ms</p>
          </div>
          <div>
            <span className="font-bold text-[var(--arka-text-muted)]">Impact</span>
            <p className="mt-0.5 font-black text-[var(--arka-text)]">{resolvedImpactMs} ms</p>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-[11px] font-bold text-[var(--arka-text-muted)]">
          Categoria
          <select
            value={curationCategory}
            onChange={(event) => setCurationCategory(event.target.value as VfxCurationCategory | 'all')}
            className="h-8 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)] outline-none focus:border-[var(--arka-primary)]"
          >
            <option value="all">Tutte</option>
            {VFX_CURATION_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-[11px] font-bold text-[var(--arka-text-muted)]">
          <input type="checkbox" checked={curatedOnly} onChange={(event) => setCuratedOnly(event.target.checked)} />
          Solo candidati
        </label>
      </div>
      <p className="text-[10px] text-[var(--arka-text-muted)]">
        Prima selezione da verificare in anteprima. Include effetti candidati, preferiti e speciali.
      </p>

      <label className="grid gap-1 text-xs font-bold text-[var(--arka-text-muted)]">
        Cerca asset
        <input
          type="search"
          value={assetSearch}
          onChange={(event) => setAssetSearch(event.target.value)}
          placeholder="Cerca nome, tipo o categoria, es. electric..."
          className="h-8 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)] outline-none focus:border-[var(--arka-primary)]"
        />
      </label>
      <p role="status" className="text-[11px] text-[var(--arka-text-muted)]">
        {filteredAssetIds.length === 0 ? 'Nessun asset corrisponde ai filtri.' : `${filteredAssetIds.length} di ${assetIds.length} asset corrispondono ai filtri.`}
        {!selectedAssetMatchesFilters && ' L’asset selezionato resta disponibile fuori filtro.'}
      </p>
      <label className="grid min-w-0 gap-1 text-xs font-bold text-[var(--arka-text-muted)]">
        Asset
        <select
          value={draft.assetId}
          onChange={(event) => {
            const asset = MOVE_VFX_ASSETS[event.target.value]
            if (asset) update(toOverride(selectedMoveId, getVfxCurationPreviewAsset(asset)))
          }}
          className="h-9 min-w-0 w-full rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)] outline-none focus:border-[var(--arka-primary)]"
        >
          {visibleAssetIds.map((assetId) => (
            <option key={assetId} value={assetId}>
              {MOVE_VFX_ASSETS[assetId].label}
              {assetId === draft.assetId && !selectedAssetMatchesFilters ? ' (selezionato · fuori filtro)' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <NumericField label="Scala" value={draft.scale} min={0.1} step={0.05} onChange={(scale) => update({ scale })} />
        <NumericField label="Durata ms" value={draft.durationMs} min={1} onChange={(durationMs) => update({ durationMs })} />
        <NumericField label="Offset X" value={draft.offsetX} onChange={(offsetX) => update({ offsetX })} />
        <NumericField label="Offset Y" value={draft.offsetY} onChange={(offsetY) => update({ offsetY })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-[11px] font-bold text-[var(--arka-text-muted)]">
          Anchor
          <select value={draft.anchor} onChange={(event) => update({ anchor: event.target.value as VfxAnchor })} className="h-8 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)]">
            {anchors.map((anchor) => <option key={anchor}>{anchor}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-[var(--arka-text-muted)]">
          Layer
          <select value={draft.layer} onChange={(event) => update({ layer: event.target.value as VfxLayer })} className="h-8 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)]">
            {layers.map((layer) => <option key={layer}>{layer}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-[var(--arka-text-muted)]">
          Blend mode
          <select value={draft.blendMode} onChange={(event) => update({ blendMode: event.target.value as VfxBlendMode })} className="h-8 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)]">
            {blendModes.map((blendMode) => <option key={blendMode}>{blendMode}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-[11px] font-bold text-[var(--arka-text-muted)]">
          <input type="checkbox" checked={draft.mirrorForEnemy} onChange={(event) => update({ mirrorForEnemy: event.target.checked })} />
          Mirror lato B
        </label>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => removeOverride(selectedMoveId)} className="flex-1 rounded-md border border-[var(--arka-border)] px-3 py-2 text-xs font-bold">
          Ripristina mossa
        </button>
        <button type="button" onClick={resetOverrides} className="flex-1 rounded-md border border-red-500/70 px-3 py-2 text-xs font-bold text-red-300">
          Azzera override
        </button>
      </div>

      <label className="grid gap-1 text-xs font-bold text-[var(--arka-text-muted)]">
        Export JSON ({Object.keys(overrides).length})
        <textarea
          readOnly
          value={exportJson}
          className="h-36 resize-y rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] p-2 font-mono text-[10px] text-[var(--arka-text)]"
        />
      </label>
    </div>
  )
}
