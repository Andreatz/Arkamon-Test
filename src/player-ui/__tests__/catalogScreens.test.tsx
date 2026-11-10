import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { initialGameSave } from '@/save/gamePersistence'
import type { GameState } from '@/store/gameStore'
import type { StatoBattaglia } from '@/types'
import { ArkadexScreen } from '../ArkadexScreen'
import { BagScreen } from '../BagScreen'
import { StoreScreen } from '../StoreScreen'

const runtime = vi.hoisted(() => ({ state: undefined as unknown }))
vi.mock('@/store/gameStore', () => ({
  useGameStore: (selector?: (state: GameState) => unknown) => selector ? selector(runtime.state as GameState) : runtime.state,
}))

function campaign(): GameState {
  const initial = initialGameSave()
  initial.giocatore1.nome = 'Giocatore Uno'
  initial.giocatore2.nome = 'Giocatore Due'
  initial.giocatore1.squadra = [{ istanzaId: 'one', specieId: 1, nome: 'Vyrath Uno', livello: 5, hp: 3, xp: 0, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }]
  initial.giocatore2.squadra = [{ istanzaId: 'two', specieId: 5, nome: 'Darklaw Due', livello: 5, hp: 8, xp: 0 }]
  initial.giocatore1.inventario = { 'paralysis-heal': 1 }
  initial.giocatore2.inventario = { masterball: 2 }
  initial.giocatore1.monete = 300
  initial.giocatore2.monete = 40
  initial.posizione1.luogo = initial.posizione2.luogo = 'Venezia'
  initial.scenaCorrente = { scena: 'citta', payload: { luogo: 'Venezia' } }
  return { ...initial, campaignRevision: 0, applicaOggetto: vi.fn(), acquistaOggetti: vi.fn() } as unknown as GameState
}

beforeEach(() => { runtime.state = campaign() })

describe('real catalog screen visibility and action boundaries', () => {
  it('limits the initial index to six species while retaining the complete catalog count and page boundaries', () => {
    const state = runtime.state as GameState
    const before = JSON.stringify(state)
    const markup = renderToStaticMarkup(<ArkadexScreen playerId={1} />)
    const listedIds = [...markup.matchAll(/aria-label="Numero (\d+):/g)].map((match) => Number(match[1]))
    expect(listedIds).toEqual([1, 2, 3, 4, 5, 6])
    expect(markup).toContain('110 schede corrispondenti.')
    expect(markup).toContain('Pagina 1 / 19')
    expect(markup).toContain('1–6 di 110')
    expect(markup).toMatch(/<button(?=[^>]*aria-label="Pagina precedente dell’Arkadex")(?=[^>]*disabled="")[^>]*>/)
    expect(markup).not.toMatch(/<button(?=[^>]*aria-label="Pagina successiva dell’Arkadex")(?=[^>]*disabled="")[^>]*>/)
    expect(JSON.stringify(state)).toBe(before)
  })

  it('opens only the information content so moves and evolution details are not stacked beneath the facts', () => {
    const markup = renderToStaticMarkup(<ArkadexScreen playerId={1} />)
    expect(markup).toContain('data-arkadex-detail="information"')
    expect(markup).toMatch(/<button(?=[^>]*aria-pressed="true")[^>]*>(?:(?!<\/button>).)*Informazioni<\/button>/)
    expect(markup).toContain('<dt>HP attuali</dt><dd>3</dd>')
    expect(markup).not.toContain('Mosse al livello')
    expect(markup).not.toContain('Linea evolutiva')
    expect(markup).not.toContain('class="pu-moves"')
  })

  it('keeps an empty campaign locked without creating a reference specimen or changing the active player', () => {
    const initial = initialGameSave()
    const state = { ...initial, campaignRevision: 0 } as unknown as GameState
    runtime.state = state
    const before = JSON.stringify(state)
    const markup = renderToStaticMarkup(<ArkadexScreen playerId={2} />)
    expect(markup).toContain('0 / 110 viste · 0 / 110 ottenute')
    expect(markup).toContain('aria-label="Scheda da scoprire"')
    expect(markup.match(/aria-label="Numero \d+: specie da scoprire · Da scoprire"/g)).toHaveLength(6)
    expect(markup).not.toContain('data-arkadex-detail=')
    expect(markup).not.toContain('Dati di riferimento al livello 5')
    expect(markup).not.toContain('class="pu-creature-art"')
    expect(markup).not.toContain('/ui/reference-png/portrait-')
    expect(state.giocatoreAttivo).toBe(1)
    expect(JSON.stringify(state)).toBe(before)
  })

  it('shows the settled battle HP and status of an owned specimen without changing the saved team', () => {
    const state = runtime.state as GameState
    const saved = state.giocatore1.squadra[0]
    const latest = { ...saved, hp: 1, stato: { tipo: 'Avvelenato' as const, turniRimanenti: -1 } }
    state.battaglia = { pokemonA: latest, pokemonB: state.giocatore2.squadra[0] } as StatoBattaglia
    const markup = renderToStaticMarkup(<ArkadexScreen playerId={1} />)
    expect(markup).toContain('<dt>HP attuali</dt><dd>1</dd>')
    expect(markup).toContain('Status: Avvelenato.')
    expect(state.giocatore1.squadra[0]).toBe(saved)
    expect(saved.hp).toBe(3)
    expect(saved.stato?.tipo).toBe('Paralizzato')
  })

  it('keeps each player’s discoveries private and never renders unknown species artwork or names', () => {
    const one = renderToStaticMarkup(<ArkadexScreen playerId={1} />)
    expect(one).toContain('Numero 1: Vyrath · Ottenuto')
    expect(one).toContain('Numero 5: specie da scoprire · Da scoprire')
    expect(one).not.toContain('Darklaw')
    expect(one).not.toContain('Voider')
    expect(one).not.toContain('/sprites/arkamon/2/')
    expect(one).not.toContain('/sprites/front_sprites/110.png')
    for (const id of [2, 3, 4, 5, 6, 110]) expect(one).not.toContain(`/ui/reference-png/portrait-${String(id).padStart(3, '0')}.webp`)
    expect(one).toContain('/ui/reference-png/portrait-001.webp')
    const two = renderToStaticMarkup(<ArkadexScreen playerId={2} />)
    expect(two).toContain('Numero 5: Darklaw · Ottenuto')
    expect(two).toContain('Numero 1: specie da scoprire · Da scoprire')
    expect(two).not.toContain('Vyrath')
    expect(two).not.toContain('/ui/reference-png/portrait-001.webp')
    expect(two).toContain('/ui/reference-png/portrait-005.webp')
  })

  it('shows only the selected player’s real items and keeps Masterball unavailable outside battle', () => {
    const state = runtime.state as GameState
    const one = renderToStaticMarkup(<BagScreen playerId={1} />)
    expect(one).toContain('Usa Antiparalisi')
    expect(one).not.toContain('Usa Masterball')
    const two = renderToStaticMarkup(<BagScreen playerId={2} />)
    expect(two).toMatch(/<button[^>]*disabled=""[^>]*>(?:<span\b[^>]*><\/span>)*Usa Masterball<\/button>/)
    expect(two).not.toContain('Usa Antiparalisi')
    expect(two).toContain('Puoi usare gli oggetti soltanto durante il turno di questo giocatore.')
    expect(state.applicaOggetto).not.toHaveBeenCalled()
    expect(state.giocatore1.inventario).toEqual({ 'paralysis-heal': 1 })
    expect(state.giocatore2.inventario).toEqual({ masterball: 2 })
  })

  it('starts a discovered final stage on information without requesting artwork for its unknown ancestors', () => {
    const state = runtime.state as GameState
    state.giocatore1.squadra = [{ istanzaId: 'final', specieId: 4, nome: 'Vyrath finale', livello: 100, hp: 1, xp: 0 }]
    const markup = renderToStaticMarkup(<ArkadexScreen playerId={1} />)
    expect(markup).toContain('Numero 4: Vyrath · Ottenuto')
    expect(markup).toContain('data-arkadex-detail="information"')
    expect(markup).not.toContain('Linea evolutiva')
    expect(markup).not.toContain('/sprites/front_sprites/1.png')
    expect(markup).not.toContain('/sprites/front_sprites/2.png')
    expect(markup).not.toContain('/sprites/front_sprites/3.png')
    for (const id of [1, 2, 3]) expect(markup).not.toContain(`/ui/reference-png/portrait-${String(id).padStart(3, '0')}.webp`)
    expect(markup).toContain('/ui/reference-png/portrait-004.webp')
  })

  it('does not turn viewing another city or player into permission to shop', () => {
    const state = runtime.state as GameState
    state.posizione1.luogo = 'Foggia'
    const one = renderToStaticMarkup(<StoreScreen playerId={1} />)
    expect(one).toContain('Raggiungi questa città per acquistare nel suo Arkastore.')
    expect(one).toMatch(/<input[^>]*disabled=""/)
    const two = renderToStaticMarkup(<StoreScreen playerId={2} />)
    expect(two).toContain('Saldo: 40 monete')
    expect(two).toContain('Il turno di questo giocatore è concluso.')
    expect(state.acquistaOggetti).not.toHaveBeenCalled()
    expect(state.giocatore1.monete).toBe(300)
    expect(state.giocatore2.monete).toBe(40)
  })
})
