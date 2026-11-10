import { ALLENATORI, getAllenatore, getIncontri, getPokemon } from '@/data'
import { getLocalMap } from '@/data/localMaps'
import { SECRET_LOCATION_ID, canAccessSecretLocation } from '@/data/secretLocation'
import { calcolaHPMax, determinaIniziativa } from '@/engine/battleEngine'
import { nuovoTurno } from '@/engine/movimento'
import type { NavigazioneScena, PokemonIstanza, PosizioneAvatar, PosizioniMappeLocali, StatoBattaglia, StatoGiocatore, StatoTurnoOverworld } from '@/types'
import { validateInteraction } from './schema'
import type { InteractionDefinition, InteractionLogEntry, InteractionProgress, InteractionResources, PendingInteractionBattle } from './types'

/** Structural input lets the game store commit all changes in a single persisted update. */
export interface InteractionRuntimeState {
  giocatore1: StatoGiocatore
  giocatore2: StatoGiocatore
  giocatoreAttivo: 1 | 2
  posizione1: PosizioneAvatar
  posizione2: PosizioneAvatar
  posizioniLocali1: PosizioniMappeLocali
  posizioniLocali2: PosizioniMappeLocali
  turnoOverworld: StatoTurnoOverworld
  battaglia: StatoBattaglia | null
  scenaCorrente: NavigazioneScena
  scenaPrecedente: NavigazioneScena | null
  rivaleStarterId: number | null
  interactionProgress: InteractionProgress
}
export type InteractionPatch = Partial<Pick<InteractionRuntimeState, 'giocatore1' | 'giocatore2' | 'turnoOverworld' | 'battaglia' | 'scenaCorrente' | 'scenaPrecedente' | 'interactionProgress'>>
export interface InteractionResolution { ok: boolean; message: string; patch?: InteractionPatch }
export function isInteractionComplete(progress: InteractionProgress, definition: Pick<InteractionDefinition, 'id' | 'scope'>, playerId: 1 | 2): boolean {
  return progress.completedShared.includes(definition.id)
    || progress[playerId === 1 ? 'completed1' : 'completed2'].includes(definition.id)
}
export function interactionRequirementMessage(
  state: Pick<InteractionRuntimeState, 'giocatore1' | 'giocatore2' | 'interactionProgress'>,
  definition: InteractionDefinition, playerId: 1 | 2,
): string | null {
  const player = state[playerId === 1 ? 'giocatore1' : 'giocatore2']
  const r = definition.requirements
  const missingGyms = r.gymIds.filter((id) => !player.allenatoriSconfitti.has(id))
  if (missingGyms.length) return `Richiede le medaglie di: ${missingGyms.map((id) => getAllenatore(id)?.luogo ?? id).join(', ')}.`
  if (r.minLevel && !player.squadra.some((pokemon) => pokemon.livello >= r.minLevel)) return `Serve almeno un Arkamon in squadra di livello ${r.minLevel}.`
  if (player.monete < Math.max(r.minCoins, definition.cost.coins)) return `Servono almeno ${Math.max(r.minCoins, definition.cost.coins)} monete.`
  for (const [id, quantity] of Object.entries(r.items)) if ((player.inventario.masterball ?? 0) < Number(quantity) && id === 'masterball') return `Servono ${quantity} Masterball.`
  if ((player.inventario.masterball ?? 0) < (definition.cost.items.masterball ?? 0)) return `Il costo è ${definition.cost.items.masterball} Masterball.`
  if (r.completedInteractions.some((id) => !isInteractionComplete(state.interactionProgress, { id, scope: 'player' }, playerId))) return 'Completa prima le tappe precedenti indicate nel diario.'
  return null
}
function changeResources(player: StatoGiocatore, resources: InteractionResources, sign: 1 | -1): StatoGiocatore {
  const inventory = { ...player.inventario }
  for (const [id, quantity] of Object.entries(resources.items)) {
    if (id === 'masterball') inventory.masterball = Math.min(999_999, Math.max(0, (inventory.masterball ?? 0) + sign * Number(quantity)))
  }
  return { ...player, monete: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, player.monete + sign * resources.coins)), inventario: inventory }
}
function appendLog(progress: InteractionProgress, playerId: 1 | 2, entry: InteractionLogEntry): InteractionProgress {
  const key = playerId === 1 ? 'log1' : 'log2'
  return { ...progress, [key]: [...progress[key], entry].slice(-100) }
}
function complete(progress: InteractionProgress, pending: Pick<PendingInteractionBattle, 'interactionId' | 'playerId' | 'scope'>): InteractionProgress {
  const key = pending.scope === 'shared' ? 'completedShared' : pending.playerId === 1 ? 'completed1' : 'completed2'
  return { ...progress, [key]: [...new Set([...progress[key], pending.interactionId])] }
}
function makePokemon(speciesId: number, level: number, token: string): PokemonIstanza | null {
  const species = getPokemon(speciesId)
  if (!species) return null
  const pokemon: PokemonIstanza = { istanzaId: token, specieId: speciesId, nome: species.nome, livello: level, xp: 0, hp: 0 }
  pokemon.hp = calcolaHPMax(pokemon)
  return pokemon
}
function makeBattle(state: InteractionRuntimeState, definition: InteractionDefinition, player: StatoGiocatore, rng: () => number): StatoBattaglia | null {
  const pokemonA = player.squadra.find((p) => p.hp > 0)
  if (!pokemonA) return null
  const a = definition.action
  let opponents: PokemonIstanza[] = []
  let trainerId: number | undefined
  let type: StatoBattaglia['tipo'] = 'Selvatico'
  let intro = definition.title
  if (a.kind === 'trainer') {
    const trainer = getAllenatore(a.trainerId)
    if (!trainer) return null
    trainerId = trainer.id; type = trainer.tipo === 'PVP' ? 'PVP' : 'NPC'; intro = `${trainer.nome} ti sfida!`
    opponents = trainer.squadra.flatMap((slot, index) => {
      const speciesId = index === 0 && trainer.tipo === 'PVP' && state.rivaleStarterId ? state.rivaleStarterId : slot.pokemonId
      const pokemon = makePokemon(speciesId, slot.livello, `interaction-${definition.id}-${player.id}-${index}`)
      return pokemon ? [pokemon] : []
    })
  } else if (a.kind === 'encounter') {
    const pokemon = makePokemon(a.speciesId, a.level, `interaction-${definition.id}-${player.id}`)
    if (pokemon) opponents = [pokemon]
  } else if (a.kind === 'bush') {
    const entries = getIncontri(definition.mapId, a.bush)
    const weight = (rarity: string) => rarity === 'Comune' ? 60 : rarity === 'Medio' ? 30 : 10
    let choice = Math.min(.99999999, Math.max(0, rng())) * entries.reduce((sum, e) => sum + weight(e.probabilita), 0)
    const entry = entries.find((e) => { choice -= weight(e.probabilita); return choice < 0 })
    if (entry) {
      const level = entry.livelloMin + Math.floor(Math.min(.99999999, Math.max(0, rng())) * (entry.livelloMax - entry.livelloMin + 1))
      const pokemon = makePokemon(entry.pokemonId, level, `interaction-${definition.id}-${player.id}`)
      if (pokemon) opponents = [pokemon]
    }
  }
  if (!opponents.length) return null
  const pokemonB = opponents[0]
  return {
    tipo: type, pokemonA, pokemonB, squadraA: player.squadra, ...(trainerId !== undefined ? { squadraB: opponents, allenatoreId: trainerId } : {}),
    hpMaxA: calcolaHPMax(pokemonA), hpMaxB: calcolaHPMax(pokemonB),
    turnoCorrente: determinaIniziativa(pokemonA.livello, pokemonB.livello, rng, pokemonA.stato?.tipo, pokemonB.stato?.tipo),
    luogoRitorno: definition.mapId, log: [intro], evoluzioneInAttesa: null,
  }
}

export function resolveConfiguredInteraction(state: InteractionRuntimeState, definition: InteractionDefinition | undefined, playerId: 1 | 2, rng: () => number = Math.random): InteractionResolution {
  const failure = (message: string): InteractionResolution => ({ ok: false, message })
  if (!definition || validateInteraction(definition)) return failure('Questa interazione non è più disponibile.')
  if (!definition.enabled) return failure('Questa interazione è disattivata.')
  const playerKey = playerId === 1 ? 'giocatore1' : 'giocatore2'
  const player = state[playerKey]
  const world = state[playerId === 1 ? 'posizione1' : 'posizione2']
  const positions = state[playerId === 1 ? 'posizioniLocali1' : 'posizioniLocali2']
  const map = getLocalMap(definition.mapId)!
  if (state.battaglia || state.interactionProgress.pendingBattle) return failure('Concludi prima la battaglia in corso.')
  if (state.giocatoreAttivo !== playerId || state.turnoOverworld.giocatoreAttivo !== playerId || state.turnoOverworld.azioniRimaste <= 0) return failure('Il turno di questo giocatore è concluso.')
  if (world.mappaId !== 'mappa-principale' || world.luogo !== definition.mapId || (positions[map.id] ?? map.startNode) !== definition.nodeId) return failure('Raggiungi il pallino di questa interazione.')
  if (definition.mapId === SECRET_LOCATION_ID && !canAccessSecretLocation(player, world)) return failure('Il passaggio segreto non è ancora disponibile.')
  if (!definition.repeatable && isInteractionComplete(state.interactionProgress, definition, playerId)) return failure('Questa interazione è già stata completata.')
  const requirement = interactionRequirementMessage(state, definition, playerId)
  if (requirement) return failure(requirement)
  const a = definition.action
  // Opening a shop is free. The atomic checkout validates the same point again.
  if (a.kind === 'shop') {
    if (state.scenaCorrente.scena !== 'citta' || state.scenaCorrente.payload?.luogo !== map.id) return failure('Apri la mappa della città e raggiungi il pallino dell’Arkastore.')
    return { ok: true, message: 'Arkastore disponibile sul pallino. Il turno si conclude soltanto all’acquisto.' }
  }
  if (a.kind === 'trainer' && player.allenatoriSconfitti.has(a.trainerId)) return failure('Questo allenatore è già stato sconfitto.')
  if (a.kind === 'bush' && player.cespugliVisitati.has(`${map.id}:${a.bush}`)) return failure('Questo cespuglio è già stato esplorato.')
  const startsBattle = a.kind === 'trainer' || a.kind === 'encounter' || a.kind === 'bush'
  const battle = startsBattle ? makeBattle(state, definition, player, rng) : null
  if (startsBattle && !battle) return failure('Serve un Arkamon vivo in squadra per affrontare questo incontro.')
  let updatedPlayer = changeResources(player, definition.cost, -1)
  let progress = state.interactionProgress
  const pending: PendingInteractionBattle = { interactionId: definition.id, playerId, title: definition.title, mapId: map.id, nodeId: definition.nodeId, scope: definition.scope, reward: structuredClone(definition.reward) }
  if (battle) {
    progress = { ...progress, pendingBattle: pending }
    if (a.kind === 'bush') updatedPlayer = { ...updatedPlayer, cespugliVisitati: new Set([...updatedPlayer.cespugliVisitati, `${map.id}:${a.bush}`]) }
  } else {
    if (a.kind === 'heal') updatedPlayer = { ...updatedPlayer, squadra: updatedPlayer.squadra.map((p) => {
      const { stato: _stato, ...clean } = p
      return { ...clean, hp: calcolaHPMax(clean) }
    }) }
    updatedPlayer = changeResources(updatedPlayer, definition.reward, 1)
    if (!definition.repeatable) progress = complete(progress, pending)
    progress = appendLog(progress, playerId, { interactionId: definition.id, title: definition.title, mapId: map.id, nodeId: definition.nodeId, message: definition.dialogue || (a.kind === 'heal' ? 'La squadra è stata curata.' : 'Interazione completata.') })
  }
  return {
    ok: true, message: definition.dialogue || (battle ? 'La sfida ha inizio.' : a.kind === 'heal' ? 'La squadra è stata curata.' : 'Interazione completata.'),
    patch: {
      [playerKey]: updatedPlayer, interactionProgress: progress, turnoOverworld: nuovoTurno(playerId),
      ...(battle ? { battaglia: battle, scenaPrecedente: state.scenaCorrente, scenaCorrente: { scena: 'battaglia' as const } } : {}),
    },
  }
}

/** Rewards are deferred until the real battle result, including capture; retrying cannot pay twice. */
export function finalizeConfiguredBattle(state: InteractionRuntimeState): InteractionPatch {
  const pending = state.interactionProgress.pendingBattle
  if (!pending) return {}
  const outcome = state.battaglia?.checkpoint?.outcome
  let progress: InteractionProgress = { ...state.interactionProgress, pendingBattle: null }
  const completed = isInteractionComplete(progress, { id: pending.interactionId, scope: pending.scope }, pending.playerId)
  const belongsToBattle = state.giocatoreAttivo === pending.playerId && state.battaglia?.luogoRitorno === pending.mapId
    && state.battaglia.pokemonB.istanzaId.startsWith(`interaction-${pending.interactionId}-${pending.playerId}`)
  const success = belongsToBattle && outcome === 'vittoria'
  const playerKey = pending.playerId === 1 ? 'giocatore1' : 'giocatore2'
  let player = state[playerKey]
  if (success && !completed) {
    player = changeResources(player, pending.reward, 1)
    progress = complete(progress, pending)
  }
  progress = appendLog(progress, pending.playerId, {
    interactionId: pending.interactionId, title: pending.title, mapId: pending.mapId, nodeId: pending.nodeId,
    message: success ? 'Sfida completata; ricompensa assegnata.' : 'Sfida non completata; nessuna ricompensa aggiuntiva.',
  })
  return { [playerKey]: player, interactionProgress: progress }
}

export function collectedGymCount(player: Pick<StatoGiocatore, 'allenatoriSconfitti'>): number {
  return ALLENATORI.filter((trainer) => trainer.tipo === 'Capopalestra' && player.allenatoriSconfitti.has(trainer.id)).length
}
