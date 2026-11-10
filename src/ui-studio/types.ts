import { LOCAL_MAPS } from '@/data/localMaps'

/** Visual configuration only: never contains campaign state or executable actions. */
export interface UiRect { x: number; y: number; w: number; h: number }
export type UiFit = 'contain' | 'cover' | 'fill'
export interface UiTypography {
  family?: string
  size?: number
  weight?: number
  lineHeight?: number
  letterSpacing?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  transform?: 'none' | 'uppercase' | 'lowercase'
}
export interface UiElementDesign {
  rect?: UiRect
  asset?: string
  fit?: UiFit
  opacity?: number
  zIndex?: number
  hidden?: boolean
  locked?: boolean
  text?: string
  order?: number
  font?: UiTypography
}
export interface UiBackground {
  asset?: string
  fit?: UiFit
  opacity?: number
  color?: string
  x?: number
  y?: number
}
export interface UiExtraLayer extends UiElementDesign {
  id: string
  kind: 'image' | 'text' | 'panel' | 'button'
  label: string
  rect: UiRect
  actionTarget?: string
}
export interface UiScreenDesign {
  background?: UiBackground
  typography?: Partial<Record<'body' | 'heading' | 'button', UiTypography>>
  elements: Record<string, UiElementDesign>
  layers: UiExtraLayer[]
}
export interface UiMediaEntry {
  id: string
  name: string
  kind: 'image' | 'font'
  source: string
  mime?: string
}
export interface UiDesignDocument {
  version: 1
  typography: Record<'body' | 'heading' | 'button', UiTypography>
  screens: Record<string, UiScreenDesign>
  media: UiMediaEntry[]
}
export interface UiElementInfo {
  id: string
  label: string
  kind: 'image' | 'text' | 'button' | 'group'
  rect: UiRect
  text?: string
  asset?: string
  parentId?: string
  actionable?: boolean
  reorderable?: boolean
  reorderGroupId?: string
}
export interface UiScreenSnapshot {
  screenId: string
  label: string
  width: number
  height: number
  elements: UiElementInfo[]
}
export interface UiBuiltinAsset { id: string; name: string; source: string; category: string; kind: 'image' | 'font' }
export type UiStudioMessage =
  | { source: 'arkamon-ui-studio'; type: 'design'; design: UiDesignDocument }
  | { source: 'arkamon-ui-studio'; type: 'screen'; screen: string }
  | { source: 'arkamon-ui-studio'; type: 'select'; id: string | null }
  | { source: 'arkamon-ui-studio'; type: 'request-snapshot' }
export type UiPreviewMessage =
  | { source: 'arkamon-ui-preview'; type: 'ready' }
  | { source: 'arkamon-ui-preview'; type: 'snapshot'; snapshot: UiScreenSnapshot }
  | { source: 'arkamon-ui-preview'; type: 'select'; id: string }

export const UI_STUDIO_SCREENS = [
  ['titolo', 'Titolo'], ['laboratorio', 'Laboratorio'],
  ['mappa-principale', 'Mappa principale'], ['citta', 'Città · Venezia'],
  ['percorso', 'Percorso 1'], ['mappa-griglia', 'Mappa a griglia'],
  ['battaglia', 'Battaglia'], ['lega', 'Lega'], ['evoluzione', 'Evoluzione'],
  ['menu', 'Menù Partita'], ['squadra', 'Squadra'], ['deposito', 'Deposito'],
  ['arkadex', 'Arkadex'], ['analisi', 'Analisi'], ['borsa', 'Borsa'],
  ['negozio', 'Negozio · anteprima'], ['register', 'Registro'], ['race', 'Gara'], ['recap', 'Ripresa'], ['journal', 'Diario'], ['backup', 'Backup'],
  ['settings', 'Impostazioni'], ['chronicles', 'Cronache'], ['match', 'Registro del match'],
  ['challenges', 'Sfide'],
] as const

/** Named presentation states, never gameplay commands. Keys suffix the base screen ID. */
export const UI_STUDIO_SCREEN_VIEWS: Record<string, readonly (readonly [string, string])[]> = {
  analisi: [['default', 'Scheda'], ['mosse', 'Mosse'], ['status', 'Status e cure']],
  arkadex: [['default', 'Informazioni'], ['moves', 'Mosse'], ['evolution', 'Evoluzioni']],
  battaglia: [['default', 'Comandi della battaglia'], ['dice', 'Pannello lancio dadi'], ['bag', 'Borsa in battaglia']],
  citta: [['default', 'Layout comune · Venezia'], ...Object.keys(LOCAL_MAPS).filter(id => !id.startsWith('Percorso_')).map(id => [id, id] as const)],
  percorso: [['default', 'Layout comune · Percorso 1'], ...Object.keys(LOCAL_MAPS).filter(id => id.startsWith('Percorso_')).map(id => [id, id.replace('_', ' ')] as const)],
}
