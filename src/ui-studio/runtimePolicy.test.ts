import { describe, expect, it } from 'vitest'
import { createDefaultDesign } from './designModel'
import { hasRuntimeDesign, requiresElementPass } from './runtimePolicy'

describe('runtime authoring work budget', () => {
  it('does no observation/scanning work for the unmodified visual document', () => {
    expect(hasRuntimeDesign(createDefaultDesign())).toBe(false)
  })
  it('activates for actual fonts, backgrounds, views and custom layers', () => {
    const design = createDefaultDesign()
    design.typography.body.size = 24
    expect(hasRuntimeDesign(design)).toBe(true)
    design.typography.body.size = undefined
    design.screens['battaglia:dice'] = { background: { color: '#123456' }, elements: {}, layers: [] }
    expect(hasRuntimeDesign(design)).toBe(true)
    expect(requiresElementPass(design.screens['battaglia:dice'])).toBe(false)
    design.screens['battaglia:dice'].elements['dice.panel'] = { opacity: .5 }
    expect(requiresElementPass(design.screens['battaglia:dice'])).toBe(true)
  })
})
