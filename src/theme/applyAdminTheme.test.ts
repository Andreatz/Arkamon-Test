import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAdminTheme } from './applyAdminTheme'
import { defaultAdminTheme } from './defaultAdminTheme'

describe('applyAdminTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applica le variabili CSS al root documentale', () => {
    const properties = new Map<string, string>()

    vi.stubGlobal('document', {
      documentElement: {
        style: {
          setProperty: (key: string, value: string) => {
            properties.set(key, value)
          },
        },
      },
    })

    applyAdminTheme(defaultAdminTheme)

    expect(properties.get('--arka-primary')).toBe(defaultAdminTheme.colors.primary)
    expect(properties.get('--arka-bg')).toBe(defaultAdminTheme.colors.bg)
    expect(properties.get('--hp-high')).toBe(defaultAdminTheme.colors.hpHigh)
    expect(properties.get('--arka-panel-radius')).toBe(`${defaultAdminTheme.ui.panelRadius}px`)
    expect(properties.get('--arka-stage-scale')).toBe('1')
    expect(properties.get('--arka-font-scale')).toBe(String(defaultAdminTheme.ui.fontScale))
  })

  it('non genera errori con un tema valido', () => {
    vi.stubGlobal('document', {
      documentElement: {
        style: {
          setProperty: () => undefined,
        },
      },
    })

    expect(() => applyAdminTheme(defaultAdminTheme)).not.toThrow()
  })
})
