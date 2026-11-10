import type { BattleChronicle, BattleLogEvent, BattleLogKind, Lato, PokemonIstanza, RisultatoMossa } from '@/types'
import type { BattleAttackResolution } from '@/engine/battleResolution'
import type { applicaXP, risolviStatoInizioTurno } from '@/engine/battleEngine'

export const MAX_BATTLE_LOG_EVENTS = 240
const MAX_BATTLE_ACTION_SEQUENCE = 1_000_000_000
const kinds = new Set<BattleLogKind>(['opening', 'attack', 'status', 'heal', 'ko', 'xp', 'recoil', 'winner', 'switch', 'capture', 'audience', 'outcome'])
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export const logPokemon = (pokemon: PokemonIstanza) => ({ instanceId: pokemon.istanzaId, speciesId: pokemon.specieId, name: pokemon.nome, level: pokemon.livello, hp: pokemon.hp })

export function createBattleChronicle(battleId: string): BattleChronicle {
  return { version: 1, battleId, nextSequence: 1, omittedEvents: 0, events: [] }
}

/** Recover imported counters without reusing the identity of a retained action. */
function availableActionSequence(chronicle: BattleChronicle): number {
  let sequence = Number.isSafeInteger(chronicle.nextSequence) && chronicle.nextSequence > 0
    && chronicle.nextSequence < MAX_BATTLE_ACTION_SEQUENCE ? chronicle.nextSequence : 1
  while (chronicle.events.some((event) => {
    const id = `${chronicle.battleId}:${sequence}`
    return event.id === id || event.id.startsWith(`${id}:`)
  })) {
    sequence += 1
    if (sequence >= MAX_BATTLE_ACTION_SEQUENCE) sequence = 1
  }
  return sequence
}

/** Action IDs are deterministic metadata and must never consume gameplay RNG. */
export function reserveBattleAction(chronicle: BattleChronicle): { actionId: string; chronicle: BattleChronicle } {
  const sequence = availableActionSequence(chronicle)
  return { actionId: `${chronicle.battleId}:${sequence}`, chronicle: { ...chronicle, nextSequence: sequence + 1 } }
}

/** Old/corrupt saves and imported replays cannot introduce unbounded records or invalid dice. */
export function normalizeBattleChronicle(value: unknown, fallbackId = 'recovered'): BattleChronicle {
  const empty = createBattleChronicle(fallbackId)
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.events)) return empty
  const events: BattleLogEvent[] = []
  const ids = new Set<string>()
  for (const item of value.events.slice(-MAX_BATTLE_LOG_EVENTS)) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || item.id.length > 180 || ids.has(item.id)
      || !kinds.has(item.kind as BattleLogKind) || typeof item.title !== 'string') continue
    ids.add(item.id)
    const event: BattleLogEvent = { id: item.id, kind: item.kind as BattleLogKind, title: item.title.slice(0, 240), messages: [] }
    event.messages = (Array.isArray(item.messages) ? item.messages : []).filter((message): message is string => typeof message === 'string').slice(0, 12).map((message) => message.slice(0, 800))
    if (item.side === 'A' || item.side === 'B') event.side = item.side
    if (item.winnerSide === 'A' || item.winnerSide === 'B') event.winnerSide = item.winnerSide
    if (typeof item.supreme === 'boolean') event.supreme = item.supreme
    if (Array.isArray(item.dice) && item.dice.length <= 120 && item.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6)) event.dice = item.dice.slice()
    for (const key of ['diceSum', 'increment', 'baseDamage', 'effectiveness', 'damage', 'hpBefore', 'hpAfter', 'xp', 'levelBefore', 'levelAfter'] as const) {
      if (finite(item[key]) && Math.abs(item[key]) <= 1_000_000) event[key] = item[key]
    }
    for (const key of ['actor', 'target'] as const) {
      const pokemon = item[key]
      if (isRecord(pokemon) && typeof pokemon.instanceId === 'string' && typeof pokemon.name === 'string'
        && Number.isInteger(pokemon.speciesId) && finite(pokemon.speciesId) && pokemon.speciesId > 0 && pokemon.speciesId <= 110
        && finite(pokemon.level) && pokemon.level >= 5 && pokemon.level <= 100 && finite(pokemon.hp) && pokemon.hp >= 0 && pokemon.hp <= 1_000_000) {
        event[key] = { instanceId: pokemon.instanceId.slice(0, 100), speciesId: pokemon.speciesId, name: pokemon.name.slice(0, 100), level: pokemon.level, hp: pokemon.hp }
      }
    }
    events.push(event)
  }
  const normalized: BattleChronicle = {
    version: 1, battleId: typeof value.battleId === 'string' ? value.battleId.slice(0, 100) : fallbackId,
    nextSequence: Number.isSafeInteger(value.nextSequence) && finite(value.nextSequence) && value.nextSequence > 0 ? value.nextSequence : events.length + 1,
    omittedEvents: finite(value.omittedEvents) ? Math.max(0, Math.trunc(value.omittedEvents)) + Math.max(0, value.events.length - MAX_BATTLE_LOG_EVENTS) : Math.max(0, value.events.length - MAX_BATTLE_LOG_EVENTS), events,
  }
  return { ...normalized, nextSequence: availableActionSequence(normalized) }
}

/** Duplicate reveal/complete callbacks are harmless. An unfinished action is never passed here. */
export function appendBattleEvents(chronicle: BattleChronicle, additions: BattleLogEvent[]): BattleChronicle {
  const ids = new Set(chronicle.events.map((event) => event.id))
  const fresh = additions.filter((event) => { if (ids.has(event.id)) return false; ids.add(event.id); return true })
  if (!fresh.length) return chronicle
  const merged = [...chronicle.events, ...fresh]
  const omitted = Math.max(0, merged.length - MAX_BATTLE_LOG_EVENTS)
  return { ...chronicle, omittedEvents: chronicle.omittedEvents + omitted, events: merged.slice(-MAX_BATTLE_LOG_EVENTS) }
}

/** Called by the dice reveal gate, never when a move is selected or calculated. */
export function revealedAttackEvents(result: RisultatoMossa, side: Lato, actionId: string): BattleLogEvent[] {
  const hpAfter = Math.max(0, result.difensore.hp - result.dannoFinale)
  const event: BattleLogEvent = {
    id: `${actionId}:attack`, kind: 'attack', side,
    title: `${result.attaccante.nome} usa ${result.mossa.nome}${result.suprema ? ' · Suprema' : ''}`,
    actor: logPokemon(result.attaccante), target: { ...logPokemon(result.difensore), hp: hpAfter },
    messages: [result.numDadi ? `${result.dannoFinale} danni a ${result.difensore.nome}.` : 'Mossa di status: nessun tiro offensivo.'],
    dice: result.tiriDado.slice(), diceSum: result.tiriDado.reduce((sum, die) => sum + die, 0),
    increment: result.incremento, baseDamage: result.dannoBase, effectiveness: result.moltiplicatoreTipo,
    supreme: result.suprema === true, damage: result.dannoFinale, hpBefore: result.difensore.hp, hpAfter,
  }
  const events = [event]
  if (result.statoApplicato && hpAfter > 0) events.push({ id: `${actionId}:status`, kind: 'status', side, title: `${result.difensore.nome}: ${result.statoApplicato}`, messages: [`Applicato lo status ${result.statoApplicato}.`], actor: event.target })
  if (hpAfter <= 0) events.push({ id: `${actionId}:target-ko`, kind: 'ko', side: side === 'A' ? 'B' : 'A', title: `${result.difensore.nome} è KO`, messages: [], actor: event.target })
  return events
}

export function xpEvent(before: PokemonIstanza, progression: ReturnType<typeof applicaXP> & { xpAssegnata: number }, side: Lato, id: string): BattleLogEvent[] {
  if (!progression.xpAssegnata) return []
  const blocked = progression.xpScartata > 0
  const reason = progression.istanza.livello >= 100 ? 'Livello massimo raggiunto.' : 'Cap di squadra raggiunto.'
  return [{ id, kind: 'xp', side, title: blocked ? `${before.nome}: EXP non accumulata` : `${before.nome} guadagna ${progression.xpAssegnata} XP`, actor: logPokemon(progression.istanza), xp: progression.xpAssegnata, levelBefore: before.livello, levelAfter: progression.istanza.livello,
    messages: [progression.livelliGuadagnati ? `Livello ${before.livello} → ${progression.istanza.livello}. Gli HP residui sono conservati.` : 'Gli HP residui sono conservati.',
      ...(blocked ? [`${reason} L’EXP di questo KO non si accumula e non darà livelli successivamente.`] : [])] }]
}

/** The order is target KO (already revealed), attacker XP, recoil, survivor XP, winner. */
export function settledAttackEvents(result: RisultatoMossa, resolution: BattleAttackResolution, side: Lato, actionId: string): BattleLogEvent[] {
  const events = xpEvent(result.attaccante, { ...resolution.attackerProgression, istanza: resolution.attackerProgression.istanzaPrimaDelContraccolpo }, side, `${actionId}:attacker-xp`)
  const { autodanno, istanzaPrimaDelContraccolpo } = resolution.attackerProgression
  if (autodanno > 0) events.push({ id: `${actionId}:recoil`, kind: 'recoil', side, title: `${result.attaccante.nome}: contraccolpo`, actor: logPokemon(resolution.attacker), damage: autodanno, hpBefore: istanzaPrimaDelContraccolpo.hp, hpAfter: resolution.attacker.hp, messages: [`−${autodanno} HP: metà degli HP massimi dopo l'eventuale avanzamento di livello.`] })
  if (resolution.attacker.hp <= 0) events.push({ id: `${actionId}:attacker-ko`, kind: 'ko', side, title: `${result.attaccante.nome} è KO`, actor: logPokemon(resolution.attacker), messages: [] })
  if (resolution.defenderProgression) events.push(...xpEvent({ ...result.difensore, hp: Math.max(0, result.difensore.hp - result.dannoFinale) }, resolution.defenderProgression, side === 'A' ? 'B' : 'A', `${actionId}:defender-xp`))
  if (resolution.winnerSide) {
    const winner = resolution.winnerSide === side ? resolution.attacker : resolution.defender
    events.push({ id: `${actionId}:winner`, kind: 'winner', side: resolution.winnerSide, winnerSide: resolution.winnerSide, title: `${winner.nome} vince lo scontro`, actor: logPokemon(winner), messages: [resolution.attacker.hp <= 0 && resolution.defender.hp <= 0 ? 'Doppio KO da Suprema: vince l’attaccante che ha abbattuto prima l’avversario.' : 'Vincitore dello scontro fra le creature attive.'] })
  }
  return events
}

export function statusEvents(before: PokemonIstanza, result: ReturnType<typeof risolviStatoInizioTurno>, side: Lato, id: string): BattleLogEvent[] {
  if (!result.messaggi.length) return []
  const dice = result.tiroStato !== undefined ? [result.tiroStato] : before.stato?.tipo === 'Confuso' && result.dannoSubito > 0 ? [result.dannoSubito] : undefined
  return [{ id, kind: 'status', side, title: `${before.nome} · ${before.stato?.tipo ?? 'Status'}`, actor: logPokemon(result.istanza), messages: result.messaggi.slice(), ...(dice ? { dice, diceSum: dice[0] } : {}), damage: result.dannoSubito, hpBefore: before.hp, hpAfter: result.istanza.hp }]
}

export function chronicleText(chronicle: BattleChronicle): string {
  return [`Cronaca Arkamon · ${chronicle.battleId}`, ...(chronicle.omittedEvents ? [`${chronicle.omittedEvents} eventi iniziali omessi.`] : []), ...chronicle.events.flatMap((event, index) => [
    `${index + 1}. ${event.title}`,
    ...(event.dice?.length ? [`Dadi: ${event.dice.join(' + ')} = ${event.diceSum ?? event.dice.reduce((sum, die) => sum + die, 0)}`] : []),
    ...(event.baseDamage !== undefined ? [`Bonus: ${event.increment ?? 0}; base: ${event.baseDamage}; efficacia: ×${event.effectiveness ?? 1}${event.supreme ? '; Suprema: ×2' : ''}; danno finale: ${event.damage ?? 0}`] : []),
    ...(event.hpBefore !== undefined ? [`HP: ${event.hpBefore} → ${event.hpAfter}`] : []), ...event.messages,
  ])].join('\n')
}
