import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALLENATORI } from '@data/index'
import { PercorsoScene } from '@scenes/PercorsoScene'
import { useGameStore } from '@store/gameStore'

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

describe('allenatori accessibili nei percorsi', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
    useGameStore.getState().scegliStarter(1)
    useGameStore.getState().scegliStarter(5)
  })

  it.each(ALLENATORI.filter((allenatore) => allenatore.luogo.startsWith('Percorso_')))(
    'offre un controllo per sfidare $nome in $luogo', (allenatore) => {
      useGameStore.getState().vaiAScena('percorso', { luogo: allenatore.luogo })
      const markup = renderToStaticMarkup(<PercorsoScene />)
      expect(markup).toContain(`aria-label="Sfida ${allenatore.nome}"`)
    },
  )

  it('marca un allenatore già sconfitto e conserva gli altri incontri disponibili', () => {
    useGameStore.setState((state) => ({
      giocatore1: { ...state.giocatore1, allenatoriSconfitti: new Set([201]) },
    }))
    useGameStore.getState().vaiAScena('percorso', { luogo: 'Percorso_1' })
    const markup = renderToStaticMarkup(<PercorsoScene />)
    expect(markup).toContain('aria-label="Rivale, già sconfitto"')
    expect(markup).toContain('aria-label="Sfida Gennaro Bullo"')
    expect(markup).toContain('aria-label="Cespuglio A"')
  })

  it('se tutta la squadra è KO impedisce gli incontri e spiega come riprendere', () => {
    useGameStore.setState((state) => ({
      giocatore1: { ...state.giocatore1, squadra: state.giocatore1.squadra.map((pokemon) => ({ ...pokemon, hp: 0 })) },
    }))
    useGameStore.getState().vaiAScena('percorso', { luogo: 'Percorso_1' })
    const markup = renderToStaticMarkup(<PercorsoScene />)
    expect(markup).toContain('La squadra è esausta.')
    const encounterButtons = [...markup.matchAll(/<button\b[^>]*aria-label="(?:Cespuglio|Sfida)[^"]*"[^>]*>/g)]
    expect(encounterButtons.length).toBeGreaterThan(7)
    expect(encounterButtons.every(([button]) => button.includes('disabled=""'))).toBe(true)
  })
})
