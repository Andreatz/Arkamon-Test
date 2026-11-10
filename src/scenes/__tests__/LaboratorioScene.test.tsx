import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LaboratorioScene } from '@scenes/LaboratorioScene'
import { TitoloScene } from '@scenes/TitoloScene'
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

function starterButtons(markup: string): string[] {
  return [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)].map(([button]) => button)
}

function restoreBoxedStarter(playerId: 1 | 2) {
  useGameStore.setState(state => {
    const key = playerId === 1 ? 'giocatore1' : 'giocatore2', player = state[key]
    return { [key]: { ...player, squadra: [], deposito: { '1:1': player.squadra[0] } } }
  })
}

describe('laboratorio al rientro', () => {
  beforeEach(() => useGameStore.getState().reset())

  it('ricostruisce gli starter disponibili dal salvataggio del primo giocatore', () => {
    useGameStore.getState().scegliStarter(1)
    const buttons = starterButtons(renderToStaticMarkup(<LaboratorioScene />))
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toContain('disabled=""')
    expect(buttons[1]).not.toContain('disabled=""')
    expect(buttons[2]).not.toContain('disabled=""')
  })

  it('disabilita ogni starter durante l’attesa prima della mappa', () => {
    useGameStore.getState().scegliStarter(1)
    useGameStore.getState().scegliStarter(5)
    const buttons = starterButtons(renderToStaticMarkup(<LaboratorioScene />))
    expect(buttons).toHaveLength(3)
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true)
  })

  it('mostra Continua anche con una scelta parziale salvata', () => {
    useGameStore.getState().scegliStarter(1)
    expect(renderToStaticMarkup(<TitoloScene />)).toContain('Continua')
  })

  it.each([{ players: [1] }, { players: [2] }, { players: [1, 2] }] as const)('mantiene Continua e blocca ogni nuova scelta con gli starter di $players in deposito', ({ players }) => {
    useGameStore.getState().scegliStarter(1)
    useGameStore.getState().scegliStarter(5)
    for (const playerId of players) restoreBoxedStarter(playerId)
    expect(renderToStaticMarkup(<TitoloScene />)).toContain('Continua')
    const buttons = starterButtons(renderToStaticMarkup(<LaboratorioScene />))
    expect(buttons).toHaveLength(3)
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true)
  })

  it('riconosce una scelta parziale in deposito e conserva il giocatore che deve scegliere', () => {
    useGameStore.getState().scegliStarter(1)
    restoreBoxedStarter(1)
    const markup = renderToStaticMarkup(<LaboratorioScene />)
    const buttons = starterButtons(markup)
    expect(buttons[0]).toContain('disabled=""')
    expect(buttons[1]).not.toContain('disabled=""')
    expect(buttons[2]).not.toContain('disabled=""')
    expect(markup).toContain('Giocatore 2')
    expect(renderToStaticMarkup(<TitoloScene />)).toContain('Continua')
  })
})
