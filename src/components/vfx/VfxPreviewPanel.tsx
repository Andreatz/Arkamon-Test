import { useResolvedBattleLayout } from '@/ui-studio/battleLayout'
import { assetUrl } from '@/utils/assetUrl'
import { getBattleSideCenter } from './battleVfxPosition'
import { MoveVfxLayer } from './MoveVfxLayer'
import { getVfxCuration, getVfxCurationPreviewAsset, getVfxReviewLabel } from './vfxCuration'
import type { MoveVfxAsset, VfxAnchor } from './types'

export type VfxPreviewBackground = 'dark' | 'light' | 'battle'

export function VfxPreviewPanel({
  title,
  asset,
  replayId,
  playbackKey,
  side,
  anchor,
  scale,
  background,
}: {
  title: string
  asset: MoveVfxAsset
  replayId: number
  playbackKey: string
  side: 'A' | 'B'
  anchor: VfxAnchor | 'default'
  scale: number | 'default'
  background: VfxPreviewBackground
}) {
  const layout = useResolvedBattleLayout()
  const curation = getVfxCuration(asset.id)
  const previewAsset = getVfxCurationPreviewAsset(asset, { anchor, scale })

  return (
    <section aria-label={title} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <header className="p-3">
        <p className="text-xs font-bold text-amber-300">{title}</p>
      </header>
      <div
        className={`relative isolate h-80 shrink-0 overflow-hidden ${
          background === 'dark' ? 'bg-slate-950' : background === 'light' ? 'bg-slate-200' : 'bg-cover bg-center'
        }`}
        style={background === 'battle' ? { backgroundImage: `url(${assetUrl('backgrounds/battle_forest.jpg')})` } : undefined}
      >
        {(['A', 'B'] as const).map((battleSide) => {
          const point = getBattleSideCenter(layout, battleSide)
          return (
            <div
              key={battleSide}
              className={`absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-black ${
                battleSide === 'A' ? 'border-emerald-300 bg-emerald-950/80 text-emerald-200' : 'border-rose-300 bg-rose-950/80 text-rose-200'
              }`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            >
              {battleSide}
            </div>
          )
        })}
        <MoveVfxLayer
          key={playbackKey}
          asset={previewAsset}
          effectId={replayId}
          side={side}
        />
      </div>
      <footer className="space-y-2 p-3 text-[10px] text-slate-400">
        <h2 className="break-words text-sm font-bold text-slate-100">{asset.label}</h2>
        <div className="flex flex-wrap gap-1 text-slate-300">
          {curation?.categories.map((category) => (
            <span key={category} className="rounded border border-slate-600 px-2 py-0.5">{category}</span>
          ))}
          <span>{curation?.priority ?? 'Non classificato'}</span>
          <span>· {getVfxReviewLabel(curation)}</span>
          {curation?.intensity && <span>· Intensità: {curation.intensity}</span>}
        </div>
        {curation?.notes && <p className="text-xs">{curation.notes}</p>}
        <p>{asset.durationMs} ms · {asset.width} × {asset.height} · {previewAsset.anchor} · {asset.motion ?? 'static'} · scala effettiva {previewAsset.scale}×</p>
        <p className="break-all">{asset.id}</p>
      </footer>
    </section>
  )
}
