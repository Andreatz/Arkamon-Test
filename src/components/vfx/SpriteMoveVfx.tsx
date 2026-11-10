import type { MoveVfxAsset } from './types'
import { getBattleVfxAnchorPosition } from './battleVfxPosition'
import { useResolvedBattleLayout } from '@/ui-studio/battleLayout'
import { prepareImageAsset } from '@/utils/prepareImageAsset'
import { assetUrl } from '@/utils/assetUrl'
import { getGifRuntimeSrc } from './GifVfx'
import { useEffect, useRef, useState } from 'react'
import type { MoveVfxEvent, MoveVfxPlaybackCallbacks } from '@/components/MoveVfx'
import { CompositeMoveVfx } from './CompositeMoveVfx'
import { MoveVfxLayer } from './MoveVfxLayer'
import {
  getMoveVfxImpactDelayMs,
  resolveMoveVfxAsset,
  resolveMoveVfxRecipe,
} from './resolveMoveVfxAsset'
import { prepareMoveVfxPlayback } from './preloadVfxAssets'
import { useVfxPlaybackPreferences } from './useVfxPlaybackPreferences'

export function SpriteMoveVfx({ effect, onStart, onImpact, onComplete, assetOverride }: { effect: MoveVfxEvent; assetOverride?: MoveVfxAsset } & MoveVfxPlaybackCallbacks) {
  const { speed, reducedMotion } = useVfxPlaybackPreferences(effect.id)
  const layout = useResolvedBattleLayout()
  const asset = assetOverride ?? resolveMoveVfxAsset(effect.move)
  const recipe = assetOverride ? undefined : resolveMoveVfxRecipe(effect.move)
  const durationMs = reducedMotion ? 180 : (recipe?.durationMs ?? asset.durationMs) / speed
  const impactMs = reducedMotion ? 0 : assetOverride ? Math.max(0, Math.min(asset.impactAtMs ?? 0, asset.durationMs)) / speed : getMoveVfxImpactDelayMs(effect.move) / speed
  const [readyId, setReadyId] = useState<number | null>(null)
  const [completedId, setCompletedId] = useState<number | null>(null)
  const callbacksRef = useRef({ onStart, onImpact, onComplete })
  callbacksRef.current = { onStart, onImpact, onComplete }

  useEffect(() => {
    let active = true
    const prepared = reducedMotion ? Promise.resolve() : assetOverride
      ? prepareImageAsset(asset.kind === 'sprite-sheet' ? assetUrl(asset.src) : getGifRuntimeSrc(assetUrl(asset.src), effect.id))
      : prepareMoveVfxPlayback(effect.move, effect.id, true)
    void prepared.then(() => {
      if (active) setReadyId(effect.id)
    })
    return () => { active = false }
  }, [effect.id, effect.move, recipe?.id, asset.id, asset.src, asset.durationMs, !!assetOverride, reducedMotion])

  useEffect(() => {
    if (readyId !== effect.id) return
    let active = true
    let impacted = false
    const impact = () => {
      if (!active || impacted) return
      impacted = true
      callbacksRef.current.onImpact?.()
    }
    let impactTimer: number | undefined
    let completeTimer: number | undefined
    // The prepared layers and their frame players share this first paint clock.
    const firstFrame = requestAnimationFrame(() => {
      if (!active) return
      callbacksRef.current.onStart?.()
      impactTimer = window.setTimeout(impact, Math.max(0, Math.min(impactMs, durationMs)))
      completeTimer = window.setTimeout(() => {
        if (!active) return
        impact()
        setCompletedId(effect.id)
        callbacksRef.current.onComplete?.()
      }, durationMs)
    })
    return () => {
      active = false
      cancelAnimationFrame(firstFrame)
      window.clearTimeout(impactTimer)
      window.clearTimeout(completeTimer)
    }
  }, [readyId, effect.id, durationMs, impactMs])

  if (readyId !== effect.id || completedId === effect.id) return null

  if (reducedMotion) {
    const point = getBattleVfxAnchorPosition(layout, effect.side, effect.target === 'self' ? 'self' : 'target')
    return <div data-vfx-reduced-cue data-move-vfx-event={effect.id} aria-hidden="true" className="absolute pointer-events-none z-[60] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white/80 bg-sky-300/15" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
  }
  if (recipe) {
    return <CompositeMoveVfx effect={effect} recipe={recipe} />
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      data-move-vfx-id={effect.move.id}
      data-move-vfx-asset={asset.id}
      data-move-vfx-event={effect.id}
      aria-hidden="true"
    >
      <MoveVfxLayer
        asset={asset}
        effectId={effect.id}
        side={effect.side}
        target={effect.target}
        playbackSpeed={speed}
      />
    </div>
  )
}
