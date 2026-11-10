import { ALLENATORI, INCONTRI, MAPPE } from '@/data'
import { getAdjacentMainMapNodes } from '@/data/mainMapRoads'
import { hasUnlockedSecretLocation, SECRET_LOCATION_ID } from '@/data/secretLocation'
import { interactionRequirementMessage, isInteractionComplete, type InteractionRuntimeState } from '@/interactions/runtime'
import type { InteractionDefinition } from '@/interactions/types'
import type { LeagueState } from '@/league/leagueModel'

export interface JournalObjective { title: string; detail: string; mapId?: string; nextStep?: string }
export function routeToLocation(from: string, target: string): string[] | null {
  if (from === target) return [from]
  const visited = new Set([from]), paths = [[from]]
  while (paths.length) {
    const path = paths.shift()!
    for (const next of getAdjacentMainMapNodes(path[path.length - 1])) {
      if (visited.has(next)) continue
      const candidate = [...path, next]
      if (next === target) return candidate
      visited.add(next); paths.push(candidate)
    }
  }
  return null
}
export function nextJournalObjective(state: InteractionRuntimeState & { league?: LeagueState }, playerId: 1 | 2, definitions: InteractionDefinition[]): JournalObjective {
  const player = state[playerId === 1 ? 'giocatore1' : 'giocatore2']
  const world = state[playerId === 1 ? 'posizione1' : 'posizione2']
  const here = world.luogo ?? 'Pordenone'
  if (state.battaglia && state.giocatoreAttivo === playerId) return { title: 'Completa la battaglia in corso', detail: 'Il movimento torna disponibile dopo lo scontro.' }
  const league = state.league
  if (league?.winner) return { title: 'La Lega è conclusa', mapId: 'Roma', detail: `${league.winner.name} ha vinto la Lega. Consulta il risultato nella schermata della Lega.` }
  if (league?.players[playerId].status === 'running') return { title: 'Prosegui la Lega', mapId: 'Roma',
    detail: `Tentativo in corso: incontro ${league.players[playerId].nextStage + 1}. Le quattro battaglie proseguono nello stesso turno dalla schermata della Lega.` }
  if (!player.squadra.length) return Object.keys(player.deposito).length
    ? { title: 'Ritira un Arkamon dal deposito', detail: 'Hai già dei compagni in riserva. Spostane almeno uno in squadra per proseguire il viaggio.' }
    : { title: 'Scegli il tuo starter', detail: 'Il laboratorio assegna uno starter diverso a ciascun giocatore.' }
  if (!player.squadra.some((pokemon) => pokemon.hp > 0)) return { title: 'Cura la squadra', detail: 'Visita il Centro Pokémon di una città prima di affrontare un incontro.' }
  if (hasUnlockedSecretLocation(player)) return { title: league?.players[playerId].status === 'defeated' ? 'Riprova la Lega a Roma' : 'Affronta la Lega a Roma', mapId: 'Roma',
    detail: `Hai completato le otto palestre. ${here === 'Roma' ? 'Apri la Lega dalla città.' : 'Raggiungi Roma per affrontare i Superquattro.'} Il passaggio segreto resta un’opportunità facoltativa.`, nextStep: routeToLocation(here, 'Roma')?.[1] }
  const candidates = definitions.filter((definition) => definition.enabled && !definition.repeatable
    && !isInteractionComplete(state.interactionProgress, definition, playerId)
    && !interactionRequirementMessage(state, definition, playerId)
    && (definition.mapId !== SECRET_LOCATION_ID || hasUnlockedSecretLocation(player))
    && !(definition.action.kind === 'trainer' && player.allenatoriSconfitti.has(definition.action.trainerId))
    && !(definition.action.kind === 'bush' && player.cespugliVisitati.has(`${definition.mapId}:${definition.action.bush}`)))
  const nearest = candidates.map((definition) => ({ definition, route: routeToLocation(here, definition.mapId) }))
    .filter((entry) => !!entry.route).sort((a, b) => a.route!.length - b.route!.length)[0]
  if (nearest) return {
    title: nearest.definition.title, mapId: nearest.definition.mapId,
    detail: nearest.definition.mapId === here ? 'Raggiungi il pallino dell’interazione in questa mappa.' : `Tappa disponibile a ${nearest.definition.mapId.replace(/_/g, ' ')}.`,
    nextStep: nearest.route?.[1],
  }
  const gyms = ALLENATORI.filter((trainer) => trainer.tipo === 'Capopalestra' && !player.allenatoriSconfitti.has(trainer.id))
  const gym = gyms.map((trainer) => ({ trainer, route: routeToLocation(here, trainer.luogo) })).filter((entry) => !!entry.route)
    .sort((a, b) => a.route!.length - b.route!.length || a.trainer.id - b.trainer.id)[0]
  if (gym) return { title: `Palestra di ${gym.trainer.luogo}`, mapId: gym.trainer.luogo,
    detail: gym.trainer.luogo === here ? `${gym.trainer.nome} non è ancora stato sconfitto.` : 'La palestra più vicina fra quelle ancora da completare.', nextStep: gym.route?.[1] }
  return { title: 'Esplora i luoghi disponibili', detail: 'Consulta nel diario gli incontri e gli allenatori ancora da affrontare.' }
}
export function journalLocations(state: InteractionRuntimeState, playerId: 1 | 2, definitions: InteractionDefinition[]) {
  const player = state[playerId === 1 ? 'giocatore1' : 'giocatore2']
  const world = state[playerId === 1 ? 'posizione1' : 'posizione2']
  const local = state[playerId === 1 ? 'posizioniLocali1' : 'posizioniLocali2']
  const documented = new Set(Object.keys(local))
  if (world.luogo) documented.add(world.luogo)
  player.cespugliVisitati.forEach((key) => documented.add(key.split(':')[0]))
  ALLENATORI.filter((trainer) => player.allenatoriSconfitti.has(trainer.id)).forEach((trainer) => documented.add(trainer.luogo))
  return [...MAPPE.map((map) => map.nome), ...(hasUnlockedSecretLocation(player) ? [SECRET_LOCATION_ID] : [])].map((mapId) => {
    const trainers = ALLENATORI.filter((trainer) => trainer.luogo === mapId)
    const bushes = [...new Set(INCONTRI.filter((entry) => entry.luogo === mapId).map((entry) => entry.cespuglio))]
    const interactions = definitions.filter((entry) => entry.mapId === mapId && entry.enabled && !entry.repeatable)
    return { mapId, documented: documented.has(mapId), current: world.luogo === mapId,
      trainersTotal: trainers.length, trainersCompleted: trainers.filter((trainer) => player.allenatoriSconfitti.has(trainer.id)).length,
      bushesTotal: bushes.length, bushesCompleted: bushes.filter((bush) => player.cespugliVisitati.has(`${mapId}:${bush}`)).length,
      interactionsTotal: interactions.length, interactionsCompleted: interactions.filter((entry) => isInteractionComplete(state.interactionProgress, entry, playerId)).length }
  })
}
