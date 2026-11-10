import { getPokemon } from '@/data'
import { validateCatalog } from '@/interactions/schema'
import type { InteractionCatalog } from '@/interactions/types'
import type { LeagueConfiguration } from '@/league/leagueModel'

export interface CampaignPackage {
  format: 'arkamon-campaign-configuration'
  version: 1
  name: string
  catalog: InteractionCatalog
  league: LeagueConfiguration | null
}
export type CampaignPackageResult = { configuration: CampaignPackage; error: null } | { configuration: null; error: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key))

function validOpponent(value: unknown): boolean {
  return object(value) && exactKeys(value, ['name', 'team']) && typeof value.name === 'string' && value.name.length <= 80
    && Array.isArray(value.team) && value.team.length <= 6 && value.team.every(member => object(member)
      && exactKeys(member, ['pokemonId', 'livello']) && typeof member.pokemonId === 'number' && !!getPokemon(member.pokemonId)
      && typeof member.livello === 'number' && Number.isSafeInteger(member.livello) && member.livello >= 5 && member.livello <= 100)
}

/** Accept incomplete authoring drafts, but never silently repair invalid species or rules. */
export function validatePortableLeague(value: unknown): value is LeagueConfiguration | null {
  return value === null || object(value) && exactKeys(value, ['version', 'opponents', 'champion', 'defeat', 'betweenBattleItems', 'championEnabled'])
    && value.version === 1 && Array.isArray(value.opponents) && value.opponents.length === 4 && value.opponents.every(validOpponent)
    && (value.champion === null || validOpponent(value.champion)) && (value.defeat === null || value.defeat === 'restart' || value.defeat === 'retry-stage')
    && typeof value.betweenBattleItems === 'boolean' && (value.championEnabled === null || typeof value.championEnabled === 'boolean')
}

/** The whitelist deliberately excludes teams, coins, history, positions and credentials. */
export function parseCampaignPackage(json: string): CampaignPackageResult {
  if (json.length > 2_000_000) return { configuration: null, error: 'Il pacchetto supera il limite di 2 MB.' }
  let value: unknown
  try { value = JSON.parse(json) } catch { return { configuration: null, error: 'Il file non contiene JSON valido.' } }
  if (!object(value) || !exactKeys(value, ['format', 'version', 'name', 'catalog', 'league']) || value.format !== 'arkamon-campaign-configuration' || value.version !== 1
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120) {
    return { configuration: null, error: 'Importa un pacchetto configurazione Arkamon versione 1. Salvataggi, credenziali e progressi non sono ammessi.' }
  }
  const catalog = validateCatalog(value.catalog)
  if (catalog.error) return { configuration: null, error: catalog.error }
  if (!object(value.catalog) || !exactKeys(value.catalog, ['version', 'interactions']) || !catalog.catalog!.interactions.every(entry => {
    const row = entry as unknown as Record<string, unknown>
    const actionKeys = { dialogue: ['kind'], heal: ['kind'], shop: ['kind'], trainer: ['kind', 'trainerId'], bush: ['kind', 'bush'], encounter: ['kind', 'speciesId', 'level'] }
    return exactKeys(row, ['id', 'mapId', 'nodeId', 'title', 'dialogue', 'scope', 'enabled', 'repeatable', 'requirements', 'cost', 'reward', 'action'])
      && exactKeys(entry.requirements as unknown as Record<string, unknown>, ['gymIds', 'minLevel', 'minCoins', 'items', 'completedInteractions'])
      && exactKeys(entry.cost as unknown as Record<string, unknown>, ['coins', 'items']) && exactKeys(entry.reward as unknown as Record<string, unknown>, ['coins', 'items'])
      && exactKeys(entry.action as unknown as Record<string, unknown>, actionKeys[entry.action.kind])
  })) return { configuration: null, error: 'Il catalogo contiene proprietà estranee alla configurazione delle interazioni.' }
  if (!validatePortableLeague(value.league)) return { configuration: null, error: 'Configurazione Lega non valida: controlla regole, nomi, specie e livelli.' }
  return { configuration: { format: 'arkamon-campaign-configuration', version: 1, name: value.name.trim(), catalog: catalog.catalog!,
    league: structuredClone(value.league) }, error: null }
}

export function exportCampaignPackage(name: string, catalog: InteractionCatalog, league: LeagueConfiguration | null): string {
  return JSON.stringify({ format: 'arkamon-campaign-configuration', version: 1, name: name.trim().slice(0, 120) || 'Configurazione Arkamon', catalog, league }, null, 2)
}
