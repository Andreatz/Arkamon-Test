import type { LocalMapDefinition } from '@/data/localMaps'
import type { InteractionDefinition } from './types'
import { validateCatalog } from './schema'

/** Tiled uses image/object layers; no grid conversion or road changes are required. */
export function exportTiledInteractions(map: LocalMapDefinition, interactions: InteractionDefinition[], width = 1619, height = 971): string {
  return JSON.stringify({
    type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width, height, tilewidth: 1, tileheight: 1, nextlayerid: 3, nextobjectid: map.nodes.length + 1,
    properties: [{ name: 'arkamonMapId', type: 'string', value: map.id }],
    layers: [
      { type: 'imagelayer', id: 1, name: 'Mappa originale', image: map.image.replace('/maps/', ''), opacity: 1, visible: true, x: 0, y: 0 },
      { type: 'objectgroup', id: 2, name: 'Interazioni Arkamon', opacity: 1, visible: true, x: 0, y: 0, draworder: 'topdown', objects: map.nodes.map((node, index) => ({
        id: index + 1, name: node.label ?? node.id, type: 'ArkamonPoint', point: true, x: node.x * width / 100, y: node.y * height / 100,
        properties: [
          { name: 'arkamonNodeId', type: 'string', value: node.id },
          { name: 'arkamonInteractions', type: 'string', value: JSON.stringify(interactions.filter((entry) => entry.mapId === map.id && entry.nodeId === node.id)) },
        ],
      })) },
    ], tilesets: [],
  }, null, 2)
}

/** Only authored properties are read. Existing graph IDs/coordinates remain authoritative. */
export function importTiledInteractions(json: string, current: InteractionDefinition[]): { interactions?: InteractionDefinition[]; error?: string } {
  try {
    const value: unknown = JSON.parse(json)
    if (!value || typeof value !== 'object' || !('layers' in value) || !Array.isArray(value.layers) || !('properties' in value) || !Array.isArray(value.properties)) return { error: 'Il file non contiene una mappa Tiled Arkamon.' }
    const properties = value.properties as Array<{ name?: unknown; value?: unknown }>
    const mapId = properties.find((prop) => prop.name === 'arkamonMapId')?.value
    if (typeof mapId !== 'string') return { error: 'Manca la proprietà arkamonMapId.' }
    const imported: InteractionDefinition[] = []
    for (const layer of value.layers as Array<{ type?: unknown; objects?: Array<{ properties?: Array<{ name?: unknown; value?: unknown }> }> }>) {
      if (layer.type !== 'objectgroup' || !Array.isArray(layer.objects)) continue
      for (const point of layer.objects) {
        if (!Array.isArray(point.properties)) continue
        const nodeId = point.properties.find((prop) => prop.name === 'arkamonNodeId')?.value
        const raw = point.properties.find((prop) => prop.name === 'arkamonInteractions')?.value
        if (raw === undefined || raw === '') continue
        if (typeof raw !== 'string' || typeof nodeId !== 'string') return { error: 'Proprietà del pallino Tiled non valide.' }
        const entries: unknown = JSON.parse(raw)
        if (!Array.isArray(entries)) return { error: 'arkamonInteractions deve contenere un elenco JSON.' }
        for (const entry of entries) {
          if (!entry || typeof entry !== 'object' || !('mapId' in entry) || entry.mapId !== mapId || !('nodeId' in entry) || entry.nodeId !== nodeId) return { error: 'Un’interazione Tiled appartiene a un altro luogo o pallino.' }
          imported.push(entry as InteractionDefinition)
        }
      }
    }
    const result = validateCatalog({ version: 1, interactions: [...current.filter((entry) => entry.mapId !== mapId), ...imported] })
    return result.error ? { error: result.error } : { interactions: result.catalog!.interactions }
  } catch { return { error: 'Il file Tiled o le sue proprietà non contengono JSON valido.' } }
}
