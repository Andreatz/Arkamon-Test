import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPokemon } from '@data/index'
import { EvoluzioneScene, getPendingEvolutionQueue } from '@scenes/EvoluzioneScene'
import { useGameStore, creaIstanza } from '@store/gameStore'

vi.mock('@store/gameStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@store/gameStore')>()
  return {
    ...actual,
    useGameStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useGameStore.getState>) => unknown) => selector(actual.useGameStore.getState()),
      actual.useGameStore,
    ),
  }
})

describe('ripresa della coda evoluzioni', () => {
  beforeEach(() => useGameStore.getState().reset())

  it('esclude evoluzioni già applicate e istanze mancanti conservando l’ordine delle restanti', () => {
    const primo = { ...creaIstanza(2, 10)!, istanzaId: 'completato' }
    const secondo = { ...creaIstanza(5, 10)!, istanzaId: 'pendente' }
    const terzo = { ...creaIstanza(9, 10)!, istanzaId: 'pendente-2' }
    const queue = [
      { istanzaId: 'completato', oldSpecieId: 1, newSpecieId: 2 },
      { istanzaId: 'mancante', oldSpecieId: 1, newSpecieId: 2 },
      { istanzaId: 'pendente', oldSpecieId: 5, newSpecieId: 6 },
      { istanzaId: 'pendente-2', oldSpecieId: 9, newSpecieId: 10 },
    ]
    expect(getPendingEvolutionQueue(queue, [primo, secondo, terzo])).toEqual(queue.slice(2))
    expect(queue).toHaveLength(4)
  })

  it('non retrocede una creatura che ha già raggiunto una specie successiva', () => {
    const pokemon = { ...creaIstanza(3, 20)!, istanzaId: 'evoluto' }
    expect(getPendingEvolutionQueue([{ istanzaId: 'evoluto', oldSpecieId: 1, newSpecieId: 2 }], [pokemon])).toEqual([])
  })

  it('al nuovo mount mostra la prima evoluzione ancora pendente senza ripetere quella completata', () => {
    const primo = { ...creaIstanza(2, 10)!, istanzaId: 'completato' }
    const secondo = { ...creaIstanza(5, 10)!, istanzaId: 'pendente' }
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, squadra: [primo, secondo] } }))
    useGameStore.getState().vaiAScena('evoluzione', {
      giocatoreId: 1,
      evoluzioni: [
        { istanzaId: 'completato', oldSpecieId: 1, newSpecieId: 2 },
        { istanzaId: 'pendente', oldSpecieId: 5, newSpecieId: 6 },
      ],
      luogoRitorno: 'Percorso_1',
    })
    const markup = renderToStaticMarkup(<EvoluzioneScene />)
    expect(markup).toContain('Evoluzione 1 di 1')
    expect(markup).toContain(`${getPokemon(5)!.nome} sta per evolversi!`)
    expect(markup).not.toContain(`${getPokemon(2)!.nome} sta per evolversi!`)
  })

  it('se il payload è già tutto applicato non offre un secondo pulsante Evolvi', () => {
    const pokemon = { ...creaIstanza(2, 10)!, istanzaId: 'completato' }
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, squadra: [pokemon] } }))
    useGameStore.getState().vaiAScena('evoluzione', {
      giocatoreId: 1,
      evoluzioni: [{ istanzaId: 'completato', oldSpecieId: 1, newSpecieId: 2 }],
    })
    expect(renderToStaticMarkup(<EvoluzioneScene />)).toBe('')
  })
})
