import { normalizeDesign } from '@/ui-studio/designModel'
import { isSafeThemeAssetPath } from './adminThemeAssetPaths'
import { ADMIN_THEME_UI_BOUNDS, isValidThemeUiValue } from '@/theme/adminThemeUiBounds'
import type {
  AdminTheme,
  AdminThemeAssets,
  AdminThemeLayouts,
  AdminLayoutRect,
  AdminMainMapNodesLayout,
  AdminMainMapRoadsLayout,
  AdminThemeColors,
  AdminThemeUi,
} from '@/theme/adminThemeTypes'
import {
  defaultAdminTheme,
  defaultBattleLayout,
  defaultDepositLayout,
  defaultEvolutionLayout,
  defaultMainMapNodePositions,
  defaultMainMapRoads,
  defaultMainMapUiLayout,
  defaultMapGridLayout,
  defaultLuogoLayout,
} from '@/theme/defaultAdminTheme'

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const colorKeys: (keyof AdminThemeColors)[] = [
  'primary',
  'primaryHover',
  'bg',
  'surface',
  'surfaceHover',
  'text',
  'textMuted',
  'border',
  'hpHigh',
  'hpMid',
  'hpLow',
]

const uiKeys: (keyof AdminThemeUi)[] = [
  'panelRadius',
  'buttonRadius',
  'panelOpacity',
  'shadowIntensity',
  'buttonScale',
  'stageScale',
  'fontScale',
  'mainMapRoadOpacity',
]

const assetKeys: (keyof AdminThemeAssets)[] = [
  'titleLogo',
  'titleBackground',
  'battleBackground',
  'panelTexture',
]

const battleLayoutKeys = Object.keys(defaultBattleLayout) as (keyof typeof defaultBattleLayout)[]
const mainMapUiLayoutKeys = Object.keys(defaultMainMapUiLayout) as (keyof typeof defaultMainMapUiLayout)[]
const mapGridLayoutKeys = Object.keys(defaultMapGridLayout) as (keyof typeof defaultMapGridLayout)[]
const luogoLayoutKeys = Object.keys(defaultLuogoLayout) as (keyof typeof defaultLuogoLayout)[]
const depositLayoutKeys = Object.keys(defaultDepositLayout) as (keyof typeof defaultDepositLayout)[]
const evolutionLayoutKeys = Object.keys(defaultEvolutionLayout) as (keyof typeof defaultEvolutionLayout)[]

function parseLayoutRects(
  source: unknown,
  defaults: Record<string, AdminLayoutRect>,
  keys: string[],
  label: string
): { layout: Record<string, AdminLayoutRect>; error: null } | { layout: null; error: string } {
  const layout = { ...defaults }
  if (source === undefined) return { layout, error: null }
  if (!isRecord(source)) {
    return { layout: null, error: `Il layout ${label} deve essere un oggetto.` }
  }

  for (const key of keys) {
    const rect = source[key]
    if (rect === undefined) continue
    if (!isRecord(rect)) {
      return { layout: null, error: `Rettangolo layout non valido: ${key}.` }
    }

    const { x, y, w, h, contentX, contentY, contentOffsets } = rect
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof w !== 'number' ||
      typeof h !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return { layout: null, error: `Coordinate layout non valide: ${key}.` }
    }

    if (
      (contentX !== undefined && (typeof contentX !== 'number' || !Number.isFinite(contentX))) ||
      (contentY !== undefined && (typeof contentY !== 'number' || !Number.isFinite(contentY)))
    ) {
      return { layout: null, error: `Offset contenuto non valido: ${key}.` }
    }

    if (contentOffsets !== undefined && !isRecord(contentOffsets)) {
      return { layout: null, error: `Offset testi non validi: ${key}.` }
    }

    const parsedContentOffsets: NonNullable<AdminLayoutRect['contentOffsets']> = {}
    for (const [textKey, offset] of Object.entries(contentOffsets ?? {})) {
      if (
        !isRecord(offset) ||
        typeof offset.x !== 'number' ||
        typeof offset.y !== 'number' ||
        !Number.isFinite(offset.x) ||
        !Number.isFinite(offset.y)
      ) {
        return { layout: null, error: `Offset testo non valido: ${key}.${textKey}.` }
      }
      parsedContentOffsets[textKey] = { x: offset.x, y: offset.y }
    }

    layout[key] = {
      x,
      y,
      w,
      h,
      ...(contentX !== undefined ? { contentX } : {}),
      ...(contentY !== undefined ? { contentY } : {}),
      ...(Object.keys(parsedContentOffsets).length > 0
        ? { contentOffsets: parsedContentOffsets }
        : {}),
    }
  }

  return { layout, error: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseThemeJson(value: string): { theme: AdminTheme; error: null } | { theme: null; error: string } {
  let parsed: unknown

  try {
    parsed = JSON.parse(value)
  } catch {
    return { theme: null, error: 'JSON non valido.' }
  }

  if (!isRecord(parsed)) {
    return { theme: null, error: 'Il contenuto deve essere un oggetto tema.' }
  }

  if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string') {
    return { theme: null, error: 'Il tema deve contenere id e name testuali.' }
  }

  if (!isRecord(parsed.colors) || !isRecord(parsed.ui)) {
    return { theme: null, error: 'Il tema deve contenere colors e ui.' }
  }

  const colors: Partial<AdminThemeColors> = {}
  for (const key of colorKeys) {
    const color = parsed.colors[key]
    if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) {
      return { theme: null, error: `Colore non valido: ${key}.` }
    }
    colors[key] = color
  }

  const ui: Partial<AdminThemeUi> = {}
  for (const key of uiKeys) {
    const valueForKey = parsed.ui[key]
    if (valueForKey === undefined) {
      ui[key] = defaultAdminTheme.ui[key]
      continue
    }
    if (!isValidThemeUiValue(key, valueForKey)) {
      const { min, max } = ADMIN_THEME_UI_BOUNDS[key]
      return { theme: null, error: `Valore UI non valido: ${key}. Deve essere compreso fra ${min} e ${max}.` }
    }
    ui[key] = valueForKey
  }

  const assets: AdminThemeAssets = {}
  if (parsed.assets !== undefined) {
    if (!isRecord(parsed.assets)) {
      return { theme: null, error: 'Il campo assets deve essere un oggetto.' }
    }

    for (const key of assetKeys) {
      const asset = parsed.assets[key]
      if (asset === undefined) continue
      if (!isSafeThemeAssetPath(asset)) {
        return { theme: null, error: `Asset non valido: ${key}.` }
      }
      assets[key] = asset
    }
  }

  const spriteScales: Record<string, number> = {}
  if (parsed.spriteScales !== undefined) {
    if (!isRecord(parsed.spriteScales)) {
      return { theme: null, error: 'Il campo spriteScales deve essere un oggetto.' }
    }

    for (const [speciesId, scale] of Object.entries(parsed.spriteScales)) {
      if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
        return { theme: null, error: `Scala sprite non valida: ${speciesId}.` }
      }
      spriteScales[speciesId] = scale
    }
  }

  const layouts: AdminThemeLayouts = {
    battle: defaultBattleLayout,
    mainMapNodes: defaultMainMapNodePositions,
    mainMapRoads: defaultMainMapRoads,
    mainMapUi: defaultMainMapUiLayout,
    mapGrid: defaultMapGridLayout,
    luogo: defaultLuogoLayout,
    deposit: defaultDepositLayout,
    evolution: defaultEvolutionLayout,
  }

  if (parsed.layouts !== undefined) {
    if (!isRecord(parsed.layouts)) {
      return { theme: null, error: 'Il campo layouts deve essere un oggetto.' }
    }
    const battle = parseLayoutRects(
      parsed.layouts.battle,
      defaultBattleLayout,
      battleLayoutKeys,
      'battaglia'
    )
    if (battle.layout === null) return { theme: null, error: battle.error }
    layouts.battle = battle.layout as unknown as AdminThemeLayouts['battle']

    const mainMapNodes: AdminMainMapNodesLayout = { ...defaultMainMapNodePositions }
    if (parsed.layouts.mainMapNodes !== undefined) {
      if (!isRecord(parsed.layouts.mainMapNodes)) {
        return { theme: null, error: 'Il layout nodi mappa deve essere un oggetto.' }
      }

      for (const [name, position] of Object.entries(parsed.layouts.mainMapNodes)) {
        if (!isRecord(position)) {
          return { theme: null, error: `Nodo mappa non valido: ${name}.` }
        }

        const { x, y } = position
        if (
          typeof x !== 'number' ||
          typeof y !== 'number' ||
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        ) {
          return { theme: null, error: `Coordinate nodo non valide: ${name}.` }
        }

        mainMapNodes[name] = { x, y }
      }
    }
    layouts.mainMapNodes = mainMapNodes

    const mainMapRoads: AdminMainMapRoadsLayout = {}
    if (parsed.layouts.mainMapRoads !== undefined) {
      if (!isRecord(parsed.layouts.mainMapRoads)) {
        return { theme: null, error: 'Il layout strade mappa deve essere un oggetto.' }
      }

      for (const [roadKey, points] of Object.entries(parsed.layouts.mainMapRoads)) {
        if (!Array.isArray(points)) {
          return { theme: null, error: `Strada mappa non valida: ${roadKey}.` }
        }

        mainMapRoads[roadKey] = []
        for (const [index, point] of points.entries()) {
          if (!isRecord(point)) {
            return { theme: null, error: `Punto strada non valido: ${roadKey} #${index}.` }
          }

          const { x, y } = point
          if (
            typeof x !== 'number' ||
            typeof y !== 'number' ||
            !Number.isFinite(x) ||
            !Number.isFinite(y)
          ) {
            return { theme: null, error: `Coordinate strada non valide: ${roadKey} #${index}.` }
          }

          mainMapRoads[roadKey].push({ x, y })
        }
      }
    }
    layouts.mainMapRoads = mainMapRoads

    const mainMapUi = parseLayoutRects(
      parsed.layouts.mainMapUi,
      defaultMainMapUiLayout,
      mainMapUiLayoutKeys,
      'interfaccia mappa principale'
    )
    if (mainMapUi.layout === null) return { theme: null, error: mainMapUi.error }
    layouts.mainMapUi = mainMapUi.layout as AdminThemeLayouts['mainMapUi']

    const mapGrid = parseLayoutRects(
      parsed.layouts.mapGrid,
      defaultMapGridLayout,
      mapGridLayoutKeys,
      'mappa'
    )
    if (mapGrid.layout === null) return { theme: null, error: mapGrid.error }
    layouts.mapGrid = mapGrid.layout as AdminThemeLayouts['mapGrid']

    const luogo = parseLayoutRects(
      parsed.layouts.luogo,
      defaultLuogoLayout,
      luogoLayoutKeys,
      'percorsi e citta'
    )
    if (luogo.layout === null) return { theme: null, error: luogo.error }
    layouts.luogo = luogo.layout as AdminThemeLayouts['luogo']

    const deposit = parseLayoutRects(
      parsed.layouts.deposit,
      defaultDepositLayout,
      depositLayoutKeys,
      'deposito'
    )
    if (deposit.layout === null) return { theme: null, error: deposit.error }
    layouts.deposit = deposit.layout as AdminThemeLayouts['deposit']

    const evolution = parseLayoutRects(
      parsed.layouts.evolution,
      defaultEvolutionLayout,
      evolutionLayoutKeys,
      'evoluzione'
    )
    if (evolution.layout === null) return { theme: null, error: evolution.error }
    layouts.evolution = evolution.layout as AdminThemeLayouts['evolution']
  }

  let design: AdminTheme['design']
  if (parsed.design !== undefined) {
    try { design = normalizeDesign(parsed.design) } catch (error) {
      return { theme: null, error: error instanceof Error ? error.message : 'Progetto UI non valido.' }
    }
  }

  return {
    theme: {
      id: parsed.id,
      name: parsed.name,
      colors: colors as AdminThemeColors,
      ui: ui as AdminThemeUi,
      assets,
      spriteScales,
      layouts,
      ...(design ? { design } : {}),
    },
    error: null,
  }
}
