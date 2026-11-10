import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalMap } from '@data/localMaps'
import { ALLENATORI } from '@data/index'
import { SECRET_LOCATION_GYM_IDS } from '@data/secretLocation'
import { getAdjacentLocalMapNodes } from '@engine/localMapMovement'
import { calcolaHPMax } from '@engine/battleEngine'
import { creaIstanza, useGameStore } from '@store/gameStore'
import type { MappaGriglia, PosizioneAvatar, StatoBattaglia } from '@/types'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

const world = (luogo: string): PosizioneAvatar => ({ mappaId: 'mappa-principale', luogo, x: 0, y: 0, direzione: 'S' })
const map = getLocalMap('Percorso_15')!
const next = () => getAdjacentLocalMapNodes(map, map.startNode)[0]
const unlock = (id: 1 | 2, defeated = SECRET_LOCATION_GYM_IDS) => {
  const key = id === 1 ? 'giocatore1' : 'giocatore2'
  useGameStore.setState((s) => ({ [key]: { ...s[key], allenatoriSconfitti: new Set(defeated) } }))
}
const restoredSave = () => {
  const options = useGameStore.persist.getOptions()
  const saved = JSON.parse(JSON.stringify(options.partialize!(useGameStore.getState())))
  return options.merge!(saved, useGameStore.getState())
}

function ongoingBattle(luogoRitorno = 'Roma'): StatoBattaglia {
  const pokemonA = useGameStore.getState().giocatore1.squadra[0]
  const pokemonB = { ...creaIstanza(13, 60)!, hp: 3 }
  return { tipo: 'NPC', pokemonA, pokemonB, squadraA: [pokemonA], squadraB: [pokemonB],
    hpMaxA: calcolaHPMax(pokemonA), hpMaxB: calcolaHPMax(pokemonB), turnoCorrente: 'A',
    luogoRitorno, log: [], evoluzioneInAttesa: null,
    checkpoint: { version: 1, phase: 'player', initialPriority: 'A', actedThisRound: [],
      openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] },
  }
}

describe('store - passaggio segreto individuale di Roma', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.setState((s) => ({
      posizione1: world('Roma'), posizione2: world('Roma'),
      giocatore1: { ...s.giocatore1, squadra: [creaIstanza(1, 60)!] },
      giocatore2: { ...s.giocatore2, squadra: [creaIstanza(5, 60)!] },
      scenaCorrente: { scena: 'citta', payload: { luogo: 'Roma' } },
    }))
  })

  it('senza palestre rifiuta ingresso, API diretta e navigazione senza spostare o spendere azioni', () => {
    const s = useGameStore.getState()
    expect(s.attraversaPassaggioSegreto(1)).toBe(false)
    expect(s.muoviAvatarMappaPrincipale(1, 'Percorso_15')).toBe(false)
    expect(s.inizializzaPosizioneLocale(1, 'Percorso_15')).toBeNull()
    expect(s.apriMappaLocale(1, 'Percorso_15')).toBe(false)
    s.vaiAScena('percorso', { luogo: 'Percorso_15' })
    expect(useGameStore.getState().scenaCorrente).toBe(s.scenaCorrente)
    expect(useGameStore.getState().posizione1).toBe(s.posizione1)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
  })

  it('anche con tutti gli NPC sconfitti resta chiuso se manca il capopalestra di Roma', () => {
    const ultimo = ALLENATORI.find((a) => a.tipo === 'Capopalestra' && a.luogo === 'Roma')!
    unlock(1, ALLENATORI.filter((a) => a.id !== ultimo.id).map((a) => a.id))
    expect(useGameStore.getState().attraversaPassaggioSegreto(1)).toBe(false)
  })

  it('lo sblocco del secondo giocatore non autorizza il primo né il movimento fuori turno', () => {
    unlock(2)
    const s = useGameStore.getState()
    expect(s.attraversaPassaggioSegreto(1)).toBe(false)
    expect(s.attraversaPassaggioSegreto(2)).toBe(false)
    s.passaTurnoMappaLocale()
    expect(s.attraversaPassaggioSegreto(2)).toBe(true)
    expect(useGameStore.getState().posizione2.luogo).toBe('Percorso_15')
    expect(useGameStore.getState().posizione1.luogo).toBe('Roma')
    expect(useGameStore.getState().posizioniLocali1).toEqual({})
  })

  it('ingresso e ritorno costano un movimento ciascuno, conservano i pallini e lasciano fermo l’altro giocatore', () => {
    unlock(1)
    const romaNode = getLocalMap('Roma')!.nodes[7].id
    const secretNode = map.nodes[5].id
    useGameStore.setState({ posizioniLocali1: { Roma: romaNode, Percorso_15: secretNode } })
    const other = useGameStore.getState().posizione2
    const s = useGameStore.getState()
    expect(s.attraversaPassaggioSegreto(1)).toBe(true)
    expect(useGameStore.getState().posizioniLocali1.Percorso_15).toBe(secretNode)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(useGameStore.getState().scenaCorrente).toEqual({ scena: 'percorso', payload: { luogo: 'Percorso_15' } })
    expect(s.attraversaPassaggioSegreto(1)).toBe(true)
    expect(useGameStore.getState().posizione1.luogo).toBe('Roma')
    expect(useGameStore.getState().posizione2).toBe(other)
    expect(useGameStore.getState().posizioniLocali1).toEqual({ Roma: romaNode, Percorso_15: secretNode })
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(s.attraversaPassaggioSegreto(1)).toBe(false)
  })

  it('l’ingresso nuovo usa il nodo locale stabilito dalla mappa e condivide il budget con il cammino', () => {
    unlock(1)
    const s = useGameStore.getState()
    expect(s.attraversaPassaggioSegreto(1)).toBe(true)
    expect(useGameStore.getState().posizioniLocali1.Percorso_15).toBe(map.startNode)
    expect(s.muoviAvatarMappaLocale(1, 'Percorso_15', next())).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(s.attraversaPassaggioSegreto(1)).toBe(false)
    s.vaiAScena('mappa-principale')
    expect(useGameStore.getState().posizione1.luogo).toBe('Percorso_15')
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(s.apriMappaLocale(1, 'Percorso_15')).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    s.passaTurnoMappaLocale()
    expect(useGameStore.getState().giocatoreAttivo).toBe(2)
    expect(useGameStore.getState().posizione2.luogo).toBe('Roma')
  })

  it('fuori Roma, senza azioni o durante battaglia il passaggio non è percorribile', () => {
    unlock(1)
    const s = useGameStore.getState()
    useGameStore.setState({ posizione1: world('Venezia') })
    expect(s.attraversaPassaggioSegreto(1)).toBe(false)
    expect(s.muoviAvatarMappaPrincipale(1, 'Percorso_15')).toBe(false)
    useGameStore.setState({ posizione1: world('Roma'), turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 0 } })
    expect(s.attraversaPassaggioSegreto(1)).toBe(false)
    useGameStore.setState({ turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, battaglia: ongoingBattle() })
    expect(s.attraversaPassaggioSegreto(1)).toBe(false)
  })

  it('dal percorso segreto si può uscire soltanto a Roma, e il ritorno non rigenera azioni', () => {
    unlock(1)
    const s = useGameStore.getState()
    expect(s.attraversaPassaggioSegreto(1)).toBe(true)
    expect(s.muoviAvatarMappaPrincipale(1, 'Percorso_14')).toBe(false)
    expect(s.muoviAvatarMappaPrincipale(1, 'Venezia')).toBe(false)
    expect(s.muoviAvatarMappaPrincipale(1, 'Roma')).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
    expect(s.apriMappaLocale(1, 'Roma')).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(0)
  })

  it('blocca apertura, cammino, attività e battaglie segrete in una posizione contraffatta prima dello sblocco', () => {
    useGameStore.setState({ posizione1: world('Percorso_15') })
    const s = useGameStore.getState()
    expect(s.apriMappaLocale(1, 'Percorso_15')).toBe(false)
    expect(s.inizializzaPosizioneLocale(1, 'Percorso_15')).toBeNull()
    expect(s.muoviAvatarMappaLocale(1, 'Percorso_15', next())).toBe(false)
    expect(s.consumaInterazioneMappaLocale(1, 'Percorso_15')).toBe(false)
    expect(s.interagisciLuogoMappaPrincipale(1)).toEqual({ tipo: 'no-op' })
    s.segnaCespuglioVisitato(1, 'Percorso_15', 'A')
    expect(s.cespuglioVisitato(1, 'Percorso_15', 'A')).toBe(false)
    s.iniziaBattaglia(ongoingBattle('Percorso_15'))
    expect(useGameStore.getState().battaglia).toBeNull()
    expect(s.iniziaBattagliaNPC(201, 'Percorso_15')).toBe(false)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
  })

  it('le API a griglia non introducono un secondo ingresso al luogo segreto', () => {
    unlock(1)
    useGameStore.setState({ posizione1: { mappaId: 'vecchia-griglia', x: 0, y: 0, direzione: 'E' } })
    const grid: MappaGriglia = { id: 'vecchia-griglia', larghezza: 2, altezza: 1, spawnDefault: { x: 0, y: 0 }, background: '', caselle: [[{ tipo: 'transito' }, { tipo: 'uscita', versoMappaId: 'Percorso_15', spawnX: 0, spawnY: 0 }]] }
    expect(useGameStore.getState().interagisciCasella(1, grid, 1, 0)).toEqual({ tipo: 'no-op' })
    expect(useGameStore.getState().muoviAvatar(1, { mappaId: grid.id, luogo: 'Percorso_15', x: 1, y: 0, direzione: 'E' }, grid)).toBe(false)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(2)
  })

  it('ricarica lo sblocco, le due posizioni locali e il budget senza creare nuove azioni', () => {
    unlock(1)
    const s = useGameStore.getState()
    expect(s.attraversaPassaggioSegreto(1)).toBe(true)
    const restored = restoredSave()
    expect(restored.giocatore1.allenatoriSconfitti).toEqual(new Set(SECRET_LOCATION_GYM_IDS))
    expect(restored.posizione1.luogo).toBe('Percorso_15')
    expect(restored.posizione2.luogo).toBe('Roma')
    expect(restored.posizioniLocali1.Percorso_15).toBe(map.startNode)
    expect(restored.turnoOverworld.azioniRimaste).toBe(1)
    expect(restored.scenaCorrente).toEqual({ scena: 'percorso', payload: { luogo: 'Percorso_15' } })
  })

  it('ricaricando un salvataggio non sbloccato torna a Roma senza alterare il budget né mostrare la mappa', () => {
    useGameStore.setState({ posizione1: world('Percorso_15'), scenaCorrente: { scena: 'percorso', payload: { luogo: 'Percorso_15' } }, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 1 } })
    const restored = restoredSave()
    expect(restored.posizione1.luogo).toBe('Roma')
    expect(restored.scenaCorrente).toEqual({ scena: 'mappa-principale' })
    expect(restored.turnoOverworld.azioniRimaste).toBe(1)
  })

  it('un movimento locale e un’interazione segreta chiudono il turno senza spostare l’altro giocatore', () => {
    unlock(1)
    useGameStore.setState({ posizione1: world('Percorso_15') })
    const s = useGameStore.getState()
    expect(s.apriMappaLocale(1, 'Percorso_15')).toBe(true)
    expect(s.muoviAvatarMappaLocale(1, 'Percorso_15', next())).toBe(true)
    expect(s.consumaInterazioneMappaLocale(1, 'Percorso_15')).toBe(true)
    expect(useGameStore.getState().turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    expect(useGameStore.getState().giocatoreAttivo).toBe(1)
    expect(s.attraversaPassaggioSegreto(1)).toBe(false)
    expect(s.passaTurnoMappaLocale()).toBe(true)
    expect(useGameStore.getState().giocatoreAttivo).toBe(2)
    expect(useGameStore.getState().posizione2.luogo).toBe('Roma')
  })
})
