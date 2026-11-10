import { describe, it, expect } from 'vitest'
import { pesoCategoria, scegliIncontroPesato, generaIncontroDaCespuglio } from '@engine/encounters'
import type { IncontroSelvatico } from '@/types'

const incontri: IncontroSelvatico[] = [
  { luogo: 'Test', cespuglio: 'A', pokemonId: 1, probabilita: 'Comune', livelloMin: 5, livelloMax: 5 },
  { luogo: 'Test', cespuglio: 'A', pokemonId: 2, probabilita: 'Medio', livelloMin: 5, livelloMax: 5 },
  { luogo: 'Test', cespuglio: 'A', pokemonId: 3, probabilita: 'Difficile', livelloMin: 5, livelloMax: 5 },
]

describe('pesoCategoria (porting di PesoCategoria)', () => {
  it('Comune → 60', () => expect(pesoCategoria('Comune')).toBe(60))
  it('Medio → 30', () => expect(pesoCategoria('Medio')).toBe(30))
  it('Difficile → 10', () => expect(pesoCategoria('Difficile')).toBe(10))
})

describe('livelli degli incontri', () => {
  it('distribuisce uniformemente i quattro livelli, senza il bias del d6 modulo quattro', () => {
    const levels: number[] = []
    const source = [{ ...incontri[0], livelloMin: 5, livelloMax: 8 }]
    for (let i = 0; i < 12; i++) {
      let call = 0
      const result = generaIncontroDaCespuglio(source, () => call++ === 0 ? 0 : (i + 0.5) / 12)
      levels.push(result!.livello)
    }
    expect([5, 6, 7, 8].map(level => levels.filter(value => value === level).length)).toEqual([3, 3, 3, 3])
  })
})

describe('scegliIncontroPesato (porting di ScegliIndicePesato)', () => {
  // pesoTotale = 60+30+10 = 100. Cumulati: [60, 90, 100]
  // tiro = rng() * 100 → confronta con cumulati
  it('rng=0 → primo incontro (Comune)', () => {
    const r = scegliIncontroPesato(incontri, () => 0)
    expect(r?.pokemonId).toBe(1)
  })
  it('rng=0.5 (=50) → primo incontro ancora (50 < 60)', () => {
    const r = scegliIncontroPesato(incontri, () => 0.5)
    expect(r?.pokemonId).toBe(1)
  })
  it('rng=0.7 (=70) → secondo incontro (60 ≤ 70 < 90)', () => {
    const r = scegliIncontroPesato(incontri, () => 0.7)
    expect(r?.pokemonId).toBe(2)
  })
  it('rng=0.95 (=95) → terzo incontro (90 ≤ 95 < 100)', () => {
    const r = scegliIncontroPesato(incontri, () => 0.95)
    expect(r?.pokemonId).toBe(3)
  })
  it('lista vuota → null', () => {
    expect(scegliIncontroPesato([], () => 0)).toBe(null)
  })
})
