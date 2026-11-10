/**
 * Test per le action overworld dello store (Fase E.2).
 * Coprono `muoviAvatar`, `interagisciCasella`, `passaTurnoOverworld` e
 * la persistenza di `caselleConsumate` come Set.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@store/gameStore'
import { MAIN_MAP_START_NODE, getAdjacentMainMapNodes } from '@data/mainMapRoads'
import type { Casella, MappaGriglia, PosizioneAvatar } from '@/types'

// Mappa 4×3 con tutti i tipi di casella, identica a quella usata in
// movimento.test.ts:
//   . . . .
//   . T C #
//   . . X U
function mappaTest(): MappaGriglia {
  const T: Casella = { tipo: 'transito' }
  const C: Casella = { tipo: 'cespuglio', cespuglioId: 'A' }
  const O: Casella = { tipo: 'ostacolo' }
  const X: Casella = { tipo: 'allenatore', allenatoreId: 202 }
  const U: Casella = {
    tipo: 'uscita',
    versoMappaId: 'AltraMappa',
    spawnX: 5,
    spawnY: 6,
  }
  return {
    id: 'Percorso_1',
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
  mappaId: 'Percorso_1',
  x,
  y,
  direzione: 'S',
})

describe('store overworld — muoviAvatar', () => {
  beforeEach(() => {
    useGameStore.setState({
      posizione1: posIn(1, 1),
      posizione2: posIn(0, 0),
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
    })
  })

  it('muove il giocatore attivo e decrementa le azioni di 1', () => {
    const ok = useGameStore.getState().muoviAvatar(1, posIn(1, 0), mappaTest())
    expect(ok).toBe(true)
    const s = useGameStore.getState()
    expect(s.posizione1).toEqual(posIn(1, 0))
    expect(s.turnoOverworld.azioniRimaste).toBe(1)
    expect(s.turnoOverworld.giocatoreAttivo).toBe(1)
  })

  it("dopo 2 movimenti il turno passa all'altro giocatore", () => {
    const m = mappaTest()
    useGameStore.getState().muoviAvatar(1, posIn(1, 0), m)
    useGameStore.getState().muoviAvatar(1, posIn(2, 0), m)
    const s = useGameStore.getState()
    expect(s.turnoOverworld.giocatoreAttivo).toBe(2)
    expect(s.turnoOverworld.azioniRimaste).toBe(2)
  })

  it('rifiuta movimento se non è il proprio turno', () => {
    const ok = useGameStore.getState().muoviAvatar(2, posIn(1, 0), mappaTest())
    expect(ok).toBe(false)
    expect(useGameStore.getState().posizione2).toEqual(posIn(0, 0))
  })

  it('rifiuta movimento su ostacolo', () => {
    useGameStore.setState({
      posizione1: posIn(2, 1),
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
    })
    const ok = useGameStore.getState().muoviAvatar(1, posIn(3, 1), mappaTest())
    expect(ok).toBe(false)
  })

  it('rifiuta movimento non adiacente', () => {
    const ok = useGameStore.getState().muoviAvatar(1, posIn(3, 1), mappaTest())
    expect(ok).toBe(false)
  })

  it('rifiuta movimento se azioniRimaste = 0', () => {
    useGameStore.setState({
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 0 },
    })
    const ok = useGameStore.getState().muoviAvatar(1, posIn(1, 0), mappaTest())
    expect(ok).toBe(false)
  })

  it('rifiuta un cambio di mappa mascherato da movimento adiacente', () => {
    const ok = useGameStore.getState().muoviAvatar(1, { ...posIn(1, 0), mappaId: 'AltraMappa' }, mappaTest())
    expect(ok).toBe(false)
    expect(useGameStore.getState().posizione1).toEqual(posIn(1, 1))
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
  })

  it('dimentica la prenotazione fallback quando si esce dalla scena', () => {
    useGameStore.setState({
      fallbackLocationActivity: { playerId: 1, location: 'Pescara' },
      scenaCorrente: { scena: 'citta', payload: { luogo: 'Pescara' } },
      scenaPrecedente: null,
    })
    useGameStore.getState().vaiAScena('mappa-principale')
    expect(useGameStore.getState().fallbackLocationActivity).toBeNull()
  })
})

describe('store overworld — interagisciCasella', () => {
  beforeEach(() => {
    useGameStore.setState({
      posizione1: posIn(1, 1),
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      giocatore1: {
        ...useGameStore.getState().giocatore1,
        squadra: [{ istanzaId: 'grid-player', specieId: 1, nome: 'Vyrath', livello: 5, hp: 8, xp: 0 }],
        caselleConsumate: new Set(),
        allenatoriSconfitti: new Set(),
      },
    })
  })

  it('cespuglio → battaglia-selvatica + casella consumata + turno chiuso', () => {
    const r = useGameStore.getState().interagisciCasella(1, mappaTest(), 2, 1)
    expect(r.tipo).toBe('battaglia-selvatica')
    const s = useGameStore.getState()
    expect(s.giocatore1.caselleConsumate.has('Percorso_1:2,1:cespuglio:A')).toBe(true)
    // Turno chiuso → swap a giocatore 2 con 2 azioni
    expect(s.turnoOverworld.giocatoreAttivo).toBe(2)
    expect(s.turnoOverworld.azioniRimaste).toBe(2)
  })

  it('allenatore → battaglia-npc + consumata', () => {
    useGameStore.setState({ posizione1: posIn(2, 1) })
    const r = useGameStore.getState().interagisciCasella(1, mappaTest(), 2, 2)
    expect(r).toMatchObject({ tipo: 'battaglia-npc', allenatoreId: 202 })
    const s = useGameStore.getState()
    expect(s.giocatore1.caselleConsumate.has('Percorso_1:2,2:allenatore:202')).toBe(true)
  })

  it('uscita → transizione-mappa + sposta avatar sul nuovo spawn', () => {
    useGameStore.setState({ posizione1: posIn(2, 2) })
    const r = useGameStore.getState().interagisciCasella(1, mappaTest(), 3, 2)
    expect(r).toMatchObject({
      tipo: 'transizione-mappa',
      versoMappaId: 'AltraMappa',
      spawnX: 5,
      spawnY: 6,
    })
    const s = useGameStore.getState()
    expect(s.posizione1).toEqual({
      mappaId: 'AltraMappa',
      x: 5,
      y: 6,
      direzione: 'S',
    })
    // Le uscite non vengono marcate consumate
    expect(s.giocatore1.caselleConsumate.size).toBe(0)
    // Ma il turno si chiude lo stesso
    expect(s.turnoOverworld.giocatoreAttivo).toBe(2)
  })

  it('cespuglio già consumato → no-op (turno NON consumato)', () => {
    useGameStore.setState({
      giocatore1: {
        ...useGameStore.getState().giocatore1,
        caselleConsumate: new Set(['Percorso_1:2,1:cespuglio:A']),
      },
    })
    const r = useGameStore.getState().interagisciCasella(1, mappaTest(), 2, 1)
    expect(r.tipo).toBe('no-op')
    const s = useGameStore.getState()
    expect(s.turnoOverworld.giocatoreAttivo).toBe(1)
    expect(s.turnoOverworld.azioniRimaste).toBe(2)
  })

  it("transito → no-op (non interagibile)", () => {
    const r = useGameStore.getState().interagisciCasella(1, mappaTest(), 0, 0)
    expect(r.tipo).toBe('no-op')
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
  })

  it("se non è il proprio turno → no-op", () => {
    useGameStore.setState({
      turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 2 },
    })
    const r = useGameStore.getState().interagisciCasella(1, mappaTest(), 2, 1)
    expect(r.tipo).toBe('no-op')
  })

  it('rifiuta caselle lontane senza consumarle o cambiare turno', () => {
    const r = useGameStore.getState().interagisciCasella(1, mappaTest(), 3, 2)
    expect(r.tipo).toBe('no-op')
    expect(useGameStore.getState().posizione1).toEqual(posIn(1, 1))
    expect(useGameStore.getState().turnoOverworld.giocatoreAttivo).toBe(1)
    expect(useGameStore.getState().giocatore1.caselleConsumate.size).toBe(0)
  })

  it('rifiuta interazioni su una mappa diversa da quella occupata', () => {
    useGameStore.setState({ posizione1: { ...posIn(1, 1), mappaId: 'AltraMappa' } })
    expect(useGameStore.getState().interagisciCasella(1, mappaTest(), 2, 1).tipo).toBe('no-op')
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
  })

  it('rifiuta interazioni quando non restano azioni', () => {
    useGameStore.setState({ turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 0 } })
    expect(useGameStore.getState().interagisciCasella(1, mappaTest(), 2, 1).tipo).toBe('no-op')
    expect(useGameStore.getState().giocatore1.caselleConsumate.size).toBe(0)
    expect(useGameStore.getState().turnoOverworld.giocatoreAttivo).toBe(1)
  })
  it.each(['npc', 'bush'] as const)('non consuma il punto %s né il turno con squadra fuori cap; l’incontro resta riprovabile', (kind) => {
    const before = useGameStore.getState()
    useGameStore.setState({ posizione1: posIn(kind === 'npc' ? 2 : 1, 1), giocatore1: { ...before.giocatore1,
      squadra: [...before.giocatore1.squadra, { istanzaId: 'out-of-cap', specieId: 5, nome: 'Felyss', livello: 20, hp: 12, xp: 0 }] } })
    const current = useGameStore.getState()
    const target = kind === 'npc' ? { x: 2, y: 2 } : { x: 2, y: 1 }
    expect(current.interagisciCasella(1, mappaTest(), target.x, target.y)).toEqual({ tipo: 'no-op' })
    expect(useGameStore.getState().giocatore1.caselleConsumate).toEqual(new Set())
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
    expect(useGameStore.getState().teamRuleMessage).toMatch(/5 livelli/)
    useGameStore.setState({ giocatore1: { ...current.giocatore1, squadra: before.giocatore1.squadra } })
    expect(useGameStore.getState().interagisciCasella(1, mappaTest(), target.x, target.y).tipo).toBe(kind === 'npc' ? 'battaglia-npc' : 'battaglia-selvatica')
  })
  it('un allenatore inesistente o una squadra KO non consumano progressione', () => {
    const invalid = mappaTest()
    invalid.caselle[1][2] = { tipo: 'allenatore', allenatoreId: 999999 }
    expect(useGameStore.getState().interagisciCasella(1, invalid, 2, 1).tipo).toBe('no-op')
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, squadra: state.giocatore1.squadra.map((pokemon) => ({ ...pokemon, hp: 0 })) } }))
    expect(useGameStore.getState().interagisciCasella(1, mappaTest(), 2, 1).tipo).toBe('no-op')
    expect(useGameStore.getState().giocatore1.caselleConsumate.size).toBe(0)
    expect(useGameStore.getState().turnoOverworld.giocatoreAttivo).toBe(1)
  })
})

describe('store overworld — passaTurnoOverworld', () => {
  it('da giocatore 1 swappa a 2 con 2 azioni', () => {
    useGameStore.setState({
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 1 },
    })
    useGameStore.getState().passaTurnoOverworld()
    expect(useGameStore.getState().turnoOverworld).toEqual({
      giocatoreAttivo: 2,
      azioniRimaste: 2,
    })
  })
})

describe('store overworld — mappa principale', () => {
  beforeEach(() => {
    useGameStore.setState({
      posizione1: {
        mappaId: 'mappa-principale',
        x: 0,
        y: 0,
        direzione: 'S',
        luogo: 'Venezia',
      },
      posizione2: {
        mappaId: 'mappa-principale',
        x: 0,
        y: 0,
        direzione: 'S',
        luogo: 'Venezia',
      },
      giocatoreAttivo: 1,
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
    })
  })

  it('muove il giocatore attivo solo verso un nodo collegato da strada', () => {
    const ok = useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Percorso_1')

    expect(ok).toBe(true)
    expect(useGameStore.getState().posizione1).toMatchObject({
      mappaId: 'mappa-principale',
      luogo: 'Percorso_1',
    })
    expect(useGameStore.getState().turnoOverworld).toEqual({
      giocatoreAttivo: 1,
      azioniRimaste: 1,
    })
  })

  it('consente due movimenti e blocca il terzo nello stesso turno sulla mappa principale', () => {
    useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Percorso_1')

    const ok = useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Piacenza')

    expect(ok).toBe(true)
    expect(useGameStore.getState().posizione1.luogo).toBe('Piacenza')
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 0 })
    expect(useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Percorso_2')).toBe(false)
    expect(useGameStore.getState().interagisciLuogoMappaPrincipale(1)).toEqual({ tipo: 'no-op' })
  })

  it('rifiuta movimento verso un nodo non collegato', () => {
    const ok = useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Roma')

    expect(ok).toBe(false)
    expect(useGameStore.getState().posizione1.luogo).toBe('Venezia')
  })

  it('usa Pordenone come nodo iniziale collegato a Venezia', () => {
    expect(MAIN_MAP_START_NODE).toBe('Pordenone')
    expect(getAdjacentMainMapNodes('Pordenone')).toEqual(['Venezia'])
  })

  it('supporta diramazioni con piu strade in uscita dallo stesso nodo', () => {
    useGameStore.setState({
      posizione1: {
        mappaId: 'mappa-principale',
        x: 0,
        y: 0,
        direzione: 'S',
        luogo: 'Percorso_14',
      },
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
    })

    const ok = useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Percorso_1')

    expect(ok).toBe(true)
    expect(useGameStore.getState().posizione1.luogo).toBe('Percorso_1')
  })

  it('modella le diramazioni principali senza percorso lineare unico', () => {
    expect(getAdjacentMainMapNodes('Percorso_3')).toEqual(['Milano'])
    expect(getAdjacentMainMapNodes('Percorso_11')).toEqual(['Foggia'])
    expect(new Set(getAdjacentMainMapNodes('Percorso_14'))).toEqual(
      new Set(['Percorso_1', 'Grosseto', 'Pescara', 'Roma'])
    )
    expect(new Set(getAdjacentMainMapNodes('Percorso_4'))).toEqual(
      new Set(['Percorso_2', 'Percorso_5'])
    )
    expect(new Set(getAdjacentMainMapNodes('Percorso_12'))).toEqual(
      new Set(['Foggia', 'Napoli', 'Molisnt'])
    )
  })

  it('interagisce col luogo corrente e passa il turno mantenendo il giocatore attivo di scena', () => {
    const result = useGameStore.getState().interagisciLuogoMappaPrincipale(1)

    expect(result).toEqual({ tipo: 'luogo', luogo: 'Venezia' })
    expect(useGameStore.getState().giocatoreAttivo).toBe(1)
    expect(useGameStore.getState().turnoOverworld).toEqual({
      giocatoreAttivo: 2,
      azioniRimaste: 2,
    })
  })

  it('prenota una sola attività nei luoghi fallback senza mappa locale', () => {
    useGameStore.setState({
      posizione1: { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo: 'Pescara' },
      giocatoreAttivo: 1,
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      fallbackLocationActivity: null,
      scenaCorrente: { scena: 'citta', payload: { luogo: 'Pescara' } },
    })
    expect(useGameStore.getState().interagisciLuogoMappaPrincipale(1)).toEqual({ tipo: 'luogo', luogo: 'Pescara' })
    expect(useGameStore.getState().fallbackLocationActivity).toEqual({ playerId: 1, location: 'Pescara' })
    expect(useGameStore.getState().consumaInterazioneMappaLocale(1, 'Pescara')).toBe(true)
    expect(useGameStore.getState().fallbackLocationActivity).toBeNull()
    expect(useGameStore.getState().consumaInterazioneMappaLocale(1, 'Pescara')).toBe(false)
  })
})

describe('store overworld — reset', () => {
  it("ripristina posizioni e turnoOverworld al default", () => {
    useGameStore.setState({
      posizione1: posIn(2, 2),
      posizione2: posIn(3, 1),
      turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 1 },
    })
    useGameStore.getState().reset()
    const s = useGameStore.getState()
    expect(s.posizione1).toEqual({
      mappaId: 'mappa-principale',
      x: 0,
      y: 0,
      direzione: 'S',
      luogo: MAIN_MAP_START_NODE,
    })
    expect(s.posizione2).toEqual({
      mappaId: 'mappa-principale',
      x: 0,
      y: 0,
      direzione: 'S',
      luogo: MAIN_MAP_START_NODE,
    })
    expect(s.turnoOverworld).toEqual({ giocatoreAttivo: 1, azioniRimaste: 2 })
    expect(s.giocatore1.caselleConsumate.size).toBe(0)
  })
})
