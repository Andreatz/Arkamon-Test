import { describe, it, expect } from 'vitest'
import { initialGameSave } from '@/save/gamePersistence'
import { defaultAdminTheme } from '@/theme/defaultAdminTheme'
import { makePublicSnapshot } from './publicSnapshot'
import type { PublicBattlePresentation } from './publicPresentation'
import type { GameState } from '@/store/gameStore'

describe('public presentation whitelist', () => {
  it('publishes progress without inventories, reserves, configuration, hidden locations or credentials', () => {
    const game = initialGameSave() as GameState
    game.giocatore1.inventario.potion = 777
    game.giocatore1.deposito.secret = { istanzaId: 'hidden-instance', specieId: 110, nome: 'Unrevealed', hp: 10, livello: 20, xp: 0 }
    const theme = structuredClone(defaultAdminTheme)
    theme.layouts.mainMapNodes['Unrevealed place'] = { x: 5, y: 4 }
    theme.layouts.mainMapRoads['Roma__Unrevealed place'] = [{ x: 8, y: 9 }]
    const snapshot = makePublicSnapshot(game, theme, null, false, 123)
    const serialized = JSON.stringify(snapshot)
    expect(snapshot.at).toBe(123)
    expect(snapshot.players).toHaveLength(2)
    expect(snapshot.nodes.Venezia).toEqual(theme.layouts.mainMapNodes.Venezia)
    for (const privateValue of ['Unrevealed', 'hidden-instance', 'inventario', 'deposto', 'potion', 'token', 'session', 'league.config']) expect(serialized).not.toContain(privateValue)
  })
  it('copies only displayed combatants and hides stale battle presentation outside battle', () => {
    const game = initialGameSave() as GameState
    game.scenaCorrente = { scena: 'battaglia' }
    const active = { istanzaId: 'private-instance', specieId: 1, nome: 'Vyrath', livello: 5, hp: 7, xp: 0 }
    const battle = { pokemonA: active, pokemonB: { ...active, specieId: 9 }, hpMaxA: 12, hpMaxB: 12,
      layout: defaultAdminTheme.layouts.battle, background: '/battle.jpg', animationA: 'idle', animationB: 'idle', replayA: 0, replayB: 0,
      status: 'Turno di Melia', messages: ['Attacco rivelato'], dice: null, effect: null, guestToken: 'PRIVATE-CAPABILITY' } as PublicBattlePresentation
    const snapshot = makePublicSnapshot(game, defaultAdminTheme, battle, true)
    expect(snapshot.battle?.pokemonA).toEqual({ specieId: 1, nome: 'Vyrath', livello: 5, hp: 7 })
    expect(JSON.stringify(snapshot)).not.toMatch(/private-instance|PRIVATE-CAPABILITY|guestToken|"xp"/)
    expect(snapshot.battle?.messages).not.toBe(battle.messages)
    expect(snapshot.battle?.appearance?.hpColors.hpHigh).toBe(defaultAdminTheme.colors.hpHigh)
    expect(snapshot.paused).toBe(true)
    game.scenaCorrente = { scena: 'mappa-principale' }
    expect(makePublicSnapshot(game, defaultAdminTheme, battle, false).battle).toBeNull()
  })
})
