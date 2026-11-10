import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALLENATORI } from '@/data'
import { calcolaHPMax } from '@/engine/battleEngine'
import { isTeamWithinLevelCap } from '@/engine/teamLevelCap'
import { useInteractionStore } from '@/interactions/interactionStore'
import { newInteractionDefinition } from '@/interactions/types'
import { emptyMatchLog, appendMatchEvent } from '@/match/matchLog'
import { initialGameSave, normalizeGameSave, serializeGameState } from '@/save/gamePersistence'
import { serializeGameBackup, stateFromValidatedBackup, validateGameBackup } from '@/save/gameBackup'
import { restoreGameBackup } from '@/save/restoreGameBackup'
import { useSaveWriteStatus } from '@/save/durableWrites'
import { haSpazioPokemon, useGameStore } from '@/store/gameStore'
import type { PokemonIstanza, StatoBattaglia } from '@/types'

const savedValues = vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  })
  return values
})

function pokemon(id: string, level = 5, hp = 3, speciesId = 1): PokemonIstanza {
  return { istanzaId: id, specieId: speciesId, nome: id, livello: level, hp, xp: 0 }
}
function preparedCity() {
  const initial = initialGameSave()
  initial.giocatore1.squadra = [pokemon('one')]
  initial.giocatore2.squadra = [pokemon('two', 5, 8, 5)]
  initial.giocatore1.monete = 300
  initial.giocatore2.monete = 40
  initial.posizione1.luogo = initial.posizione2.luogo = 'Venezia'
  initial.scenaCorrente = { scena: 'citta', payload: { luogo: 'Venezia' } }
  initial.posizioniLocali1 = initial.posizioniLocali2 = { Venezia: 'n56' }
  useGameStore.setState(initial)
  const shop = newInteractionDefinition('Venezia', 'n56', 'test-shop')
  shop.title = 'Arkastore'; shop.action = { kind: 'shop' }; shop.repeatable = true
  useInteractionStore.setState({ interactions: [shop] })
  return useGameStore.getState()
}
function wildBattle(target: PokemonIstanza): StatoBattaglia {
  const state = useGameStore.getState()
  const attacker = state.giocatore1.squadra[0]
  return {
    tipo: 'Selvatico', pokemonA: attacker, pokemonB: target, squadraA: state.giocatore1.squadra,
    hpMaxA: calcolaHPMax(attacker), hpMaxB: calcolaHPMax(target), turnoCorrente: 'A', luogoRitorno: 'Venezia',
    log: [], evoluzioneInAttesa: null,
    checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'player', openingComplete: true, outcome: null, evolutions: [], rivalMessages: [] },
  }
}
function finishCapture(battle: StatoBattaglia): Partial<StatoBattaglia> {
  return { checkpoint: { ...battle.checkpoint!, phase: 'ended', outcome: 'vittoria' } }
}

beforeEach(() => {
  useSaveWriteStatus.getState().clear()
  savedValues.clear()
  useGameStore.getState().reset()
  useGameStore.setState({ challengeContext: null })
  useInteractionStore.setState({ interactions: [] })
})

describe('cap di squadra applicato alle azioni della campagna', () => {
  it.each([1, 2] as const)('sends an out-of-range addition to player %s deposit without changing HP or levels', (playerId) => {
    const state = preparedCity()
    const originalOther = state[playerId === 1 ? 'giocatore2' : 'giocatore1']
    const captured = pokemon('too-high', 11, 1, 13)
    state.aggiungiPokemon(playerId, captured)
    const next = useGameStore.getState()
    const player = next[playerId === 1 ? 'giocatore1' : 'giocatore2']
    expect(player.squadra).toHaveLength(1)
    expect(player.deposito['1:1']).toEqual(captured)
    expect(isTeamWithinLevelCap(player.squadra)).toBe(true)
    expect(next[playerId === 1 ? 'giocatore2' : 'giocatore1']).toEqual(originalOther)
    next.aggiungiPokemon(playerId, captured)
    expect(Object.values(useGameStore.getState()[playerId === 1 ? 'giocatore1' : 'giocatore2'].deposito)).toHaveLength(1)
  })

  it('keeps a new capture exactly five levels above the weakest team member', () => {
    const state = preparedCity()
    const captured = pokemon('boundary', 10, 1, 13)
    state.aggiungiPokemon(1, captured)
    expect(useGameStore.getState().giocatore1.squadra).toEqual([...state.giocatore1.squadra, captured])
    expect(useGameStore.getState().giocatore1.deposito).toEqual({})
  })

  it('rejects a deposit swap that would break the cap and accepts a valid replacement', () => {
    preparedCity()
    const low = pokemon('low', 5, 1), high = pokemon('high', 10, 2), invalid = pokemon('invalid', 20, 3), valid = pokemon('valid', 6, 4)
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, squadra: [low, high], deposito: { '1:1': invalid, '1:2': valid } } }))
    const before = useGameStore.getState().giocatore1
    useGameStore.getState().scambiaSlot(1, { tipo: 'deposito', chiave: '1:1' }, { tipo: 'squadra', indice: 0 })
    expect(useGameStore.getState().giocatore1).toEqual(before)
    expect(useGameStore.getState().teamRuleMessage).toContain('5 livelli')
    useGameStore.getState().scambiaSlot(1, { tipo: 'deposito', chiave: '1:2' }, { tipo: 'squadra', indice: 1 })
    expect(useGameStore.getState().giocatore1.squadra).toEqual([low, valid])
    expect(useGameStore.getState().giocatore1.deposito['1:2']).toEqual(high)
    expect(useGameStore.getState().teamRuleMessage).toBeNull()
  })

  it('preserves an invalid older save and lets the player repair it through the deposit', () => {
    const old = initialGameSave()
    old.giocatore1.squadra = [pokemon('low', 5, 1), pokemon('middle', 15, 2), pokemon('high', 20, 3)]
    old.scenaCorrente = { scena: 'mappa-principale' }
    const recovered = normalizeGameSave(serializeGameState(old))
    expect(recovered.state.giocatore1.squadra).toEqual(old.giocatore1.squadra)
    expect(recovered.warnings.join(' ')).toContain('5 livelli')
    useGameStore.setState(recovered.state)
    const trainer = ALLENATORI.find((entry) => entry.tipo === 'NPC')!
    expect(useGameStore.getState().iniziaBattagliaNPC(trainer.id, trainer.luogo)).toBe(false)
    expect(useGameStore.getState().battaglia).toBeNull()
    expect(useGameStore.getState().giocatore1.squadra).toEqual(old.giocatore1.squadra)
    useGameStore.getState().scambiaSlot(1, { tipo: 'squadra', indice: 0 }, { tipo: 'deposito', chiave: '1:1' })
    expect(useGameStore.getState().giocatore1.squadra).toEqual(old.giocatore1.squadra.slice(1))
    expect(useGameStore.getState().giocatore1.deposito['1:1']).toEqual(old.giocatore1.squadra[0])
    expect(useGameStore.getState().iniziaBattagliaNPC(trainer.id, trainer.luogo)).toBe(true)
  })

  it('blocks direct and configured battles for an invalid team without spending interaction costs', () => {
    preparedCity()
    const invalidTeam = [pokemon('low', 5, 1), pokemon('high', 20, 2)]
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, squadra: invalidTeam } }))
    const before = useGameStore.getState()
    before.iniziaBattaglia(wildBattle(pokemon('target', 5, 2, 13)))
    expect(useGameStore.getState().battaglia).toBeNull()
    const definition = newInteractionDefinition('Venezia', 'n56', 'cap-guard-encounter')
    definition.title = 'Incontro con squadra valida'
    definition.action = { kind: 'encounter', speciesId: 13, level: 5 }
    definition.cost.coins = 50
    useInteractionStore.setState({ interactions: [definition] })
    const result = useGameStore.getState().eseguiInterazioneConfigurata(1, definition.id)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('5 livelli')
    expect(useGameStore.getState().giocatore1).toBe(before.giocatore1)
    expect(useGameStore.getState().giocatore1.monete).toBe(300)
    expect(useGameStore.getState().turnoOverworld).toBe(before.turnoOverworld)
    expect(useGameStore.getState().interactionProgress).toBe(before.interactionProgress)
    expect(useGameStore.getState().battaglia).toBeNull()
  })

  it.each([10, 11])('settles a level %s capture atomically into the eligible team or deposit', (level) => {
    preparedCity()
    const target = pokemon('wild', level, 2, 13)
    const battle = wildBattle(target)
    useGameStore.getState().iniziaBattaglia(battle)
    expect(useGameStore.getState().concludiCattura(1, target, finishCapture(battle), true)).toBe(true)
    const state = useGameStore.getState()
    if (level === 10) expect(state.giocatore1.squadra).toHaveLength(2)
    else {
      expect(state.giocatore1.squadra).toHaveLength(1)
      expect(state.giocatore1.deposito['1:1']).toEqual(target)
    }
    expect(state.giocatore1.inventario.masterball).toBe(0)
    expect(state.battaglia?.checkpoint?.phase).toBe('ended')
    expect(state.arkadex.caught1).toContain(13)
    expect(state.arkadex.caught2).not.toContain(13)
    expect(state.matchLog.events.filter((event) => event.kind === 'capture' && event.speciesId === 13)).toHaveLength(1)
    expect(state.concludiCattura(1, target, finishCapture(battle), true)).toBe(false)
    expect(useGameStore.getState().giocatore1.inventario.masterball).toBe(0)
  })

  it('refuses an out-of-range capture if every deposit slot is occupied, preserving the ball', () => {
    preparedCity()
    const deposit = Object.fromEntries(Array.from({ length: 1050 }, (_, index) => [`${Math.floor(index / 35) + 1}:${index % 35 + 1}`, pokemon(`deposit-${index}`)]))
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, deposito: deposit } }))
    const target = pokemon('too-high', 11, 1, 13), battle = wildBattle(target)
    useGameStore.getState().iniziaBattaglia(battle)
    const before = useGameStore.getState()
    expect(haSpazioPokemon(before.giocatore1)).toBe(true)
    expect(haSpazioPokemon(before.giocatore1, target)).toBe(false)
    expect(haSpazioPokemon(before.giocatore1, { ...target, livello: 10 })).toBe(true)
    expect(before.concludiCattura(1, target, finishCapture(battle), true)).toBe(false)
    expect(useGameStore.getState().giocatore1).toBe(before.giocatore1)
    expect(useGameStore.getState().battaglia).toBe(before.battaglia)
    expect(useGameStore.getState().giocatore1.inventario.masterball).toBe(1)
  })

  it('includes fainted low-level teammates when checking whether the captured target fits a full deposit', () => {
    preparedCity()
    const deposit = Object.fromEntries(Array.from({ length: 1050 }, (_, index) => [`${Math.floor(index / 35) + 1}:${index % 35 + 1}`, pokemon(`deposit-${index}`)]))
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1,
      squadra: [pokemon('low-ko', 5, 0), pokemon('high', 10)], deposito: deposit } }))
    const player = useGameStore.getState().giocatore1
    expect(haSpazioPokemon(player, pokemon('compatible', 10))).toBe(true)
    expect(haSpazioPokemon(player, pokemon('too-high', 11))).toBe(false)
    const availableDeposit = { ...deposit }
    delete availableDeposit['30:35']
    expect(haSpazioPokemon({ ...player, deposito: availableDeposit }, pokemon('too-high', 11))).toBe(true)
  })
})

describe('Arkastore, cura esplicita e registro persistente', () => {
  it('keeps wallet, inventory, turn and match history intact when checkout cannot be saved, then permits retry', () => {
    preparedCity()
    const before = useGameStore.getState(), persistedBefore = localStorage.getItem('arkamon-save')
    const writer = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'arkamon-save') throw new DOMException('Storage pieno', 'QuotaExceededError')
      savedValues.set(key, value)
    })
    try {
      const result = before.acquistaOggetti(1, { potion: 1, 'paralysis-heal': 1 }, 'Venezia', 'test-shop')
      expect(result.ok).toBe(false)
      expect(result.message).toContain('non salvato')
      expect(useGameStore.getState()).toBe(before)
      expect(useGameStore.getState().giocatore1.monete).toBe(300)
      expect(useGameStore.getState().giocatore1.inventario).toBe(before.giocatore1.inventario)
      expect(useGameStore.getState().turnoOverworld).toBe(before.turnoOverworld)
      expect(useGameStore.getState().matchLog).toBe(before.matchLog)
      expect(useGameStore.getState().giocatore1.squadra[0].hp).toBe(3)
      expect(localStorage.getItem('arkamon-save')).toBe(persistedBefore)
    } finally { writer.mockRestore() }
    // The error dialog freezes further gameplay; retry its preserved operation.
    expect(useGameStore.getState().acquistaOggetti(1, { potion: 1, 'paralysis-heal': 1 }, 'Venezia', 'test-shop').ok).toBe(false)
    expect(useSaveWriteStatus.getState().retry?.()).toBe(true)
    const saved = JSON.parse(localStorage.getItem('arkamon-save')!).state
    expect(saved.giocatore1.monete).toBe(120)
    expect(saved.giocatore1.inventario).toMatchObject({ potion: 1, 'paralysis-heal': 1 })
    expect(saved.matchLog.events.filter((event: { kind: string }) => event.kind === 'shop')).toHaveLength(1)
  })

  it('keeps HP, inventory, turn and match history intact when an item cannot be saved, then permits retry', () => {
    preparedCity()
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, inventario: { potion: 1, masterball: 1 } } }))
    const before = useGameStore.getState(), persistedBefore = localStorage.getItem('arkamon-save')
    const writer = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'arkamon-save') throw new DOMException('Storage pieno', 'QuotaExceededError')
      savedValues.set(key, value)
    })
    try {
      const result = before.applicaOggetto(1, 'potion', 'one')
      expect(result.ok).toBe(false)
      expect(result.message).toContain('non può salvare')
      expect(useGameStore.getState()).toBe(before)
      expect(useGameStore.getState().giocatore1.monete).toBe(300)
      expect(useGameStore.getState().giocatore1.inventario.potion).toBe(1)
      expect(useGameStore.getState().giocatore1.squadra[0].hp).toBe(3)
      expect(useGameStore.getState().turnoOverworld).toBe(before.turnoOverworld)
      expect(useGameStore.getState().matchLog).toBe(before.matchLog)
      expect(localStorage.getItem('arkamon-save')).toBe(persistedBefore)
    } finally { writer.mockRestore() }
    expect(useGameStore.getState().applicaOggetto(1, 'potion', 'one').ok).toBe(false)
    expect(useSaveWriteStatus.getState().retry?.()).toBe(true)
    const saved = JSON.parse(localStorage.getItem('arkamon-save')!).state
    expect(saved.giocatore1.squadra[0].hp).toBe(6)
    expect(saved.giocatore1.inventario.potion).toBe(0)
    expect(saved.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    expect(saved.matchLog.events.filter((event: { title: string }) => event.title === 'Usa Pozione')).toHaveLength(1)
  })

  it('purchases and uses the declared items once, preserving the other player and the unused HP', () => {
    preparedCity()
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, squadra: [{ ...state.giocatore1.squadra[0], stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }] } }))
    const before = useGameStore.getState(), other = before.giocatore2
    expect(before.acquistaOggetti(1, { potion: 1, 'paralysis-heal': 1 }, 'Venezia', 'test-shop').ok).toBe(true)
    let state = useGameStore.getState()
    expect(state.giocatore1.monete).toBe(120)
    expect(state.giocatore1.squadra[0]).toMatchObject({ hp: 3, stato: { tipo: 'Paralizzato' } })
    expect(state.giocatore2).toEqual(other)
    expect(state.matchLog.events.filter((event) => event.kind === 'shop')).toHaveLength(1)
    expect(state.matchLog.events.find((event) => event.kind === 'shop')).toMatchObject({ amount: -180, playerId: 1, place: 'Venezia' })
    expect(state.acquistaOggetti(1, { potion: 1 }, 'Venezia', 'test-shop').ok).toBe(false)
    expect(state.applicaOggetto(1, 'paralysis-heal', 'one').ok).toBe(false)
    state.passaTurnoMappaLocale(); useGameStore.getState().passaTurnoMappaLocale()
    expect(useGameStore.getState().applicaOggetto(1, 'paralysis-heal', 'one').ok).toBe(true)
    state = useGameStore.getState()
    expect(state.giocatore1.squadra[0].hp).toBe(3)
    expect(state.giocatore1.squadra[0].stato).toBeUndefined()
    expect(state.giocatore1.inventario['paralysis-heal']).toBe(0)
    expect(state.giocatore1.inventario.potion).toBe(1)
    expect(state.applicaOggetto(1, 'potion', 'one').ok).toBe(false)
    state.passaTurnoMappaLocale(); useGameStore.getState().passaTurnoMappaLocale()
    expect(useGameStore.getState().applicaOggetto(1, 'potion', 'one').ok).toBe(true)
    expect(useGameStore.getState().giocatore1.squadra[0].hp).toBe(6)
    expect(useGameStore.getState().giocatore1.inventario.potion).toBe(0)
    expect(useGameStore.getState().giocatore2).toEqual(other)
  })

  it('does not consume an ineffective or unowned item, an unrelated target or any item during battle', () => {
    preparedCity()
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, inventario: { potion: 2, antidote: 1, masterball: 1 }, squadra: [{ ...state.giocatore1.squadra[0], hp: 12 }] } }))
    const before = useGameStore.getState()
    expect(before.applicaOggetto(1, 'potion', 'one').ok).toBe(false)
    expect(before.applicaOggetto(1, 'antidote', 'one').ok).toBe(false)
    expect(before.applicaOggetto(1, 'revive', 'one').ok).toBe(false)
    expect(before.applicaOggetto(1, 'potion', 'two').ok).toBe(false)
    expect(before.applicaOggetto(1, 'masterball', 'one').ok).toBe(false)
    expect(useGameStore.getState().giocatore1).toBe(before.giocatore1)
    expect(useGameStore.getState().turnoOverworld).toBe(before.turnoOverworld)
    useGameStore.getState().iniziaBattaglia(wildBattle(pokemon('target', 5, 3, 13)))
    expect(useGameStore.getState().applicaOggetto(1, 'potion', 'one').ok).toBe(false)
    expect(useGameStore.getState().giocatore1.inventario.potion).toBe(2)
  })

  it('preserves independent Arkadex history, match events and all inventory IDs in save and backup roundtrips', () => {
    preparedCity()
    const history = appendMatchEvent(emptyMatchLog(), { id: 'known-history', kind: 'move', playerId: 1, title: 'Passaggio al ponte', message: 'Una tappa già completata.', place: 'Venezia' }, 100)
    useGameStore.setState({ arkadex: { seen1: [1, 13, 21], caught1: [1, 13], seen2: [5, 9], caught2: [5] }, matchLog: history })
    useGameStore.setState((state) => ({ giocatore1: { ...state.giocatore1, inventario: { masterball: 1, potion: 2, 'super-potion': 3, revive: 4, antidote: 5, 'paralysis-heal': 6, awakening: 7 } } }))
    const before = useGameStore.getState()
    const serialized = serializeGameState(before)
    const normalized = normalizeGameSave(serialized)
    expect(normalized.warnings).toEqual([])
    expect(normalized.state.arkadex).toEqual(before.arkadex)
    expect(normalized.state.matchLog).toEqual(history)
    expect(normalized.state.giocatore1.inventario).toEqual(before.giocatore1.inventario)
    const hydrated = useGameStore.persist.getOptions().merge!(serialized, before)
    expect(hydrated.arkadex).toEqual(before.arkadex)
    expect(hydrated.matchLog).toEqual(history)
    const checked = validateGameBackup(serializeGameBackup(before, new Date('2026-10-10T12:00:00Z')))
    expect(checked.ok).toBe(true)
    if (!checked.ok) throw new Error(checked.error)
    const portable = stateFromValidatedBackup(checked.preview)!
    expect(portable.arkadex).toEqual(before.arkadex)
    expect(portable.matchLog).toEqual(history)
    expect(portable.giocatore1.inventario).toEqual(before.giocatore1.inventario)
    useGameStore.getState().reset()
    expect(restoreGameBackup(checked.preview).ok).toBe(true)
    expect(useGameStore.getState().arkadex).toEqual(before.arkadex)
    expect(useGameStore.getState().matchLog).toEqual(history)
    expect(useGameStore.getState().giocatore1.squadra[0].hp).toBe(3)
    expect(useGameStore.getState().giocatore1.inventario).toEqual(before.giocatore1.inventario)
  })
})
