import { getLocalMap } from '@/data/localMaps'
import { getAllenatore, getIncontri, getPokemon, ALLENATORI } from '@/data'
import type { InteractionCatalog, InteractionDefinition, InteractionProgress, InteractionResources } from './types'
import { emptyInteractionProgress } from './types'
import { hasArkaStore } from '@/shop/catalog'

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const integer = (value: unknown, max = 1_000_000): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
/** Legacy impossible edges remain visible only until removed, never selectable anew. */
export function completionPrerequisiteOptions(entries: readonly InteractionDefinition[], draft: InteractionDefinition): InteractionDefinition[] {
  return entries.filter((entry) => entry.id !== draft.id && entry.action.kind !== 'shop'
    && (!entry.repeatable || draft.requirements.completedInteractions.includes(entry.id)))
}
export function validResources(value: unknown): value is InteractionResources {
  if (!object(value) || !integer(value.coins) || !object(value.items)) return false
  return Object.entries(value.items).every(([id, quantity]) => id === 'masterball' && integer(quantity, 999))
}

/** Strict import: invalid nodes and unknown game IDs never become executable content. */
export function validateInteraction(value: unknown): string | null {
  if (!object(value) || !validId(value.id)) return 'Identificatore dell’interazione non valido.'
  const map = typeof value.mapId === 'string' ? getLocalMap(value.mapId) : undefined
  if (!map || !map.nodes.some((node) => node.id === value.nodeId)) return 'Mappa o pallino inesistente.'
  if (!text(value.title, 120) || !value.title.trim()) return 'Inserisci un titolo (massimo 120 caratteri).'
  if (!text(value.dialogue, 4000)) return 'Il dialogo può contenere al massimo 4.000 caratteri.'
  if (!['player', 'shared'].includes(String(value.scope)) || typeof value.enabled !== 'boolean' || typeof value.repeatable !== 'boolean') return 'Completamento o disponibilità non validi.'
  const r = value.requirements
  if (!object(r) || !integer(r.minLevel, 100) || !integer(r.minCoins) || !Array.isArray(r.gymIds)
    || !r.gymIds.every((id) => integer(id) && ALLENATORI.some((trainer) => trainer.id === id && trainer.tipo === 'Capopalestra'))
    || !Array.isArray(r.completedInteractions) || !r.completedInteractions.every(validId)
    || r.completedInteractions.includes(value.id) || !validResources({ coins: 0, items: r.items })) return 'Requisiti non validi: controlla livelli, medaglie, oggetti e tappe precedenti.'
  if (!validResources(value.cost) || !validResources(value.reward)) return 'Costi o ricompense non validi.'
  const a = value.action
  if (!object(a) || !['dialogue', 'heal', 'shop', 'trainer', 'bush', 'encounter'].includes(String(a.kind))) return 'Scegli un’attività valida.'
  if (a.kind === 'shop' && (!hasArkaStore(map.id) || !value.repeatable || value.cost.coins > 0 || value.reward.coins > 0
    || Object.values(value.cost.items).some(q => Number(q) > 0) || Object.values(value.reward.items).some(q => Number(q) > 0))) {
    return 'Un Arkastore deve essere ripetibile, in una città e senza costi o premi di apertura: si pagano soltanto gli acquisti.'
  }
  if (a.kind === 'trainer') {
    const trainer = integer(a.trainerId) ? getAllenatore(a.trainerId) : undefined
    if (!trainer || trainer.luogo !== map.id || !trainer.squadra.length) return 'L’allenatore deve appartenere al luogo selezionato.'
  }
  if (a.kind === 'bush' && (typeof a.bush !== 'string' || !getIncontri(map.id, a.bush).length)) return 'Il cespuglio scelto non ha incontri definiti in questo luogo.'
  if (a.kind === 'encounter' && (!integer(a.speciesId) || !getPokemon(a.speciesId) || !integer(a.level, 100) || a.level < 5)) return 'Seleziona una specie esistente e un livello fra 5 e 100.'
  if (value.repeatable && !['dialogue', 'heal', 'shop'].includes(String(a.kind))) return 'Solo dialoghi, cure e Arkastore possono essere ripetibili.'
  if (value.repeatable && (value.reward.coins > 0 || Object.values(value.reward.items).some((q) => Number(q) > 0))) return 'Le attività ripetibili non possono assegnare ricompense.'
  return null
}

export function validateCatalog(value: unknown, options: { allowLegacyRepeatableRequirements?: boolean; legacyInteractions?: readonly InteractionDefinition[] } = {}): { catalog?: InteractionCatalog; error?: string; warning?: string } {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.interactions) || value.interactions.length > 200) return { error: 'Formato non valido: importa un catalogo Arkamon versione 1 (massimo 200 interazioni).' }
  const ids = new Set<string>()
  for (const entry of value.interactions) {
    const error = validateInteraction(entry)
    if (error) return { error }
    const interaction = entry as InteractionDefinition
    if (ids.has(interaction.id)) return { error: 'Due interazioni hanno lo stesso identificatore.' }
    ids.add(interaction.id)
  }
  const entries = value.interactions as InteractionDefinition[]
  let warning: string | undefined
  for (const entry of entries) {
    if (entry.requirements.completedInteractions.some((id) => !ids.has(id))) return { error: `La tappa «${entry.title}» richiede un’interazione assente dal catalogo.` }
    if (entry.requirements.completedInteractions.some((id) => entries.find((candidate) => candidate.id === id)!.action.kind === 'shop')) {
      return { error: `La tappa «${entry.title}» richiede un Arkastore: i negozi non si completano e non possono essere tappe precedenti.` }
    }
    const repeatableRequirements = entry.requirements.completedInteractions.filter((id) => entries.find((candidate) => candidate.id === id)!.repeatable)
    if (repeatableRequirements.length) {
      const message = `La tappa «${entry.title}» richiede un’attività ripetibile: queste attività non registrano completamenti e non possono essere tappe precedenti.`
      const existing = options.legacyInteractions?.find(candidate => candidate.id === entry.id)
      const unchangedLegacyEdges = repeatableRequirements.every(id => existing?.requirements.completedInteractions.includes(id)
        && options.legacyInteractions?.find(candidate => candidate.id === id)?.repeatable)
      if (!options.allowLegacyRepeatableRequirements && !unchangedLegacyEdges) return { error: message }
      // A formerly accepted catalog must remain editable and portable. Reading
      // it never executes the impossible dependency or erases unrelated entries.
      warning = `${message} Correggi il requisito nell’editor delle interazioni.`
    }
  }
  const visiting = new Set<string>(), done = new Set<string>()
  const cycle = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (done.has(id)) return false
    visiting.add(id)
    if (entries.find((e) => e.id === id)!.requirements.completedInteractions.some(cycle)) return true
    visiting.delete(id); done.add(id)
    return false
  }
  if (entries.some((entry) => cycle(entry.id))) return { error: 'Le tappe precedenti formano un ciclo: nessuna potrebbe essere iniziata.' }
  return { catalog: { version: 1, interactions: structuredClone(entries) }, ...(warning ? { warning } : {}) }
}

export function normalizeInteractionProgress(value: unknown): InteractionProgress {
  const result = emptyInteractionProgress()
  if (!object(value)) return result
  for (const key of ['completed1', 'completed2', 'completedShared'] as const) {
    if (Array.isArray(value[key])) result[key] = [...new Set(value[key].filter(validId))].slice(-2000)
  }
  for (const key of ['log1', 'log2'] as const) {
    if (Array.isArray(value[key])) result[key] = value[key].filter((entry) => {
      if (!object(entry) || !validId(entry.interactionId) || !text(entry.title, 120) || !text(entry.message, 4000)) return false
      const map = typeof entry.mapId === 'string' ? getLocalMap(entry.mapId) : undefined
      return !!map?.nodes.some((node) => node.id === entry.nodeId)
    }).slice(-100) as InteractionProgress[typeof key]
  }
  const pending = value.pendingBattle
  if (object(pending) && validId(pending.interactionId) && (pending.playerId === 1 || pending.playerId === 2)
    && text(pending.title, 120) && ['player', 'shared'].includes(String(pending.scope)) && validResources(pending.reward)) {
    const map = typeof pending.mapId === 'string' ? getLocalMap(pending.mapId) : undefined
    if (map?.nodes.some((node) => node.id === pending.nodeId)) result.pendingBattle = structuredClone(pending) as unknown as NonNullable<InteractionProgress['pendingBattle']>
  }
  return result
}
