import { describe, expect, it } from 'vitest'
import { initialGameSave } from '@/save/gamePersistence'
import type { GameState } from '@/store/gameStore'
import { buildPublicManagement } from './managementPresentation'
import { makePublicSnapshot } from './publicSnapshot'
import { defaultAdminTheme } from '@/theme/defaultAdminTheme'

function campaign() {
  const game = initialGameSave() as GameState
  game.giocatore1.squadra = [{ istanzaId: 'private-identity', specieId: 1, nome: 'Visible companion', livello: 20, hp: 23, xp: 0 }]
  game.giocatore1.deposito['1:5'] = { istanzaId: 'unrevealed-identity', specieId: 110, nome: 'Secret reserve', livello: 20, hp: 30, xp: 0 }
  game.giocatore1.inventario.potion = 777
  game.scenaCorrente = { scena: 'mappa-principale' }
  return game
}
describe('explicit management reveal', () => {
  it('is private by default and copies only the explicitly selected detail', () => {
    const game = campaign()
    expect(makePublicSnapshot(game, defaultAdminTheme, null, false).management).toBeNull()
    const snapshot = makePublicSnapshot(game, defaultAdminTheme, null, false, 0, { screen: 'squadra', playerId: 1, instanceId: 'private-identity' })
    expect(snapshot.management?.creature?.name).toBe('Visible companion')
    for (const value of ['Secret reserve', 'unrevealed-identity', 'private-identity', 'inventario', '"xp"', '777']) expect(JSON.stringify(snapshot.management)).not.toContain(value)
  })
  it('does not expose an unknown species, another player specimen or stale selection', () => {
    const game = campaign()
    expect(buildPublicManagement(game, { screen: 'arkadex', playerId: 1, speciesId: 100 })).toBeNull()
    expect(buildPublicManagement(game, { screen: 'analisi', playerId: 2, instanceId: 'private-identity' })).toBeNull()
    expect(buildPublicManagement(game, { screen: 'deposito', playerId: 1, instanceId: 'removed' })).toBeNull()
    expect(buildPublicManagement(game, { screen: 'arkadex', playerId: 1, speciesId: 1 })?.creature?.speciesId).toBe(1)
  })
  it('publishes an item description without disclosing inventory or hidden targets', () => {
    const view = buildPublicManagement(campaign(), { screen: 'borsa', playerId: 1, itemId: 'potion' })
    expect(view?.item?.name).toBe('Pozione')
    expect(view?.item).not.toHaveProperty('quantity')
    expect(view?.item).not.toHaveProperty('price')
    expect(buildPublicManagement(campaign(), { screen: 'negozio', playerId: 1, itemId: 'potion' })?.item?.price).toBe(100)
  })
  it('uses the live battle instance without sending the battle roster', () => {
    const game = campaign()
    game.battaglia = { pokemonA: { ...game.giocatore1.squadra[0], hp: 9 } } as GameState['battaglia']
    const view = buildPublicManagement(game, { screen: 'analisi', playerId: 1, instanceId: 'private-identity' })
    expect(view?.creature?.hp).toBe(9)
  })
})
