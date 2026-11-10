import { describe, expect, it, vi } from 'vitest'
import { applicaStato, calcolaAzioneSuprema, calcolaDanno, calcolaHPMax, risolviStatoInizioTurno } from '@/engine/battleEngine'
import { resolveBattleAttack } from '@/engine/battleResolution'
import { createBattleDamageReveal } from './battleVisualSequence'
import { appendBattleEvents, chronicleText, createBattleChronicle, MAX_BATTLE_LOG_EVENTS, normalizeBattleChronicle, reserveBattleAction, revealedAttackEvents, settledAttackEvents, statusEvents } from './battleChronicle'
import { makeSettledBattlePatch } from './useSettledBattleCheckpoint'
import { restoreBattleCheckpoint } from './battleCheckpoint'
import type { PokemonIstanza, StatoBattaglia } from '@/types'

const pokemon = (id: string, livello = 14, hp = 13): PokemonIstanza => ({ istanzaId: id, specieId: 1, nome: id, livello, hp, xp: 0 })

describe('cronaca rivelata e replay senza nuovi dadi', () => {
  it('mantiene KO, XP e contraccolpo privati finché il gate dei dadi non rivela i risultati', () => {
    const attacker = pokemon('A')
    const target = pokemon('B', 5, 1)
    const result = calcolaAzioneSuprema(attacker, target, 0, () => 0)!
    const resolved = resolveBattleAttack(result, 'A', [attacker], [target])
    let log = createBattleChronicle('battle')
    const reveal = createBattleDamageReveal({
      waitForTargetKO: true,
      onReveal: () => { log = appendBattleEvents(log, revealedAttackEvents(result, 'A', 'battle:1')) },
      onComplete: () => { log = appendBattleEvents(log, settledAttackEvents(result, resolved, 'A', 'battle:1')) },
    })
    expect(log.events).toEqual([])
    reveal.targetKOComplete()
    expect(log.events).toEqual([])
    reveal.diceVisible()
    expect(log.events.map((event) => event.kind)).toEqual(['attack', 'ko'])
    expect(log.events[0]).toMatchObject({ dice: [1, 1], diceSum: 2, increment: 2, baseDamage: 4, effectiveness: 1, supreme: true, damage: 8, hpBefore: 1, hpAfter: 0 })
    reveal.diceComplete()
    expect(log.events.map((event) => event.kind)).toEqual(['attack', 'ko', 'xp', 'recoil', 'ko', 'winner'])
    expect(log.events[log.events.length - 1]).toMatchObject({ winnerSide: 'A', actor: { level: 15, hp: 0 } })
    reveal.diceVisible(); reveal.diceComplete(); reveal.targetKOComplete()
    expect(log.events).toHaveLength(6)
  })

  it('riprende lo stesso risultato e la stessa coda XP dopo un salvataggio, senza duplicati', () => {
    const attacker = pokemon('A')
    const target = pokemon('B', 5, 1)
    const result = calcolaAzioneSuprema(attacker, target, 0, () => 0)!
    const settled = resolveBattleAttack(result, 'A', [attacker], [target])
    const events = [...revealedAttackEvents(result, 'A', 'battle:1'), ...settledAttackEvents(result, settled, 'A', 'battle:1')]
    const chronicle = { ...appendBattleEvents(createBattleChronicle('battle'), events), nextSequence: 2 }
    const patch = makeSettledBattlePatch({
      pokemonA: settled.attacker, pokemonB: settled.defender, squadA: settled.squadA, squadB: settled.squadB,
      messages: ['Conclusa'], chronicle,
      control: { initialPriority: 'A', actedThisRound: new Set(['A']), turnA: true, pvp: false, chooseRivalMove: false, outcome: settled.outcome, openingComplete: true, evolutions: [{ istanzaId: 'A', oldSpecieId: 1, newSpecieId: 2 }], rivalMessages: [] },
    })!
    const loaded = JSON.parse(JSON.stringify({ tipo: 'PVP', luogoRitorno: 'Roma', log: [], evoluzioneInAttesa: null, ...patch })) as StatoBattaglia
    expect(loaded.pokemonA).toMatchObject({ livello: 15, hp: 0 })
    expect(restoreBattleCheckpoint(loaded)).toMatchObject({ phase: 'ended', outcome: 'vittoria', evolutions: [{ istanzaId: 'A', oldSpecieId: 1, newSpecieId: 2 }] })
    const resumed = normalizeBattleChronicle(loaded.cronaca)
    expect(appendBattleEvents(resumed, events)).toBe(resumed)
    expect(resumed.nextSequence).toBe(2)
    expect(resumed.events.filter((event) => event.kind === 'xp')).toHaveLength(1)
  })

  it('registra il premio KO scartato al cap senza promettere EXP conservata o livelli futuri', () => {
    const attacker = pokemon('A', 14, 13)
    const target = pokemon('B', 5, 1)
    const teammate = pokemon('low-ko', 9, 0)
    const result = calcolaDanno(attacker, target, 0, () => 0, false)!
    const settled = resolveBattleAttack(result, 'A', [attacker, teammate], [target], 14)
    const event = settledAttackEvents(result, settled, 'A', 'battle:1').find((entry) => entry.kind === 'xp')!
    expect(event).toMatchObject({ title: 'A: EXP non accumulata', levelBefore: 14, levelAfter: 14, actor: { level: 14, hp: 13 } })
    expect(event.messages.join(' ')).toContain('Cap di squadra raggiunto')
    expect(event.messages.join(' ')).toContain('non darà livelli successivamente')
    expect(settled.attacker.xp).toBe(0)
  })

  it('rivedere o esportare la cronaca non usa il generatore casuale e non cambia HP', () => {
    const attacker = pokemon('A', 10, 5)
    const target = pokemon('B', 20, 20)
    const result = calcolaDanno(attacker, target, 0, () => 0.5, false)!
    const chronicle = appendBattleEvents(createBattleChronicle('battle'), revealedAttackEvents(result, 'A', 'battle:1'))
    const rng = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Un replay non tira dadi') })
    try {
      expect(chronicleText(normalizeBattleChronicle(JSON.parse(JSON.stringify(chronicle))))).toContain(`Dadi: ${result.tiriDado.join(' + ')}`)
      expect(rng).not.toHaveBeenCalled()
      expect(attacker.hp).toBe(5)
      expect(target.hp).toBe(20)
    } finally { rng.mockRestore() }
  })

  it('distingue il turno obbligatorio di sonno dal dado reale e conserva PAR dopo il tiro', () => {
    const sleeper = applicaStato(pokemon('A'), 'Addormentato')
    const first = risolviStatoInizioTurno(sleeper, calcolaHPMax(sleeper), () => 0.99)
    const firstLog = statusEvents(sleeper, first, 'A', 'sleep:1')[0]
    expect(firstLog.dice).toBeUndefined()
    expect(firstLog.messages.join(' ')).toContain('primo turno di sonno obbligatorio')
    const second = risolviStatoInizioTurno(first.istanza, calcolaHPMax(first.istanza), () => 0.99)
    expect(statusEvents(first.istanza, second, 'A', 'sleep:2')[0].dice).toEqual([6])
    const paralyzed = applicaStato(pokemon('B'), 'Paralizzato')
    const failed = risolviStatoInizioTurno(paralyzed, calcolaHPMax(paralyzed), () => 0)
    expect(statusEvents(paralyzed, failed, 'B', 'par:1')[0]).toMatchObject({ dice: [1], hpBefore: 13, hpAfter: 13 })
    expect(failed.istanza.stato?.tipo).toBe('Paralizzato')
  })

  it('limita e sanifica gli eventi importati, con quantità omesse esplicita', () => {
    const entries = Array.from({ length: MAX_BATTLE_LOG_EVENTS + 10 }, (_, index) => ({ id: `battle:${index}`, kind: 'status' as const, title: `Evento ${index}`, messages: [] }))
    const capped = appendBattleEvents(createBattleChronicle('battle'), entries)
    expect(capped.events).toHaveLength(MAX_BATTLE_LOG_EVENTS)
    expect(capped.omittedEvents).toBe(10)
    const clean = normalizeBattleChronicle({ ...capped, events: [
      { id: 'bad', kind: 'invented', title: 'Bad' },
      { id: 'good', kind: 'attack', title: 'Ok', dice: [0, 7], damage: Infinity, messages: [null, 'Reale'], hostToken: 'secret' },
      { id: 'good', kind: 'attack', title: 'Duplicato' },
    ] })
    expect(clean.events).toEqual([{ id: 'good', kind: 'attack', title: 'Ok', messages: ['Reale'] }])
    expect(JSON.stringify(clean)).not.toContain('secret')
    expect(normalizeBattleChronicle(null).events).toEqual([])
  })

  it('ripara un contatore importato che non consente più identità sicure per le azioni', () => {
    const prior = appendBattleEvents(createBattleChronicle('battle'), [
      { id: 'battle:1:attack', kind: 'attack', title: 'Colpo precedente', messages: [] },
    ])
    const restored = normalizeBattleChronicle({ ...prior, nextSequence: Number.MAX_SAFE_INTEGER })
    expect(restored.events).toEqual(prior.events)
    expect(restored.nextSequence).toBeLessThan(1_000_000_000)
    expect(Number.isSafeInteger(restored.nextSequence + 2)).toBe(true)
  })

  it('conserva i colpi nuovi quando un backup ha un contatore arretrato rispetto ai suoi eventi', () => {
    const restored = normalizeBattleChronicle({ ...createBattleChronicle('battle'), nextSequence: 1, events: [
      { id: 'battle:1:attack', kind: 'attack', title: 'Primo colpo', messages: [] },
      { id: 'battle:2:status', kind: 'status', title: 'Status precedente', messages: [] },
    ] })
    const first = reserveBattleAction(restored)
    const withAttack = appendBattleEvents(first.chronicle, [{ id: `${first.actionId}:attack`, kind: 'attack', title: 'Nuovo colpo', messages: [] }])
    const reloaded = normalizeBattleChronicle(JSON.parse(JSON.stringify(withAttack)))
    const second = reserveBattleAction(reloaded)
    expect(first.actionId).toBe('battle:3')
    expect(second.actionId).toBe('battle:4')
    expect(reloaded.events.map((event) => event.title)).toEqual(['Primo colpo', 'Status precedente', 'Nuovo colpo'])
    expect(appendBattleEvents(reloaded, [withAttack.events[2]])).toBe(reloaded)
  })

  it('supera il limite del contatore con identità distinte e senza usare i dadi di gioco', () => {
    const initial = { ...createBattleChronicle('battle'), nextSequence: 999_999_999 }
    const rng = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Le identità non tirano dadi') })
    try {
      const first = reserveBattleAction(initial)
      const second = reserveBattleAction(first.chronicle)
      const third = reserveBattleAction(second.chronicle)
      expect(new Set([first.actionId, second.actionId, third.actionId]).size).toBe(3)
      expect([first.chronicle.nextSequence, second.chronicle.nextSequence, third.chronicle.nextSequence].every(Number.isSafeInteger)).toBe(true)
      expect(initial.nextSequence).toBe(999_999_999)
      expect(rng).not.toHaveBeenCalled()
    } finally { rng.mockRestore() }
  })
})
