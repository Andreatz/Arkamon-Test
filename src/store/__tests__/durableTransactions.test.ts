import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALLENATORI } from '@/data'
import { getLocalMap } from '@/data/localMaps'
import { initialGameSave, GAME_SAVE_STORAGE_KEY, serializeGameState } from '@/save/gamePersistence'
import { AUTO_BACKUP_STORAGE_KEY, cancelPendingRecoveryCopy, flushPendingRecoveryCopy, readRecoveryCopies, useSaveWriteStatus } from '@/save/durableWrites'
import { newInteractionDefinition } from '@/interactions/types'
import { useInteractionStore } from '@/interactions/interactionStore'
import { useGameStore } from '../gameStore'
import { launchChallenge, exitChallenge } from '@/challenges/challengeRuntime'
import { createChallengeSession } from '@/challenges/challengeRules'
import { ACTIVE_CHALLENGE_STORAGE_KEY } from '@/challenges/challengePersistence'
import type { PokemonIstanza } from '@/types'
import { resolveItemEffect } from '@/shop/itemEffects'
import { normalizeBattleChronicle } from '@/components/battle/battleChronicle'

const disk = vi.hoisted(() => {
  const values = new Map<string, string>(), writes: string[] = [], blocked = new Set<string>()
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); if (blocked.has(key)) throw new Error('QuotaExceededError'); values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  })
  return { values, writes, blocked }
})

const creature = (id: string, hp = 7): PokemonIstanza => ({ istanzaId: id, specieId: 1, nome: id, livello: 5, hp, xp: 0 })
const primaryWrites = () => disk.writes.filter(key => key === GAME_SAVE_STORAGE_KEY).length

function campaign() {
  const state = initialGameSave()
  state.giocatore1 = { ...state.giocatore1, nome: 'Campagna uno', monete: 300, squadra: [creature('one')], inventario: { masterball: 3 } }
  state.giocatore2 = { ...state.giocatore2, nome: 'Campagna due', monete: 100, squadra: [creature('two')] }
  state.scenaCorrente = { scena: 'mappa-principale' }
  useGameStore.setState({ ...state, challengeContext: null, campaignRevision: 0 })
  disk.writes.length = 0
  return useGameStore.getState()
}

describe('durable compound gameplay transactions', () => {
  beforeEach(() => {
    cancelPendingRecoveryCopy()
    disk.blocked.clear(); disk.values.clear(); disk.writes.length = 0
    useSaveWriteStatus.getState().clear()
    useSaveWriteStatus.setState({ backupWarning: null })
    useInteractionStore.setState({ interactions: [] })
    campaign()
  })
  afterEach(() => { cancelPendingRecoveryCopy(); disk.blocked.clear(); vi.restoreAllMocks() })

  it('retries NPC reward, updated roster, configured prize, cleanup and navigation as one write and one publication', () => {
    const trainer = ALLENATORI.find(entry => entry.tipo === 'NPC')!
    const original = creature('one')
    const finalPokemon = { ...original, livello: 6, hp: 2, stato: { tipo: 'Paralizzato' as const, turniRimanenti: -1 } }
    const target = { ...creature('interaction-prize-1-0', 0), specieId: 13 }
    useGameStore.setState(state => ({ scenaCorrente: { scena: 'battaglia' },
      battaglia: { tipo: 'NPC', allenatoreId: trainer.id, pokemonA: finalPokemon, pokemonB: target, squadraA: [finalPokemon], squadraB: [target],
        hpMaxA: 13, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended', openingComplete: true,
          outcome: 'vittoria', evolutions: [], rivalMessages: [] } },
      interactionProgress: { ...state.interactionProgress, pendingBattle: { interactionId: 'prize', playerId: 1, title: 'Sfida speciale',
        mapId: 'Venezia', nodeId: getLocalMap('Venezia')!.startNode, scope: 'player', reward: { coins: 50, items: { masterball: 2 } } } },
    }))
    const before = useGameStore.getState(), diskBefore = new Map(disk.values)
    let publications = 0
    const unsubscribe = useGameStore.subscribe(() => { publications++ })
    disk.writes.length = 0; disk.blocked.add(GAME_SAVE_STORAGE_KEY)
    const complete = () => {
      const actions = useGameStore.getState()
      actions.risolviBattagliaNPC('vittoria')
      actions.aggiornaPokemon(1, finalPokemon)
      actions.terminaBattaglia(false)
      actions.vaiAScena('citta', { luogo: 'Venezia' })
    }
    expect(before.eseguiTransazione(complete)).toBe(false)
    expect(useGameStore.getState()).toBe(before)
    expect(disk.values).toEqual(diskBefore)
    expect(publications).toBe(0)
    expect(primaryWrites()).toBe(1)
    const retry = useSaveWriteStatus.getState().retry!
    expect(useSaveWriteStatus.getState()).toMatchObject({ local: false, error: expect.any(String) })
    disk.blocked.delete(GAME_SAVE_STORAGE_KEY); disk.writes.length = 0
    expect(retry()).toBe(true)
    const after = useGameStore.getState()
    expect(after.giocatore1).toMatchObject({ monete: 550, squadra: [finalPokemon], inventario: { masterball: 5 } })
    expect(after.giocatore1.allenatoriSconfitti.has(trainer.id)).toBe(true)
    expect(after.giocatore2).toEqual(before.giocatore2)
    expect(after.battaglia).toBeNull()
    expect(after.interactionProgress.pendingBattle).toBeNull()
    expect(after.interactionProgress.completed1).toEqual(['prize'])
    expect(after.interactionProgress.log1).toHaveLength(1)
    expect(after.scenaCorrente).toEqual({ scena: 'citta', payload: { luogo: 'Venezia' } })
    expect(primaryWrites()).toBe(1)
    expect(publications).toBe(1)
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!).state).toEqual(serializeGameState(after))
    expect(retry()).toBe(false)
    after.risolviBattagliaNPC('vittoria')
    expect(useGameStore.getState().giocatore1.monete).toBe(550)
    expect(primaryWrites()).toBe(1)
    expect(useSaveWriteStatus.getState().error).toBeNull()
    unsubscribe()
  })

  it('keeps interaction costs, rewards, completion and shared turn intact until a durable retry', () => {
    const map = getLocalMap('Venezia')!
    const entry = newInteractionDefinition('Venezia', map.startNode, 'durable-dialogue')
    entry.title = 'Aiuto al porto'; entry.dialogue = 'Ricompensa consegnata.'
    entry.cost = { coins: 100, items: { masterball: 1 } }
    entry.reward = { coins: 30, items: { masterball: 2 } }
    useInteractionStore.setState({ interactions: [entry] })
    useGameStore.setState(state => ({ posizione1: { ...state.posizione1, luogo: 'Venezia' },
      posizioniLocali1: { Venezia: map.startNode }, scenaCorrente: { scena: 'citta', payload: { luogo: 'Venezia' } } }))
    const before = useGameStore.getState(), diskBefore = new Map(disk.values)
    disk.blocked.add(GAME_SAVE_STORAGE_KEY); disk.writes.length = 0
    expect(before.eseguiInterazioneConfigurata(1, entry.id)).toMatchObject({ ok: false, message: expect.stringContaining('non salvata') })
    expect(useGameStore.getState()).toBe(before)
    expect(disk.values).toEqual(diskBefore)
    const retry = useSaveWriteStatus.getState().retry!
    disk.blocked.clear(); disk.writes.length = 0
    expect(retry()).toBe(true)
    const after = useGameStore.getState()
    expect(after.giocatore1).toMatchObject({ monete: 230, inventario: { masterball: 4 }, squadra: before.giocatore1.squadra })
    expect(after.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    expect(after.interactionProgress.completed1).toEqual([entry.id])
    expect(after.interactionProgress.log1).toHaveLength(1)
    expect(after.matchLog.events.filter(event => event.kind === 'interaction')).toHaveLength(1)
    expect(primaryWrites()).toBe(1)
    expect(retry()).toBe(false)
    expect(useGameStore.getState().giocatore1.monete).toBe(230)
  })

  it('returns false for a refused movement write and preserves both position and remaining actions', () => {
    const before = useGameStore.getState(), diskBefore = new Map(disk.values)
    disk.blocked.add(GAME_SAVE_STORAGE_KEY)
    expect(before.muoviAvatarMappaPrincipale(1, 'Venezia')).toBe(false)
    expect(useGameStore.getState()).toBe(before)
    expect(disk.values).toEqual(diskBefore)
    disk.blocked.clear(); disk.writes.length = 0
    expect(useSaveWriteStatus.getState().retry?.()).toBe(true)
    expect(useGameStore.getState().posizione1.luogo).toBe('Venezia')
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(primaryWrites()).toBe(1)
  })

  it('discards a stale retry after another campaign change instead of overwriting its new progress', () => {
    disk.blocked.add(GAME_SAVE_STORAGE_KEY)
    expect(useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Venezia')).toBe(false)
    const retry = useSaveWriteStatus.getState().retry!
    disk.blocked.clear()
    const frozen = useGameStore.getState()
    frozen.impostaNomeGiocatore(1, 'Nome bloccato')
    frozen.vaiAScena('citta', { luogo: 'Venezia' })
    expect(useGameStore.getState()).toBe(frozen)
    expect(useSaveWriteStatus.getState().retry).toBe(retry)
    // A confirmed external restore publishes directly after its own durable write.
    // Normal gameplay writes above must remain frozen while this retry is pending.
    useGameStore.setState({ giocatore1: { ...frozen.giocatore1, nome: 'Nuova decisione' } })
    const current = useGameStore.getState(), saved = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    disk.writes.length = 0
    expect(retry()).toBe(false)
    expect(useGameStore.getState()).toBe(current)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(saved)
    expect(current.posizione1.luogo).toBe('Pordenone')
    expect(current.giocatore1.nome).toBe('Nuova decisione')
    expect(primaryWrites()).toBe(0)
  })

  it('keeps both named actors unchanged until one compound name confirmation is durably retried', () => {
    useGameStore.setState({ scenaCorrente: { scena: 'laboratorio' } })
    const before = useGameStore.getState(), saved = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    disk.writes.length = 0; disk.blocked.add(GAME_SAVE_STORAGE_KEY)
    expect(before.eseguiTransazione(read => {
      read().impostaNomeGiocatore(1, 'Ada durable')
      read().impostaNomeGiocatore(2, 'Bruno durable')
    })).toBe(false)
    expect(useGameStore.getState()).toBe(before)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(saved)
    expect(primaryWrites()).toBe(1)
    const retry = useSaveWriteStatus.getState().retry!
    disk.blocked.clear(); disk.writes.length = 0
    expect(retry()).toBe(true)
    expect(useGameStore.getState().giocatore1.nome).toBe('Ada durable')
    expect(useGameStore.getState().giocatore2.nome).toBe('Bruno durable')
    expect(primaryWrites()).toBe(1)
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!).state.giocatore1.nome).toBe('Ada durable')
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!).state.giocatore2.nome).toBe('Bruno durable')
  })

  it('stages a local-map pass and its destination together, using the staged actor rather than the published actor', () => {
    useGameStore.setState(state => ({
      posizione1: { ...state.posizione1, luogo: 'Venezia' },
      posizione2: { ...state.posizione2, luogo: 'Pordenone' },
      posizioniLocali1: { Venezia: getLocalMap('Venezia')!.startNode },
      scenaCorrente: { scena: 'citta', payload: { luogo: 'Venezia' } },
    }))
    const before = useGameStore.getState(), saved = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    disk.writes.length = 0; disk.blocked.add(GAME_SAVE_STORAGE_KEY)
    expect(before.eseguiTransazione(read => {
      expect(read().passaTurnoMappaLocale()).toBe(true)
      const staged = read()
      expect(staged.giocatoreAttivo).toBe(2)
      expect(useGameStore.getState().giocatoreAttivo).toBe(1)
      const world = staged.giocatoreAttivo === 1 ? staged.posizione1 : staged.posizione2
      const target = getLocalMap(world.luogo ?? '')
      if (target && staged.apriMappaLocale(staged.giocatoreAttivo, target.id)) {
        staged.vaiAScena('citta', { luogo: target.id })
      } else staged.vaiAScena('mappa-principale')
    })).toBe(false)
    expect(useGameStore.getState()).toBe(before)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(saved)
    expect(primaryWrites()).toBe(1)
    disk.blocked.clear(); disk.writes.length = 0
    expect(useSaveWriteStatus.getState().retry?.()).toBe(true)
    expect(useGameStore.getState()).toMatchObject({
      giocatoreAttivo: 2, turnoOverworld: { giocatoreAttivo: 2, azioniRimaste: 2 },
      scenaCorrente: { scena: 'mappa-principale' },
    })
    expect(primaryWrites()).toBe(1)
  })

  it('preserves a queued item retry when background battle checkpoints and other gameplay writes arrive', () => {
    const pokemonA = creature('one'), pokemonB = { ...creature('enemy'), specieId: 13 }
    useGameStore.setState(state => ({
      giocatore1: { ...state.giocatore1, inventario: { ...state.giocatore1.inventario, potion: 2 } },
      scenaCorrente: { scena: 'battaglia' },
      battaglia: { tipo: 'NPC', pokemonA, pokemonB, squadraA: [pokemonA], squadraB: [pokemonB],
        hpMaxA: 13, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'player', openingComplete: true,
          outcome: null, evolutions: [], rivalMessages: [] } },
    }))
    const before = useGameStore.getState(), saved = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    const healed = resolveItemEffect(pokemonA, 'potion').pokemon!
    disk.writes.length = 0; disk.blocked.add(GAME_SAVE_STORAGE_KEY)
    expect(before.usaOggetto(1, 'potion', { pokemonA: healed, squadraA: [healed], turnoCorrente: 'B',
      checkpoint: { ...before.battaglia!.checkpoint!, phase: 'opponent', actedThisRound: ['A'] },
      log: ['Pozione realmente applicata'] })).toBe(false)
    const pending = useSaveWriteStatus.getState()
    expect(primaryWrites()).toBe(1)
    before.aggiornaBattaglia({ pokemonA, squadraA: [pokemonA], turnoCorrente: 'A', log: ['Checkpoint automatico tardivo'] })
    before.aggiornaMonete(1, 100)
    expect(primaryWrites()).toBe(1)
    expect(useSaveWriteStatus.getState().retry).toBe(pending.retry)
    expect(useSaveWriteStatus.getState().cancel).toBe(pending.cancel)
    expect(useGameStore.getState()).toBe(before)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(saved)
    disk.blocked.clear(); disk.writes.length = 0
    expect(pending.retry?.()).toBe(true)
    const after = useGameStore.getState()
    expect(after.giocatore1.inventario.potion).toBe(1)
    expect(after.giocatore1.monete).toBe(before.giocatore1.monete)
    expect(after.battaglia).toMatchObject({ pokemonA: healed, squadraA: [healed], turnoCorrente: 'B',
      log: ['Pozione realmente applicata'], checkpoint: { phase: 'opponent', actedThisRound: ['A'] } })
    expect(after.campaignRevision).toBe(before.campaignRevision + 1)
    expect(primaryWrites()).toBe(1)
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!).state.battaglia.pokemonA.hp).toBe(healed.hp)
  })

  it('serializes generated and reload-normalized chronicle events identically without writing a duplicate checkpoint', () => {
    const pokemonA = { ...creature('one'), stato: { tipo: 'Paralizzato' as const, turniRimanenti: -1 } }
    const pokemonB = { ...creature('enemy'), specieId: 13 }
    const chronicle = { version: 1 as const, battleId: 'canonical-item', nextSequence: 2, omittedEvents: 0,
      events: [{ id: 'canonical-item:1:item', kind: 'heal' as const, side: 'A' as const, title: 'Pozione su one',
        messages: ['one recupera 3 HP.'], actor: { instanceId: 'one', speciesId: 1, name: 'one', level: 5, hp: 7 },
        hpBefore: 4, hpAfter: 7 }] }
    const afterReload = normalizeBattleChronicle(chronicle)
    expect(afterReload).toEqual(chronicle)
    // This was the cause of the additional write after a retry remounted the scene.
    expect(JSON.stringify(afterReload)).not.toBe(JSON.stringify(chronicle))
    useGameStore.getState().aggiornaStato({
      scenaCorrente: { scena: 'battaglia' },
      battaglia: { tipo: 'NPC', pokemonA, pokemonB, squadraA: [pokemonA], squadraB: [pokemonB],
        hpMaxA: 13, hpMaxB: 12, turnoCorrente: 'B', luogoRitorno: 'Venezia', log: ['one recupera 3 HP.'],
        evoluzioneInAttesa: null, cronaca: chronicle,
        checkpoint: { version: 1, initialPriority: 'A', actedThisRound: ['A'], phase: 'opponent', openingComplete: true,
          outcome: null, evolutions: [], rivalMessages: [] } },
    })
    const before = useGameStore.getState(), diskBefore = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    const serializedBefore = JSON.stringify(serializeGameState(before))
    disk.writes.length = 0
    before.aggiornaBattaglia({ cronaca: afterReload })
    expect(primaryWrites()).toBe(0)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(diskBefore)
    const after = useGameStore.getState()
    expect(JSON.stringify(serializeGameState(after))).toBe(serializedBefore)
    expect(normalizeBattleChronicle(after.battaglia!.cronaca)).toEqual(afterReload)
    expect(after.battaglia).toMatchObject({ pokemonA, squadraA: [pokemonA], turnoCorrente: 'B',
      checkpoint: { phase: 'opponent' }, cronaca: { events: chronicle.events } })
  })

  it('discards a retry after a new campaign generation even when the restored payload is identical', () => {
    const before = useGameStore.getState()
    disk.blocked.add(GAME_SAVE_STORAGE_KEY)
    expect(before.muoviAvatarMappaPrincipale(1, 'Venezia')).toBe(false)
    const retry = useSaveWriteStatus.getState().retry!
    disk.blocked.clear()
    // Restoring an equal backup still remounts the scenes and invalidates old callbacks.
    useGameStore.setState({ ...before, campaignRevision: before.campaignRevision + 1 })
    const restored = useGameStore.getState(), saved = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    disk.writes.length = 0
    expect(retry()).toBe(false)
    expect(useGameStore.getState()).toBe(restored)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(saved)
    expect(primaryWrites()).toBe(0)
  })

  it('recovers staging after a thrown compound action without leaking an intermediate award', () => {
    const before = useGameStore.getState(), saved = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    expect(() => before.eseguiTransazione(() => { before.aggiornaMonete(1, 200); throw new Error('Interrupted operation') })).toThrow('Interrupted operation')
    expect(useGameStore.getState()).toBe(before)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(saved)
    before.aggiornaMonete(1, 10)
    expect(useGameStore.getState().giocatore1.monete).toBe(310)
  })

  it('does not block the primary save when automatic backup quota is exhausted', () => {
    disk.blocked.add(AUTO_BACKUP_STORAGE_KEY)
    expect(useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Venezia')).toBe(true)
    expect(useGameStore.getState().posizione1.luogo).toBe('Venezia')
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!).state.posizione1.luogo).toBe('Venezia')
    expect(useSaveWriteStatus.getState().error).toBeNull()
    flushPendingRecoveryCopy()
    expect(useSaveWriteStatus.getState().backupWarning).toContain('copia automatica')
    expect(readRecoveryCopies()).toEqual([])
  })

  it('keeps challenge transaction writes outside the campaign and its automatic backups', () => {
    const campaignSave = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    const oldCopies = localStorage.getItem(AUTO_BACKUP_STORAGE_KEY)
    expect(launchChallenge(createChallengeSession({ version: 2, mode: 'seed', seed: 'Durable-isolation', speciesIds: [] })).ok).toBe(true)
    disk.writes.length = 0
    expect(useGameStore.getState().eseguiTransazione(() => {
      const actions = useGameStore.getState()
      actions.impostaNomeGiocatore(1, 'Nome solo sfida'); actions.aggiornaMonete(1, 10)
    })).toBe(true)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(campaignSave)
    expect(localStorage.getItem(AUTO_BACKUP_STORAGE_KEY)).toBe(oldCopies)
    expect(disk.writes.filter(key => key === ACTIVE_CHALLENGE_STORAGE_KEY)).toHaveLength(1)
    expect(primaryWrites()).toBe(0)
    expect(exitChallenge().ok).toBe(true)
    expect(useGameStore.getState().giocatore1.nome).toBe('Campagna uno')
  })
})
