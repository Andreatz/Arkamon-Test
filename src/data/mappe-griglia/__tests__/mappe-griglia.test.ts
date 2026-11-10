/**
 * Sanity check sui dati delle mappe-griglia (Fase E.6).
 * Non testa l'engine — verifica solo che le mappe siano well-formed.
 */
import { describe, it, expect } from 'vitest'
import {
  MAPPE_GRIGLIA,
  MILANO,
  PERCORSO_1,
  PERCORSO_2,
  PERCORSO_3,
  VENEZIA,
  PIACENZA,
  MAPPA_PRINCIPALE_GRIGLIA,
  getMappaGriglia,
} from '@data/mappe-griglia'
import { ALLENATORI, MAPPE, getIncontri } from '@data/index'
import type { MappaGriglia } from '@/types'

const tutte: MappaGriglia[] = Object.values(MAPPE_GRIGLIA)

describe('MAPPE_GRIGLIA — invariants', () => {
  it.each(tutte)(
    '$id ha caselle.length === altezza e ogni riga ha length === larghezza',
    (m) => {
      expect(m.caselle).toHaveLength(m.altezza)
      for (const riga of m.caselle) {
        expect(riga).toHaveLength(m.larghezza)
      }
    }
  )

  it.each(tutte)('$id ha spawnDefault dentro i bordi', (m) => {
    expect(m.spawnDefault.x).toBeGreaterThanOrEqual(0)
    expect(m.spawnDefault.x).toBeLessThan(m.larghezza)
    expect(m.spawnDefault.y).toBeGreaterThanOrEqual(0)
    expect(m.spawnDefault.y).toBeLessThan(m.altezza)
  })

  it.each(tutte)(
    '$id: ogni casella ha un campo `tipo` valido',
    (m) => {
      const tipiValidi = new Set([
        'transito',
        'cespuglio',
        'allenatore',
        'npc',
        'edificio',
        'uscita',
        'ostacolo',
      ])
      for (const riga of m.caselle) {
        for (const c of riga) {
          expect(tipiValidi.has(c.tipo)).toBe(true)
        }
      }
    }
  )

  it.each(tutte)(
    '$id: lo spawn delle uscite punta a coordinate dentro la mappa di destinazione (se registrata)',
    (m) => {
      for (const riga of m.caselle) {
        for (const c of riga) {
          if (c.tipo !== 'uscita') continue
          const dest = MAPPE_GRIGLIA[c.versoMappaId]
          if (!dest) continue // uscita verso scena 2D, non controllabile qui
          expect(c.spawnX).toBeGreaterThanOrEqual(0)
          expect(c.spawnX).toBeLessThan(dest.larghezza)
          expect(c.spawnY).toBeGreaterThanOrEqual(0)
          expect(c.spawnY).toBeLessThan(dest.altezza)
        }
      }
    }
  )

  it.each(tutte)(
    '$id: ogni cespuglio ha almeno un incontro selvatico configurato',
    (m) => {
      for (const riga of m.caselle) {
        for (const c of riga) {
          if (c.tipo !== 'cespuglio') continue
          expect(getIncontri(m.id, c.cespuglioId).length).toBeGreaterThan(0)
        }
      }
    }
  )

  it('registra tutte le mappe storiche definite in mappe.json', () => {
    for (const m of MAPPE) {
      expect(MAPPE_GRIGLIA[m.nome]?.id).toBe(m.nome)
    }
  })

  it('contiene una casella allenatore per ogni allenatore definito nei dati', () => {
    for (const allenatore of ALLENATORI) {
      const mappa = MAPPE_GRIGLIA[allenatore.luogo]
      expect(mappa, `Mappa mancante: ${allenatore.luogo}`).toBeTruthy()

      const trovato = mappa.caselle.some((riga) =>
        riga.some(
          (c) => c.tipo === 'allenatore' && c.allenatoreId === allenatore.id
        )
      )
      expect(trovato, `${allenatore.nome} (${allenatore.id}) non piazzato in ${allenatore.luogo}`).toBe(true)
    }
  })
})

describe('Percorso_1', () => {
  it('contiene 7 cespugli A..G distinti', () => {
    const ids = new Set<string>()
    for (const riga of PERCORSO_1.caselle) {
      for (const c of riga) {
        if (c.tipo === 'cespuglio') ids.add(c.cespuglioId)
      }
    }
    expect(ids).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']))
  })
  it('contiene gli allenatori 201 (Rivale) e 202 (Gennaro)', () => {
    const ids: number[] = []
    for (const riga of PERCORSO_1.caselle) {
      for (const c of riga) {
        if (c.tipo === 'allenatore') ids.push(c.allenatoreId)
      }
    }
    expect(ids.sort()).toEqual([201, 202])
  })
})

describe('Venezia', () => {
  it('contiene il Capopalestra 203 (Marco il Marinaio)', () => {
    let trovato = false
    for (const riga of VENEZIA.caselle) {
      for (const c of riga) {
        if (c.tipo === 'allenatore' && c.allenatoreId === 203) trovato = true
      }
    }
    expect(trovato).toBe(true)
  })
  it('contiene un edificio centro Pokémon e un deposito', () => {
    const edifici = new Set<string>()
    for (const riga of VENEZIA.caselle) {
      for (const c of riga) {
        if (c.tipo === 'edificio') edifici.add(c.edificioId)
      }
    }
    expect(edifici.has('centro')).toBe(true)
    expect(edifici.has('deposito')).toBe(true)
  })
})

describe('Piacenza', () => {
  it('contiene Luca (allenatore 301), centro Pokemon e deposito', () => {
    const edifici = new Set<string>()
    let trovatoLuca = false

    for (const riga of PIACENZA.caselle) {
      for (const c of riga) {
        if (c.tipo === 'allenatore' && c.allenatoreId === 301) trovatoLuca = true
        if (c.tipo === 'edificio') edifici.add(c.edificioId)
      }
    }

    expect(trovatoLuca).toBe(true)
    expect(edifici.has('centro')).toBe(true)
    expect(edifici.has('deposito')).toBe(true)
  })
})

describe('Percorso_2', () => {
  it('contiene 6 cespugli A..F distinti e Pendolare Lia', () => {
    const cespugli = new Set<string>()
    let trovataLia = false

    for (const riga of PERCORSO_2.caselle) {
      for (const c of riga) {
        if (c.tipo === 'cespuglio') cespugli.add(c.cespuglioId)
        if (c.tipo === 'allenatore' && c.allenatoreId === 250) trovataLia = true
      }
    }

    expect(cespugli).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']))
    expect(trovataLia).toBe(true)
  })
})

describe('Percorso_3', () => {
  it('contiene 6 cespugli A..F distinti e Camionista Tito', () => {
    const cespugli = new Set<string>()
    let trovatoTito = false

    for (const riga of PERCORSO_3.caselle) {
      for (const c of riga) {
        if (c.tipo === 'cespuglio') cespugli.add(c.cespuglioId)
        if (c.tipo === 'allenatore' && c.allenatoreId === 251) trovatoTito = true
      }
    }

    expect(cespugli).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']))
    expect(trovatoTito).toBe(true)
  })
})

describe('Milano', () => {
  it('contiene Anna Voltaggio (302), palestra, centro Pokemon e deposito', () => {
    const edifici = new Set<string>()
    let trovataAnna = false

    for (const riga of MILANO.caselle) {
      for (const c of riga) {
        if (c.tipo === 'allenatore' && c.allenatoreId === 302) trovataAnna = true
        if (c.tipo === 'edificio') edifici.add(c.edificioId)
      }
    }

    expect(trovataAnna).toBe(true)
    expect(edifici.has('palestra')).toBe(true)
    expect(edifici.has('centro')).toBe(true)
    expect(edifici.has('deposito')).toBe(true)
  })
})

describe('mappa-principale (griglia)', () => {
  it('ha uscite verso tutte le mappe storiche migrate', () => {
    const dest: string[] = []
    for (const riga of MAPPA_PRINCIPALE_GRIGLIA.caselle) {
      for (const c of riga) {
        if (c.tipo === 'uscita') dest.push(c.versoMappaId)
      }
    }
    for (const m of MAPPE) {
      expect(dest).toContain(m.nome)
    }
  })
})

describe('getMappaGriglia', () => {
  it('ritorna la mappa per id valido', () => {
    expect(getMappaGriglia('Percorso_1')?.id).toBe('Percorso_1')
  })
  it('ritorna null per id sconosciuto', () => {
    expect(getMappaGriglia('non-esiste')).toBeNull()
  })
})
