import type { BattleCameraChoreography } from './battleCameraLanguage'

export type ImpactLayerKind = 'slash' | 'ring' | 'halo' | 'shockwave'

export interface ImpactLayerSpec {
  kind: ImpactLayerKind
  width: number
  height: number
  rotate: number
  delayMs: number
  durationMs: number
  peakOpacity: number
  startScale: number
  endScale: number
}

/** Small GPU-only layers, generated from existing VFX cues (never from damage). */
export function planBattleImpactComposition(
  choreography: BattleCameraChoreography,
  strength: number,
  reducedMotion = false,
): readonly ImpactLayerSpec[] {
  if (reducedMotion) return []
  const power = Number.isFinite(strength) ? Math.max(0.6, Math.min(1.5, strength)) : 1
  const spec = (kind: ImpactLayerKind, width: number, height: number, rotate: number,
    delayMs: number, durationMs: number, opacity: number, endScale: number): ImpactLayerSpec => ({
    kind, width, height, rotate, delayMs, durationMs,
    peakOpacity: Math.min(0.95, opacity * power), startScale: 0.3,
    endScale: Number((endScale * power).toFixed(3)),
  })
  switch (choreography) {
    case 'physical':
      return [
        spec('slash', 148, 42, -24, 0, 300, 0.85, 1.3),
        spec('ring', 88, 88, 0, 42, 360, 0.65, 1.65),
      ]
    case 'area':
      return [
        spec('shockwave', 158, 110, 0, 0, 460, 0.75, 1.65),
        spec('ring', 192, 124, 0, 76, 450, 0.55, 1.8),
      ]
    case 'support':
      return [
        spec('halo', 105, 105, 0, 0, 460, 0.56, 1.3),
        spec('ring', 122, 122, 0, 40, 420, 0.4, 1.48),
      ]
    case 'projectile':
    default:
      return [
        spec('ring', 104, 104, 0, 0, 360, 0.86, 1.65),
        spec('halo', 80, 80, 0, 45, 360, 0.62, 1.55),
      ]
  }
}

/** Unmount after the last layer rather than clipping the final shockwave. */
export function getBattleImpactDurationMs(layers: readonly ImpactLayerSpec[]): number {
  return layers.reduce((max, layer) => Math.max(max, layer.delayMs + layer.durationMs), 0)
}

export function impactLayerAppearance(kind: ImpactLayerKind, color: string) {
  switch (kind) {
    case 'slash':
      return { border: `2px solid ${color}`, background: `linear-gradient(115deg, transparent, ${color}B8 50%, transparent)`, boxShadow: `0 0 18px ${color}90` }
    case 'shockwave':
      return { border: `3px solid ${color}A0`, background: `radial-gradient(ellipse, transparent 48%, ${color}1C 70%, transparent 85%)`, boxShadow: `0 0 18px ${color}77` }
    case 'halo':
      return { border: `1px solid ${color}80`, background: `radial-gradient(circle, ${color}66 0%, ${color}18 52%, transparent 75%)`, boxShadow: `0 0 14px ${color}88` }
    case 'ring':
    default:
      return { border: `3px solid ${color}AA`, background: `radial-gradient(circle, ${color}22, transparent 70%)`, boxShadow: `0 0 16px ${color}A0` }
  }
}
