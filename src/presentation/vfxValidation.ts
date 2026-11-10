import { MOVE_VFX_ASSETS } from '@/components/vfx/vfxManifest'
import type { AdminMoveVfxOverride } from '@/store/vfxAdminStore'

export function normalizeVfxOverrides(raw: unknown): Record<number, AdminMoveVfxOverride> {
  if (!raw || typeof raw !== 'object') throw new Error('Associazioni VFX non valide.')
  const entries = Array.isArray(raw) ? raw.map(v => [String(v?.moveId), v] as const) : Object.entries(raw)
  if (entries.length > 1000) throw new Error('Troppe associazioni VFX.')
  const result: Record<number, AdminMoveVfxOverride> = {}
  for (const [id, value] of entries) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Associazione VFX non valida.')
    const e = value as Record<string, unknown>
    const bounded = (key: string, min: number, max: number) => typeof e[key] === 'number' && Number.isFinite(e[key]) && (e[key] as number) >= min && (e[key] as number) <= max
    if (!/^\d+$/.test(id) || !Number.isInteger(e.moveId) || Number(id) !== e.moveId || Number(id) < 1 || Number(id) > 10000 || Object.prototype.hasOwnProperty.call(result, id)
      || Object.keys(e).some(k => !['moveId', 'assetId', 'scale', 'offsetX', 'offsetY', 'durationMs', 'anchor', 'layer', 'mirrorForEnemy', 'blendMode'].includes(k))
      || typeof e.assetId !== 'string' || !Object.prototype.hasOwnProperty.call(MOVE_VFX_ASSETS, e.assetId) || !bounded('scale', .01, 20) || !bounded('offsetX', -2000, 2000) || !bounded('offsetY', -2000, 2000) || !bounded('durationMs', 1, 120000)
      || !['attacker', 'target', 'self', 'center', 'screen'].includes(String(e.anchor)) || !['behind-pokemon', 'over-pokemon', 'front-ui'].includes(String(e.layer))
      || !['normal', 'screen', 'lighten', 'plus-lighter'].includes(String(e.blendMode)) || typeof e.mirrorForEnemy !== 'boolean') throw new Error(`Associazione VFX non valida: ${id}.`)
    result[Number(id)] = { moveId: Number(e.moveId), assetId: e.assetId, scale: e.scale, offsetX: e.offsetX, offsetY: e.offsetY, durationMs: e.durationMs, anchor: e.anchor, layer: e.layer, mirrorForEnemy: e.mirrorForEnemy, blendMode: e.blendMode } as AdminMoveVfxOverride
  }
  return result
}
