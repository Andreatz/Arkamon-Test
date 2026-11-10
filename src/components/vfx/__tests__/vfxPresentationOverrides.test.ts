import { describe, expect, it } from 'vitest'
import { GENERATED_MOVE_VFX_ASSETS } from '../generatedVfxAssets'
import { MOVE_VFX_ASSETS } from '../vfxManifest'
import { VFX_PRESENTATION_OVERRIDES } from '../vfxPresentationOverrides'

describe('VFX presentation corrections', () => {
  it('corrects known opaque backdrops without overwriting generated metadata', () => {
    for (const id of Object.keys(VFX_PRESENTATION_OVERRIDES)) {
      const source = GENERATED_MOVE_VFX_ASSETS[id]
      expect(source, id).toBeDefined()
      expect(source.blendMode, id).toBe('normal')
      expect(MOVE_VFX_ASSETS[id], id).toEqual({ ...source, blendMode: 'screen' })
    }
  })

  it('preserves normal blending for genuine transparent artwork', () => {
    for (const id of ['gif:fire-flames-sticker-by-brannmanndan', 'gif:f721c5ff45edd5fb0280c4926dbf75af']) {
      expect(MOVE_VFX_ASSETS[id]).toBe(GENERATED_MOVE_VFX_ASSETS[id])
      expect(MOVE_VFX_ASSETS[id].blendMode).toBe('normal')
    }
  })
})
