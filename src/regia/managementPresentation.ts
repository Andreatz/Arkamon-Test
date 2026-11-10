import { ALLENATORI, getPokemon, getMossa } from '@/data'
import { calcolaHPMax, getMossaAlLivello, èMossaCura, èMossaSoloStato } from '@/engine/battleEngine'
import { getShopItem, isShopItemId } from '@/shop/catalog'
import { deriveArkadexProgress } from '@/arkadex/arkadexModel'
import { liveOwnedPokemon } from '@/player-ui/currentRoster'
import type { GameState } from '@/store/gameStore'

export const PRESENTABLE_SCREENS = ['partita', 'squadra', 'deposito', 'arkadex', 'analisi', 'borsa', 'negozio'] as const
export type PresentableScreen = typeof PRESENTABLE_SCREENS[number]
/** Private selection identifiers stay in the console and never enter the snapshot. */
export interface ManagementRequest {
  screen: PresentableScreen
  playerId: 1 | 2
  instanceId?: string
  speciesId?: number
  itemId?: string
}
export interface PublicManagement {
  title: string
  playerName: string
  playerId: 1 | 2
  place: string
  creature?: { speciesId: number; name: string; level?: number; hp?: number; maximum?: number; type: string; condition?: string; moves: { name: string; type: string; effect: string }[] }
  item?: { id: string; name: string; description: string; price?: number }
  progress?: { badges: number; leagueWins: number; leagueTotal: number }
}
const titles: Record<PresentableScreen, string> = { partita: 'Carta allenatore', squadra: 'Compagno di viaggio', deposito: 'Compagno selezionato', arkadex: 'Arkadex', analisi: 'Analisi Arkamon', borsa: 'Borsa · oggetto selezionato', negozio: 'Arkastore · articolo selezionato' }

/** Builds a new explicit whitelist. No roster, inventory counts, IDs, XP or credentials. */
export function buildPublicManagement(game: GameState, request: ManagementRequest | null): PublicManagement | null {
  if (!request || !PRESENTABLE_SCREENS.includes(request.screen) || game.challengeContext) return null
  const player = game[request.playerId === 1 ? 'giocatore1' : 'giocatore2']
  if (!player) return null
  const position = game[request.playerId === 1 ? 'posizione1' : 'posizione2']
  const result: PublicManagement = { title: titles[request.screen], playerId: request.playerId, playerName: player.nome || `Giocatore ${request.playerId}`, place: (position.luogo ?? position.mappaId).replace(/_/g, ' ') }
  if (request.screen === 'partita') {
    result.progress = { badges: ALLENATORI.filter(a => a.tipo === 'Capopalestra' && player.allenatoriSconfitti.has(a.id)).length,
      leagueWins: game.league.players[request.playerId].completedStages.length, leagueTotal: game.league.config?.championEnabled ? 5 : 4 }
    return result
  }
  if (request.screen === 'borsa' || request.screen === 'negozio') {
    if (!request.itemId || !isShopItemId(request.itemId)) return null
    const item = getShopItem(request.itemId)
    if (!item) return null
    result.item = { id: item.id, name: item.name, description: item.description, ...(request.screen === 'negozio' ? { price: item.price } : {}) }
    return result
  }
  const owned = [...player.squadra, ...Object.values(player.deposito)].find(p => p.istanzaId === request.instanceId)
  const specimen = owned ? liveOwnedPokemon(owned, game.battaglia) : undefined
  const speciesId = request.screen === 'arkadex' ? request.speciesId : specimen?.specieId
  if (speciesId === undefined) return null
  if (request.screen === 'arkadex') {
    const progress = deriveArkadexProgress(game.arkadex, game)
    if (!progress[request.playerId === 1 ? 'seen1' : 'seen2'].includes(speciesId)) return null
  }
  const species = getPokemon(speciesId)
  if (!species) return null
  result.creature = { speciesId: species.id, name: request.screen === 'arkadex' ? species.nome : specimen!.nome, type: species.tipo,
    ...(request.screen !== 'arkadex' && specimen ? { level: specimen.livello, hp: specimen.hp, maximum: calcolaHPMax(specimen), condition: specimen.hp <= 0 ? 'KO' : specimen.stato?.tipo ?? 'Nessuno status attivo' } : {}),
    moves: species.mosse.flatMap(id => {
      const move = getMossa(id)
      if (!move) return []
      const dice = getMossaAlLivello(move, specimen?.livello ?? 1)
      return [{ name: move.nome, type: move.tipo, effect: èMossaCura(move) ? `Cura ${move.valoreEffetto ?? 0}${move.effetto === 'CURA_PCT' ? '%' : ' HP'}`
        : èMossaSoloStato(move) ? 'Stato alterato' : request.screen === 'arkadex' ? 'Mossa offensiva' : `${dice.dadi} D6 ${dice.incremento >= 0 ? '+' : ''}${dice.incremento}` }]
    }) }
  return result
}
