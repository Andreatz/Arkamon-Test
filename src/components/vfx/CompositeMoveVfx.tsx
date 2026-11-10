import { useEffect, useState } from 'react'
import type { MoveVfxEvent } from '@/components/MoveVfx'
import { MOVE_VFX_ASSETS } from './vfxManifest'
import type { MoveVfxRecipe, VfxRecipeStep } from './types'
import { MoveVfxLayer } from './MoveVfxLayer'
import { useVfxPlaybackPreferences } from './useVfxPlaybackPreferences'

function RecipeStep({
  step,
  recipe,
  effect,
  index,
}: {
  step: VfxRecipeStep
  recipe: MoveVfxRecipe
  effect: MoveVfxEvent
  index: number
}) {
  const { speed } = useVfxPlaybackPreferences(effect.id)
  const [started, setStarted] = useState(step.startAtMs <= 0)

  useEffect(() => {
    setStarted(step.startAtMs <= 0)
    if (step.startAtMs <= 0) return

    const timer = window.setTimeout(() => setStarted(true), step.startAtMs / speed)
    return () => window.clearTimeout(timer)
  }, [effect.id, step.startAtMs, speed])

  if (!started) return null
  const asset = MOVE_VFX_ASSETS[step.assetId as keyof typeof MOVE_VFX_ASSETS]
  if (!asset) return null

  const remaining = Math.max(1, recipe.durationMs - step.startAtMs)
  const durationMs = Math.min(step.durationMs ?? asset.durationMs, remaining)

  return (
    <MoveVfxLayer
      key={`${effect.id}-${step.id}`}
      asset={asset}
      effectId={effect.id * 100 + index}
      side={effect.side}
      target={effect.target}
      durationMs={durationMs}
      playbackSpeed={speed}
      anchor={step.anchor}
      layer={step.layer}
      motion={step.motion}
      scaleMultiplier={step.scaleMultiplier}
      offsetX={step.offsetX}
      offsetY={step.offsetY}
      opacity={step.opacity}
      blendMode={step.blendMode}
    />
  )
}

export function CompositeMoveVfx({
  effect,
  recipe,
}: {
  effect: MoveVfxEvent
  recipe: MoveVfxRecipe
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      data-move-vfx-id={effect.move.id}
      data-move-vfx-recipe={recipe.id}
      data-move-vfx-event={effect.id}
      aria-hidden="true"
    >
      {recipe.steps.map((step, index) => (
        <RecipeStep
          key={step.id}
          step={step}
          recipe={recipe}
          effect={effect}
          index={index}
        />
      ))}
    </div>
  )
}
