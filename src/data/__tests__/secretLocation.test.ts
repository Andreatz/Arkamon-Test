import { describe, expect, it } from 'vitest'
import { ALLENATORI } from '@data/index'
import { SECRET_LOCATION_GYM_IDS, hasUnlockedSecretLocation, isSecretLocationConnection } from '@data/secretLocation'

describe('luogo segreto dopo tutte le palestre', () => {
  it('richiede tutti gli otto capipalestra reali, incluso quello di Roma', () => {
    const capi = ALLENATORI.filter((a) => a.tipo === 'Capopalestra')
    expect(capi).toHaveLength(8)
    expect(SECRET_LOCATION_GYM_IDS).toEqual(capi.map((a) => a.id))
    expect(capi.some((a) => a.luogo === 'Roma')).toBe(true)
    expect(hasUnlockedSecretLocation({ allenatoriSconfitti: new Set(SECRET_LOCATION_GYM_IDS) })).toBe(true)
  })

  it.each(ALLENATORI.filter((a) => a.tipo === 'Capopalestra'))('resta chiuso quando manca $nome', (capo) => {
    const altri = ALLENATORI.filter((a) => a.id !== capo.id).map((a) => a.id)
    expect(hasUnlockedSecretLocation({ allenatoriSconfitti: new Set(altri) })).toBe(false)
  })

  it('NPC e rivali sconfitti non sostituiscono una palestra', () => {
    expect(hasUnlockedSecretLocation({ allenatoriSconfitti: new Set() })).toBe(false)
    expect(hasUnlockedSecretLocation({ allenatoriSconfitti: new Set(ALLENATORI.filter((a) => a.tipo !== 'Capopalestra').map((a) => a.id)) })).toBe(false)
  })

  it('il collegamento nascosto porta esclusivamente da Roma al Percorso 15 e viceversa', () => {
    expect(isSecretLocationConnection('Roma', 'Percorso_15')).toBe(true)
    expect(isSecretLocationConnection('Percorso_15', 'Roma')).toBe(true)
    expect(isSecretLocationConnection('Venezia', 'Percorso_15')).toBe(false)
    expect(isSecretLocationConnection('Percorso_15', 'Percorso_14')).toBe(false)
  })
})
