import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialGameSave } from '@/save/gamePersistence'
import { ALLENATORI } from '@/data'
import type { GameState } from '@/store/gameStore'
import { MenuScreen } from '../MenuScreen'
import { PlayerUi } from '../PlayerUi'
import { AnalysisScreen } from '../AnalysisScreen'
import { DepositScreen } from '../DepositScreen'
import { PLAYER_UI_SCREENS, isPlayerUiScreen } from '../navigation'

const runtime = vi.hoisted(() => ({ state: undefined as unknown as GameState }))
vi.mock('@/store/gameStore', () => ({
  useGameStore: Object.assign((selector?: (state: GameState) => unknown) => selector ? selector(runtime.state) : runtime.state,
    { getState: () => runtime.state }),
}))

beforeEach(() => {
  const state = initialGameSave()
  state.giocatore1.nome = 'Arianna'
  state.giocatore1.squadra = [{ istanzaId: 'menu-specimen', specieId: 1, nome: 'Vyrath', livello: 10, hp: 3, xp: 3 }]
  state.giocatore1.deposito = { '1:1': { istanzaId: 'reserve-specimen', specieId: 9, nome: 'Felyss', livello: 7, hp: 2, xp: 4 } }
  state.scenaCorrente = { scena: 'citta', payload: { luogo: 'Venezia' } }
  runtime.state = { ...state, campaignRevision: 0 } as unknown as GameState
})

describe('player menu navigation and progression facts', () => {
  it('shows the earned Venice water medal and never counts an ordinary trainer as a gym victory', () => {
    const veniceGym = ALLENATORI.find(trainer => trainer.tipo === 'Capopalestra' && trainer.luogo === 'Venezia')!
    const ordinaryTrainer = ALLENATORI.find(trainer => trainer.tipo === 'NPC')!
    runtime.state.giocatore1.allenatoriSconfitti = new Set([ordinaryTrainer.id])
    const ordinaryVictory = renderToStaticMarkup(<MenuScreen playerId={1} onAuxiliary={vi.fn()} />)
    expect(ordinaryVictory).toContain('aria-label="0 medaglie su 8"')
    expect(ordinaryVictory).not.toContain('data-earned="true"')

    runtime.state.giocatore1.allenatoriSconfitti.add(veniceGym.id)
    const before = structuredClone(runtime.state.giocatore1)
    const markup = renderToStaticMarkup(<MenuScreen playerId={1} onAuxiliary={vi.fn()} />)
    expect(markup).toContain('aria-label="1 medaglie su 8"')
    expect(markup.match(/data-earned="true"/g)).toHaveLength(1)
    expect(markup).toMatch(/<span(?=[^>]*data-earned="true")(?=[^>]*title="Venezia: ottenuta")[^>]*><img(?=[^>]*data-provided-asset="medal-water")(?=[^>]*src="[^"]*\/ui\/reference-png\/medal-water\.webp")[^>]*>/)
    expect(runtime.state.giocatore1).toEqual(before)
  })

  it('offers the reference destinations and match utilities without adding a free shop', () => {
    const onAuxiliary = vi.fn()
    const before = structuredClone(runtime.state.giocatore1)
    const markup = renderToStaticMarkup(<MenuScreen playerId={1} onAuxiliary={onAuxiliary} />)
    expect([...markup.matchAll(/aria-label="Apri ([^"]+)"/g)].map(([, name]) => name)).toEqual([
      'Gara', 'Ripresa', 'Sfide', 'Squadra', 'Arkadex', 'Borsa', 'Deposito', 'Mappa', 'Diario', 'Registro', 'Salvataggio', 'Impostazioni',
    ])
    expect(markup.match(/aria-label="Apri Squadra"/g)).toHaveLength(1)
    expect(markup).not.toContain('Apri Negozio')
    expect(markup).not.toContain('pu-journey-actions')
    expect(onAuxiliary).not.toHaveBeenCalled()
    expect(runtime.state.giocatore1).toEqual(before)
  })

  it('keeps the shop outside navigation and exposes exactly one journey resume command', () => {
    expect(PLAYER_UI_SCREENS).toEqual(['partita', 'squadra', 'deposito', 'arkadex', 'analisi', 'borsa'])
    expect(isPlayerUiScreen('negozio')).toBe(true)
    const markup = renderToStaticMarkup(<PlayerUi onClose={vi.fn()} />)
    expect(markup.match(/Riprendi il Viaggio/g)).toHaveLength(1)
    expect(markup).not.toContain('pu-aux-nav')
    expect(markup).not.toContain('Esc · Chiudi')
    expect(markup).not.toContain('>Negozio<')
    expect(markup.match(/class="pu-button[^\"]*pu-nav-button/g)).toHaveLength(6)
  })

  it('does not open a shop from an initial screen lacking a point interaction', () => {
    const markup = renderToStaticMarkup(<PlayerUi initialScreen="negozio" initialPlayerId={1} onClose={vi.fn()} />)
    expect(markup).toContain('data-player-ui-screen="partita"')
    expect(markup).not.toContain('data-player-ui-screen="negozio"')
  })

  it('shows levels and growth in reserve and analysis without a saved or banked XP counter', () => {
    const before = structuredClone(runtime.state.giocatore1)
    const deposit = renderToStaticMarkup(<DepositScreen playerId={1} />)
    const analysis = renderToStaticMarkup(<AnalysisScreen playerId={1} />)
    for (const markup of [deposit, analysis]) {
      expect(markup).toContain('Livello')
      expect(markup).toContain('Crescita')
      expect(markup).not.toMatch(/\bXP\b|Esperienza|exp|Prossimo livello/)
    }
    expect(runtime.state.giocatore1).toEqual(before)
  })
})
