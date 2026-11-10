import { ALLENATORI, getPokemon } from '@/data'
import { calcolaHPMax } from '@/engine/battleEngine'
import { initialGameSave, mainMapPosition, type GameSaveState } from '@/save/gamePersistence'
import { emptyLeagueState } from '@/league/leagueModel'
import { appendMatchEvent } from '@/match/matchLog'
import { getLocalMap } from '@/data/localMaps'
import type { PokemonIstanza, SceneId } from '@/types'

export function previewCreature(speciesId: number, index: number, owner = 1): PokemonIstanza {
  const pokemon: PokemonIstanza = { istanzaId: `ui-preview-${owner}-${index}`, specieId: speciesId, nome: getPokemon(speciesId)?.nome ?? `Arkamon ${speciesId}`, livello: 20 + index % 6, xp: 0, hp: 1 }
  pokemon.hp = Math.max(1, Math.floor(calcolaHPMax(pokemon) * (index % 5 === 0 ? .6 : 1)))
  if (index === 0) pokemon.stato = { tipo: 'Paralizzato', turniRimanenti: -1 }
  return pokemon
}
/** Generated demonstration data is never loaded from or written into the campaign. */
export function createPreviewFixture(screenKey: string): GameSaveState {
  const [screen, view] = screenKey.split(':')
  const state = initialGameSave()
  state.audioMuted = true; state.rivaleStarterId = 9
  state.giocatore1.nome = 'Melia'; state.giocatore2.nome = 'Maggi'
  state.giocatore1.squadra = [1, 5, 9, 13, 20, 43].map((id, index) => previewCreature(id, index))
  state.giocatore2.squadra = [5, 9, 17, 26, 33, 40].map((id, index) => previewCreature(id, index, 2))
  state.giocatore1.deposito = Object.fromEntries(Array.from({ length: 35 }, (_, index) => [`1:${index + 1}`, previewCreature(13 + index, index + 10)]))
  state.giocatore1.monete = 12450; state.giocatore2.monete = 8750
  state.giocatore1.inventario = { potion: 8, 'super-potion': 4, revive: 2, antidote: 3, 'paralysis-heal': 2, awakening: 2, masterball: 5 }
  state.giocatore2.inventario = { potion: 4, masterball: 2 }
  state.giocatore1.allenatoriSconfitti = new Set(ALLENATORI.filter(entry => entry.tipo === 'Capopalestra').slice(0, 5).map(entry => entry.id))
  state.posizione1 = mainMapPosition('Venezia'); state.posizione2 = mainMapPosition('Pordenone')
  state.posizioniLocali1 = { Venezia: getLocalMap('Venezia')!.startNode, Percorso_1: getLocalMap('Percorso_1')!.startNode }
  state.arkadex = { seen1: Array.from({ length: 110 }, (_, i) => i + 1), caught1: Array.from({ length: 48 }, (_, i) => i + 1), seen2: [1, 5, 9, 17, 26, 33, 40], caught2: [5, 9, 17, 26, 33, 40] }
  state.matchLog = appendMatchEvent(state.matchLog, { kind: 'move', title: 'Esplorazione di Venezia', message: 'Esempio di registro per la composizione della schermata.', place: 'Venezia', playerId: 1 }, Date.UTC(2026, 9, 17, 12))
  const isManagement = ['menu', 'squadra', 'deposito', 'arkadex', 'analisi', 'borsa', 'negozio', 'register', 'race', 'recap', 'journal', 'backup', 'settings', 'chronicles', 'match', 'challenges'].includes(screen)
  state.scenaCorrente = { scena: isManagement ? 'citta' : screen as SceneId, ...(screen === 'percorso' ? { payload: { luogo: 'Percorso_1' } } : screen === 'citta' || isManagement ? { payload: { luogo: 'Venezia' } } : {}) }
  if (screen === 'percorso') state.posizione1 = mainMapPosition('Percorso_1')
  if ((screen === 'citta' || screen === 'percorso') && view && getLocalMap(view)) {
    state.scenaCorrente.payload = { luogo: view }
    state.posizione1 = mainMapPosition(view)
    state.posizioniLocali1 = { [view]: getLocalMap(view)!.startNode }
    if (view === 'Percorso_15') state.giocatore1.allenatoriSconfitti = new Set(ALLENATORI.filter(entry => entry.tipo === 'Capopalestra').map(entry => entry.id))
  }
  if (screen === 'laboratorio') {
    // One chosen starter reveals the real starter-selection view without its automatic exit.
    state.giocatore1.squadra = [previewCreature(1, 0)]; state.giocatore1.deposito = {}; state.giocatore2.squadra = []; state.giocatore2.deposito = {}
  }
  if (screen === 'battaglia') {
    const attacker = state.giocatore1.squadra[0], defender = previewCreature(5, 1, 9)
    state.battaglia = { tipo: 'Selvatico', pokemonA: attacker, pokemonB: defender, squadraA: state.giocatore1.squadra, squadraB: [defender], hpMaxA: calcolaHPMax(attacker), hpMaxB: calcolaHPMax(defender), turnoCorrente: 'A', luogoRitorno: 'Percorso_1', log: ['Il tuo Arkamon è pronto. Scegli una mossa.'], evoluzioneInAttesa: null }
  }
  if (screen === 'evoluzione') state.scenaCorrente.payload = { giocatoreId: 1, luogoRitorno: 'mappa-principale', evoluzioni: [{ istanzaId: state.giocatore1.squadra[0].istanzaId, oldSpecieId: 1, newSpecieId: 2 }] }
  state.league = emptyLeagueState()
  if (screen === 'lega') {
    state.league.config = { version: 1, opponents: [0, 1, 2, 3].map(index => ({ name: `Superquattro ${index + 1}`, team: [{ pokemonId: [5, 9, 13, 43][index], livello: 25 }] })) as NonNullable<typeof state.league.config>['opponents'], champion: null, championEnabled: false, defeat: 'restart', betweenBattleItems: true }
    state.league.players[1] = { runId: 'ui-preview-league', nextStage: 1, status: 'running', attempt: 1, completedStages: [0], stageCompleted: true }
    state.posizione1 = mainMapPosition('Roma'); state.giocatore1.allenatoriSconfitti = new Set(ALLENATORI.filter(entry => entry.tipo === 'Capopalestra').map(entry => entry.id))
  }
  return state
}
