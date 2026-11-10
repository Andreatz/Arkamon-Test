import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creaIstanza, useGameStore } from '@/store/gameStore'
import { initialGameSave, normalizeGameSave, serializeGameState, GAME_SAVE_STORAGE_KEY, PREVIOUS_BACKUP_STORAGE_KEY } from './gamePersistence'
import { GAME_BACKUP_FORMAT, MAX_GAME_BACKUP_BYTES, serializeGameBackup, stateFromValidatedBackup, validateGameBackup } from './gameBackup'
import { readPreviousGameBackup, restoreGameBackup } from './restoreGameBackup'
import { INTERACTION_STORAGE_KEY, useInteractionStore } from '@/interactions/interactionStore'
import { newInteractionDefinition } from '@/interactions/types'
import { getLocalMap } from '@/data/localMaps'
import { normalizeBattleArchive, useBattleArchiveStore } from '@/components/battle/battleArchiveStore'
import { createBattleChronicle } from '@/components/battle/battleChronicle'
import { shopAvailabilityMessage } from '@/shop/purchase'

const storageValues = vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  })
  return values
})

const date = new Date('2026-10-10T12:00:00.000Z')
function campaign() {
  const state = initialGameSave()
  state.giocatore1.nome = 'Andrea'
  state.giocatore1.squadra = [{ ...creaIstanza(1, 15)!, hp: 3, xp: 2, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }]
  state.giocatore2.squadra = [{ ...creaIstanza(5, 5)!, hp: 0 }]
  state.giocatore1.deposito = { '30:35': { ...creaIstanza(9, 40)!, hp: 11 } }
  state.giocatore1.allenatoriSconfitti = new Set([101, 102])
  state.giocatore1.cespugliVisitati = new Set(['Percorso_1:A'])
  state.giocatore2.caselleConsumate = new Set(['legacy:2,3:npc:hi'])
  state.turnoOverworld = { giocatoreAttivo: 2, azioniRimaste: 1 }
  state.giocatoreAttivo = 2
  state.posizioniLocali1 = { Venezia: getLocalMap('Venezia')!.startNode }
  state.scenaCorrente = { scena: 'mappa-principale' }
  state.interactionProgress.completed1 = ['quest-a']
  return state
}
function checked(text: string) {
  const result = validateGameBackup(text)
  if (!result.ok) throw new Error(result.error)
  return result.preview
}
function definition(id = 'quest-a') {
  const entry = newInteractionDefinition('Venezia', getLocalMap('Venezia')!.startNode, id)
  entry.title = 'Il saluto del porto'
  entry.dialogue = 'Benvenuto.'
  return entry
}
function largeArchive(messages = ['Fixture commentary. '.repeat(25)]) {
  return normalizeBattleArchive({ version: 1, matches: Array.from({ length: 20 }, (_, battle) => {
    const id = `fixture-${battle + 1}`
    return { id, title: 'Fixture imported replay', completedAt: date.toISOString(), playerId: 1, outcome: 'vittoria', location: 'borgo_aurora', battleType: 'PVP', chronicle: {
      version: 1, battleId: id, nextSequence: 241, omittedEvents: 0,
      events: Array.from({ length: 240 }, (_, index) => ({ id: `${id}:${index + 1}:attack`, kind: 'attack', title: 'Imported valid turn record', side: 'A', messages,
        actor: { instanceId: 'fixture-actor', speciesId: 1, name: 'Fixture Arkamon', level: 20, hp: 20 },
        target: { instanceId: 'fixture-target', speciesId: 2, name: 'Fixture opponent', level: 20, hp: 20 },
        dice: Array.from({ length: 12 }, () => 3), diceSum: 36, increment: 2, baseDamage: 38, effectiveness: 1, damage: 38, hpBefore: 58, hpAfter: 20,
      })),
    } }
  }) })
}

describe('backup portabile e ripristino guidato della campagna', () => {
  beforeEach(() => {
    storageValues.clear()
    useGameStore.getState().reset()
    useInteractionStore.setState({ interactions: [] })
    useBattleArchiveStore.setState({ version: 1, matches: [] })
  })
  it('exports all 20 supported replays within the restore limit instead of exceeding it through indentation', () => {
    const archive = largeArchive()
    const text = serializeGameBackup(initialGameSave(), date, undefined, archive)
    expect(new TextEncoder().encode(JSON.stringify(JSON.parse(text), null, 2)).byteLength).toBeGreaterThan(MAX_GAME_BACKUP_BYTES)
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_GAME_BACKUP_BYTES)
    const preview = checked(text)
    expect(preview.battleArchive).toEqual(archive)
    expect(preview.battleArchive?.matches).toHaveLength(20)
    expect(preview.battleArchive?.matches.reduce((total, battle) => total + battle.chronicle.events.length, 0)).toBe(4800)
  })
  it('rejects intrinsically oversized exports without silently dropping archive records', () => {
    const archive = largeArchive(['x'.repeat(800), 'y'.repeat(800)])
    expect(() => serializeGameBackup(campaign(), date, undefined, archive)).toThrow(/supera il limite.*non sarebbe ripristinabile/)
    expect(archive.matches).toHaveLength(20)
    expect(archive.matches.every(match => match.chronicle.events.length === 240)).toBe(true)
  })
  it('does not restore another campaign if the previous complete safety copy cannot be preserved', () => {
    const preview = checked(serializeGameBackup(campaign(), date))
    useBattleArchiveStore.setState(largeArchive(['x'.repeat(800), 'y'.repeat(800)]))
    const state = useGameStore.getState(), before = new Map(storageValues)
    const result = restoreGameBackup(preview)
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/conservare la partita precedente/) })
    expect(useGameStore.getState()).toBe(state)
    expect(storageValues).toEqual(before)
  })

  it('roundtrip versione/data, Set, squadre e depositi senza curare HP o status', () => {
    const state = campaign()
    const text = serializeGameBackup(state, date)
    const envelope = JSON.parse(text)
    expect(envelope).toMatchObject({ format: GAME_BACKUP_FORMAT, version: 1, saveSchemaVersion: 1, createdAt: date.toISOString() })
    expect(envelope.campaign.giocatore1.allenatoriSconfitti).toEqual([101, 102])
    const preview = checked(text)
    expect(preview.warnings).toEqual([])
    const restored = stateFromValidatedBackup(preview)!
    expect(restored.giocatore1).toEqual({ ...state.giocatore1, squadra: state.giocatore1.squadra.map((pokemon) => ({ ...pokemon, xp: 0 })) })
    expect(restored.giocatore2).toEqual(state.giocatore2)
    expect(restored.turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 1 })
    expect(restored.posizioniLocali1).toEqual(state.posizioniLocali1)
    expect(restored.interactionProgress.completed1).toEqual(['quest-a'])
  })
  it('does not disguise a damaged conserved campaign as a downloadable challenge roster', () => {
    const current = campaign()
    for (const challengeContext of [{}, { campaign: {} }, { campaign: { giocatore1: current.giocatore1, giocatore2: null } }]) {
      expect(() => serializeGameBackup({ ...current, challengeContext }, date)).toThrow(/campagna conservata/)
    }
    expect(serializeGameBackup({ ...current, challengeContext: null }, date)).toBe(serializeGameBackup(current, date))
  })
  it('preserves previously accepted repeatable dependencies in backups with an explicit repair warning', async () => {
    const prerequisite = { ...definition('repeatable-step'), repeatable: true }
    const dependent = { ...definition('dependent-step'), requirements: { ...definition().requirements, completedInteractions: [prerequisite.id] } }
    const catalog = [prerequisite, dependent]
    localStorage.setItem(INTERACTION_STORAGE_KEY, JSON.stringify({ version: 0, state: { interactions: catalog } }))
    await useInteractionStore.persist.rehydrate()
    expect(useInteractionStore.getState().interactions).toEqual(catalog)
    expect(useInteractionStore.getState().importCatalog(JSON.stringify({ version: 1, interactions: catalog }))).toMatch(/ripetibile/)
    expect(useInteractionStore.getState().interactions).toEqual(catalog)
    const checked = validateGameBackup(serializeGameBackup(campaign(), date, catalog))
    expect(checked.ok).toBe(true)
    if (!checked.ok) throw new Error(checked.error)
    expect(checked.preview.interactionCatalog?.interactions).toEqual(catalog)
    expect(checked.preview.warnings).toContainEqual(expect.stringMatching(/Correggi il requisito/))
    useInteractionStore.setState({ interactions: [] })
    expect(restoreGameBackup(checked.preview).ok).toBe(true)
    expect(useInteractionStore.getState().interactions).toEqual(catalog)
    expect(JSON.parse(localStorage.getItem(INTERACTION_STORAGE_KEY)!).state.interactions).toEqual(catalog)
    expect(useGameStore.getState().saveRecoveryWarnings).toContainEqual(expect.stringMatching(/Correggi il requisito/))
  })

  it.each([null, {}, { format: 'other-game', version: 1 }, { format: GAME_BACKUP_FORMAT, version: 999 }, { format: GAME_BACKUP_FORMAT, version: 1, saveSchemaVersion: 1, createdAt: 'yesterday', campaign: {} }])('rifiuta formati/versioni sconosciuti senza cambiare stato: %j', (data) => {
    const before = useGameStore.getState()
    expect(validateGameBackup(JSON.stringify(data)).ok).toBe(false)
    expect(useGameStore.getState()).toBe(before)
  })

  it('rifiuta JSON rotto, file eccessivo e dati essenziali assenti', () => {
    expect(validateGameBackup('{broken').ok).toBe(false)
    expect(validateGameBackup('x'.repeat(5 * 1024 * 1024 + 1)).ok).toBe(false)
    const data = JSON.parse(serializeGameBackup(campaign(), date))
    data.campaign.giocatore2.deposito = null
    expect(validateGameBackup(JSON.stringify(data)).ok).toBe(false)
  })

  it('l’anteprima avvisa delle creature corrotte e non tocca memoria o disco prima della conferma', () => {
    const data = JSON.parse(serializeGameBackup(campaign(), date))
    data.campaign.giocatore1.squadra.push({ specieId: 999, hp: -1 })
    data.campaign.giocatore1.squadra[0].xp = 'bad'
    data.campaign.reset = null
    const before = useGameStore.getState()
    const saved = localStorage.getItem(GAME_SAVE_STORAGE_KEY)
    const preview = checked(JSON.stringify(data))
    expect(preview.warnings.join(' ')).toContain('creatura')
    expect(preview.warnings.join(' ')).toContain('esperienza')
    expect(preview.warnings.join(' ')).toContain('campi estranei')
    expect(preview.players[0].team).toBe(1)
    expect(useGameStore.getState()).toBe(before)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(saved)
  })

  it('il ripristino aggiorna memoria e salvataggio, conserva azioni/settings estranei e una copia precedente', () => {
    useGameStore.getState().impostaNomeGiocatore(1, 'Partita precedente')
    useGameStore.getState().setAudioMuted(true)
    const reset = useGameStore.getState().reset
    localStorage.setItem('arkamon-theme', 'tema originale')
    localStorage.setItem('arkamon-audience-settings', 'QR attuale')
    const result = restoreGameBackup(checked(serializeGameBackup(campaign(), date)))
    expect(result.ok).toBe(true)
    expect(useGameStore.getState().giocatore1.nome).toBe('Andrea')
    expect(useGameStore.getState().reset).toBe(reset)
    expect(useGameStore.getState().audioMuted).toBe(true)
    const persisted = JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!)
    expect(persisted.state.giocatore1.squadra[0].hp).toBe(3)
    expect(persisted.state.turnoOverworld.azioniRimaste).toBe(1)
    expect(readPreviousGameBackup()).toContain('Partita precedente')
    expect(localStorage.getItem('arkamon-theme')).toBe('tema originale')
    expect(localStorage.getItem('arkamon-audience-settings')).toBe('QR attuale')
    expect(serializeGameBackup(useGameStore.getState())).not.toContain('audioMuted')
  })

  it('un errore di scrittura non sostituisce la partita e ripristina i valori precedenti del catalogo', () => {
    useInteractionStore.setState({ interactions: [definition('previous')] })
    const before = useGameStore.getState()
    const valuesBefore = new Map(storageValues)
    const storage = {
      getItem: localStorage.getItem,
      removeItem: localStorage.removeItem,
      setItem: (key: string, value: string) => {
        if (key === GAME_SAVE_STORAGE_KEY) throw new Error('Quota')
        localStorage.setItem(key, value)
      },
    }
    const result = restoreGameBackup(checked(serializeGameBackup(campaign(), date, [definition()])), storage)
    expect(result.ok).toBe(false)
    expect(useGameStore.getState()).toBe(before)
    expect(storageValues).toEqual(valuesBefore)
    expect(useInteractionStore.getState().interactions[0].id).toBe('previous')
  })

  it('include catalogo e progressi validati e permette di recuperare la partita precedente completa', () => {
    useInteractionStore.setState({ interactions: [definition('previous')] })
    const preview = checked(serializeGameBackup(campaign(), date, [definition()]))
    expect(preview.interactionCatalog?.interactions[0].id).toBe('quest-a')
    expect(restoreGameBackup(preview).ok).toBe(true)
    expect(useInteractionStore.getState().interactions[0].id).toBe('quest-a')
    expect(JSON.parse(localStorage.getItem(INTERACTION_STORAGE_KEY)!).state.interactions[0].id).toBe('quest-a')
    expect(checked(localStorage.getItem(PREVIOUS_BACKUP_STORAGE_KEY)!).interactionCatalog?.interactions[0].id).toBe('previous')
  })

  it('un catalogo con pallino inesistente non diventa un’interazione eseguibile', () => {
    const data = JSON.parse(serializeGameBackup(campaign(), date, [definition()]))
    data.interactionCatalog.interactions[0].nodeId = 'non-existing'
    expect(validateGameBackup(JSON.stringify(data)).ok).toBe(false)
  })

  it('i replay conservano i dadi già usciti e la cronaca della battaglia in corso sopravvive al backup', () => {
    useBattleArchiveStore.setState({ storageWarning: 'Salvataggio precedente non riuscito.' })
    const chronicle = { ...createBattleChronicle('fight-1'), events: [{ id: 'fight-1:attack', kind: 'attack' as const,
      title: 'Soffio', messages: ['Il risultato è già stato rivelato.'], dice: [1, 6], diceSum: 7, damage: 8 }] }
    const archive = { version: 1 as const, matches: [{ id: 'fight-1', title: 'Sfida NPC', completedAt: date.toISOString(),
      playerId: 1 as const, outcome: 'vittoria' as const, location: 'Venezia', battleType: 'NPC' as const, chronicle }] }
    const state = campaign()
    state.battaglia = { tipo: 'Selvatico', pokemonA: state.giocatore1.squadra[0], pokemonB: state.giocatore2.squadra[0],
      hpMaxA: 27, hpMaxB: 12, turnoCorrente: 'A', luogoRitorno: 'Venezia', log: [], evoluzioneInAttesa: null, cronaca: chronicle }
    const preview = checked(serializeGameBackup(state, date, [], archive))
    expect(restoreGameBackup(preview).ok).toBe(true)
    expect(useBattleArchiveStore.getState().matches[0].chronicle.events[0].dice).toEqual([1, 6])
    expect(useBattleArchiveStore.getState().storageWarning).toBeNull()
    expect(useGameStore.getState().battaglia?.cronaca?.events[0].dice).toEqual([1, 6])
  })

  it('una nuova installazione non riceve avvisi di corruzione', () => {
    expect(normalizeGameSave(undefined).warnings).toEqual([])
  })

  it.each([
    [1200.5, 1200], [Number.MAX_SAFE_INTEGER + 100, Number.MAX_SAFE_INTEGER],
    [-3.2, 0], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0],
  ])('recupera il saldo %s come intero sicuro %s e avvisa senza regalare monete', (coins, expected) => {
    const saved = serializeGameState(campaign())
    const recovered = normalizeGameSave({ ...saved, giocatore1: { ...saved.giocatore1 as object, monete: coins } })
    expect(recovered.state.giocatore1.monete).toBe(expected)
    expect(Number.isSafeInteger(recovered.state.giocatore1.monete)).toBe(true)
    expect(recovered.warnings.join(' ')).toContain('saldo monete corretto')
  })

  it.each([0, 1200])('conserva un saldo valido di %s senza avvisi', (coins) => {
    const saved = campaign()
    saved.giocatore1.monete = coins
    const restored = stateFromValidatedBackup(checked(serializeGameBackup(saved, date)))!
    expect(restored.giocatore1.monete).toBe(coins)
    expect(normalizeGameSave(serializeGameState(saved)).warnings).toEqual([])
  })

  it.each([
    [1200.5, 1200], [Number.MAX_SAFE_INTEGER + 100, Number.MAX_SAFE_INTEGER],
  ])('un backup con saldo %s avvisa e ripristina gli acquisti con saldo %s', (coins, expected) => {
    const saved = campaign()
    saved.giocatoreAttivo = 1
    saved.turnoOverworld = { giocatoreAttivo: 1, azioniRimaste: 2 }
    saved.posizione1 = { ...saved.posizione1, luogo: 'Venezia' }
    saved.scenaCorrente = { scena: 'citta', payload: { luogo: 'Venezia' } }
    const shop = { ...definition('wallet-shop'), title: 'Arkastore', repeatable: true, action: { kind: 'shop' as const } }
    const data = JSON.parse(serializeGameBackup(saved, date, [shop]))
    data.campaign.giocatore1.monete = coins
    const preview = checked(JSON.stringify(data))
    expect(preview.warnings.join(' ')).toContain('saldo monete corretto')
    expect(preview.players[0].coins).toBe(expected)
    expect(restoreGameBackup(preview).ok).toBe(true)
    const restored = useGameStore.getState()
    expect(restored.saveRecoveryWarnings.join(' ')).toContain('saldo monete corretto')
    expect(restored.giocatore1.monete).toBe(expected)
    expect(shopAvailabilityMessage(restored, 1, 'Venezia', { interactionId: shop.id, interactions: [shop] })).toBeNull()
    expect(restored.acquistaOggetti(1, { potion: 1 }, 'Venezia', shop.id).ok).toBe(true)
    expect(useGameStore.getState().giocatore1.monete).toBe(expected - 100)
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!).state.giocatore1.monete).toBe(expected - 100)
  })

  it('un ripristino anche nella stessa scena crea una nuova generazione senza importarla dal file', () => {
    useGameStore.setState({ scenaCorrente: { scena: 'mappa-principale' } })
    const revision = useGameStore.getState().campaignRevision
    const data = JSON.parse(serializeGameBackup(campaign(), date))
    data.campaign.campaignRevision = 999999
    expect(restoreGameBackup(checked(JSON.stringify(data))).ok).toBe(true)
    expect(useGameStore.getState().campaignRevision).toBe(revision + 1)
    expect(serializeGameBackup(useGameStore.getState())).not.toContain('campaignRevision')
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toContain('campaignRevision')
    useGameStore.getState().reset()
    expect(useGameStore.getState().campaignRevision).toBe(revision + 2)
  })

  it('esclude la votazione remota ma conserva iniziativa, lati già mossi ed evoluzioni del checkpoint', () => {
    const state = campaign()
    state.battaglia = {
      tipo: 'NPC', pokemonA: state.giocatore1.squadra[0], pokemonB: state.giocatore2.squadra[0], hpMaxA: 27, hpMaxB: 12,
      turnoCorrente: 'B', luogoRitorno: 'Venezia', log: ['Turno salvato'], evoluzioneInAttesa: null,
      checkpoint: { version: 1, initialPriority: 'A', actedThisRound: ['A'], phase: 'rival-move', openingComplete: true,
        outcome: null, evolutions: [{ istanzaId: 'first', oldSpecieId: 1, newSpecieId: 2 }], rivalMessages: ['Conservato'],
        audienceBattleId: 'previous-battle', opponentTurnNumber: 7 },
    }
    state.scenaCorrente = { scena: 'battaglia' }
    const file = serializeGameBackup(state, date)
    expect(file).not.toContain('audienceBattleId')
    expect(file).not.toContain('opponentTurnNumber')
    const restored = stateFromValidatedBackup(checked(file))!
    expect(restored.battaglia?.checkpoint).toMatchObject({ initialPriority: 'A', actedThisRound: ['A'], phase: 'rival-move', openingComplete: true,
      evolutions: [{ istanzaId: 'first', oldSpecieId: 1, newSpecieId: 2 }] })
  })

  it('le azioni e i campi estranei non sono serializzati e un riferimento battle mancante non blocca i progressi', () => {
    const state = campaign()
    const result = normalizeGameSave({ ...serializeGameState(state), reset: 'invalid', battaglia: null,
      interactionProgress: { ...state.interactionProgress, pendingBattle: { interactionId: 'quest-a', playerId: 1,
        title: 'Sfida', mapId: 'Venezia', nodeId: getLocalMap('Venezia')!.startNode, scope: 'player', reward: { coins: 200, items: {} } } } })
    expect(result.state.interactionProgress.pendingBattle).toBeNull()
    expect(result.state.interactionProgress.completed1).toEqual(['quest-a'])
    expect(JSON.stringify(serializeGameState(useGameStore.getState()))).not.toContain('dismissSaveRecoveryWarnings')
    expect(JSON.stringify(serializeGameState(useGameStore.getState()))).not.toContain('eseguiInterazioneConfigurata')
  })
})
