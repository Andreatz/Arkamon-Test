import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalMap } from '@/data/localMaps'
import { ALLENATORI } from '@/data'
import { useGameStore, creaIstanza } from '@/store/gameStore'
import { useInteractionStore } from '../interactionStore'
import { emptyInteractionProgress, newInteractionDefinition } from '../types'
import { finalizeConfiguredBattle, resolveConfiguredInteraction } from '../runtime'

vi.hoisted(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
})
const map = getLocalMap('Venezia')!
function definition(id = 'test-dialogue') {
  const result = newInteractionDefinition(map.id, map.startNode, id)
  result.title = 'Messaggio definito dalla regia'; result.dialogue = 'Un dialogo di prova.'
  result.reward = { coins: 25, items: { masterball: 1 } }
  return result
}
function prepare() {
  useGameStore.getState().reset()
  const state = useGameStore.getState()
  useGameStore.setState({
    giocatore1: { ...state.giocatore1, monete: 100, squadra: [creaIstanza(1, 5)!] },
    giocatore2: { ...state.giocatore2, monete: 70, squadra: [creaIstanza(5, 5)!] },
    posizione1: { mappaId: 'mappa-principale', luogo: map.id, x: 0, y: 0, direzione: 'S' },
    posizione2: { mappaId: 'mappa-principale', luogo: map.id, x: 0, y: 0, direzione: 'S' },
    posizioniLocali1: { [map.id]: map.startNode }, posizioniLocali2: { [map.id]: map.startNode }, interactionProgress: emptyInteractionProgress(),
  })
  useInteractionStore.setState({ interactions: [] })
}
describe('interazioni configurate: regole, risorse e persistenza atomica', () => {
  beforeEach(prepare)
  it('opens the configured shop freely without consuming the turn or awarding rewards', () => {
    useGameStore.setState({ scenaCorrente: { scena: 'citta', payload: { luogo: map.id } } })
    const entry = definition('test-shop')
    entry.action = { kind: 'shop' }; entry.repeatable = true; entry.cost = { coins: 0, items: {} }; entry.reward = { coins: 0, items: {} }
    expect(useInteractionStore.getState().saveInteraction(entry)).toBeNull()
    const before = useGameStore.getState()
    expect(before.eseguiInterazioneConfigurata(1, entry.id)).toMatchObject({ ok: true })
    const after = useGameStore.getState()
    expect(after.giocatore1).toBe(before.giocatore1)
    expect(after.turnoOverworld).toBe(before.turnoOverworld)
    expect(after.interactionProgress).toBe(before.interactionProgress)
    useGameStore.setState({ posizioniLocali1: { [map.id]: 'n1' } })
    expect(useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id)).toMatchObject({ ok: false })
  })
  it('aggiorna premio, completamento e turno nello stesso salvataggio; la ricompensa non si ripete', () => {
    const entry = definition()
    expect(useInteractionStore.getState().saveInteraction(entry)).toBeNull()
    const writes: Array<ReturnType<typeof useGameStore.getState>> = []
    const release = useGameStore.subscribe((state) => writes.push(state))
    expect(useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id).ok).toBe(true)
    release()
    expect(writes).toHaveLength(1)
    expect(writes[0].giocatore1.monete).toBe(125)
    expect(writes[0].giocatore1.inventario.masterball).toBe(2)
    expect(writes[0].interactionProgress.completed1).toEqual([entry.id])
    expect(writes[0].turnoOverworld).toEqual({ giocatoreAttivo: 2, azioniRimaste: 2 })
    useGameStore.setState({ turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 } })
    expect(useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id).ok).toBe(false)
    expect(useGameStore.getState().giocatore1.monete).toBe(125)
  })
  it('le tappe individuali premiano separatamente ciascun giocatore', () => {
    const entry = definition()
    useInteractionStore.getState().saveInteraction(entry)
    useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id)
    useGameStore.getState().passaTurnoMappaLocale()
    expect(useGameStore.getState().eseguiInterazioneConfigurata(2, entry.id).ok).toBe(true)
    expect(useGameStore.getState().interactionProgress.completed2).toEqual([entry.id])
    expect(useGameStore.getState().giocatore2.monete).toBe(95)
  })
  it('il premio condiviso arriva una volta al primo giocatore', () => {
    const entry = { ...definition(), scope: 'shared' as const }
    useInteractionStore.getState().saveInteraction(entry)
    useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id)
    useGameStore.getState().passaTurnoMappaLocale()
    expect(useGameStore.getState().eseguiInterazioneConfigurata(2, entry.id).ok).toBe(false)
    expect(useGameStore.getState().giocatore2.monete).toBe(70)
    expect(useGameStore.getState().interactionProgress.completedShared).toEqual([entry.id])
  })
  it.each(['coins', 'level', 'gym', 'item', 'quest'] as const)('il requisito %s fallito non consuma risorse né azioni', (kind) => {
    const entry = definition()
    if (kind === 'coins') entry.cost.coins = 101
    if (kind === 'level') entry.requirements.minLevel = 6
    if (kind === 'gym') entry.requirements.gymIds = [ALLENATORI.find((trainer) => trainer.tipo === 'Capopalestra')!.id]
    if (kind === 'item') entry.cost.items.masterball = 2
    if (kind === 'quest') entry.requirements.completedInteractions = ['previous-stage']
    const state = useGameStore.getState()
    const result = resolveConfiguredInteraction(state, entry, 1)
    expect(result.ok).toBe(false); expect(result.patch).toBeUndefined()
    expect(useGameStore.getState()).toBe(state)
  })
  it('un passo e una interazione completano lo stesso budget; terza azione rifiutata', () => {
    const road = map.roads.find((entry) => entry.from === map.startNode || entry.to === map.startNode)!
    const next = road.from === map.startNode ? road.to : road.from
    const entry = { ...definition(), nodeId: next }
    useInteractionStore.getState().saveInteraction(entry)
    expect(useGameStore.getState().muoviAvatarMappaLocale(1, map.id, next)).toBe(true)
    expect(useGameStore.getState().turnoOverworld.azioniRimaste).toBe(1)
    expect(useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id).ok).toBe(true)
    expect(useGameStore.getState().muoviAvatarMappaLocale(1, map.id, map.startNode)).toBe(false)
  })
  it('essere in un altro luogo o pallino non consente una interazione a distanza', () => {
    const entry = { ...definition(), nodeId: map.nodes.find((node) => node.id !== map.startNode)!.id }
    expect(resolveConfiguredInteraction(useGameStore.getState(), entry, 1).ok).toBe(false)
    useGameStore.setState({ posizione1: { ...useGameStore.getState().posizione1, luogo: 'Roma' } })
    expect(resolveConfiguredInteraction(useGameStore.getState(), definition(), 1).ok).toBe(false)
  })
  it('la cura esplicita rimuove la paralisi, senza premi ripetibili', () => {
    const entry = { ...definition(), repeatable: true, action: { kind: 'heal' as const }, reward: { coins: 0, items: {} } }
    const player = useGameStore.getState().giocatore1
    useGameStore.setState({ giocatore1: { ...player, squadra: [{ ...player.squadra[0], hp: 1, stato: { tipo: 'Paralizzato', turniRimanenti: -1 } }] } })
    const result = resolveConfiguredInteraction(useGameStore.getState(), entry, 1)
    expect(result.ok).toBe(true)
    expect(result.patch?.giocatore1?.squadra[0]).toMatchObject({ hp: 12 })
    expect(result.patch?.giocatore1?.squadra[0].stato).toBeUndefined()
    expect(result.patch?.interactionProgress?.completed1).toEqual([])
  })
  it('la sfida riserva il costo ma paga il premio soltanto alla vittoria, una volta', () => {
    const entry = { ...definition('battle-stage'), action: { kind: 'encounter' as const, speciesId: 20, level: 5 }, cost: { coins: 10, items: {} } }
    useInteractionStore.getState().saveInteraction(entry)
    expect(useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id).ok).toBe(true)
    expect(useGameStore.getState().giocatore1.monete).toBe(90)
    expect(useGameStore.getState().interactionProgress.completed1).toEqual([])
    const battle = useGameStore.getState().battaglia!
    expect(battle.tipo).toBe('Selvatico')
    useGameStore.getState().aggiornaBattaglia({ checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended', openingComplete: true, outcome: 'vittoria', evolutions: [], rivalMessages: [] } })
    useGameStore.getState().terminaBattaglia(false)
    expect(useGameStore.getState().giocatore1.monete).toBe(115)
    expect(useGameStore.getState().interactionProgress.completed1).toEqual([entry.id])
    expect(useGameStore.getState().interactionProgress.pendingBattle).toBeNull()
    useGameStore.getState().terminaBattaglia(false)
    expect(useGameStore.getState().giocatore1.monete).toBe(115)
  })
  it('la sconfitta non assegna né premio né completamento', () => {
    const entry = { ...definition(), action: { kind: 'encounter' as const, speciesId: 20, level: 5 } }
    const start = resolveConfiguredInteraction(useGameStore.getState(), entry, 1)
    const state = { ...useGameStore.getState(), ...start.patch }
    const result = finalizeConfiguredBattle(state)
    expect(result.interactionProgress?.completed1).toEqual([])
    expect(result.interactionProgress?.pendingBattle).toBeNull()
    expect(result.giocatore1?.monete).toBe(100)
  })
  it('le ricompense ordinarie NPC e quelle della tappa si sommano una volta, senza consumare un secondo turno', () => {
    const trainer = ALLENATORI.find((item) => item.tipo === 'NPC' && getLocalMap(item.luogo))!
    const trainerMap = getLocalMap(trainer.luogo)!
    useGameStore.setState({ posizione1: { ...useGameStore.getState().posizione1, luogo: trainerMap.id }, posizioniLocali1: { [trainerMap.id]: trainerMap.startNode } })
    const entry = { ...definition('trainer-stage'), mapId: trainerMap.id, nodeId: trainerMap.startNode, action: { kind: 'trainer' as const, trainerId: trainer.id } }
    useInteractionStore.getState().saveInteraction(entry)
    expect(useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id).ok).toBe(true)
    const turn = useGameStore.getState().turnoOverworld
    useGameStore.getState().aggiornaBattaglia({ checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended', openingComplete: true, outcome: 'vittoria', evolutions: [], rivalMessages: [] } })
    useGameStore.getState().risolviBattagliaNPC('vittoria')
    useGameStore.getState().risolviBattagliaNPC('vittoria')
    expect(useGameStore.getState().giocatore1.monete).toBe(300)
    useGameStore.getState().terminaBattaglia(false)
    expect(useGameStore.getState().giocatore1.monete).toBe(325)
    expect(useGameStore.getState().giocatore1.allenatoriSconfitti.has(trainer.id)).toBe(true)
    expect(useGameStore.getState().turnoOverworld).toBe(turn)
  })
  it('un riferimento obsoleto a un’altra battaglia non assegna la ricompensa della tappa', () => {
    const entry = { ...definition(), action: { kind: 'encounter' as const, speciesId: 20, level: 5 } }
    const start = resolveConfiguredInteraction(useGameStore.getState(), entry, 1)
    const state = { ...useGameStore.getState(), ...start.patch }
    state.battaglia = { ...state.battaglia!, pokemonB: { ...state.battaglia!.pokemonB, istanzaId: 'other-battle' }, checkpoint: { version: 1, initialPriority: 'A', actedThisRound: [], phase: 'ended', openingComplete: true, outcome: 'vittoria', evolutions: [], rivalMessages: [] } }
    const final = finalizeConfiguredBattle(state)
    expect(final.giocatore1?.monete).toBe(100)
    expect(final.interactionProgress?.completed1).toEqual([])
  })
  it('non spende un turno per iniziare un incontro con tutta la squadra KO', () => {
    const player = useGameStore.getState().giocatore1
    useGameStore.setState({ giocatore1: { ...player, squadra: player.squadra.map((pokemon) => ({ ...pokemon, hp: 0 })) } })
    expect(resolveConfiguredInteraction(useGameStore.getState(), { ...definition(), action: { kind: 'encounter', speciesId: 20, level: 5 } }, 1).patch).toBeUndefined()
  })
  it('le strade e le azioni restano bloccate durante la battaglia configurata', () => {
    const entry = { ...definition(), action: { kind: 'encounter' as const, speciesId: 20, level: 5 } }
    useInteractionStore.getState().saveInteraction(entry)
    useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id)
    expect(useGameStore.getState().passaTurnoMappaLocale()).toBe(false)
    expect(useGameStore.getState().eseguiInterazioneConfigurata(1, entry.id).ok).toBe(false)
    expect(useGameStore.getState().muoviAvatarMappaPrincipale(1, 'Percorso_1')).toBe(false)
  })
})
