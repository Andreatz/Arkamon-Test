import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALLENATORI } from '@data/index'
import { calcolaHPMax } from '@engine/battleEngine'
import { haSpazioPokemon, useGameStore } from '@store/gameStore'
import type { PokemonIstanza } from '@/types'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

function pokemon(id: string, hp = 4): PokemonIstanza {
  return {
    istanzaId: id,
    specieId: 1,
    nome: id,
    livello: 5,
    hp,
    xp: 0,
  }
}

function depositoPieno(): Record<string, PokemonIstanza> {
  const deposito: Record<string, PokemonIstanza> = {}
  for (let box = 1; box <= 30; box++) {
    for (let slot = 1; slot <= 35; slot++) {
      deposito[`${box}:${slot}`] = pokemon(`deposito-${box}-${slot}`)
    }
  }
  return deposito
}

describe('gameStore - invarianti squadra e deposito', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  it('non sovrascrive il deposito quando tutti gli slot sono pieni', () => {
    const deposito = depositoPieno()
    const originale = deposito['1:1']
    useGameStore.setState((s) => ({
      giocatore1: {
        ...s.giocatore1,
        squadra: Array.from({ length: 6 }, (_, i) => pokemon(`squadra-${i}`)),
        deposito,
      },
    }))

    useGameStore.getState().aggiungiPokemon(1, pokemon('nuovo'))

    const giocatore = useGameStore.getState().giocatore1
    expect(haSpazioPokemon(giocatore)).toBe(false)
    expect(Object.keys(giocatore.deposito)).toHaveLength(1050)
    expect(giocatore.deposito['1:1']).toBe(originale)
  })

  it('termina la battaglia conservando gli HP e pulendo gli altri stati alterati', () => {
    useGameStore.setState((s) => ({
      giocatore1: {
        ...s.giocatore1,
        squadra: [{ ...pokemon('squadra'), stato: { tipo: 'Avvelenato', turniRimanenti: -1 } }],
        deposito: {
          '1:1': { ...pokemon('deposito'), stato: { tipo: 'Confuso', turniRimanenti: 1 } },
        },
      },
    }))

    useGameStore.getState().terminaBattaglia(false)

    const giocatore = useGameStore.getState().giocatore1
    expect(giocatore.squadra[0].hp).toBe(4)
    expect(giocatore.squadra[0].stato).toBeUndefined()
    expect(giocatore.deposito['1:1'].hp).toBe(4)
    expect(giocatore.deposito['1:1'].stato).toBeUndefined()
  })

  it.each([1, 2] as const)('con giocatore attivo %i conserva PAR in entrambe le squadre e depositi, anche dopo salvataggio', (giocatoreAttivo) => {
    const paralizzato = (id: string, hp: number): PokemonIstanza => ({
      ...pokemon(id, hp), stato: { tipo: 'Paralizzato', turniRimanenti: -1 },
    })
    const squadra = (id: number): PokemonIstanza[] => [
      paralizzato(`attivo-${id}`, 1),
      paralizzato(`riserva-ko-${id}`, 0),
      { ...pokemon(`avvelenato-${id}`, 3), stato: { tipo: 'Avvelenato', turniRimanenti: -1, turniTrascorsi: 2 } },
    ]
    const deposito = (id: number): Record<string, PokemonIstanza> => ({
      '1:1': paralizzato(`deposito-par-${id}`, 2),
      '1:2': { ...pokemon(`deposito-sonno-${id}`, 3), stato: { tipo: 'Addormentato', turniRimanenti: 2 } },
    })
    useGameStore.setState((state) => ({
      giocatoreAttivo,
      giocatore1: { ...state.giocatore1, squadra: squadra(1), deposito: deposito(1) },
      giocatore2: { ...state.giocatore2, squadra: squadra(2), deposito: deposito(2) },
    }))
    const before = useGameStore.getState()
    before.iniziaBattaglia({
      tipo: 'PVP', pokemonA: before.giocatore1.squadra[0], pokemonB: before.giocatore2.squadra[0],
      squadraA: before.giocatore1.squadra, squadraB: before.giocatore2.squadra,
      hpMaxA: 12, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Percorso_1', log: [], evoluzioneInAttesa: null,
    })

    useGameStore.getState().terminaBattaglia(false)

    const after = useGameStore.getState()
    expect(after.battaglia).toBeNull()
    const options = useGameStore.persist.getOptions()
    const saved = localStorage.getItem('arkamon-save')
    expect(saved).not.toBeNull()
    const serialized = JSON.parse(saved!).state
    const restored = options.merge!(serialized, before)
    expect(restored.battaglia).toBeNull()
    for (const key of ['giocatore1', 'giocatore2'] as const) {
      expect(after[key].squadra.map((p) => p.hp)).toEqual([1, 0, 3])
      expect(after[key].squadra.slice(0, 2)).toEqual(before[key].squadra.slice(0, 2))
      expect(after[key].squadra[2].stato).toBeUndefined()
      expect(after[key].deposito['1:1']).toEqual(before[key].deposito['1:1'])
      expect(after[key].deposito['1:2']).toMatchObject({ hp: 3 })
      expect(after[key].deposito['1:2'].stato).toBeUndefined()
      expect(restored[key].squadra).toEqual(after[key].squadra)
      expect(restored[key].deposito).toEqual(after[key].deposito)
      expect(before[key].squadra[2].stato?.tipo).toBe('Avvelenato')
    }
  })

  it('la chiusura con cura completa guarisce PAR in entrambe le squadre e depositi', () => {
    const paralizzato: PokemonIstanza = { ...pokemon('paralizzato', 1), stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }
    const esausto: PokemonIstanza = { ...pokemon('esausto', 0), stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }
    useGameStore.setState((state) => ({
      giocatore1: { ...state.giocatore1, squadra: [paralizzato, esausto], deposito: { '1:1': paralizzato } },
      giocatore2: { ...state.giocatore2, squadra: [paralizzato, esausto], deposito: { '1:1': paralizzato } },
    }))

    useGameStore.getState().terminaBattaglia(true)

    for (const player of [useGameStore.getState().giocatore1, useGameStore.getState().giocatore2]) {
      for (const curato of player.squadra) {
        expect(curato.hp).toBe(calcolaHPMax(curato))
        expect(curato.stato).toBeUndefined()
      }
      expect(player.deposito['1:1'].stato).toBeUndefined()
      expect(player.deposito['1:1'].hp).toBe(1)
    }
    expect(paralizzato.stato?.tipo).toBe('Paralizzato')
    expect(esausto.hp).toBe(0)
  })

  it.each([1, 2] as const)('il Centro guarisce PAR al giocatore %i senza curare la squadra dell’altro', (giocatoreId) => {
    const paralizzato: PokemonIstanza = { ...pokemon('paralizzato', 1), stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }
    const esausto: PokemonIstanza = { ...pokemon('esausto', 0), stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }
    useGameStore.setState((state) => ({
      giocatore1: { ...state.giocatore1, squadra: [paralizzato, esausto] },
      giocatore2: { ...state.giocatore2, squadra: [paralizzato, esausto] },
    }))

    useGameStore.getState().curaSquadra(giocatoreId)

    const state = useGameStore.getState()
    const curato = giocatoreId === 1 ? state.giocatore1 : state.giocatore2
    const altro = giocatoreId === 1 ? state.giocatore2 : state.giocatore1
    for (const p of curato.squadra) {
      expect(p.hp).toBe(calcolaHPMax(p))
      expect(p.stato).toBeUndefined()
    }
    expect(altro.squadra).toEqual([paralizzato, esausto])
  })

  it('il Centro Pokemon cura gli HP e pulisce lo stato alterato', () => {
    const ferito = { ...pokemon('ferito', 1), stato: { tipo: 'Avvelenato' as const, turniRimanenti: -1 } }
    useGameStore.setState((s) => ({
      giocatore1: { ...s.giocatore1, squadra: [ferito] },
    }))

    useGameStore.getState().curaSquadra(1)

    const curato = useGameStore.getState().giocatore1.squadra[0]
    expect(curato.hp).toBe(calcolaHPMax(curato))
    expect(curato.stato).toBeUndefined()
  })

  it('non avvia una battaglia NPC se tutta la squadra e KO', () => {
    const allenatore = ALLENATORI[0]
    expect(allenatore).toBeDefined()
    useGameStore.setState((s) => ({
      giocatore1: { ...s.giocatore1, squadra: [pokemon('ko', 0)] },
      giocatoreAttivo: 1,
    }))

    expect(useGameStore.getState().iniziaBattagliaNPC(allenatore.id, allenatore.luogo)).toBe(false)
  })

  it('non permette di sfidare nuovamente un allenatore sconfitto', () => {
    const allenatore = ALLENATORI[0]
    useGameStore.setState((state) => ({
      giocatore1: {
        ...state.giocatore1,
        squadra: [pokemon('sano')],
        allenatoriSconfitti: new Set([allenatore.id]),
      },
      giocatoreAttivo: 1,
    }))
    expect(useGameStore.getState().iniziaBattagliaNPC(allenatore.id, allenatore.luogo)).toBe(false)
    expect(useGameStore.getState().battaglia).toBeNull()
  })
})
