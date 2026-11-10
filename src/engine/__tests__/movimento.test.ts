import { describe, it, expect } from 'vitest'
import {
  caselleAdiacenti,
  puòMuoversi,
  puòInteragire,
  risultatoInterazione,
  consumaAzione,
  nuovoTurno,
  chiaveCasellaConsumata,
  getCasella,
} from '@engine/movimento'
import type {
  Casella,
  MappaGriglia,
  PosizioneAvatar,
  StatoTurnoOverworld,
} from '@/types'

// Mappa 4×3 di test:
//   . . . .
//   . T C #
//   . . X U
// dove . = transito, T = transito (start), C = cespuglio A, # = ostacolo,
// X = allenatore 42, U = uscita verso 'Altra'
function mappaTest(): MappaGriglia {
  const T: Casella = { tipo: 'transito' }
  const C: Casella = { tipo: 'cespuglio', cespuglioId: 'A' }
  const O: Casella = { tipo: 'ostacolo' }
  const X: Casella = { tipo: 'allenatore', allenatoreId: 42 }
  const U: Casella = {
    tipo: 'uscita',
    versoMappaId: 'Altra',
    spawnX: 0,
    spawnY: 0,
  }
  return {
    id: 'TestMap',
    larghezza: 4,
    altezza: 3,
    caselle: [
      [T, T, T, T],
      [T, T, C, O],
      [T, T, X, U],
    ],
    spawnDefault: { x: 1, y: 1 },
    background: '/bg.png',
  }
}

const posIn = (x: number, y: number): PosizioneAvatar => ({
  mappaId: 'TestMap',
  x,
  y,
  direzione: 'S',
})

describe('getCasella', () => {
  it('ritorna la casella alle coordinate valide', () => {
    expect(getCasella(mappaTest(), 2, 1)?.tipo).toBe('cespuglio')
  })
  it('ritorna null fuori bordo', () => {
    expect(getCasella(mappaTest(), -1, 0)).toBeNull()
    expect(getCasella(mappaTest(), 4, 0)).toBeNull()
    expect(getCasella(mappaTest(), 0, 3)).toBeNull()
  })
})

describe('caselleAdiacenti', () => {
  it('al centro della mappa restituisce 4 caselle (N/S/E/O)', () => {
    const adj = caselleAdiacenti(posIn(1, 1), mappaTest())
    expect(adj).toHaveLength(4)
    expect(adj).toContainEqual({ x: 1, y: 0 })
    expect(adj).toContainEqual({ x: 1, y: 2 })
    expect(adj).toContainEqual({ x: 2, y: 1 })
    expect(adj).toContainEqual({ x: 0, y: 1 })
  })
  it('in un angolo restituisce solo 2 caselle', () => {
    const adj = caselleAdiacenti(posIn(0, 0), mappaTest())
    expect(adj).toHaveLength(2)
    expect(adj).toContainEqual({ x: 1, y: 0 })
    expect(adj).toContainEqual({ x: 0, y: 1 })
  })
  it('su un bordo restituisce 3 caselle', () => {
    const adj = caselleAdiacenti(posIn(1, 0), mappaTest())
    expect(adj).toHaveLength(3)
  })
})

describe('puòMuoversi', () => {
  const m = mappaTest()
  it('vero per casella adiacente di transito', () => {
    expect(puòMuoversi(posIn(1, 1), { x: 1, y: 0 }, m)).toBe(true)
  })
  it('vero per casella interagibile (cespuglio)', () => {
    // si può "calpestare" un cespuglio? secondo design: l'avatar interagisce
    // dall'adiacenza, non sale sopra. Ma `puòMuoversi` non distingue: il
    // movimento è bloccato solo da `ostacolo`. Documentato nel codice.
    expect(puòMuoversi(posIn(1, 1), { x: 2, y: 1 }, m)).toBe(true)
  })
  it('falso su casella ostacolo', () => {
    expect(puòMuoversi(posIn(2, 1), { x: 3, y: 1 }, m)).toBe(false)
  })
  it('falso se non adiacente', () => {
    expect(puòMuoversi(posIn(1, 1), { x: 3, y: 1 }, m)).toBe(false)
    expect(puòMuoversi(posIn(1, 1), { x: 1, y: 1 }, m)).toBe(false)
  })
  it('falso fuori bordo', () => {
    expect(puòMuoversi(posIn(0, 0), { x: -1, y: 0 }, m)).toBe(false)
    expect(puòMuoversi(posIn(3, 2), { x: 4, y: 2 }, m)).toBe(false)
  })
  it("falso se mappaId di partenza non combacia", () => {
    const altrove: PosizioneAvatar = { mappaId: 'Altra', x: 1, y: 1, direzione: 'S' }
    expect(puòMuoversi(altrove, { x: 1, y: 0 }, m)).toBe(false)
  })
})

describe('chiaveCasellaConsumata', () => {
  it('null per transito/ostacolo/edificio/uscita', () => {
    expect(chiaveCasellaConsumata('M', 0, 0, { tipo: 'transito' })).toBeNull()
    expect(chiaveCasellaConsumata('M', 0, 0, { tipo: 'ostacolo' })).toBeNull()
    expect(
      chiaveCasellaConsumata('M', 0, 0, {
        tipo: 'edificio',
        edificioId: 'centro',
      })
    ).toBeNull()
    expect(
      chiaveCasellaConsumata('M', 0, 0, {
        tipo: 'uscita',
        versoMappaId: 'X',
        spawnX: 0,
        spawnY: 0,
      })
    ).toBeNull()
  })
  it('chiave deterministica per cespuglio/allenatore/npc', () => {
    expect(
      chiaveCasellaConsumata('M', 2, 1, { tipo: 'cespuglio', cespuglioId: 'A' })
    ).toBe('M:2,1:cespuglio:A')
    expect(
      chiaveCasellaConsumata('M', 2, 2, { tipo: 'allenatore', allenatoreId: 42 })
    ).toBe('M:2,2:allenatore:42')
    expect(
      chiaveCasellaConsumata('M', 0, 0, { tipo: 'npc', dialogoId: 'saggio' })
    ).toBe('M:0,0:npc:saggio')
  })
})

describe('puòInteragire', () => {
  const m = mappaTest()
  const statoVuoto = {
    caselleConsumate: new Set<string>(),
    allenatoriSconfitti: new Set<number>(),
  }
  it('falso su transito/ostacolo', () => {
    expect(puòInteragire('TestMap', 0, 0, { tipo: 'transito' }, statoVuoto)).toBe(false)
    expect(puòInteragire('TestMap', 3, 1, { tipo: 'ostacolo' }, statoVuoto)).toBe(false)
  })
  it('vero su cespuglio non visitato', () => {
    const c = m.caselle[1][2]
    expect(puòInteragire('TestMap', 2, 1, c, statoVuoto)).toBe(true)
  })
  it('falso su cespuglio già consumato', () => {
    const c = m.caselle[1][2]
    const stato = {
      caselleConsumate: new Set(['TestMap:2,1:cespuglio:A']),
      allenatoriSconfitti: new Set<number>(),
    }
    expect(puòInteragire('TestMap', 2, 1, c, stato)).toBe(false)
  })
  it('falso su allenatore già sconfitto', () => {
    const c = m.caselle[2][2]
    const stato = {
      caselleConsumate: new Set<string>(),
      allenatoriSconfitti: new Set([42]),
    }
    expect(puòInteragire('TestMap', 2, 2, c, stato)).toBe(false)
  })
  it('vero su edificio sempre (non si consuma)', () => {
    const c: Casella = { tipo: 'edificio', edificioId: 'centro' }
    expect(puòInteragire('TestMap', 0, 0, c, statoVuoto)).toBe(true)
  })
  it('vero su uscita sempre (non si consuma)', () => {
    const c = m.caselle[2][3]
    expect(puòInteragire('TestMap', 3, 2, c, statoVuoto)).toBe(true)
  })
})

describe('risultatoInterazione', () => {
  const m = mappaTest()
  const statoVuoto = {
    caselleConsumate: new Set<string>(),
    allenatoriSconfitti: new Set<number>(),
  }
  it('cespuglio → battaglia-selvatica', () => {
    const r = risultatoInterazione('TestMap', 2, 1, m.caselle[1][2], 1, statoVuoto)
    expect(r).toEqual({
      tipo: 'battaglia-selvatica',
      cespuglioId: 'A',
      mappaId: 'TestMap',
      x: 2,
      y: 1,
    })
  })
  it('allenatore → battaglia-npc', () => {
    const r = risultatoInterazione('TestMap', 2, 2, m.caselle[2][2], 1, statoVuoto)
    expect(r).toEqual({
      tipo: 'battaglia-npc',
      allenatoreId: 42,
      mappaId: 'TestMap',
      x: 2,
      y: 2,
    })
  })
  it('uscita → transizione-mappa con spawn', () => {
    const r = risultatoInterazione('TestMap', 3, 2, m.caselle[2][3], 1, statoVuoto)
    expect(r).toEqual({
      tipo: 'transizione-mappa',
      versoMappaId: 'Altra',
      spawnX: 0,
      spawnY: 0,
    })
  })
  it('edificio → edificio', () => {
    const c: Casella = { tipo: 'edificio', edificioId: 'centro' }
    const r = risultatoInterazione('TestMap', 0, 0, c, 1, statoVuoto)
    expect(r).toEqual({ tipo: 'edificio', edificioId: 'centro' })
  })
  it('npc → dialogo', () => {
    const c: Casella = { tipo: 'npc', dialogoId: 'saggio' }
    const r = risultatoInterazione('TestMap', 0, 0, c, 1, statoVuoto)
    expect(r).toEqual({
      tipo: 'dialogo',
      dialogoId: 'saggio',
      mappaId: 'TestMap',
      x: 0,
      y: 0,
    })
  })
  it('transito → no-op', () => {
    const r = risultatoInterazione('TestMap', 0, 0, { tipo: 'transito' }, 1, statoVuoto)
    expect(r).toEqual({ tipo: 'no-op' })
  })
  it('cespuglio già consumato → no-op', () => {
    const stato = {
      caselleConsumate: new Set(['TestMap:2,1:cespuglio:A']),
      allenatoriSconfitti: new Set<number>(),
    }
    const r = risultatoInterazione('TestMap', 2, 1, m.caselle[1][2], 1, stato)
    expect(r).toEqual({ tipo: 'no-op' })
  })
})

describe('consumaAzione', () => {
  const base: StatoTurnoOverworld = { giocatoreAttivo: 1, azioniRimaste: 2 }
  it('movimento decrementa di 1', () => {
    expect(consumaAzione(base, 'movimento')).toEqual({
      giocatoreAttivo: 1,
      azioniRimaste: 1,
    })
  })
  it('movimento → movimento → 0', () => {
    const dopo1 = consumaAzione(base, 'movimento')
    const dopo2 = consumaAzione(dopo1, 'movimento')
    expect(dopo2.azioniRimaste).toBe(0)
  })
  it('interazione azzera il turno (chiude anche se aveva 2 azioni)', () => {
    expect(consumaAzione(base, 'interazione').azioniRimaste).toBe(0)
  })
  it('interazione con 1 azione rimasta → 0 (non va negativo)', () => {
    const stato: StatoTurnoOverworld = { giocatoreAttivo: 2, azioniRimaste: 1 }
    expect(consumaAzione(stato, 'interazione').azioniRimaste).toBe(0)
  })
  it('movimento con 0 azioni resta a 0 (clamp)', () => {
    const stato: StatoTurnoOverworld = { giocatoreAttivo: 1, azioniRimaste: 0 }
    expect(consumaAzione(stato, 'movimento').azioniRimaste).toBe(0)
  })
  it('non muta lo stato di input (immutabilità)', () => {
    consumaAzione(base, 'movimento')
    expect(base.azioniRimaste).toBe(2)
  })
})

describe('nuovoTurno', () => {
  it('da giocatore 1 passa a 2 con 2 azioni', () => {
    expect(nuovoTurno(1)).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
  })
  it('da giocatore 2 passa a 1 con 2 azioni', () => {
    expect(nuovoTurno(2)).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
  })
})
