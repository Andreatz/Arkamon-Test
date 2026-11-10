export type VfxPlaybackKind = 'sprite-sheet' | 'gif' | 'static-image'

export type VfxMotion = 'static' | 'projectile'

export type VfxAnchor =
  | 'attacker'
  | 'target'
  | 'self'
  | 'center'
  | 'screen'

export type VfxLayer =
  | 'behind-pokemon'
  | 'over-pokemon'
  | 'front-ui'

export type VfxBlendMode =
  | 'normal'
  | 'screen'
  | 'lighten'
  | 'plus-lighter'

export interface SpriteSheetMeta {
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
  frameCount: number
  startFrame?: number
  fps: number
}

export interface MoveVfxAsset {
  id: string
  label: string
  kind: VfxPlaybackKind
  src: string
  sprite?: SpriteSheetMeta
  durationMs: number
  impactAtMs?: number
  anchor: VfxAnchor
  layer: VfxLayer
  width: number
  height: number
  scale?: number
  offsetX?: number
  offsetY?: number
  mirrorForEnemy?: boolean
  rotateDegForEnemy?: number
  blendMode?: VfxBlendMode
  opacity?: number
  loop?: boolean
  motion?: VfxMotion
}

export interface VfxRecipeStep {
  id: string
  assetId: string
  startAtMs: number
  durationMs?: number
  anchor?: VfxAnchor
  layer?: VfxLayer
  motion?: VfxMotion
  scaleMultiplier?: number
  offsetX?: number
  offsetY?: number
  opacity?: number
  blendMode?: VfxBlendMode
}

export interface MoveVfxRecipe {
  id: string
  label: string
  durationMs: number
  impactAtMs: number
  steps: VfxRecipeStep[]
}

export type VfxArchetype =
  | 'blunt'
  | 'slash'
  | 'bite'
  | 'charge'
  | 'beam'
  | 'wave'
  | 'storm'
  | 'eruption'
  | 'aura'
  | 'psychic'
  | 'plant'
  | 'fire'
  | 'electric'
  | 'water'
  | 'dark'
  | 'heal'
  | 'status'
  | 'supreme'

export type VfxIntensity = 'subtle' | 'light' | 'medium' | 'heavy'

export type VfxProfileSource = 'explicit' | 'effect' | 'name' | 'type-fallback'

export interface MoveVfxFeedback {
  targetShakePx: number
  targetShakeMs: number
  targetFlashMs: number
  cameraShakePx: number
  cameraShakeMs: number
  hitStopMs: number
}

export interface MoveVfxProfile {
  archetype: VfxArchetype
  intensity: VfxIntensity
  source: VfxProfileSource
  feedback: MoveVfxFeedback
}
