import { describe, it, expect } from 'vitest'
import { calcolaVariazioneMonete } from '@engine/battleEngine'

describe('calcolaVariazioneMonete (porting di CalcolaVariazioneMonete)', () => {
  it('vittoria vs NPC → +200', () => {
    expect(calcolaVariazioneMonete('vittoria', 'NPC')).toBe(200)
  })
  it('vittoria vs Capopalestra → +1000', () => {
    expect(calcolaVariazioneMonete('vittoria', 'Capopalestra')).toBe(1000)
  })
  it('vittoria vs Selvatico → 0 (i pokemon selvatici non danno monete)', () => {
    expect(calcolaVariazioneMonete('vittoria', 'Selvatico')).toBe(0)
  })
  it('vittoria vs PVP → 0', () => {
    expect(calcolaVariazioneMonete('vittoria', 'PVP')).toBe(0)
  })
  it('sconfitta vs NPC → -200', () => {
    expect(calcolaVariazioneMonete('sconfitta', 'NPC')).toBe(-200)
  })
  it('sconfitta vs Capopalestra → -200', () => {
    expect(calcolaVariazioneMonete('sconfitta', 'Capopalestra')).toBe(-200)
  })
  it('sconfitta vs Selvatico → 0', () => {
    expect(calcolaVariazioneMonete('sconfitta', 'Selvatico')).toBe(0)
  })
})
