import type { NavigazioneScena, PokemonIstanza, PosizioneAvatar, PosizioniMappeLocali, SceneId, StatoBattaglia, StatoGiocatore, StatoTurnoOverworld } from '@/types'
import { getPokemon } from '@/data'
import { MAIN_MAP_START_NODE, getAdjacentMainMapNodes } from '@/data/mainMapRoads'
import { getLocalMap } from '@/data/localMaps'
import { getLocalMapNode } from '@/engine/localMapMovement'
import { calcolaHPMax, clearStoredExperience } from '@/engine/battleEngine'
import { SECRET_LOCATION_ID, SECRET_LOCATION_ORIGIN, canAccessSecretLocation, hasUnlockedSecretLocation, isSecretLocationPosition } from '@/data/secretLocation'
import { restoreBattleCheckpoint } from '@/components/battle/battleCheckpoint'
import { emptyInteractionProgress, type InteractionProgress } from '@/interactions/types'
import { normalizeInteractionProgress } from '@/interactions/schema'
import { normalizeBattleChronicle } from '@/components/battle/battleChronicle'
import { deriveArkadexProgress, emptyArkadexProgress, normalizeArkadexProgress, type ArkadexProgress } from '@/arkadex/arkadexModel'
import { emptyMatchLog, normalizeMatchLog, type MatchLog } from '@/match/matchLog'
import { normalizeShopInventory } from '@/shop/catalog'
import { isTeamWithinLevelCap, teamCapMessage } from '@/engine/teamLevelCap'
import { createSeededRandomState } from '@/challenges/seededRandom'
import { emptyLeagueState, normalizeLeagueState, leagueTrainer, type LeagueState } from '@/league/leagueModel'

/** This whitelist is shared by browser persistence and portable campaign files. */
export interface GameSaveState {
  league: LeagueState
  arkadex: ArkadexProgress
  matchLog: MatchLog
  giocatore1: StatoGiocatore
  giocatore2: StatoGiocatore
  giocatoreAttivo: 1 | 2
  battaglia: StatoBattaglia | null
  rivaleStarterId: number | null
  posizione1: PosizioneAvatar
  posizione2: PosizioneAvatar
  turnoOverworld: StatoTurnoOverworld
  posizioniLocali1: PosizioniMappeLocali
  posizioniLocali2: PosizioniMappeLocali
  scenaCorrente: NavigazioneScena
  scenaPrecedente: NavigazioneScena | null
  audioMuted: boolean
  interactionProgress: InteractionProgress
  fallbackLocationActivity?: { playerId: 1 | 2; location: string } | null
}

export const GAME_SAVE_STORAGE_KEY = 'arkamon-save'
export const PREVIOUS_BACKUP_STORAGE_KEY = 'arkamon-previous-backup-v1'
export const emptyPlayer = (id: 1 | 2): StatoGiocatore => ({
  id, nome: `Giocatore ${id}`, squadra: [], deposito: {}, cespugliVisitati: new Set(),
  allenatoriSconfitti: new Set(), monete: 0, inventario: { masterball: 1 }, caselleConsumate: new Set(),
})

export function mainMapPosition(luogo = MAIN_MAP_START_NODE): PosizioneAvatar {
  return { mappaId: 'mappa-principale', x: 0, y: 0, direzione: 'S', luogo }
}

export function initialGameSave(): GameSaveState {
  return {
    giocatore1: emptyPlayer(1), giocatore2: emptyPlayer(2), giocatoreAttivo: 1, battaglia: null,
    rivaleStarterId: null, posizione1: mainMapPosition(), posizione2: mainMapPosition(),
    turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 }, posizioniLocali1: {}, posizioniLocali2: {},
    scenaCorrente: { scena: 'titolo' }, scenaPrecedente: null, audioMuted: false, interactionProgress: emptyInteractionProgress(), fallbackLocationActivity: null,
    arkadex: emptyArkadexProgress(), matchLog: emptyMatchLog(), league: emptyLeagueState(),
  }
}

export function isSaveRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
type Warn = (message: string) => void

function restorePosition(value: unknown, warn: Warn, label: string): PosizioneAvatar {
  if (!isSaveRecord(value) || typeof value.mappaId !== 'string') {
    if (value !== undefined) warn(`${label}: posizione non valida, ripristinato l’ingresso.`)
    return mainMapPosition()
  }
  if (value.mappaId === SECRET_LOCATION_ID) return mainMapPosition(SECRET_LOCATION_ORIGIN)
  if (value.mappaId !== 'mappa-principale') {
    if (Number.isInteger(value.x) && Number.isInteger(value.y) && ['N', 'S', 'E', 'O'].includes(value.direzione as string)) {
      return { mappaId: value.mappaId, x: value.x as number, y: value.y as number, direzione: value.direzione as PosizioneAvatar['direzione'] }
    }
    warn(`${label}: posizione non valida, ripristinato l’ingresso.`)
    return mainMapPosition()
  }
  const luogo = typeof value.luogo === 'string' ? value.luogo : MAIN_MAP_START_NODE
  if (luogo === SECRET_LOCATION_ID || getAdjacentMainMapNodes(luogo).length > 0) return mainMapPosition(luogo)
  warn(`${label}: luogo non disponibile, ripristinato l’ingresso.`)
  return mainMapPosition()
}

function restoreSet<T>(value: unknown, fallback: Set<T>, valid: (item: unknown) => item is T, warn: Warn, label: string): Set<T> {
  if (value === undefined) return new Set(fallback)
  const items = value instanceof Set ? [...value] : Array.isArray(value) ? value : []
  const clean = items.filter(valid)
  if (!(value instanceof Set) && !Array.isArray(value) || clean.length !== items.length) warn(`${label}: rimossi progressi non validi.`)
  return new Set(clean)
}

function restorePokemon(value: unknown, warn: Warn, label: string): PokemonIstanza | null {
  if (!isSaveRecord(value) || typeof value.istanzaId !== 'string' || !value.istanzaId.trim()
    || !finite(value.specieId) || !getPokemon(value.specieId) || !Number.isInteger(value.livello)
    || (value.livello as number) < 5 || (value.livello as number) > 100 || !finite(value.hp) || value.hp < 0) {
    warn(`${label}: esclusa una creatura con dati non recuperabili.`)
    return null
  }
  const pokemon: PokemonIstanza = {
    istanzaId: value.istanzaId, specieId: value.specieId, livello: value.livello as number, hp: value.hp,
    nome: typeof value.nome === 'string' && value.nome.trim() ? value.nome : getPokemon(value.specieId)!.nome,
    xp: 0,
  }
  if (pokemon.nome !== value.nome || !finite(value.xp) || value.xp < 0) warn(`${label}: recuperati nome o esperienza mancanti.`)
  else if (value.xp > 0) warn(`${label}: rimossa l’esperienza accumulata dal vecchio salvataggio; livelli, HP e status restano invariati. L’EXP si usa subito e non si accumula.`)
  if (pokemon.hp > calcolaHPMax(pokemon)) {
    pokemon.hp = calcolaHPMax(pokemon)
    warn(`${label}: HP oltre il massimo corretti senza applicare una cura.`)
  }
  if (value.stato !== undefined) {
    const status = value.stato
    if (isSaveRecord(status) && ['Paralizzato', 'Confuso', 'Addormentato', 'Avvelenato'].includes(status.tipo as string)
      && Number.isInteger(status.turniRimanenti) && (status.turniRimanenti as number) >= -1
      && (status.turniTrascorsi === undefined || Number.isInteger(status.turniTrascorsi) && (status.turniTrascorsi as number) >= 0)) {
      pokemon.stato = { tipo: status.tipo as NonNullable<PokemonIstanza['stato']>['tipo'], turniRimanenti: status.turniRimanenti as number,
        ...(status.turniTrascorsi === undefined ? {} : { turniTrascorsi: status.turniTrascorsi as number }) }
    } else warn(`${label}: rimosso uno status non valido.`)
  }
  return pokemon
}

function restorePlayer(value: unknown, fallback: StatoGiocatore, warn: Warn): StatoGiocatore {
  const g = isSaveRecord(value) ? value : {}
  const label = `Giocatore ${fallback.id}`
  if (value !== undefined && !isSaveRecord(value)) warn(`${label}: dati non validi, recuperate le impostazioni iniziali.`)
  const squadra = Array.isArray(g.squadra)
    ? g.squadra.map((p) => restorePokemon(p, warn, label)).filter((p): p is PokemonIstanza => p !== null) : fallback.squadra.map(clearStoredExperience)
  if (g.squadra !== undefined && !Array.isArray(g.squadra)) warn(`${label}: squadra non valida.`)
  const deposito: Record<string, PokemonIstanza> = isSaveRecord(g.deposito) ? {} : Object.fromEntries(Object.entries(fallback.deposito).map(([slot, pokemon]) => [slot, clearStoredExperience(pokemon)]))
  if (g.deposito !== undefined && !isSaveRecord(g.deposito)) warn(`${label}: deposito non valido.`)
  if (isSaveRecord(g.deposito)) for (const [slot, value] of Object.entries(g.deposito)) {
    const parts = /^(\d+):(\d+)$/.exec(slot)
    if (!parts || Number(parts[1]) < 1 || Number(parts[1]) > 30 || Number(parts[2]) < 1 || Number(parts[2]) > 35) {
      warn(`${label}: escluso uno slot del deposito non valido.`)
      continue
    }
    const pokemon = restorePokemon(value, warn, `${label}, deposito`)
    if (pokemon) deposito[slot] = pokemon
  }
  if (squadra.length > 6) {
    for (const pokemon of squadra.splice(6)) {
      let slot: string | undefined
      for (let box = 1; box <= 30 && !slot; box++) for (let i = 1; i <= 35; i++) if (!deposito[`${box}:${i}`]) { slot = `${box}:${i}`; break }
      if (slot) deposito[slot] = pokemon
      else warn(`${label}: deposito pieno, esclusa una creatura oltre i sei slot della squadra.`)
    }
    warn(`${label}: le creature oltre i sei slot sono state spostate nel deposito.`)
  }
  const player = {
    ...fallback, nome: typeof g.nome === 'string' && g.nome.trim() ? g.nome : fallback.nome, squadra, deposito,
    monete: finite(g.monete) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(g.monete))) : fallback.monete,
    cespugliVisitati: restoreSet(g.cespugliVisitati, fallback.cespugliVisitati, (v): v is string => typeof v === 'string', warn, label),
    allenatoriSconfitti: restoreSet(g.allenatoriSconfitti, fallback.allenatoriSconfitti, (v): v is number => finite(v) && Number.isInteger(v) && v > 0, warn, label),
    caselleConsumate: restoreSet(g.caselleConsumate, fallback.caselleConsumate, (v): v is string => typeof v === 'string', warn, label),
    inventario: g.inventario === undefined ? fallback.inventario : normalizeShopInventory(g.inventario, warn),
  }
  if (g.monete !== undefined && g.monete !== player.monete) warn(`${label}: saldo monete corretto a un numero intero valido.`)
  if (g.inventario !== undefined && JSON.stringify(g.inventario) !== JSON.stringify(player.inventario)) warn(`${label}: inventario non valido corretto.`)
  return player
}

const SCENES: SceneId[] = ['lega', 'titolo', 'laboratorio', 'mappa-principale', 'mappa-griglia', 'percorso', 'citta', 'battaglia', 'deposito', 'evoluzione']
const LEGACY_SCENES = new Set(['palestra', 'centro-pokemon', 'squadra'])
const isLegacyNavigation = (value: unknown): boolean => isSaveRecord(value) && typeof value.scena === 'string' && LEGACY_SCENES.has(value.scena)
function restoreNavigation(value: unknown, fallback: NavigazioneScena | null, warn: Warn): NavigazioneScena | null {
  if (value === null && fallback === null) return null
  if (isLegacyNavigation(value)) {
    warn('Una schermata storica non più disponibile è stata recuperata sulla mappa; squadre e progressi restano invariati.')
    return fallback === null ? null : { scena: 'mappa-principale' }
  }
  if (!isSaveRecord(value) || !SCENES.includes(value.scena as SceneId)) {
    if (value !== undefined) warn('Una schermata non valida è stata recuperata.')
    return fallback
  }
  const payload = isSaveRecord(value.payload) ? { ...value.payload } : undefined
  if (payload) {
    if (typeof payload.luogo !== 'string') delete payload.luogo
    if (typeof payload.luogoRitorno !== 'string') delete payload.luogoRitorno
    if (value.scena === 'evoluzione') {
      payload.evoluzioni = Array.isArray(payload.evoluzioni) ? payload.evoluzioni.filter((e) =>
        isSaveRecord(e) && typeof e.istanzaId === 'string' && finite(e.oldSpecieId) && finite(e.newSpecieId)
        && getPokemon(e.oldSpecieId)?.evoluzioneId === e.newSpecieId) : []
      if (payload.giocatoreId !== 1 && payload.giocatoreId !== 2) payload.giocatoreId = 1
    }
  }
  return { scena: value.scena as SceneId, ...(payload ? { payload } : {}) }
}

function restoreBattle(value: unknown, warn: Warn): StatoBattaglia | null {
  if (value === undefined || value === null) return null
  if (!isSaveRecord(value) || !['Selvatico', 'NPC', 'PVP'].includes(value.tipo as string)
    || !finite(value.hpMaxA) || value.hpMaxA <= 0 || !finite(value.hpMaxB) || value.hpMaxB <= 0
    || !['A', 'B'].includes(value.turnoCorrente as string) || typeof value.luogoRitorno !== 'string') {
    warn('La battaglia incompleta è stata chiusa; la squadra resta salvata.')
    return null
  }
  const pokemonA = restorePokemon(value.pokemonA, warn, 'Battaglia A')
  const pokemonB = restorePokemon(value.pokemonB, warn, 'Battaglia B')
  if (!pokemonA || !pokemonB) { warn('La battaglia incompleta è stata chiusa; la squadra resta salvata.'); return null }
  const roster = (items: unknown) => Array.isArray(items) ? items.map((p) => restorePokemon(p, warn, 'Squadra in battaglia')).filter((p): p is PokemonIstanza => p !== null) : undefined
  const battle: StatoBattaglia = {
    tipo: value.tipo as StatoBattaglia['tipo'], pokemonA, pokemonB, hpMaxA: value.hpMaxA, hpMaxB: value.hpMaxB,
    turnoCorrente: value.turnoCorrente as StatoBattaglia['turnoCorrente'], luogoRitorno: value.luogoRitorno,
    log: Array.isArray(value.log) ? value.log.filter((v): v is string => typeof v === 'string') : [],
    evoluzioneInAttesa: isSaveRecord(value.evoluzioneInAttesa) && typeof value.evoluzioneInAttesa.istanzaId === 'string' && finite(value.evoluzioneInAttesa.nuovaSpecieId)
      ? { istanzaId: value.evoluzioneInAttesa.istanzaId, nuovaSpecieId: value.evoluzioneInAttesa.nuovaSpecieId } : null,
    ...(finite(value.allenatoreId) ? { allenatoreId: value.allenatoreId } : {}),
    ...(value.ricompenseApplicate === true ? { ricompenseApplicate: true } : {}),
    ...(Array.isArray(value.squadraA) ? { squadraA: roster(value.squadraA) } : {}),
    ...(Array.isArray(value.squadraB) ? { squadraB: roster(value.squadraB) } : {}),
    ...(value.cronaca === undefined ? {} : { cronaca: normalizeBattleChronicle(value.cronaca) }),
  }
  if (value.leagueBattle !== undefined) {
    const reference = value.leagueBattle
    if (isSaveRecord(reference) && typeof reference.runId === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(reference.runId)
      && Number.isSafeInteger(reference.stageIndex) && (reference.stageIndex as number) >= 0 && (reference.stageIndex as number) <= 4
      && (reference.playerId === 1 || reference.playerId === 2)) {
      battle.leagueBattle = { runId: reference.runId, stageIndex: reference.stageIndex as number, playerId: reference.playerId }
    } else { warn('La battaglia della Lega non ha un riferimento valido.'); return null }
  }
  if (isSaveRecord(value.checkpoint)) {
    battle.checkpoint = restoreBattleCheckpoint({ ...battle, checkpoint: value.checkpoint as unknown as NonNullable<StatoBattaglia['checkpoint']> })
    if (value.checkpoint.version !== 1 || value.checkpoint.phase !== battle.checkpoint.phase
      || value.checkpoint.initialPriority !== battle.checkpoint.initialPriority) warn('Recuperato un checkpoint della battaglia non valido.')
  } else if (value.checkpoint !== undefined) warn('Rimosso un checkpoint della battaglia non valido.')
  if (isSaveRecord(value.seeded) && value.seeded.algorithm === 'arkamon-counter-v1') {
    try { battle.seeded = createSeededRandomState(value.seeded.seed as string, value.seeded.cursor as number) }
    catch { warn('Rimosso uno stato dei dadi non valido.') }
  }
  if (Number.isSafeInteger(value.challengeActionCount) && (value.challengeActionCount as number) >= 0 && (value.challengeActionCount as number) <= 100_000) battle.challengeActionCount = value.challengeActionCount as number
  return battle
}

function restoreLocalPositions(value: unknown, warn: Warn): PosizioniMappeLocali {
  if (value === undefined) return {}
  if (!isSaveRecord(value)) { warn('Recuperate le posizioni sulle mappe locali.'); return {} }
  const positions: PosizioniMappeLocali = {}
  for (const [luogo, nodeId] of Object.entries(value)) {
    const map = getLocalMap(luogo)
    if (map) {
      positions[luogo] = getLocalMapNode(map, typeof nodeId === 'string' ? nodeId : undefined).id
      if (positions[luogo] !== nodeId) warn(`${luogo}: punto non valido, ripristinato l’ingresso.`)
    } else warn(`Rimossa la posizione su una mappa non disponibile: ${luogo}.`)
  }
  return positions
}

/** Owned creatures are canonical. A later duplicate is recovered rather than
 * deleted, but no live battle/evolution may guess which original ID it meant. */
function restoreInstanceIdentity(state: GameSaveState, warn: Warn): void {
  const owned = [state.giocatore1, state.giocatore2].flatMap((player) => [...player.squadra, ...Object.values(player.deposito)])
  const reserved = new Set(owned.map((pokemon) => pokemon.istanzaId))
  const existingBattle = state.battaglia
  if (existingBattle) for (const pokemon of [existingBattle.pokemonA, existingBattle.pokemonB, ...(existingBattle.squadraA ?? []), ...(existingBattle.squadraB ?? [])]) reserved.add(pokemon.istanzaId)
  for (const pokemon of state.league.winner?.team ?? []) reserved.add(pokemon.istanzaId)
  const seen = new Set<string>(), ambiguous = new Set<string>()
  const recover = (pokemon: PokemonIstanza): PokemonIstanza => {
    const id = pokemon.istanzaId
    if (!seen.has(id)) { seen.add(id); return pokemon }
    ambiguous.add(id)
    let suffix = 1
    while (reserved.has(`${id}-recovered-${suffix}`)) suffix++
    const recoveredId = `${id}-recovered-${suffix}`
    reserved.add(recoveredId); seen.add(recoveredId)
    return { ...pokemon, istanzaId: recoveredId }
  }
  for (const player of [state.giocatore1, state.giocatore2]) {
    player.squadra = player.squadra.map(recover)
    player.deposito = Object.fromEntries(Object.entries(player.deposito).map(([slot, pokemon]) => [slot, recover(pokemon)]))
  }
  if (ambiguous.size) warn('Recuperate identità duplicate: la prima creatura conserva l’identificatore, le successive ricevono un nuovo identificatore. Specie, livelli, HP e status sono conservati.')
  const battle = state.battaglia
  if (battle) {
    const sideA = battle.squadraA ?? [battle.pokemonA], sideB = battle.squadraB ?? [battle.pokemonB]
    const idsA = sideA.map((pokemon) => pokemon.istanzaId), idsB = sideB.map((pokemon) => pokemon.istanzaId)
    const canonical = new Map([state.giocatore1, state.giocatore2].flatMap((player) => [...player.squadra, ...Object.values(player.deposito)]).map((pokemon) => [pokemon.istanzaId, pokemon]))
    const inconsistentSpecies = (active: PokemonIstanza, roster: PokemonIstanza[]) => roster.find((pokemon) => pokemon.istanzaId === active.istanzaId)?.specieId !== active.specieId
    const ambiguousReference = [...idsA, ...idsB, battle.pokemonA.istanzaId, battle.pokemonB.istanzaId,
      ...(battle.checkpoint?.evolutions.map((evolution) => evolution.istanzaId) ?? []),
      ...(battle.evoluzioneInAttesa ? [battle.evoluzioneInAttesa.istanzaId] : [])].some((id) => ambiguous.has(id))
    if (ambiguousReference || new Set(idsA).size !== idsA.length || new Set(idsB).size !== idsB.length
      || idsA.some((id) => idsB.includes(id)) || !idsA.includes(battle.pokemonA.istanzaId) || !idsB.includes(battle.pokemonB.istanzaId)
      || inconsistentSpecies(battle.pokemonA, sideA) || inconsistentSpecies(battle.pokemonB, sideB)
      || sideA.some((pokemon) => canonical.get(pokemon.istanzaId)?.specieId !== pokemon.specieId)
      || sideB.some((pokemon) => canonical.has(pokemon.istanzaId) && canonical.get(pokemon.istanzaId)!.specieId !== pokemon.specieId)) {
      state.battaglia = null
      warn('La battaglia aveva riferimenti a creature ambigui o incoerenti ed è stata chiusa senza applicare ricompense. Le creature recuperate restano disponibili.')
    }
  }
  for (const key of ['scenaCorrente', 'scenaPrecedente'] as const) {
    const scene = state[key]
    if (scene?.scena === 'evoluzione' && Array.isArray(scene.payload?.evoluzioni)
      && scene.payload.evoluzioni.some((entry) => isSaveRecord(entry) && ambiguous.has(String(entry.istanzaId)))) {
      if (key === 'scenaPrecedente') state.scenaPrecedente = null
      else state.scenaCorrente = { scena: 'mappa-principale' }
      warn('Una presentazione di evoluzione con identità ambigua è stata chiusa; nessun nuovo livello o evoluzione è stato assegnato.')
    }
  }
}

export function normalizeGameSave(persisted: unknown, fallback: GameSaveState = initialGameSave()): { state: GameSaveState; warnings: string[] } {
  const warnings: string[] = []
  const warn: Warn = (message) => { if (!warnings.includes(message)) warnings.push(message) }
  const p = isSaveRecord(persisted) ? persisted : {}
  if (persisted !== undefined && !isSaveRecord(persisted)) warn('Il salvataggio non era valido: recuperate le impostazioni iniziali.')
  const turn = isSaveRecord(p.turnoOverworld) ? p.turnoOverworld : {}
  const turnoOverworld: StatoTurnoOverworld = {
    giocatoreAttivo: turn.giocatoreAttivo === 2 ? 2 : 1,
    azioniRimaste: finite(turn.azioniRimaste) && Number.isInteger(turn.azioniRimaste) ? Math.min(2, Math.max(0, turn.azioniRimaste)) : 2,
  }
  if (p.turnoOverworld !== undefined && (turn.giocatoreAttivo !== turnoOverworld.giocatoreAttivo || turn.azioniRimaste !== turnoOverworld.azioniRimaste)) warn('Recuperato il turno della mappa.')
  const state: GameSaveState = {
    league: normalizeLeagueState(p.league, (v) => restorePokemon(v, warn, 'Squadra del Campione'), warn),
    giocatore1: restorePlayer(p.giocatore1, fallback.giocatore1, warn), giocatore2: restorePlayer(p.giocatore2, fallback.giocatore2, warn),
    giocatoreAttivo: p.giocatoreAttivo === 2 ? 2 : 1,
    rivaleStarterId: finite(p.rivaleStarterId) && !!getPokemon(p.rivaleStarterId) ? p.rivaleStarterId : null,
    battaglia: restoreBattle(p.battaglia, warn), scenaCorrente: restoreNavigation(p.scenaCorrente, fallback.scenaCorrente, warn)!,
    scenaPrecedente: restoreNavigation(p.scenaPrecedente, null, warn), posizione1: restorePosition(p.posizione1, warn, 'Giocatore 1'),
    posizione2: restorePosition(p.posizione2, warn, 'Giocatore 2'), turnoOverworld,
    posizioniLocali1: restoreLocalPositions(p.posizioniLocali1, warn), posizioniLocali2: restoreLocalPositions(p.posizioniLocali2, warn),
    audioMuted: typeof p.audioMuted === 'boolean' ? p.audioMuted : fallback.audioMuted,
    interactionProgress: normalizeInteractionProgress(p.interactionProgress),
    fallbackLocationActivity: isSaveRecord(p.fallbackLocationActivity)
      && (p.fallbackLocationActivity.playerId === 1 || p.fallbackLocationActivity.playerId === 2)
      && typeof p.fallbackLocationActivity.location === 'string'
      ? { playerId: p.fallbackLocationActivity.playerId, location: p.fallbackLocationActivity.location }
      : null,
    arkadex: normalizeArkadexProgress(p.arkadex), matchLog: normalizeMatchLog(p.matchLog),
  }
  restoreInstanceIdentity(state, warn)
  // Obsolete management routes must not strand a still-valid battle behind the map.
  if (isLegacyNavigation(p.scenaCorrente) && state.battaglia) state.scenaCorrente = { scena: 'battaglia' }
  state.arkadex = deriveArkadexProgress(state.arkadex, state)
  if (state.battaglia?.leagueBattle) {
    const reference = state.battaglia.leagueBattle
    const progress = state.league.players[reference.playerId]
    const opponent = state.league.config ? leagueTrainer(state.league.config, reference.stageIndex) : null
    if (!opponent || progress.status !== 'running' || progress.runId !== reference.runId || progress.nextStage !== reference.stageIndex
      || state.giocatoreAttivo !== reference.playerId || state.battaglia.tipo !== 'PVP') {
      state.battaglia = null
      state.scenaCorrente = { scena: 'lega' }
      warn('Il riferimento alla battaglia della Lega non coincide con il progresso: riprendi dall’ingresso della Lega.')
    } else state.battaglia = { ...state.battaglia, leagueOpponent: opponent, allenatoreId: opponent.id }
  } else if (state.battaglia?.luogoRitorno === 'lega') {
    state.battaglia = null
    state.scenaCorrente = { scena: 'lega' }
    warn('Rimossa una battaglia della Lega priva di riferimento.')
  }
  const runningPlayer = ([1, 2] as const).find((id) => state.league.players[id].status === 'running')
  if (runningPlayer) {
    const other = runningPlayer === 1 ? 2 : 1
    if (state.league.players[other].status === 'running') {
      state.league.players[other] = { ...state.league.players[other], status: 'defeated' }
      warn('Due tentativi della Lega risultavano simultanei: recuperato il primo tentativo.')
    }
    state.giocatoreAttivo = runningPlayer
    state.turnoOverworld = { giocatoreAttivo: runningPlayer, azioniRimaste: 0 }
    if (!state.battaglia && state.scenaCorrente.scena !== 'evoluzione') state.scenaCorrente = { scena: 'lega' }
  }
  if (state.league.winner && state.scenaCorrente.scena !== 'evoluzione') state.scenaCorrente = { scena: 'lega' }
  for (const player of [state.giocatore1, state.giocatore2]) {
    if (!isTeamWithinLevelCap(player.squadra)) warn(`Giocatore ${player.id}: ${teamCapMessage(player.squadra)} Livelli e HP sono stati conservati.`)
  }
  if (state.scenaCorrente.scena === 'battaglia' && !state.battaglia) state.scenaCorrente = { scena: 'mappa-principale' }
  for (const id of [1, 2] as const) {
    const positionKey = id === 1 ? 'posizione1' : 'posizione2'
    if (isSecretLocationPosition(state[positionKey]) && !hasUnlockedSecretLocation(state[id === 1 ? 'giocatore1' : 'giocatore2'])) {
      state[positionKey] = mainMapPosition(SECRET_LOCATION_ORIGIN)
      warn(`Giocatore ${id}: il luogo segreto resta bloccato fino alle otto palestre.`)
    }
  }
  const playerKey = state.giocatoreAttivo === 1 ? 'giocatore1' : 'giocatore2'
  const positionKey = state.giocatoreAttivo === 1 ? 'posizione1' : 'posizione2'
  const permitted = (scene: NavigazioneScena) => scene.payload?.luogo !== SECRET_LOCATION_ID
    || scene.scena === 'percorso' && canAccessSecretLocation(state[playerKey], state[positionKey])
  if (!permitted(state.scenaCorrente)) state.scenaCorrente = { scena: 'mappa-principale' }
  if (state.scenaPrecedente && !permitted(state.scenaPrecedente)) state.scenaPrecedente = null
  if (state.battaglia?.luogoRitorno === SECRET_LOCATION_ID && !canAccessSecretLocation(state[playerKey], state[positionKey])) {
    state.battaglia = null
    if (state.scenaCorrente.scena === 'battaglia') state.scenaCorrente = { scena: 'mappa-principale' }
  }
  if (!state.battaglia && state.interactionProgress.pendingBattle) {
    state.interactionProgress = { ...state.interactionProgress, pendingBattle: null }
    warn('Rimosso il riferimento a una sfida non più disponibile; i progressi già completati restano salvati.')
  }
  return { state, warnings }
}

/** Never serializes functions, UI settings from other stores or unknown root fields. */
export function serializeGameState(state: GameSaveState): Record<string, unknown> {
  const player = (g: StatoGiocatore) => ({ ...g,
    squadra: g.squadra.map(clearStoredExperience),
    deposito: Object.fromEntries(Object.entries(g.deposito).map(([slot, pokemon]) => [slot, clearStoredExperience(pokemon)])),
    cespugliVisitati: [...g.cespugliVisitati], allenatoriSconfitti: [...g.allenatoriSconfitti], caselleConsumate: [...g.caselleConsumate] })
  const battaglia = state.battaglia ? { ...state.battaglia,
    ...(state.battaglia.cronaca ? { cronaca: normalizeBattleChronicle(state.battaglia.cronaca) } : {}),
    pokemonA: clearStoredExperience(state.battaglia.pokemonA), pokemonB: clearStoredExperience(state.battaglia.pokemonB),
    ...(state.battaglia.squadraA ? { squadraA: state.battaglia.squadraA.map(clearStoredExperience) } : {}),
    ...(state.battaglia.squadraB ? { squadraB: state.battaglia.squadraB.map(clearStoredExperience) } : {}),
  } : null
  return {
    giocatore1: player(state.giocatore1), giocatore2: player(state.giocatore2), giocatoreAttivo: state.giocatoreAttivo,
    battaglia, rivaleStarterId: state.rivaleStarterId, posizione1: state.posizione1, posizione2: state.posizione2,
    turnoOverworld: state.turnoOverworld, posizioniLocali1: state.posizioniLocali1, posizioniLocali2: state.posizioniLocali2,
    scenaCorrente: state.scenaCorrente, scenaPrecedente: state.scenaPrecedente, audioMuted: state.audioMuted,
    interactionProgress: state.interactionProgress,
    fallbackLocationActivity: state.fallbackLocationActivity ?? null,
    arkadex: state.arkadex, matchLog: state.matchLog, league: state.league,
  }
}
