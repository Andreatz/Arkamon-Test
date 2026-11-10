import { ALLENATORI } from '@/data'
import type { GameState } from '@/store/gameStore'
import type { AdminTheme } from '@/theme/adminThemeTypes'
import type { PublicBattlePresentation } from './publicPresentation'
import { MAIN_MAP_ROAD_CONNECTIONS } from '@/data/mainMapRoads'
import { resolvedScreenDesign } from '@/ui-studio/runtimeDesign'
import type { UiElementDesign } from '@/ui-studio/types'
import { buildPublicManagement, type ManagementRequest, type PublicManagement } from './managementPresentation'
import { normalizeMotionPlayback, type MotionPlayback } from '@/settings/motionPlayback'

export const PUBLIC_CHANNEL = 'arkamon-public-presentation-v1'
const publicWorldNodes = new Set(MAIN_MAP_ROAD_CONNECTIONS.flat())
const publicWorldRoads = new Set(MAIN_MAP_ROAD_CONNECTIONS.map(([from, to]) => `${from}__${to}`))
export interface PublicSnapshot {
  version: 1; at: number; scene: string; place: string; active: 1 | 2; actions: number; paused: boolean
  players: { id: 1 | 2; name: string; place: string; node?: string; badges: number; leagueWins: number }[]
  battle: PublicBattlePresentation | null
  nodes: AdminTheme['layouts']['mainMapNodes']; roads: AdminTheme['layouts']['mainMapRoads']
  winner: string | null
  leagueTotal: number
  management?: PublicManagement | null
  motion?: MotionPlayback
}
const publicCreature = ({ specieId, nome, livello, hp, stato }: PublicBattlePresentation['pokemonA']) => ({ specieId, nome, livello, hp, ...(stato ? { stato: { ...stato } } : {}) })
function visibleBattle(battle: PublicBattlePresentation | null, theme: AdminTheme): PublicBattlePresentation | null {
  if (!battle) return null
  const design = theme.design && resolvedScreenDesign(theme.design, battle.dice ? 'battaglia:dice' : 'battaglia')
  const skin = (element?: UiElementDesign) => element?.asset ? { source: element.asset, fit: element.fit ?? 'contain' as const } : undefined
  // Copy an explicit presentation whitelist even if the caller passes a richer runtime object.
  return { pokemonA: publicCreature(battle.pokemonA), pokemonB: publicCreature(battle.pokemonB),
    hpMaxA: battle.hpMaxA, hpMaxB: battle.hpMaxB, background: battle.background, layout: battle.layout,
    animationA: battle.animationA, animationB: battle.animationB, replayA: battle.replayA, replayB: battle.replayB,
    status: battle.status, messages: [...battle.messages], dice: battle.dice, effect: battle.effect,
    appearance: { enemyFrame: skin(design?.elements['layout.hp-nemico']), playerFrame: skin(design?.elements['layout.hp-giocatore']),
      background: design?.background?.asset, hpColors: { hpHigh: theme.colors.hpHigh, hpMid: theme.colors.hpMid, hpLow: theme.colors.hpLow } } }
}
/** Only public progress is copied: no bags, unrevealed roster, authoring text, saves or credentials. */
export function makePublicSnapshot(game: GameState, theme: AdminTheme, battle: PublicBattlePresentation | null, paused: boolean, at = Date.now(), management: ManagementRequest | null = null, motion?: MotionPlayback): PublicSnapshot {
  const place = String(game.scenaCorrente.payload?.luogo ?? game[game.giocatoreAttivo === 1 ? 'posizione1' : 'posizione2'].luogo ?? '')
  return { version: 1, at, scene: game.scenaCorrente.scena, place, active: game.giocatoreAttivo,
    actions: game.turnoOverworld.azioniRimaste, paused, motion: normalizeMotionPlayback(motion),
    players: ([1, 2] as const).map(id => {
      const player = game[id === 1 ? 'giocatore1' : 'giocatore2']
      const world = game[id === 1 ? 'posizione1' : 'posizione2']
      const location = world.luogo ?? ''
      return { id, name: player.nome || `Giocatore ${id}`, place: location,
        node: game[id === 1 ? 'posizioniLocali1' : 'posizioniLocali2'][location],
        badges: ALLENATORI.filter(gym => gym.tipo === 'Capopalestra' && player.allenatoriSconfitti.has(gym.id)).length,
        leagueWins: game.league.players[id].completedStages.length }
    }),
    battle: game.scenaCorrente.scena === 'battaglia' ? visibleBattle(battle, theme) : null,
    nodes: Object.fromEntries(Object.entries(theme.layouts.mainMapNodes).filter(([id]) => publicWorldNodes.has(id))),
    roads: Object.fromEntries(Object.entries(theme.layouts.mainMapRoads).filter(([id]) => publicWorldRoads.has(id))),
    winner: game.league.winner?.name ?? null,
    leagueTotal: game.league.config?.championEnabled ? 5 : 4,
    management: buildPublicManagement(game, management),
  }
}
