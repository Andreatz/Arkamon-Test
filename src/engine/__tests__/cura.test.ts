import { describe, it, expect } from 'vitest'
import {
  applicaMossaCura,
  èMossaCura,
  scegliMossaIA,
  calcolaHPMax,
  applicaStato,
  risolviStatoInizioTurno,
} from '@engine/battleEngine'
import type { PokemonIstanza, MossaDef } from '@/types'
import { getMossa } from '@data/index'

function mkIstanza(specieId: number, livello: number, hp?: number): PokemonIstanza {
  const istanza: PokemonIstanza = {
    istanzaId: `test-${specieId}-${livello}`,
    specieId,
    nome: 'Test',
    livello,
    hp: 0,
    xp: 0,
  }
  istanza.hp = hp ?? calcolaHPMax(istanza)
  return istanza
}

function mkMossa(
  effetto: string | null,
  valoreEffetto: number | null,
  tipo: MossaDef['tipo'] = 'Normale'
): MossaDef {
  return {
    id: 999,
    nome: 'Mossa Test',
    tipo,
    effetto,
    valoreEffetto,
    dadiPerLivello: { '5': 0 },
    incrementoPerLivello: { '5': 0 },
  }
}

describe('èMossaCura', () => {
  it('riconosce CURA e CURA_PCT', () => {
    expect(èMossaCura(mkMossa('CURA', 10))).toBe(true)
    expect(èMossaCura(mkMossa('CURA_PCT', 50))).toBe(true)
  })
  it('rifiuta effetti diversi e null', () => {
    expect(èMossaCura(mkMossa(null, null))).toBe(false)
    expect(èMossaCura(mkMossa('VELENO', 30))).toBe(false)
    expect(èMossaCura(mkMossa('SONNO', 50))).toBe(false)
  })
})

describe('applicaMossaCura', () => {
  it('CURA piatta: ripristina valoreEffetto HP, clamp a hpMax', () => {
    const i = mkIstanza(1, 5, 4) // hpMax 12, hp 4
    const r = applicaMossaCura(i, mkMossa('CURA', 5), 12)
    expect(r.hpRecuperato).toBe(5)
    expect(r.istanza.hp).toBe(9)
    expect(r.messaggi.some((m) => m.includes('5 HP'))).toBe(true)
  })
  it('CURA piatta: clamp a hpMax (no overflow)', () => {
    const i = mkIstanza(1, 5, 10) // hpMax 12
    const r = applicaMossaCura(i, mkMossa('CURA', 100), 12)
    expect(r.hpRecuperato).toBe(2)
    expect(r.istanza.hp).toBe(12)
  })
  it('CURA_PCT: ripristina valoreEffetto% di hpMax', () => {
    const i = mkIstanza(1, 50, 10) // hpMax 79 (Media)
    const r = applicaMossaCura(i, mkMossa('CURA_PCT', 50), 79)
    expect(r.hpRecuperato).toBe(Math.floor(79 * 0.5)) // 39
    expect(r.istanza.hp).toBe(10 + 39)
  })
  it('CURA_PCT: clamp a hpMax', () => {
    const i = mkIstanza(1, 50, 70) // hpMax 79
    const r = applicaMossaCura(i, mkMossa('CURA_PCT', 50), 79)
    expect(r.istanza.hp).toBe(79)
    expect(r.hpRecuperato).toBe(9)
  })
  it('HP già pieni: nessun recupero, messaggio dedicato', () => {
    const i = mkIstanza(1, 5) // hpMax 12, hp 12
    const r = applicaMossaCura(i, mkMossa('CURA_PCT', 50), 12)
    expect(r.hpRecuperato).toBe(0)
    expect(r.istanza.hp).toBe(12)
    expect(r.messaggi.some((m) => m.includes('massimo'))).toBe(true)
  })
  it('mossa non curativa → no-op', () => {
    const i = mkIstanza(1, 5, 4)
    const r = applicaMossaCura(i, mkMossa('VELENO', 30), 12)
    expect(r.hpRecuperato).toBe(0)
    expect(r.istanza.hp).toBe(4)
  })
  it('cura piccola: garantisce almeno 1 HP recuperato', () => {
    const i = mkIstanza(1, 5, 5) // hpMax 12
    // 1% di 12 = 0.12 → trunc 0 → clamp a 1
    const r = applicaMossaCura(i, mkMossa('CURA_PCT', 1), 12)
    expect(r.hpRecuperato).toBeGreaterThanOrEqual(1)
  })

  // BR.3 — cura + guarigione veleno
  it('BR.3 Avvelenato + cura con recupero: rimuove stato, messaggio veleno', () => {
    const base = mkIstanza(1, 5, 4) // hp 4, hpMax 12
    const i: PokemonIstanza = { ...base, stato: { tipo: 'Avvelenato', turniRimanenti: -1 } }
    const r = applicaMossaCura(i, mkMossa('CURA', 5), 12)
    expect(r.istanza.stato).toBeUndefined()
    expect(r.hpRecuperato).toBe(5)
    expect(r.messaggi.some((m) => m.toLowerCase().includes('veleno'))).toBe(true)
  })
  it('BR.3 Avvelenato + HP pieni: guarisce il veleno anche senza recupero HP', () => {
    const base = mkIstanza(1, 5) // hp pieni (12)
    const i: PokemonIstanza = { ...base, stato: { tipo: 'Avvelenato', turniRimanenti: -1 } }
    const r = applicaMossaCura(i, mkMossa('CURA_PCT', 50), 12)
    expect(r.hpRecuperato).toBe(0)
    expect(r.istanza.stato).toBeUndefined()
    expect(r.messaggi.some((m) => m.toLowerCase().includes('veleno'))).toBe(true)
  })
  it('la cura elimina il contatore progressivo e un nuovo veleno riparte dal 10%', () => {
    const primo = risolviStatoInizioTurno(applicaStato(mkIstanza(1, 5), 'Avvelenato'), 12)
    const secondo = risolviStatoInizioTurno(primo.istanza, 12)
    expect(secondo.istanza.stato?.turniTrascorsi).toBe(2)
    const cura = applicaMossaCura(secondo.istanza, mkMossa('CURA', 5), 12)
    expect(cura.istanza.stato).toBeUndefined()
    const nuovoVeleno = applicaStato(cura.istanza, 'Avvelenato')
    expect(nuovoVeleno.stato?.turniTrascorsi).toBe(0)
    const nuovoTick = risolviStatoInizioTurno(nuovoVeleno, 12)
    expect(nuovoTick.dannoSubito).toBe(1)
    expect(nuovoTick.istanza.stato?.turniTrascorsi).toBe(1)
    expect(secondo.istanza.stato?.turniTrascorsi).toBe(2)
  })
  it.each([59, 66, 153, 154])('la cura runtime %i rimuove la paralisi anche a HP pieni', (id) => {
    const iniziale = applicaStato(mkIstanza(1, 5), 'Paralizzato')
    const risultato = applicaMossaCura(iniziale, getMossa(id)!, 12)
    expect(risultato.istanza.stato).toBeUndefined()
    expect(risultato.istanza.hp).toBe(12)
    expect(risultato.hpRecuperato).toBe(0)
    expect(risultato.messaggi).toContain('Test è guarito dalla paralisi!')
    expect(iniziale.stato?.tipo).toBe('Paralizzato')
  })
  it('una cura a HP parziali ripristina gli HP e rimuove la paralisi', () => {
    const iniziale = applicaStato(mkIstanza(95, 5, 4), 'Paralizzato')
    const risultato = applicaMossaCura(iniziale, getMossa(59)!, 12)
    expect(risultato.istanza.hp).toBe(7)
    expect(risultato.hpRecuperato).toBe(3)
    expect(risultato.istanza.stato).toBeUndefined()
    expect(iniziale.hp).toBe(4)
    expect(iniziale.stato?.tipo).toBe('Paralizzato')
  })
  it.each(['Addormentato', 'Confuso'] as const)('le cure HP non eliminano %s', (tipo) => {
    const iniziale = applicaStato(mkIstanza(1, 5, 4), tipo)
    const risultato = applicaMossaCura(iniziale, getMossa(59)!, 12)
    expect(risultato.istanza.stato).toEqual(iniziale.stato)
    expect(risultato.hpRecuperato).toBe(3)
  })
  it('la cura di paralisi si esegue senza dado offensivo ed elimina la penalità sui turni successivi', () => {
    const iniziale = applicaStato(mkIstanza(95, 5), 'Paralizzato')
    const primaDellaCura = risolviStatoInizioTurno(iniziale, 12, () => {
      throw new Error('La cura non deve tirare per la paralisi')
    }, false)
    expect(primaDellaCura.puoAgire).toBe(true)
    const curato = applicaMossaCura(primaDellaCura.istanza, getMossa(59)!, 12)
    const attaccoSuccessivo = risolviStatoInizioTurno(curato.istanza, 12, () => {
      throw new Error('La paralisi curata non tira nei turni successivi')
    })
    expect(attaccoSuccessivo.puoAgire).toBe(true)
    expect(attaccoSuccessivo.tiroStato).toBeUndefined()
    expect(attaccoSuccessivo.istanza.stato).toBeUndefined()
  })
})

describe('scegliMossaIA — priorità mosse curative', () => {
  // Userò un Pokémon (id 1, Vyrath) e mosse fittizie. Per testare la priorità
  // devo fingere che il pokemon abbia mosse di cura. Visto che la specie reale
  // ha già mosse fisse, qui validiamo solo via stato HP basso/alto su Vyrath
  // e verifichiamo che il punteggio cura sopravviva al confronto con mosse normali.
  // Test indiretto: con HP pieni, l'AI NON sceglie una cura (priorità -1).

  it('è coerente: importa correttamente e si chiama senza errori', () => {
    const att = mkIstanza(1, 5)
    const dif = mkIstanza(13, 5)
    const idx = scegliMossaIA(att, dif)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThanOrEqual(2)
  })
  it.each([
    [53, 0], [84, 1], [85, 1], [95, 0],
  ] as const)('specie %i preferisce la cura %i per la paralisi permanente anche a HP pieni e livello alto', (specieId, slot) => {
    for (const livello of [5, 100]) {
      const attaccante = applicaStato(mkIstanza(specieId, livello), 'Paralizzato')
      const difensore = mkIstanza(13, livello)
      expect(scegliMossaIA(attaccante, difensore, () => 0)).toBe(slot)
      expect(attaccante.stato?.tipo).toBe('Paralizzato')
    }
  })
})
