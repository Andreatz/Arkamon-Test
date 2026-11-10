import { getMossa, getPokemon, POKEMON_BASE } from '@/data'
import { calcolaHPMax, getMossaAlLivello, èMossaCura, èMossaSoloStato } from '@/engine/battleEngine'
import type { PokemonIstanza, PokemonSpecie } from '@/types'
import { createSeededRandomState, hashChallengeText, seededRandom, validateChallengeSeed } from './seededRandom'
import type { ChallengeDraft, ChallengeRulesVersion, ChallengeSession, ChallengeValidation } from './types'
import classicCatalog from './classicCatalogV1.json'

export const CHALLENGE_RULES_VERSION: ChallengeRulesVersion = 2
export const CHALLENGE_LEVEL = 20
export const FANTA_BUDGET = 100
export const CHALLENGE_TEAM_SIZE = 6

const categoryCost: Record<PokemonSpecie['categoria'], number> = { Lenta: 2, Media: 4, Veloce: 7, Leggendaria: 14 }
const previousSpecies = new Map(POKEMON_BASE.filter((species) => species.evoluzioneId).map((species) => [species.evoluzioneId, species]))
const classicSpecies = new Map(classicCatalog.species.map((species) => [species.id, species]))

export function isChallengeRulesVersion(value: unknown): value is ChallengeRulesVersion {
  return value === 1 || value === 2
}

export function challengeRulesLabel(version: ChallengeRulesVersion): string {
  return version === 1 ? 'Regole classiche · v1' : 'Regole aggiornate · v2'
}

export function speciesEvolutionStage(speciesId: number, rulesVersion: ChallengeRulesVersion = CHALLENGE_RULES_VERSION): number {
  if (rulesVersion === 1) {
    const species = classicSpecies.get(speciesId)
    if (!species) throw new Error('Specie non disponibile nelle regole classiche.')
    return species.stage
  }
  let stage = 0
  let previous = previousSpecies.get(speciesId)
  const visited = new Set<number>([speciesId])
  while (previous && !visited.has(previous.id)) {
    visited.add(previous.id)
    stage++
    previous = previousSpecies.get(previous.id)
  }
  return stage
}

/** Classic prices are a snapshot of the released catalog; updated prices count offensive moves only. */
export function fantaSpeciesCost(speciesId: number, rulesVersion: ChallengeRulesVersion = CHALLENGE_RULES_VERSION): number {
  if (rulesVersion === 1) {
    const species = classicSpecies.get(speciesId)
    if (!species) throw new Error('Specie non disponibile nelle regole classiche.')
    return species.cost
  }
  const species = getPokemon(speciesId)
  if (!species) throw new Error('Specie di Arkamon sconosciuta.')
  let expectedDamage = 0
  for (const moveId of species.mosse) {
    const move = getMossa(moveId)
    if (!move || èMossaSoloStato(move) || èMossaCura(move)) continue
    const params = getMossaAlLivello(move, CHALLENGE_LEVEL)
    expectedDamage = Math.max(expectedDamage, params.dadi * 3.5 + params.incremento)
  }
  return 8 + categoryCost[species.categoria] + speciesEvolutionStage(species.id) * 3 + Math.ceil(expectedDamage / 5)
}

export function fantaTeamCost(speciesIds: readonly number[], rulesVersion: ChallengeRulesVersion = CHALLENGE_RULES_VERSION): number {
  return speciesIds.reduce((sum, id) => sum + fantaSpeciesCost(id, rulesVersion), 0)
}

export function validateFantaTeam(speciesIds: unknown, requireComplete = true, rulesVersion: ChallengeRulesVersion = CHALLENGE_RULES_VERSION): ChallengeValidation {
  if (!isChallengeRulesVersion(rulesVersion)) return { ok: false, error: 'Versione delle regole non supportata.' }
  if (!Array.isArray(speciesIds) || speciesIds.length > CHALLENGE_TEAM_SIZE || (requireComplete && speciesIds.length !== CHALLENGE_TEAM_SIZE)) {
    return { ok: false, error: `Scegli ${CHALLENGE_TEAM_SIZE} Arkamon per la squadra.` }
  }
  if (speciesIds.some((id) => !Number.isSafeInteger(id) || !getPokemon(id))) return { ok: false, error: 'La squadra contiene una specie sconosciuta.' }
  if (new Set(speciesIds).size !== speciesIds.length) return { ok: false, error: 'Ogni specie può essere scelta una sola volta.' }
  if (rulesVersion === 1 && speciesIds.some((id) => !classicSpecies.has(id))) return { ok: false, error: 'La squadra contiene una specie non disponibile nelle regole classiche.' }
  if (fantaTeamCost(speciesIds, rulesVersion) > FANTA_BUDGET) return { ok: false, error: `La squadra supera il budget di ${FANTA_BUDGET} crediti.` }
  return { ok: true }
}

/** Species are picked in deterministic order, reserving enough budget to finish all six slots. */
export function generateSeedTeam(seed: string, namespace: 'player' | 'opponent', rulesVersion: ChallengeRulesVersion = CHALLENGE_RULES_VERSION): number[] {
  if (!isChallengeRulesVersion(rulesVersion)) throw new Error('Versione delle regole non supportata.')
  const normalized = validateChallengeSeed(seed)
  const rng = seededRandom(`${namespace}:${hashChallengeText(normalized).toString(16)}`)
  const catalog = rulesVersion === 1 ? classicCatalog.species : POKEMON_BASE.map((species) => ({ id: species.id, type: species.tipo }))
  const candidates = catalog.map((species) => ({ id: species.id, type: species.type, cost: fantaSpeciesCost(species.id, rulesVersion), tie: rng() }))
    .sort((a, b) => a.tie - b.tie || a.id - b.id)
  const selected: number[] = []
  const types = new Set<string>()
  let spent = 0
  for (let slot = 0; slot < CHALLENGE_TEAM_SIZE; slot++) {
    const affordable = candidates.filter((candidate) => !selected.includes(candidate.id)).filter((candidate) => {
      const remaining = candidates.filter((other) => other.id !== candidate.id && !selected.includes(other.id)).map((other) => other.cost).sort((a, b) => a - b)
      const reserve = remaining.slice(0, CHALLENGE_TEAM_SIZE - slot - 1).reduce((sum, cost) => sum + cost, 0)
      return spent + candidate.cost + reserve <= FANTA_BUDGET
    })
    const pick = affordable.find((candidate) => !types.has(candidate.type)) ?? affordable[0]
    if (!pick) throw new Error('Il catalogo non permette di completare una squadra entro il budget.')
    selected.push(pick.id)
    spent += pick.cost
    types.add(pick.type)
  }
  return selected
}

function createTeam(speciesIds: readonly number[], prefix: string): PokemonIstanza[] {
  return speciesIds.map((id, index) => {
    const species = getPokemon(id)!
    const pokemon: PokemonIstanza = { istanzaId: `${prefix}-${index}-${id}`, specieId: id, nome: species.nome, livello: CHALLENGE_LEVEL, hp: 1, xp: 0 }
    return { ...pokemon, hp: calcolaHPMax(pokemon) }
  })
}

export function createChallengeSession(draft: ChallengeDraft): ChallengeSession {
  if (!isChallengeRulesVersion(draft.version) || (draft.mode !== 'seed' && draft.mode !== 'fanta')) throw new Error('Versione o modalità della sfida non supportata.')
  const seed = validateChallengeSeed(draft.seed)
  const rulesVersion = draft.version
  const team = draft.mode === 'seed' ? generateSeedTeam(seed, 'player', rulesVersion) : [...draft.speciesIds]
  const checked = validateFantaTeam(team, true, rulesVersion)
  if (!checked.ok) throw new Error(checked.error)
  const enemy = generateSeedTeam(seed, 'opponent', rulesVersion)
  const id = `challenge-v${rulesVersion}-${hashChallengeText(JSON.stringify([draft.mode, seed, team])).toString(16).padStart(8, '0')}`
  return { version: rulesVersion, rulesVersion, id, mode: draft.mode, seed,
    rng: createSeededRandomState(seed), team: createTeam(team, `${id}-A`), enemyTeam: createTeam(enemy, `${id}-B`), budget: FANTA_BUDGET, level: CHALLENGE_LEVEL }
}

export const MAX_CHALLENGE_CODE_LENGTH = 8192

/** Sharing includes configuration, never trusted HP, moves or random state. */
export function exportChallengeCode(session: ChallengeSession): string {
  return JSON.stringify({ format: 'arkamon-challenge', version: session.version, rulesVersion: session.rulesVersion, mode: session.mode, seed: session.seed,
    speciesIds: session.mode === 'fanta' ? session.team.map((pokemon) => pokemon.specieId) : [] })
}

export function importChallengeCode(code: string): ChallengeSession {
  if (code.length > MAX_CHALLENGE_CODE_LENGTH) throw new Error('Il codice della sfida è troppo grande.')
  let value: unknown
  try { value = JSON.parse(code) } catch { throw new Error('Il codice della sfida non è un JSON valido.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Codice della sfida non valido.')
  const parsed = value as Record<string, unknown>
  if (parsed.format !== 'arkamon-challenge' || !isChallengeRulesVersion(parsed.version) || parsed.rulesVersion !== parsed.version || (parsed.mode !== 'seed' && parsed.mode !== 'fanta')) {
    throw new Error('Formato o versione della sfida non supportato.')
  }
  if (!Array.isArray(parsed.speciesIds)) throw new Error('La squadra condivisa non è valida.')
  const checked = validateFantaTeam(parsed.speciesIds, parsed.mode === 'fanta', parsed.version)
  if (!checked.ok) throw new Error(checked.error)
  if (parsed.mode === 'seed' && parsed.speciesIds.length > 0) throw new Error('Le squadre della sfida a seed sono generate dalle regole.')
  return createChallengeSession({ version: parsed.version, seed: validateChallengeSeed(parsed.seed), mode: parsed.mode, speciesIds: parsed.speciesIds as number[] })
}
