import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '@store/gameStore'
import type { PokemonIstanza, StatoBattaglia, StatoGiocatore } from '@/types'
import { emptyInteractionProgress } from '@/interactions/types'
import { TeamScreen, canManagePlayerTeam, liveOwnedPokemon } from './TeamScreen'
import { AnalysisScreen } from './AnalysisScreen'
import { DepositScreen } from './DepositScreen'
import { emptyLeagueState } from '@/league/leagueModel'

const fixture = vi.hoisted(() => ({ state: null as unknown as GameState }))
vi.mock('@store/gameStore', () => ({
  useGameStore: Object.assign((selector: (state: GameState) => unknown) => selector(fixture.state), {
    getState: () => fixture.state,
  }),
}))

const first: PokemonIstanza = { istanzaId: 'first-owner-instance', specieId: 5, nome: 'Ombra', livello: 8, hp: 3, xp: 2, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }
const reserve: PokemonIstanza = { istanzaId: 'reserve-owner-instance', specieId: 9, nome: 'Luna', livello: 7, hp: 0, xp: 0 }
const foreign: PokemonIstanza = { istanzaId: 'second-owner-instance', specieId: 1, nome: 'Neve', livello: 6, hp: 10, xp: 0 }
function player(id: 1 | 2, squadra: PokemonIstanza[], deposito: Record<string, PokemonIstanza>): StatoGiocatore {
  return { id, nome: id === 1 ? 'Arianna' : 'Bruno', squadra, deposito, monete: 0, inventario: {}, cespugliVisitati: new Set(), allenatoriSconfitti: new Set(), caselleConsumate: new Set() }
}
function battle(pokemonA = { ...first, hp: 1 }): StatoBattaglia {
  return { tipo: 'Selvatico', pokemonA, pokemonB: { ...foreign, istanzaId: 'wild-opponent' }, hpMaxA: 16, hpMaxB: 13, turnoCorrente: 'A', luogoRitorno: 'Torino', log: [], evoluzioneInAttesa: null }
}
beforeEach(() => {
  fixture.state = {
    giocatore1: player(1, [first], { '1:1': reserve }), giocatore2: player(2, [foreign], {}),
    battaglia: null, interactionProgress: emptyInteractionProgress(), giocatoreAttivo: 1,
    turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, scenaCorrente: { scena: 'mappa-principale' },
    challengeContext: null, teamRuleMessage: null, league: emptyLeagueState(),
  } as GameState
})

describe('Real player team tools', () => {
  it('keeps the selected player separate and displays residual HP/status without healing', () => {
    const markup = renderToStaticMarkup(<TeamScreen playerId={1} onAnalyse={() => {}} onBag={() => {}} onDeposit={() => {}} />)
    expect(markup).toContain('Ombra')
    expect(markup).toContain('Paralizzato')
    expect(markup).toContain('HP di Ombra: 3 su 16')
    expect(markup).not.toContain('Neve')
    expect(markup).not.toContain('Luna')
    expect(fixture.state.giocatore1.squadra[0]).toEqual(first)
  })

  it('renders all 35 box slots and six team destinations with unique semantic names', () => {
    const markup = renderToStaticMarkup(<DepositScreen playerId={1} />)
    const labels = [...markup.matchAll(/aria-label="((?:Box \d+|Squadra), posto \d+:[^"]+)"/g)].map(([, label]) => label)
    expect(labels).toHaveLength(41)
    expect(new Set(labels).size).toBe(41)
    expect(labels).toContain('Box 1, posto 1: Luna, livello 7')
    expect(labels).toContain('Box 1, posto 35: vuoto')
    expect(labels).toContain('Squadra, posto 6: vuoto')
    expect(markup).toContain('aria-label="Vai al box 30"')
    expect(markup).toContain('aria-label="Vai al box 2"')
    expect(markup).not.toContain('Neve')
  })

  it('renders a new empty team without selecting or inventing any creature', () => {
    fixture.state.giocatore1 = player(1, [], {})
    const markup = renderToStaticMarkup(<TeamScreen playerId={1} onAnalyse={() => {}} onBag={() => {}} onDeposit={() => {}} />)
    expect(markup).toContain('La tua squadra apparirà qui dopo la scelta dello starter.')
    expect(markup.match(/class="pu-team-slot"/g)).toHaveLength(6)
    expect(markup).not.toContain('Arkamon selezionato:')
    expect(markup).not.toContain('Ombra')
  })

  it('analyses an owned deposit instance while rejecting a foreign instance identifier', () => {
    const deposit = renderToStaticMarkup(<AnalysisScreen playerId={1} instanceId={reserve.istanzaId} />)
    expect(deposit).toContain('Arkamon selezionato: Luna')
    expect(deposit).toContain('Condizione</dt><dd>KO')
    expect(deposit).toContain('Box 1, posto 1')
    const unavailable = renderToStaticMarkup(<AnalysisScreen playerId={1} instanceId={foreign.istanzaId} />)
    expect(unavailable).toContain('Arkamon selezionato: Ombra')
    expect(unavailable).not.toContain('Neve')
  })

  it('uses the current battle HP for an owned creature without leaking opponents', () => {
    fixture.state.battaglia = battle()
    const markup = renderToStaticMarkup(<TeamScreen playerId={1} onAnalyse={() => {}} onBag={() => {}} onDeposit={() => {}} />)
    expect(markup).toContain('HP di Ombra: 1 su 16')
    expect(markup).not.toContain('Neve')
    expect(liveOwnedPokemon(reserve, fixture.state.battaglia)).toBe(reserve)
    expect(fixture.state.giocatore1.squadra[0].hp).toBe(3)
  })

  it('blocks mutation controls while battle, pending interaction, inactive turn, exhausted actions or setup screens apply', () => {
    const original = fixture.state
    const cases: GameState[] = [
      { ...original, battaglia: battle() },
      { ...original, challengeContext: {} as NonNullable<GameState['challengeContext']> },
      { ...original, interactionProgress: { ...original.interactionProgress, pendingBattle: { interactionId: 'pending', playerId: 1, title: 'Allenatore', mapId: 'Torino', nodeId: '1', scope: 'player', reward: { coins: 0, items: {} } } } },
      { ...original, giocatoreAttivo: 2 },
      { ...original, turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 2 } },
      { ...original, turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 0 } },
      ...(['titolo', 'laboratorio', 'evoluzione'] as const).map((scena) => ({ ...original, scenaCorrente: { scena } })),
    ]
    for (const state of cases) {
      fixture.state = state
      expect(canManagePlayerTeam(state, 1)).toBe(false)
      const markup = renderToStaticMarkup(<DepositScreen playerId={1} />)
      expect(markup).toContain('Consultazione: nessuno scambio')
      expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Sposta o scambia<\/button>/)
    }
    expect(canManagePlayerTeam(original, 1)).toBe(true)
    expect(canManagePlayerTeam(original, 2)).toBe(false)
  })

  it('keeps both players in consultation throughout a consecutive League run', () => {
    fixture.state.league = emptyLeagueState()
    fixture.state.league.players[1].status = 'running'
    expect(canManagePlayerTeam(fixture.state, 1)).toBe(false)
    expect(canManagePlayerTeam(fixture.state, 2)).toBe(false)
    const markup = renderToStaticMarkup(<DepositScreen playerId={1} />)
    expect(markup).toContain('concludi il tentativo della Lega prima di cambiare squadra')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Sposta o scambia<\/button>/)
  })
})
