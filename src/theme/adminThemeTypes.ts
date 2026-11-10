import type { UiDesignDocument } from '@/ui-studio/types'

export interface AdminThemeColors {
  primary: string
  primaryHover: string
  bg: string
  surface: string
  surfaceHover: string
  text: string
  textMuted: string
  border: string
  hpHigh: string
  hpMid: string
  hpLow: string
}

export interface AdminThemeUi {
  panelRadius: number
  buttonRadius: number
  panelOpacity: number
  shadowIntensity: number
  buttonScale: number
  stageScale: number
  fontScale: number
  mainMapRoadOpacity: number
}

export interface AdminThemeAssets {
  titleLogo?: string
  titleBackground?: string
  battleBackground?: string
  panelTexture?: string
}

export interface AdminLayoutRect {
  x: number
  y: number
  w: number
  h: number
  contentX?: number
  contentY?: number
  contentOffsets?: Record<string, AdminLayoutContentOffset>
}

export interface AdminLayoutContentOffset {
  x: number
  y: number
}

export interface AdminMapNodePosition {
  x: number
  y: number
}

export interface AdminMapRoadPoint {
  x: number
  y: number
}

export type AdminBattleLayoutKey =
  | 'enemySprite'
  | 'playerSprite'
  | 'enemyHp'
  | 'playerHp'
  | 'infoBox'
  | 'playerMoves'
  | 'enemyMoves'
  | 'playerSupreme'
  | 'enemySupreme'
  | 'turnStatus'
  | 'passTurnButton'
  | 'resultMoney'
  | 'continueButton'
  | 'enemySquad'
  | 'playerSquad'

export interface AdminBattleLayout {
  enemySprite: AdminLayoutRect
  playerSprite: AdminLayoutRect
  enemyHp: AdminLayoutRect
  playerHp: AdminLayoutRect
  infoBox: AdminLayoutRect
  playerMoves: AdminLayoutRect
  enemyMoves: AdminLayoutRect
  playerSupreme: AdminLayoutRect
  enemySupreme: AdminLayoutRect
  turnStatus: AdminLayoutRect
  passTurnButton: AdminLayoutRect
  resultMoney: AdminLayoutRect
  continueButton: AdminLayoutRect
  enemySquad: AdminLayoutRect
  playerSquad: AdminLayoutRect
}

export type AdminMapGridLayoutKey = 'hud' | 'grid' | 'bottomLog' | 'legend'
export type AdminLuogoLayoutKey =
  | 'backButton'
  | 'turnPanel'
  | 'coinsPanel'
  | 'title'
  | 'subtitle'
  | 'contentGrid'
export type AdminMainMapUiLayoutKey =
  | 'turnPanel'
  | 'coinsPanel'
  | 'positionPanel'
  | 'actionsPanel'
  | 'enterButton'
  | 'passButton'
  | 'depositButton'
  | 'titleButton'
  | 'legend'
  | 'footer'
export type AdminDepositLayoutKey = 'hud' | 'boxGrid' | 'teamPanel' | 'infoBar'
export type AdminEvolutionLayoutKey = 'counter' | 'sprite' | 'textPanel'

export type AdminSceneLayoutKey =
  | AdminMapGridLayoutKey
  | AdminLuogoLayoutKey
  | AdminMainMapUiLayoutKey
  | AdminDepositLayoutKey
  | AdminEvolutionLayoutKey

export type AdminMapGridLayout = Record<AdminMapGridLayoutKey, AdminLayoutRect>
export type AdminLuogoLayout = Record<AdminLuogoLayoutKey, AdminLayoutRect>
export type AdminMainMapUiLayout = Record<AdminMainMapUiLayoutKey, AdminLayoutRect>
export type AdminDepositLayout = Record<AdminDepositLayoutKey, AdminLayoutRect>
export type AdminEvolutionLayout = Record<AdminEvolutionLayoutKey, AdminLayoutRect>
export type AdminMainMapNodesLayout = Record<string, AdminMapNodePosition>
export type AdminMainMapRoadsLayout = Record<string, AdminMapRoadPoint[]>

export interface AdminThemeLayouts {
  battle: AdminBattleLayout
  mainMapNodes: AdminMainMapNodesLayout
  mainMapRoads: AdminMainMapRoadsLayout
  mainMapUi: AdminMainMapUiLayout
  mapGrid: AdminMapGridLayout
  luogo: AdminLuogoLayout
  deposit: AdminDepositLayout
  evolution: AdminEvolutionLayout
}

export interface AdminTheme {
  id: string
  name: string
  colors: AdminThemeColors
  ui: AdminThemeUi
  assets: AdminThemeAssets
  spriteScales: Record<string, number>
  layouts: AdminThemeLayouts
  /** Optional for compatibility with historical themes. Contains visual settings only. */
  design?: UiDesignDocument
}
