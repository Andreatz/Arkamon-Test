import { describe, expect, it } from 'vitest'
import { MOSSE } from '@data/index'
import { resolveMoveVfxProfile, resolveProfileAssetId } from '../moveVfxProfiles'
import { getMoveVfxAssignment } from '../moveVfxAssignments'
import { resolveMoveVfxAsset } from '../resolveMoveVfxAsset'

describe('move VFX semantic profiles', () => {
  it('classifies every configured move semantically instead of relying on type fallback', () => {
    const unresolved = MOSSE.filter(
      (move) => resolveMoveVfxProfile(move).source === 'type-fallback'
    )

    expect(
      unresolved.map((move) => `#${move.id} ${move.nome}`)
    ).toEqual([])
  })

  it('recognizes representative physical and elemental archetypes', () => {
    const byId = (id: number) => MOSSE.find((move) => move.id === id)!

    expect(resolveMoveVfxProfile(byId(30)).archetype).toBe('slash')
    expect(resolveMoveVfxProfile(byId(36)).archetype).toBe('fire')
    expect(resolveMoveVfxProfile(byId(107)).archetype).toBe('supreme')
    expect(resolveMoveVfxProfile(byId(146)).archetype).toBe('blunt')
    expect(resolveMoveVfxProfile(byId(174)).archetype).toBe('supreme')
    expect(resolveMoveVfxProfile(byId(203)).archetype).toBe('bite')
  })

  it('classifies every pure paralysis move by effect and preserves its assigned asset calibration', () => {
    const paralysisMoves = MOSSE.filter((move) => move.soloStato && move.effetto === 'PARALISI')
    expect(paralysisMoves).toHaveLength(9)
    for (const move of paralysisMoves) {
      const assignment = getMoveVfxAssignment(move)!
      expect(assignment).toBeDefined()
      expect(resolveMoveVfxProfile(move)).toMatchObject({
        archetype: 'status', source: 'effect', intensity: 'subtle',
        feedback: { targetShakePx: 0, targetShakeMs: 0, cameraShakePx: 0, cameraShakeMs: 0, hitStopMs: 0 },
      })
      expect(resolveMoveVfxAsset(move)).toMatchObject({
        id: assignment.assetId, anchor: assignment.anchor, scale: assignment.scale,
      })
    }
  })

  it('uses pure status semantics before a physical name and type, with a debuff fallback', () => {
    const physical = { ...MOSSE.find((move) => move.id === 1)!, id: 9999, nome: 'Zampata', effetto: null }
    expect(resolveMoveVfxProfile(physical)).toMatchObject({ archetype: 'slash', source: 'name' })
    const pure = { ...physical, soloStato: true }
    expect(resolveMoveVfxProfile(pure)).toMatchObject({ archetype: 'status', source: 'effect', intensity: 'subtle' })
    expect(resolveProfileAssetId(pure)).toBe('debuff')
    for (const effect of ['PARALISI', 'PARALIZZATO']) {
      expect(resolveMoveVfxProfile({ ...physical, effetto: effect })).toMatchObject({ archetype: 'status', source: 'effect' })
    }
  })

  it('maps semantic profiles to deterministic assets', () => {
    for (const move of MOSSE) {
      expect(resolveProfileAssetId(move)).toBeTruthy()
    }
  })

  it('gives stronger feedback to heavy moves than light moves', () => {
    const light = resolveMoveVfxProfile(MOSSE.find((move) => move.id === 70)!)
    const heavy = resolveMoveVfxProfile(MOSSE.find((move) => move.id === 107)!)

    expect(heavy.feedback.targetShakePx).toBeGreaterThan(light.feedback.targetShakePx)
    expect(heavy.feedback.cameraShakePx).toBeGreaterThan(light.feedback.cameraShakePx)
    expect(heavy.feedback.hitStopMs).toBeGreaterThan(light.feedback.hitStopMs)
  })
})
