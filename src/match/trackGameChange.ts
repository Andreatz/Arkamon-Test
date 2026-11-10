import type { GameSaveState } from '@/save/gamePersistence'
import { deriveArkadexProgress } from '@/arkadex/arkadexModel'
import { appendMatchEvent, emptyMatchLog, type MatchEventInput } from './matchLog'
import { getShopItem } from '@/shop/catalog'

/** Track committed domain changes only. Rendering, previews and checkpoint retries create no history. */
export function trackGameChange(previous: GameSaveState, next: GameSaveState): Pick<GameSaveState, 'arkadex' | 'matchLog'> {
  const reset = next.scenaCorrente.scena === 'titolo' && !next.giocatore1.squadra.length && !next.giocatore2.squadra.length
    && (previous.giocatore1.squadra.length > 0 || previous.giocatore2.squadra.length > 0)
  let log = reset ? emptyMatchLog() : next.matchLog
  const add = (event: MatchEventInput) => { log = appendMatchEvent(log, event) }
  if (reset) {
    add({ kind: 'start', title: 'Nuova partita', message: 'La campagna riparte: progressi individuali e registro azzerati.' })
    return { arkadex: deriveArkadexProgress(next.arkadex, next), matchLog: log }
  }
  if (!log.events.length && previous.scenaCorrente.scena === 'titolo' && next.scenaCorrente.scena === 'laboratorio') {
    add({ kind: 'start', title: 'Nuova partita', message: 'Inizio della campagna di due giocatori.' })
  }
  for (const playerId of [1, 2] as const) {
    const key = playerId === 1 ? 'giocatore1' : 'giocatore2'
    const before = previous[key], after = next[key]
    const ownedBefore = [...before.squadra, ...Object.values(before.deposito)]
    const ownedAfter = [...after.squadra, ...Object.values(after.deposito)]
    const oldInstances = new Map(ownedBefore.map((pokemon) => [pokemon.istanzaId, pokemon]))
    for (const pokemon of ownedAfter) {
      const old = oldInstances.get(pokemon.istanzaId)
      if (!old) add({ id: `owned:${playerId}:${pokemon.istanzaId}`, kind: ownedBefore.length ? 'capture' : 'starter', playerId,
        title: ownedBefore.length ? `${pokemon.nome} entra nella collezione` : `${after.nome} sceglie ${pokemon.nome}`,
        message: `Livello ${pokemon.livello}, ${pokemon.hp} HP. ${after.squadra.some((p) => p.istanzaId === pokemon.istanzaId) ? 'In squadra.' : 'Nel deposito.'}`,
        speciesId: pokemon.specieId })
      else if (old.specieId !== pokemon.specieId) add({ id: `evolution:${playerId}:${pokemon.istanzaId}:${pokemon.specieId}`, kind: 'evolution', playerId,
        title: `${old.nome} si evolve in ${pokemon.nome}`, message: `Livello ${pokemon.livello}. Gli HP residui sono conservati.`, speciesId: pokemon.specieId })
    }
    const placeKey = playerId === 1 ? 'posizione1' : 'posizione2'
    const localKey = playerId === 1 ? 'posizioniLocali1' : 'posizioniLocali2'
    const from = previous[placeKey].luogo, to = next[placeKey].luogo
    if (from !== to && to) add({ kind: 'move', playerId, title: `${after.nome} raggiunge ${to.replace(/_/g, ' ')}`,
      message: `Spostamento da ${from?.replace(/_/g, ' ') ?? 'ingresso'}.`, place: to })
    for (const [place, node] of Object.entries(next[localKey])) if (previous[localKey][place] && previous[localKey][place] !== node) {
      add({ kind: 'move', playerId, title: `Esplorazione di ${place.replace(/_/g, ' ')}`, message: `${after.nome} percorre una strada della mappa locale.`, place })
    }
    if (after.monete < before.monete) {
      const bought = Object.entries(after.inventario).filter(([id, count]) => (count ?? 0) > (before.inventario[id as keyof typeof before.inventario] ?? 0))
      if (bought.length) add({ kind: 'shop', playerId, title: `Acquisto all’Arkastore`, amount: after.monete - before.monete, place: to,
        message: `${bought.map(([id, count]) => `${getShopItem(id)?.name ?? id} ×${count! - (before.inventario[id as keyof typeof before.inventario] ?? 0)}`).join(', ')}. Spesa: ${before.monete - after.monete} monete.` })
    }
    if (before.squadra !== after.squadra || before.deposito !== after.deposito) {
      const oldSlots = new Map(before.squadra.map((p, i) => [p.istanzaId, `s${i}`]))
      for (const [slot, p] of Object.entries(before.deposito)) oldSlots.set(p.istanzaId, slot)
      const changedSlot = after.squadra.some((p, i) => oldSlots.has(p.istanzaId) && oldSlots.get(p.istanzaId) !== `s${i}`)
        || Object.entries(after.deposito).some(([slot, p]) => oldSlots.has(p.istanzaId) && oldSlots.get(p.istanzaId) !== slot)
      if (changedSlot) add({ kind: 'deposit', playerId, title: 'Squadra e deposito aggiornati', message: `${after.nome} organizza la collezione; ${after.squadra.length} Arkamon in squadra.` })
    }
    const oldLog = previous.interactionProgress[playerId === 1 ? 'log1' : 'log2']
    const newLog = next.interactionProgress[playerId === 1 ? 'log1' : 'log2']
    if (newLog !== oldLog && newLog.length) {
      const entry = newLog[newLog.length - 1]
      if (oldLog[oldLog.length - 1] !== entry) add({ kind: 'interaction', playerId, title: entry.title, message: entry.message, place: entry.mapId })
    }
  }
  const battle = next.battaglia ?? previous.battaglia
  if (battle?.pokemonA && battle?.pokemonB) {
    const battleId = battle.cronaca?.battleId ?? battle.pokemonB.istanzaId
    if (!previous.battaglia && next.battaglia) add({ id: `battle:${battleId}:start`, kind: 'battle', playerId: next.giocatoreAttivo,
      title: `Inizia uno scontro contro ${battle.pokemonB.nome}`, message: `${battle.tipo} · livello ${battle.pokemonB.livello}.`, place: battle.luogoRitorno, battleId })
    if (previous.battaglia && !next.battaglia) {
      const outcome = previous.battaglia.checkpoint?.outcome
      add({ id: `battle:${battleId}:end`, kind: 'battle', playerId: previous.giocatoreAttivo, battleId, place: battle.luogoRitorno,
        title: outcome === 'vittoria' ? 'Battaglia vinta' : outcome === 'sconfitta' ? 'Battaglia persa' : 'Battaglia conclusa',
        message: `Contro ${battle.pokemonB.nome}. ${battle.cronaca?.events.length ?? 0} eventi nella cronaca. Gli HP residui restano salvati.` })
    }
    if (next.battaglia && previous.battaglia) {
      for (const pokemon of next.battaglia.squadraA ?? [next.battaglia.pokemonA]) {
        const old = (previous.battaglia.squadraA ?? [previous.battaglia.pokemonA]).find((p) => p.istanzaId === pokemon.istanzaId)
        if (old && old.livello < pokemon.livello) add({ id: `level:${battleId}:${pokemon.istanzaId}:${pokemon.livello}`, kind: 'level', playerId: next.giocatoreAttivo,
          title: `${pokemon.nome} sale di livello`,
          message: `Livello ${old.livello} → ${pokemon.livello}, HP residui ${pokemon.hp}.`, speciesId: pokemon.specieId, battleId })
      }
    }
  }
  return { arkadex: deriveArkadexProgress(next.arkadex, next), matchLog: log }
}
