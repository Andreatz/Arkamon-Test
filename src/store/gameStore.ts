/**
 * Store globale dell'applicazione (Zustand).
 *
 * Sostituisce i fogli Excel `Stato_Giocatore`, `Battaglia_Corrente`,
 * `Giocatore1_Squadra`, `Giocatore2_Squadra`, etc.
 *
 * Persiste automaticamente su localStorage tra sessioni.
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { configureSessionHydration, isCampaignWritable, isCampaignCheckpointCurrent } from '@/session/sessionOwnership'
import { SessionWriteDenied } from '@/session/sessionCoordinator'
import { creaIstanza } from '@/engine/pokemonFactory'
import { isUiStudioPreview, uiPreviewCampaignStorage } from '@/ui-studio/previewMode'
import { normalizeChallengeContext, scopedGameStorage, ACTIVE_CHALLENGE_STORAGE_KEY, type ChallengeContext } from '@/challenges/challengePersistence'
import { emptyPlayer as giocatoreVuoto, mainMapPosition, normalizeGameSave, serializeGameState, GAME_SAVE_STORAGE_KEY, type GameSaveState } from '@/save/gamePersistence'
import { emptyInteractionProgress } from '@/interactions/types'
import { useInteractionStore } from '@/interactions/interactionStore'
import { finalizeConfiguredBattle, resolveConfiguredInteraction } from '@/interactions/runtime'
import { emptyArkadexProgress } from '@/arkadex/arkadexModel'
import { appendMatchEvent, emptyMatchLog } from '@/match/matchLog'
import { trackGameChange } from '@/match/trackGameChange'
import { canJoinTeam, isTeamWithinLevelCap, teamCapMessage, teamLevelRange } from '@/engine/teamLevelCap'
import { getOwnedPokemon, hasOwnedPokemon } from '@/engine/pokemonOwnership'
import { cancelPendingRecoveryCopy, scheduleRecoveryCopy, reportSaveFailure, useSaveWriteStatus } from '@/save/durableWrites'
import { recoverInterruptedBackupRestore, useBackupRestoreRecoveryStatus } from '@/save/restoreJournal'
import { useRegiaStore } from '@/regia/regiaStore'
import { resolveShopPurchase, type ShopPurchaseResult } from '@/shop/purchase'
import { getShopItem, isShopItemId, MAX_ITEM_QUANTITY, type ShopCart } from '@/shop/catalog'
import { resolveItemEffect } from '@/shop/itemEffects'
import { emptyLeagueState, type LeagueConfiguration } from '@/league/leagueModel'
import { createLeagueActions } from './game/leagueActions'
import type {
  StatoGiocatore,
  StatoBattaglia,
  PokemonIstanza,
  NavigazioneScena,
  SceneId,
  OggettoId,
  PosizioneAvatar,
  StatoTurnoOverworld,
  Casella,
  MappaGriglia,
  PosizioniMappeLocali,
} from '@/types'
import {
  calcolaHPMax,
  clearStoredExperience,
  determinaIniziativa,
  type EsitoBattaglia,
} from '@engine/battleEngine'
import { getPokemon, getAllenatore, getIncontri } from '@data/index'
import {
  MAIN_MAP_START_NODE,
  areMainMapNodesConnected,
} from '@data/mainMapRoads'
import type { SlotRef } from '@engine/deposito'
import { campaignActivityBlock, commandApplied, commandFailure, type CommandFailure, type GameCommandResult } from './game/commandPolicy'
import { resolveRosterSwap } from './game/rosterCommands'
import { cleanupBattlePlayer, clearBattleExperience, npcBattleReward, prepareBattleEntry, resolveBattleConclusion } from './game/battleCommands'
import { getLocalMap } from '@data/localMaps'
import {
  SECRET_LOCATION_ID,
  SECRET_LOCATION_ORIGIN,
  canAccessSecretLocation,
  hasUnlockedSecretLocation,
  isSecretLocationConnection,
  isSecretLocationPosition,
} from '@data/secretLocation'
import { canMoveOnLocalMap, getLocalMapNode } from '@engine/localMapMovement'
import {
  chiaveCasellaConsumata,
  consumaAzione,
  nuovoTurno,
  puòMuoversi,
  risultatoInterazione,
  type RisultatoInterazione,
} from '@engine/movimento'

export interface GameState extends GameSaveState {
  configuraLega: (configuration: LeagueConfiguration) => { ok: boolean; message: string }
  iniziaLega: () => { ok: boolean; message: string }
  prossimoIncontroLega: () => { ok: boolean; message: string }
  concludiBattagliaLega: (esito: EsitoBattaglia, squadra: PokemonIstanza[], evoluzioni?: { istanzaId: string; oldSpecieId: number; newSpecieId: number }[]) => { ok: boolean; message: string }
  usaOggettoLega: (itemId: OggettoId, instanceId: string) => { ok: boolean; message: string }
  abbandonaLega: () => { ok: boolean; message: string }
  /** Publish a compound action only after its complete checkpoint is durable. */
  eseguiTransazione: (operation: (read: () => GameState) => void) => boolean
  aggiornaStato: (patch: Partial<GameSaveState> & { teamRuleMessage?: string | null }) => boolean
  challengeContext: ChallengeContext | null
  teamRuleMessage: string | null
  dismissTeamRuleMessage: () => void
  acquistaOggetti: (playerId: 1 | 2, cart: ShopCart, location: string, shopInteractionId?: string) => ShopPurchaseResult
  applicaOggetto: (playerId: 1 | 2, itemId: OggettoId, instanceId: string) => { ok: boolean; message: string }
  /** Volatile scene generation. A restored/new campaign must release every old timer and local scene snapshot. */
  campaignRevision: number
  /** Recoveries from the last load; excluded from portable files. */
  saveRecoveryWarnings: string[]
  dismissSaveRecoveryWarnings: () => void
  eseguiInterazioneConfigurata: (giocatoreId: 1 | 2, interactionId: string) => { ok: boolean; message: string }
  // === STATO GIOCATORI ===
  giocatore1: StatoGiocatore
  giocatore2: StatoGiocatore
  /** Quale dei due giocatori sta giocando il proprio turno */
  giocatoreAttivo: 1 | 2

  // === STATO BATTAGLIA ===
  battaglia: StatoBattaglia | null

  /** ID specie dello starter assegnato al Rivale (quello scartato dai giocatori) */
  rivaleStarterId: number | null

  // === OVERWORLD (Fase E) ===
  posizione1: PosizioneAvatar
  posizione2: PosizioneAvatar
  turnoOverworld: StatoTurnoOverworld
  posizioniLocali1: PosizioniMappeLocali
  posizioniLocali2: PosizioniMappeLocali

  // === NAVIGAZIONE ===
  scenaCorrente: NavigazioneScena
  scenaPrecedente: NavigazioneScena | null

  // === AUDIO ===
  audioMuted: boolean

  // =====================================================
  // ACTIONS
  // =====================================================

  /** Naviga a una nuova scena, ricordando quella precedente */
  vaiAScena: (scena: SceneId, payload?: Record<string, unknown>) => void

  /** Torna alla scena precedente */
  scenaIndietro: () => void

  /** Abilita/disabilita audio globale, persistito nel save. */
  setAudioMuted: (muted: boolean) => void

  /** Cambia il giocatore attivo (alternanza tra Giocatore 1 e 2) */
  cambiaGiocatoreAttivo: () => GameCommandResult

  /** Imposta il nome visualizzato di un giocatore. */
  impostaNomeGiocatore: (giocatoreId: 1 | 2, nome: string) => void

  /** Assegna uno starter disponibile al prossimo giocatore che deve sceglierlo. */
  scegliStarter: (specieId: number) => boolean

  /** Aggiunge un pokemon alla squadra (se piena va in deposito). */
  aggiungiPokemon: (giocatoreId: 1 | 2, istanza: PokemonIstanza) => void
  /** Capture, optional Masterball consumption and the finished battle save form one update. */
  concludiCattura: (giocatoreId: 1 | 2, istanza: PokemonIstanza, patch: Partial<StatoBattaglia>, masterball?: boolean) => boolean

  /** Aggiorna un pokemon esistente (HP, livello, evoluzione...) */
  aggiornaPokemon: (giocatoreId: 1 | 2, istanza: PokemonIstanza) => void

  /** Marca un cespuglio come visitato (non più ripetibile per quel giocatore) */
  segnaCespuglioVisitato: (giocatoreId: 1 | 2, luogo: string, cespuglio: string) => void

  /** Verifica se un cespuglio è già stato visitato dal giocatore */
  cespuglioVisitato: (giocatoreId: 1 | 2, luogo: string, cespuglio: string) => boolean

  /** Aggiunge (o sottrae se delta < 0) monete al giocatore, non scende sotto 0 */
  aggiornaMonete: (giocatoreId: 1 | 2, delta: number) => void

  /** Decrementa di 1 la quantità dell'oggetto. Ritorna true se consumato. */
  usaOggetto: (giocatoreId: 1 | 2, oggettoId: OggettoId, battlePatch?: Partial<StatoBattaglia>) => boolean

  /** Aggiunge (o crea) `delta` unità di un oggetto. */
  aggiungiOggetto: (giocatoreId: 1 | 2, oggettoId: OggettoId, delta: number) => void

  /** Avvia una battaglia contro un allenatore NPC. Ritorna false se non avviabile */
  iniziaBattagliaNPC: (allenatoreId: number, luogoRitorno: string) => boolean

  /** Risolve l'esito di una battaglia NPC: applica monete e marca sconfitto */
  risolviBattagliaNPC: (esito: EsitoBattaglia) => void

  /** Cura tutta la squadra del giocatore (Centro Pokemon) */
  curaSquadra: (giocatoreId: 1 | 2) => GameCommandResult

  /** Scambia o sposta il contenuto tra due slot (squadra o deposito) */
  scambiaSlot: (giocatoreId: 1 | 2, source: SlotRef, target: SlotRef) => GameCommandResult
  /** Assegna lo starter scartato al Rivale (porting di AssegnaRivaleEVaiAllaMappa) */
  assegnaRivaleStarter: (specieId: number) => void

  /** Avvia una nuova battaglia */
  iniziaBattaglia: (battaglia: StatoBattaglia) => GameCommandResult

  /** Aggiorna lo stato della battaglia in corso */
  aggiornaBattaglia: (patch: Partial<StatoBattaglia>) => void

  /** Termina la battaglia: conserva la paralisi salvo cura completa, pulisce gli altri stati. */
  terminaBattaglia: (curaCompleta: boolean) => void
  /** Settle the durable final roster, rewards, cleanup and return scene together. */
  concludiBattaglia: (esito: EsitoBattaglia) => GameCommandResult

  // === ACTIONS OVERWORLD (Fase E) ===

  /**
   * Muove l'avatar del giocatore alla nuova posizione (deve essere adiacente
   * e calpestabile). Decrementa di 1 le azioni rimaste; se arriva a 0 passa
   * automaticamente il turno all'altro giocatore.
   * Ritorna `true` se il movimento è stato applicato.
   */
  muoviAvatar: (giocatoreId: 1 | 2, nuovaPos: PosizioneAvatar, mappa: MappaGriglia) => boolean

  /**
   * Interagisce con la casella in (x, y) sulla mappa data. Marca la casella
   * come consumata (per cespuglio/allenatore/npc), gestisce internamente
   * `transizione-mappa` (sposta l'avatar sulla mappa di destinazione) e
   * chiude il turno (azioni → 0 → swap).
   * Ritorna il `RisultatoInterazione` per delegare battaglia/edificio
   * alla UI; `no-op` se la casella non è interagibile dal giocatore.
   */
  interagisciCasella: (
    giocatoreId: 1 | 2,
    mappa: MappaGriglia,
    x: number,
    y: number
  ) => RisultatoInterazione

  /** Forza lo swap del turno overworld (usato dalla UI come pulsante manuale). */
  passaTurnoOverworld: () => void

  /** Muove l'avatar sulla mappa principale lungo una strada collegata. */
  muoviAvatarMappaPrincipale: (giocatoreId: 1 | 2, luogoDestinazione: string) => boolean

  /** Crosses the hidden Rome passage using one shared movement action. */
  attraversaPassaggioSegreto: (giocatoreId: 1 | 2) => boolean

  /** Consuma l'interazione del turno sul nodo corrente della mappa principale. */
  interagisciLuogoMappaPrincipale: (
    giocatoreId: 1 | 2
  ) => { tipo: 'no-op' } | { tipo: 'luogo'; luogo: string }

  /** Prepara il punto d'ingresso locale solo per un giocatore che si trova già nel luogo. */
  inizializzaPosizioneLocale: (giocatoreId: 1 | 2, luogo: string) => string | null

  /** Aprire il disegno locale non consuma azioni e non sposta il nodo sulla mappa principale. */
  apriMappaLocale: (giocatoreId: 1 | 2, luogo: string) => boolean

  /** Percorre una sola strada locale e consuma una delle due azioni condivise. */
  muoviAvatarMappaLocale: (giocatoreId: 1 | 2, luogo: string, nodoDestinazione: string) => boolean

  /** L'interazione chiude il turno ma mantiene il giocatore che deve completare l'attività. */
  consumaInterazioneMappaLocale: (giocatoreId: 1 | 2, luogo: string) => boolean

  /** Attiva il prossimo turno, anche se già accodato da un'interazione nel luogo. */
  passaTurnoMappaLocale: () => boolean

  /** Reset completo del gioco (Nuova Partita) */
  reset: () => void
}

export const STARTER_IDS = [1, 5, 9] as const

const posizioneIniziale = () => mainMapPosition()
const posizioneMappaPrincipale = mainMapPosition

function luogoMappaPrincipale(posizione: PosizioneAvatar): string {
  return posizione.mappaId === 'mappa-principale'
    ? posizione.luogo ?? MAIN_MAP_START_NODE
    : MAIN_MAP_START_NODE
}

function puoAccedereAlLuogoSegreto(state: GameState, giocatoreId: 1 | 2): boolean {
  return canAccessSecretLocation(
    state[giocatoreId === 1 ? 'giocatore1' : 'giocatore2'],
    state[giocatoreId === 1 ? 'posizione1' : 'posizione2'],
  )
}

function navigazioneSegretaConsentita(state: GameState, scena: NavigazioneScena): boolean {
  return scena.payload?.luogo !== SECRET_LOCATION_ID
    || (scena.scena === 'percorso' && puoAccedereAlLuogoSegreto(state, state.giocatoreAttivo))
}

/**
 * Cerca il primo slot libero nel deposito (box × slot).
 * Il deposito ha 30 box × 35 slot, identici a Excel.
 */
function trovaSlotDepositoLibero(deposito: Record<string, PokemonIstanza>): string | null {
  for (let box = 1; box <= 30; box++) {
    for (let slot = 1; slot <= 35; slot++) {
      const chiave = `${box}:${slot}`
      if (!deposito[chiave]) return chiave
    }
  }
  return null
}

export function haSpazioPokemon(giocatore: StatoGiocatore, target?: PokemonIstanza): boolean {
  const canUseTeam = target ? canJoinTeam(giocatore.squadra, target) : giocatore.squadra.length < 6
  return canUseTeam || trovaSlotDepositoLibero(giocatore.deposito) !== null
}

export const useGameStore = create<GameState>()(
  persist(
    (rawSet, getRaw) => {
      let staged: GameState | null = null
      let retryingWrite = false
      const get = (): GameState => staged ?? getRaw()
      const commandWriteBlock = (): CommandFailure | null => {
        if (!isCampaignWritable()) return commandFailure('readonly', 'Questa finestra è in consultazione. Usa la console che conduce la partita.')
        if (useBackupRestoreRecoveryStatus.getState().error) return commandFailure('recovery-required', 'Completa il recupero del salvataggio prima di modificare la partita.')
        const pending = useSaveWriteStatus.getState()
        if (!retryingWrite && pending.error && !pending.local) return commandFailure('save-pending', 'Risolvi il salvataggio in sospeso prima di applicare un’altra operazione.')
        return null
      }
      const applyCommand = (patch: Partial<GameState>, message: string): GameCommandResult => {
        const denied = commandWriteBlock()
        if (denied) return denied
        return set(patch) ? commandApplied(message) : commandFailure('save-failed', 'Operazione non salvata. I dati precedenti restano intatti.')
      }
      const reportTeamRule = (message: string) => {
        if (staged) staged = { ...staged, teamRuleMessage: message }
        else publish({ ...getRaw(), teamRuleMessage: message })
      }
      const set = (update: Parameters<typeof rawSet>[0], replace?: boolean): boolean => {
        if (!isCampaignWritable()) return false
        const previous = get()
        const patch = typeof update === 'function' ? update(previous) : update
        if (patch === previous) return true
        if (staged) { staged = { ...staged, ...patch }; return true }
        return commitDurable(patch, false, replace)
      }
      const publish = (state: GameState, replace?: boolean) => {
        const storage = useGameStore.persist?.getOptions().storage
        if (storage) useGameStore.persist.setOptions({ storage: { ...storage, setItem: () => undefined } })
        try { rawSet(state, replace) } finally { if (storage) useGameStore.persist.setOptions({ storage }) }
      }
      const commitDurable = (patch: Partial<GameState>, local = false, replace?: boolean): boolean => {
        if (!isCampaignWritable()) return false
        if (useBackupRestoreRecoveryStatus.getState().error) return false
        if (staged) { staged = { ...staged, ...patch }; return true }
        const pendingWrite = useSaveWriteStatus.getState()
        // Background checkpoint effects must not replace an unsaved action.
        if (!retryingWrite && pendingWrite.error && !pendingWrite.local) return false
        const previous = get(), next = { ...previous, ...patch }
        const tracked = next.challengeContext ? next : { ...next, ...trackGameChange(previous, next) }
        if (isUiStudioPreview()) { publish(tracked, replace); return true }
        const options = useGameStore.persist?.getOptions(), storage = options?.storage
        const previousSave = { ...serializeGameState(previous), ...(previous.challengeContext ? { challengeContext: previous.challengeContext } : {}) }
        const saved = { ...serializeGameState(tracked), ...(tracked.challengeContext ? { challengeContext: tracked.challengeContext } : {}) }
        const baseline = JSON.stringify(previousSave)
        if (baseline === JSON.stringify(saved)) { publish(tracked, replace); return true }
        const failed = () => {
          reportSaveFailure(() => {
            const current = get()
            const currentSaved = { ...serializeGameState(current), ...(current.challengeContext ? { challengeContext: current.challengeContext } : {}) }
            if (current.campaignRevision !== previous.campaignRevision || JSON.stringify(currentSaved) !== baseline) { useSaveWriteStatus.getState().clear(); return false }
            retryingWrite = true
            try { return commitDurable(patch, local, replace) } finally { retryingWrite = false }
          }, local, () => publish({ ...getRaw(), campaignRevision: getRaw().campaignRevision + 1 }))
          return false
        }
        if (!storage) { if (typeof window !== 'undefined') return failed(); publish(tracked, replace); return true }
        try {
          const result = storage.setItem(options?.name ?? GAME_SAVE_STORAGE_KEY, { state: saved as unknown as GameState, version: 0 })
          if (result instanceof Promise) { void result.catch(() => {}); return failed() }
          if (!previous.challengeContext && !tracked.challengeContext && typeof window !== 'undefined') {
            const revision = tracked.campaignRevision
            scheduleRecoveryCopy(previous, () => isCampaignWritable() && get().campaignRevision === revision && !get().challengeContext,
              () => !useRegiaStore.getState().busy)
          }
          // A retried battle action must rebuild its scene from the checkpoint;
          // the failed action's local HP/messages are not authoritative.
          publish(retryingWrite && !local && tracked.scenaCorrente.scena === 'battaglia'
            ? { ...tracked, campaignRevision: tracked.campaignRevision + 1 } : tracked, replace)
          useSaveWriteStatus.getState().clear()
          return true
        } catch (error) { return error instanceof SessionWriteDenied ? false : failed() }
      }
      return ({
      aggiornaStato: (patch) => set(patch),
      eseguiTransazione: (operation) => {
        if (!isCampaignWritable()) return false
        if (staged) { operation(get); return true }
        const previous = getRaw()
        staged = previous
        let candidate: GameState
        try { operation(get); candidate = staged } finally { staged = null }
        return candidate === previous ? true : commitDurable(candidate)
      },
      giocatore1: giocatoreVuoto(1),
      giocatore2: giocatoreVuoto(2),
      giocatoreAttivo: 1,
      battaglia: null,
      rivaleStarterId: null,
      posizione1: posizioneIniziale(),
      posizione2: posizioneIniziale(),
      turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
      posizioniLocali1: {},
      posizioniLocali2: {},
      scenaCorrente: { scena: 'titolo' },
      scenaPrecedente: null,
      audioMuted: false,
      campaignRevision: 0,
      challengeContext: null,
      league: emptyLeagueState(),
      interactionProgress: emptyInteractionProgress(),
      fallbackLocationActivity: null,
      arkadex: emptyArkadexProgress(), matchLog: emptyMatchLog(),
      teamRuleMessage: null,
      dismissTeamRuleMessage: () => set({ teamRuleMessage: null }),
      saveRecoveryWarnings: [],
      dismissSaveRecoveryWarnings: () => set({ saveRecoveryWarnings: [] }),

      vaiAScena: (scena, payload) =>
        set((s) => !navigazioneSegretaConsentita(s, { scena, payload }) ? s : ({
          scenaPrecedente: s.scenaCorrente,
          scenaCorrente: { scena, payload },
          // A fallback location reserves exactly one activity. The reservation
          // must not survive a return to the overworld or another scene.
          fallbackLocationActivity: scena === 'citta' || scena === 'percorso'
            ? s.fallbackLocationActivity
            : null,
        })),

      scenaIndietro: () =>
        set((s) =>
          s.scenaPrecedente
            && navigazioneSegretaConsentita(s, s.scenaPrecedente)
            ? {
              scenaCorrente: s.scenaPrecedente,
              scenaPrecedente: null,
              fallbackLocationActivity: s.scenaPrecedente.scena === 'citta' || s.scenaPrecedente.scena === 'percorso'
                ? s.fallbackLocationActivity
                : null,
            }
            : s
        ),

      setAudioMuted: (audioMuted) => set({ audioMuted }),

      cambiaGiocatoreAttivo: () => {
        const denied = commandWriteBlock() ?? campaignActivityBlock(get())
        if (denied) return denied
        return applyCommand({ giocatoreAttivo: get().giocatoreAttivo === 1 ? 2 : 1 }, 'Giocatore attivo aggiornato.')
      },

      impostaNomeGiocatore: (giocatoreId, nome) =>
        set((s) => {
          const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
          return {
            [chiaveG]: {
              ...s[chiaveG],
              nome: nome.trim() || `Giocatore ${giocatoreId}`,
            },
          } as Partial<GameState>
        }),

      scegliStarter: (specieId) => {
        const state = get()
        const giocatoreId = !hasOwnedPokemon(state.giocatore1)
          ? 1
          : !hasOwnedPokemon(state.giocatore2) ? 2 : null
        const scelti = [...getOwnedPokemon(state.giocatore1), ...getOwnedPokemon(state.giocatore2)]
          .map((pokemon) => pokemon.specieId)
        if (!giocatoreId || !STARTER_IDS.some((id) => id === specieId) || scelti.includes(specieId)) {
          return false
        }
        const istanza = creaIstanza(specieId, 5)
        if (!istanza) return false
        const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
        const rimanenti = STARTER_IDS.filter((id) => id !== specieId && !scelti.includes(id))
        return set({
          [chiaveG]: { ...state[chiaveG], squadra: [istanza] },
          giocatoreAttivo: giocatoreId === 1 ? 2 : state.turnoOverworld.giocatoreAttivo,
          ...(giocatoreId === 2 && rimanenti.length === 1 ? { rivaleStarterId: rimanenti[0] } : {}),
        } as Partial<GameState>)
      },

      aggiungiPokemon: (giocatoreId, creature) =>
        set((s) => {
          const istanza = clearStoredExperience(creature)
          const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
          const g = s[chiaveG]
          if ([...g.squadra, ...Object.values(g.deposito)].some((pokemon) => pokemon.istanzaId === istanza.istanzaId)) return s
          if (canJoinTeam(g.squadra, istanza)) {
            return { [chiaveG]: { ...g, squadra: [...g.squadra, istanza] } } as Partial<GameState>
          }
          // Squadra piena → deposito
          const slot = trovaSlotDepositoLibero(g.deposito)
          if (!slot) return s
          return {
            [chiaveG]: { ...g, deposito: { ...g.deposito, [slot]: istanza } },
          } as Partial<GameState>
        }),

      concludiCattura: (giocatoreId, creature, patch, masterball = false) => {
        const istanza = clearStoredExperience(creature)
        const state = get()
        const battle = state.battaglia
        const key = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
        const player = state[key]
        if (!battle || battle.tipo !== 'Selvatico' || battle.checkpoint?.phase === 'ended'
          || battle.pokemonB.istanzaId !== istanza.istanzaId || !haSpazioPokemon(player, istanza)
          || battle.pokemonB.hp <= 0 || patch.checkpoint?.phase !== 'ended' || patch.checkpoint.outcome !== 'vittoria'
          || (masterball && (player.inventario.masterball ?? 0) <= 0)) return false
        const eligible = canJoinTeam(player.squadra, istanza)
        const slot = !eligible ? trovaSlotDepositoLibero(player.deposito) : null
        if (!eligible && !slot) return false
        const nextPlayer = {
          ...player,
          squadra: slot ? player.squadra : [...player.squadra, istanza],
          deposito: slot ? { ...player.deposito, [slot]: istanza } : player.deposito,
          inventario: masterball
            ? { ...player.inventario, masterball: (player.inventario.masterball ?? 0) - 1 }
            : player.inventario,
        }
        return commitDurable({ [key]: nextPlayer, battaglia: clearBattleExperience({ ...battle, ...patch }) } as Partial<GameState>, true)
      },

      aggiornaPokemon: (giocatoreId, creature) =>
        set((s) => {
          const istanza = clearStoredExperience(creature)
          const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
          const g = s[chiaveG]
          // Cerca prima nella squadra
          const idxSquadra = g.squadra.findIndex((p) => p.istanzaId === istanza.istanzaId)
          if (idxSquadra >= 0) {
            const nuovaSquadra = [...g.squadra]
            nuovaSquadra[idxSquadra] = istanza
            if (teamLevelRange(nuovaSquadra).gap > Math.max(5, teamLevelRange(g.squadra).gap)) return { teamRuleMessage: teamCapMessage(nuovaSquadra) }
            return { [chiaveG]: { ...g, squadra: nuovaSquadra },
              ...(s.league.winner?.playerId === giocatoreId && s.scenaCorrente.scena === 'evoluzione'
                ? { league: { ...s.league, winner: { ...s.league.winner, team: s.league.winner.team.map((p) => p.istanzaId === istanza.istanzaId ? istanza : p) } } } : {}),
            } as Partial<GameState>
          }
          // Poi nel deposito
          for (const [chiave, p] of Object.entries(g.deposito)) {
            if (p.istanzaId === istanza.istanzaId) {
              return {
                [chiaveG]: { ...g, deposito: { ...g.deposito, [chiave]: istanza } },
              } as Partial<GameState>
            }
          }
          return s
        }),

      segnaCespuglioVisitato: (giocatoreId, luogo, cespuglio) =>
        set((s) => {
          if (luogo === SECRET_LOCATION_ID && (s.giocatoreAttivo !== giocatoreId || !puoAccedereAlLuogoSegreto(s, giocatoreId))) return s
          const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
          const g = s[chiaveG]
          const nuovo = new Set(g.cespugliVisitati)
          nuovo.add(`${luogo}:${cespuglio}`)
          return { [chiaveG]: { ...g, cespugliVisitati: nuovo } } as Partial<GameState>
        }),

      cespuglioVisitato: (giocatoreId, luogo, cespuglio) => {
        const g = get()[giocatoreId === 1 ? 'giocatore1' : 'giocatore2']
        return g.cespugliVisitati.has(`${luogo}:${cespuglio}`)
      },

      aggiornaMonete: (giocatoreId, delta) =>
        set((s) => {
          const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
          const g = s[chiaveG]
          return {
            [chiaveG]: { ...g, monete: Math.max(0, g.monete + delta) },
          } as Partial<GameState>
        }),

      usaOggetto: (giocatoreId, oggettoId, battlePatch) => {
        if (!isShopItemId(oggettoId)) return false
        const state = get()
        const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
        const g = state[chiaveG]
        const q = g.inventario[oggettoId] ?? 0
        if (battlePatch && (!state.battaglia || state.battaglia.checkpoint?.outcome || state.giocatoreAttivo !== giocatoreId)) return false
        if (q <= 0) return false
        const written = commitDurable({
          ...(battlePatch ? { battaglia: { ...state.battaglia!, ...battlePatch } } : {}),
          [chiaveG]: {
            ...g,
            inventario: { ...g.inventario, [oggettoId]: q - 1 },
          },
        } as Partial<GameState>)
        return written
      },

      aggiungiOggetto: (giocatoreId, oggettoId, delta) =>
        set((s) => {
          if (!isShopItemId(oggettoId) || !Number.isSafeInteger(delta)) return s
          const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
          const g = s[chiaveG]
          const q = g.inventario[oggettoId] ?? 0
          return {
            [chiaveG]: {
              ...g,
              inventario: { ...g.inventario, [oggettoId]: Math.min(MAX_ITEM_QUANTITY, Math.max(0, q + delta)) },
            },
          } as Partial<GameState>
        }),

      // Porting di: IniziaBattagliaAllenatore da old_files/Mod_Game_Events.txt
      acquistaOggetti: (playerId, cart, location, shopInteractionId) => {
        const denied = commandWriteBlock() ?? campaignActivityBlock(get())
        if (denied) return denied
        const result = resolveShopPurchase(get(), playerId, cart, location, { interactionId: shopInteractionId, interactions: useInteractionStore.getState().interactions })
        if (result.ok && result.patch && !commitDurable(result.patch)) return { ok: false, message: 'Acquisto non salvato: spazio del browser esaurito o bloccato. Monete e borsa restano intatte.' }
        return result
      },
      applicaOggetto: (playerId, itemId, instanceId) => {
        const state = get(), key = playerId === 1 ? 'giocatore1' : 'giocatore2', player = state[key]
        const denied = commandWriteBlock()
        if (denied) return denied
        if (state.challengeContext) return commandFailure('challenge-active', 'Usa soltanto gli oggetti previsti dalle regole della sfida.')
        if (state.league.players[state.giocatoreAttivo].status === 'running' && !state.battaglia) {
          return playerId === state.giocatoreAttivo ? state.usaOggettoLega(itemId, instanceId) : { ok: false, message: 'La Lega è riservata al giocatore in sfida.' }
        }
        if (state.battaglia || state.interactionProgress.pendingBattle) return { ok: false, message: 'Usa la Borsa della battaglia durante uno scontro.' }
        if (['titolo', 'laboratorio', 'evoluzione'].includes(state.scenaCorrente.scena)) return { ok: false, message: 'Concludi questa schermata prima di usare un oggetto.' }
        if (state.giocatoreAttivo !== playerId || state.turnoOverworld.giocatoreAttivo !== playerId || state.turnoOverworld.azioniRimaste < 1) return { ok: false, message: 'Il turno di questo giocatore è concluso.' }
        if (!isShopItemId(itemId) || (player.inventario[itemId] ?? 0) < 1) return { ok: false, message: 'Questo oggetto non è nella borsa.' }
        const pokemon = player.squadra.find((entry) => entry.istanzaId === instanceId)
        if (!pokemon) return { ok: false, message: 'Scegli un Arkamon della tua squadra.' }
        const result = resolveItemEffect(pokemon, itemId)
        if (!result.ok || !result.pokemon) return result
        const written = commitDurable({ [key]: { ...player, squadra: player.squadra.map((entry) => entry.istanzaId === instanceId ? result.pokemon! : entry),
          inventario: { ...player.inventario, [itemId]: player.inventario[itemId]! - 1 } }, turnoOverworld: nuovoTurno(playerId),
          matchLog: appendMatchEvent(state.matchLog, { kind: 'interaction', playerId, title: `Usa ${getShopItem(itemId)!.name}`, message: result.message }),
        })
        if (!written) return { ok: false, message: 'Oggetto non usato: il browser non può salvare la partita. Borsa e HP restano intatti.' }
        return { ok: true, message: `${result.message} Il turno è concluso.` }
      },
      iniziaBattagliaNPC: (allenatoreId, luogoRitorno) => {
        if (commandWriteBlock() || campaignActivityBlock(get())) return false
        const allenatore = getAllenatore(allenatoreId)
        if (!allenatore || allenatore.squadra.length === 0) return false

        const state = get()
        if (campaignActivityBlock(state)) return false
        if ((luogoRitorno === SECRET_LOCATION_ID || allenatore.luogo === SECRET_LOCATION_ID)
          && (!puoAccedereAlLuogoSegreto(state, state.giocatoreAttivo) || allenatore.luogo !== luogoRitorno)) return false
        const giocatore =
          state.giocatoreAttivo === 1 ? state.giocatore1 : state.giocatore2
        if (giocatore.squadra.length === 0) return false
        if (!isTeamWithinLevelCap(giocatore.squadra)) { set({ teamRuleMessage: teamCapMessage(giocatore.squadra) }); return false }
        if (giocatore.allenatoriSconfitti.has(allenatoreId)) return false
        const pokemonA = giocatore.squadra.find((p) => p.hp > 0)
        if (!pokemonA) return false

        // Per il Rivale (tipo PVP), il primo slot è lo starter scartato
        // dai giocatori (porting di AssegnaRivaleEVaiAllaMappa).
        const isRivale = allenatore.tipo === 'PVP'
        const slotsAllenatore = allenatore.squadra.map((s, i) =>
          isRivale && i === 0 && state.rivaleStarterId
            ? { ...s, pokemonId: state.rivaleStarterId }
            : s
        )

        // Crea istanze fresche per tutta la squadra dell'allenatore
        const squadraB: PokemonIstanza[] = []
        for (let i = 0; i < slotsAllenatore.length; i++) {
          const slot = slotsAllenatore[i]
          const speci = getPokemon(slot.pokemonId)
          if (!speci) continue
          const ist: PokemonIstanza = {
            istanzaId: `npc-${allenatoreId}-${i}-${Date.now()}`,
            specieId: slot.pokemonId,
            nome: speci.nome,
            livello: slot.livello,
            hp: 0,
            xp: 0,
          }
          ist.hp = calcolaHPMax(ist)
          squadraB.push(ist)
        }
        if (squadraB.length === 0) return false

        const pokemonB = squadraB[0]
        const turnoCorrente = determinaIniziativa(pokemonA.livello, pokemonB.livello, Math.random, pokemonA.stato?.tipo, pokemonB.stato?.tipo)
        const tipo = allenatore.tipo === 'PVP' ? 'PVP' : 'NPC'

        return set({
          battaglia: {
            tipo,
            pokemonA,
            pokemonB,
            hpMaxA: calcolaHPMax(pokemonA),
            hpMaxB: calcolaHPMax(pokemonB),
            turnoCorrente,
            squadraA: giocatore.squadra,
            squadraB,
            luogoRitorno,
            allenatoreId,
            log: [`${allenatore.nome} ti sfida!`],
            evoluzioneInAttesa: null,
          },
        })
      },

      risolviBattagliaNPC: (esito) => {
        const state = get()
        const b = state.battaglia
        if (!b || b.leagueBattle || b.allenatoreId === undefined || b.tipo === 'Selvatico' || b.ricompenseApplicate) return
        const giocatoreId = state.giocatoreAttivo
        const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
        set({
          battaglia: { ...b, ricompenseApplicate: true },
          [chiaveG]: npcBattleReward(state[chiaveG], b, esito),
        } as Partial<GameState>)
      },

      curaSquadra: (giocatoreId) => {
          const s = get(), denied = commandWriteBlock() ?? campaignActivityBlock(s)
          if (denied) return denied
          if (giocatoreId !== 1 && giocatoreId !== 2) return commandFailure('invalid-player', 'Giocatore non valido.')
          const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2', g = s[chiaveG]
          const squadraCurata = g.squadra.map((p) => {
            const { stato: _stato, ...senzaStato } = p
            return { ...senzaStato, hp: calcolaHPMax(senzaStato) }
          })
          return applyCommand({ [chiaveG]: { ...g, squadra: squadraCurata } }, 'La squadra è stata curata.')
      },

      // Porting di: EseguiScambioDati da old_files/Mod_Deposito.txt
      scambiaSlot: (giocatoreId, source, target) => {
        const denied = commandWriteBlock()
        if (denied) return denied
        const resolution = resolveRosterSwap(get(), giocatoreId, source, target)
        if (!resolution.result.ok) {
          if (resolution.result.code === 'team-level-cap') reportTeamRule(resolution.result.message)
          return resolution.result
        }
        return resolution.patch ? applyCommand(resolution.patch, resolution.result.message) : resolution.result
      },
      // Porting di: AssegnaRivaleEVaiAllaMappa da old_files/Mod_Game_Events.txt
      assegnaRivaleStarter: (specieId) => set({ rivaleStarterId: specieId }),

      iniziaBattaglia: (battaglia) => {
        const state = get()
        const denied = commandWriteBlock() ?? campaignActivityBlock(state)
        if (denied) return denied
        if (battaglia.luogoRitorno === SECRET_LOCATION_ID && !puoAccedereAlLuogoSegreto(state, state.giocatoreAttivo))
          return commandFailure('secret-locked', 'Il passaggio segreto non è ancora disponibile.')
        const prepared = prepareBattleEntry(battaglia, state[state.giocatoreAttivo === 1 ? 'giocatore1' : 'giocatore2'])
        if (!prepared.result.ok) {
          if (prepared.result.code === 'team-level-cap') reportTeamRule(prepared.result.message)
          return prepared.result
        }
        return applyCommand({ battaglia: prepared.battle! }, prepared.result.message)
      },

      aggiornaBattaglia: (patch) =>
        set((s) => (s.battaglia ? { battaglia: clearBattleExperience({ ...s.battaglia, ...patch }) } : s)),

      terminaBattaglia: (curaCompleta) =>
        set((s) => {
          const final = finalizeConfiguredBattle(s)
          const giocatore1 = final.giocatore1 ?? s.giocatore1
          const giocatore2 = final.giocatore2 ?? s.giocatore2
          return {
            ...final,
            battaglia: null,
            giocatore1: cleanupBattlePlayer(giocatore1, curaCompleta),
            giocatore2: cleanupBattlePlayer(giocatore2, curaCompleta),
          }
        }),

      concludiBattaglia: (esito) => {
        const denied = commandWriteBlock()
        if (denied) return denied
        const state = get(), resolved = resolveBattleConclusion(state, esito)
        if (!resolved.result.ok || !resolved.patch) return resolved.result
        if (resolved.patch.scenaCorrente && !navigazioneSegretaConsentita(state, resolved.patch.scenaCorrente))
          return commandFailure('secret-locked', 'Il luogo di ritorno non è disponibile. Il risultato della battaglia resta salvato.')
        return applyCommand(resolved.patch, resolved.result.message)
      },

      eseguiInterazioneConfigurata: (giocatoreId, interactionId) => {
        const denied = commandWriteBlock() ?? campaignActivityBlock(get())
        if (denied) return denied
        const definition = useInteractionStore.getState().interactions.find((entry) => entry.id === interactionId)
        const result = resolveConfiguredInteraction(get(), definition, giocatoreId)
        if (result.patch?.battaglia && !isTeamWithinLevelCap(result.patch.battaglia.squadraA ?? [])) return { ok: false, message: teamCapMessage(result.patch.battaglia.squadraA ?? []) }
        if (result.ok && result.patch && !set(result.patch)) return { ok: false, message: 'Interazione non salvata. Costi, ricompense e azioni restano intatti.' }
        return { ok: result.ok, message: result.message }
      },

      ...createLeagueActions(get, set),
      // ----------------------------------------------------------------
      // OVERWORLD (Fase E)
      // ----------------------------------------------------------------

      muoviAvatar: (giocatoreId, nuovaPos, mappa) => {
        const state = get()
        const chiavePos = giocatoreId === 1 ? 'posizione1' : 'posizione2'
        const da = state[chiavePos]
        if (campaignActivityBlock(state)) return false
        if (mappa.id === SECRET_LOCATION_ID || nuovaPos.luogo === SECRET_LOCATION_ID || isSecretLocationPosition(da)) return false
        if (state.turnoOverworld.giocatoreAttivo !== giocatoreId) return false
        if (state.turnoOverworld.azioniRimaste <= 0) return false
        if (nuovaPos.mappaId !== mappa.id) return false
        if (!puòMuoversi(da, { x: nuovaPos.x, y: nuovaPos.y }, mappa)) return false

        const turnoNuovo = consumaAzione(state.turnoOverworld, 'movimento')
        const turnoFinale =
          turnoNuovo.azioniRimaste <= 0 ? nuovoTurno(giocatoreId) : turnoNuovo

        return set({
          [chiavePos]: nuovaPos,
          turnoOverworld: turnoFinale,
        } as Partial<GameState>)
      },

      interagisciCasella: (giocatoreId, mappa, x, y) => {
        const state = get()
        if (campaignActivityBlock(state)) return { tipo: 'no-op' }
        if (state.turnoOverworld.giocatoreAttivo !== giocatoreId) {
          return { tipo: 'no-op' }
        }
        if (state.turnoOverworld.azioniRimaste <= 0) return { tipo: 'no-op' }
        const posizione = state[giocatoreId === 1 ? 'posizione1' : 'posizione2']
        if (mappa.id === SECRET_LOCATION_ID || isSecretLocationPosition(posizione)) return { tipo: 'no-op' }
        if (posizione.mappaId !== mappa.id || Math.abs(posizione.x - x) + Math.abs(posizione.y - y) !== 1) {
          return { tipo: 'no-op' }
        }
        const casella: Casella | undefined = mappa.caselle[y]?.[x]
        if (!casella) return { tipo: 'no-op' }

        const chiaveG = giocatoreId === 1 ? 'giocatore1' : 'giocatore2'
        const g = state[chiaveG]
        const r = risultatoInterazione(
          mappa.id,
          x,
          y,
          casella,
          giocatoreId,
          {
            caselleConsumate: g.caselleConsumate,
            allenatoriSconfitti: g.allenatoriSconfitti,
          }
        )
        if (r.tipo === 'no-op') return r
        if (r.tipo === 'transizione-mappa' && r.versoMappaId === SECRET_LOCATION_ID) return { tipo: 'no-op' }

        // Validate every battle prerequisite before consuming a legacy tile or
        // swapping the overworld turn. The scene starts it in the same transaction.
        if (r.tipo === 'battaglia-npc' || r.tipo === 'battaglia-selvatica') {
          if (!isTeamWithinLevelCap(g.squadra)) { set({ teamRuleMessage: teamCapMessage(g.squadra) }); return { tipo: 'no-op' } }
          if (!g.squadra.some((pokemon) => pokemon.hp > 0)) return { tipo: 'no-op' }
          if (r.tipo === 'battaglia-npc') {
            const trainer = getAllenatore(r.allenatoreId)
            if (!trainer || !trainer.squadra.some((slot) => !!getPokemon(slot.pokemonId))) return { tipo: 'no-op' }
          } else if (!getIncontri(mappa.id, r.cespuglioId).length) return { tipo: 'no-op' }
        }

        // Marca la casella come consumata se è un tipo "esauribile".
        // Edifici e uscite restano sempre interagibili.
        const chiave = chiaveCasellaConsumata(mappa.id, x, y, casella)
        const nuoveConsumate = chiave
          ? new Set(g.caselleConsumate).add(chiave)
          : g.caselleConsumate

        // Se è una transizione-mappa, sposta l'avatar sul nuovo spawn.
        const chiavePos = giocatoreId === 1 ? 'posizione1' : 'posizione2'
        const nuovaPos: PosizioneAvatar =
          r.tipo === 'transizione-mappa'
            ? {
                mappaId: r.versoMappaId,
                x: r.spawnX,
                y: r.spawnY,
                direzione: state[chiavePos].direzione,
              }
            : state[chiavePos]

        // Interazione consuma l'intero turno → swap immediato.
        const turnoFinale = nuovoTurno(giocatoreId)

        if (!set({
          [chiaveG]: { ...g, caselleConsumate: nuoveConsumate },
          [chiavePos]: nuovaPos,
          turnoOverworld: turnoFinale,
        } as Partial<GameState>)) return { tipo: 'no-op' }
        return r
      },

      passaTurnoOverworld: () =>
        set((s) => {
          if (campaignActivityBlock(s)) return s
          const turnoOverworld = nuovoTurno(s.turnoOverworld.giocatoreAttivo)
          return {
            turnoOverworld,
            giocatoreAttivo: turnoOverworld.giocatoreAttivo,
          }
        }),

      muoviAvatarMappaPrincipale: (giocatoreId, luogoDestinazione) => {
        const state = get()
        if (campaignActivityBlock(state)) return false
        const chiavePos = giocatoreId === 1 ? 'posizione1' : 'posizione2'
        const posizione = state[chiavePos]
        const luogoCorrente = luogoMappaPrincipale(posizione)

        if (state.turnoOverworld.giocatoreAttivo !== giocatoreId) return false
        if (state.turnoOverworld.azioniRimaste <= 0) return false
        if (luogoCorrente === SECRET_LOCATION_ID || luogoDestinazione === SECRET_LOCATION_ID) {
          const giocatore = state[giocatoreId === 1 ? 'giocatore1' : 'giocatore2']
          if (state.battaglia || state.giocatoreAttivo !== giocatoreId
            || posizione.mappaId !== 'mappa-principale'
            || !hasUnlockedSecretLocation(giocatore)
            || !isSecretLocationConnection(luogoCorrente, luogoDestinazione)) return false
        } else if (!areMainMapNodesConnected(luogoCorrente, luogoDestinazione)) return false

        return set({
          [chiavePos]: posizioneMappaPrincipale(luogoDestinazione),
          giocatoreAttivo: giocatoreId,
          turnoOverworld: {
            ...state.turnoOverworld,
            azioniRimaste: state.turnoOverworld.azioniRimaste - 1,
          },
        } as Partial<GameState>)
      },

      attraversaPassaggioSegreto: (giocatoreId) => {
        const state = get()
        const posizione = state[giocatoreId === 1 ? 'posizione1' : 'posizione2']
        if (posizione.mappaId !== 'mappa-principale'
          || (posizione.luogo !== SECRET_LOCATION_ORIGIN && posizione.luogo !== SECRET_LOCATION_ID)) return false
        const destinazione = posizione.luogo === SECRET_LOCATION_ORIGIN ? SECRET_LOCATION_ID : SECRET_LOCATION_ORIGIN
        let moved = false
        const written = state.eseguiTransazione(() => {
          moved = state.muoviAvatarMappaPrincipale(giocatoreId, destinazione)
          if (!moved) return
          get().inizializzaPosizioneLocale(giocatoreId, destinazione)
          get().vaiAScena(destinazione === SECRET_LOCATION_ID ? 'percorso' : 'citta', { luogo: destinazione })
        })
        return moved && written
      },

      interagisciLuogoMappaPrincipale: (giocatoreId) => {
        const state = get()
        if (campaignActivityBlock(state)) return { tipo: 'no-op' }
        const chiavePos = giocatoreId === 1 ? 'posizione1' : 'posizione2'
        const posizione = state[chiavePos]
        if (state.turnoOverworld.giocatoreAttivo !== giocatoreId) return { tipo: 'no-op' }
        if (state.turnoOverworld.azioniRimaste <= 0) return { tipo: 'no-op' }
        if (posizione.mappaId !== 'mappa-principale') return { tipo: 'no-op' }

        const luogo = luogoMappaPrincipale(posizione)
        if (luogo === SECRET_LOCATION_ID && !puoAccedereAlLuogoSegreto(state, giocatoreId)) return { tipo: 'no-op' }
        const localMap = getLocalMap(luogo)
        if (!set({
          [chiavePos]: posizioneMappaPrincipale(luogo),
          giocatoreAttivo: giocatoreId,
          turnoOverworld: nuovoTurno(giocatoreId),
          fallbackLocationActivity: localMap ? null : { playerId: giocatoreId, location: luogo },
        } as Partial<GameState>)) return { tipo: 'no-op' }

        return { tipo: 'luogo', luogo }
      },

      inizializzaPosizioneLocale: (giocatoreId, luogo) => {
        const state = get()
        const worldPosition = state[giocatoreId === 1 ? 'posizione1' : 'posizione2']
        const map = getLocalMap(luogo)
        if (luogo === SECRET_LOCATION_ID && !puoAccedereAlLuogoSegreto(state, giocatoreId)) return null
        if (!map || worldPosition.mappaId !== 'mappa-principale' || luogoMappaPrincipale(worldPosition) !== luogo) {
          return null
        }
        const positionKey = giocatoreId === 1 ? 'posizioniLocali1' : 'posizioniLocali2'
        const nodeId = getLocalMapNode(map, state[positionKey][luogo]).id
        if (state[positionKey][luogo] !== nodeId) {
          if (!set({ [positionKey]: { ...state[positionKey], [luogo]: nodeId } } as Partial<GameState>)) return null
        }
        return nodeId
      },

      apriMappaLocale: (giocatoreId, luogo) => {
        const state = get()
        if (campaignActivityBlock(state) || state.turnoOverworld.giocatoreAttivo !== giocatoreId) return false
        if (luogo === SECRET_LOCATION_ID && state.giocatoreAttivo !== giocatoreId) return false
        let valid = false
        const written = state.eseguiTransazione(() => {
          valid = state.inizializzaPosizioneLocale(giocatoreId, luogo) !== null
          if (valid) set({ giocatoreAttivo: giocatoreId })
        })
        return valid && written
      },

      muoviAvatarMappaLocale: (giocatoreId, luogo, nodoDestinazione) => {
        const state = get()
        const map = getLocalMap(luogo)
        const positionKey = giocatoreId === 1 ? 'posizioniLocali1' : 'posizioniLocali2'
        const worldPosition = state[giocatoreId === 1 ? 'posizione1' : 'posizione2']
        if (luogo === SECRET_LOCATION_ID && !puoAccedereAlLuogoSegreto(state, giocatoreId)) return false
        if (!map || campaignActivityBlock(state) || state.giocatoreAttivo !== giocatoreId
          || state.turnoOverworld.giocatoreAttivo !== giocatoreId || state.turnoOverworld.azioniRimaste <= 0
          || worldPosition.mappaId !== 'mappa-principale' || luogoMappaPrincipale(worldPosition) !== luogo) {
          return false
        }
        const from = getLocalMapNode(map, state[positionKey][luogo]).id
        if (!canMoveOnLocalMap(map, from, nodoDestinazione)) return false
        return set({
          [positionKey]: { ...state[positionKey], [luogo]: nodoDestinazione },
          turnoOverworld: consumaAzione(state.turnoOverworld, 'movimento'),
        } as Partial<GameState>)
      },

      consumaInterazioneMappaLocale: (giocatoreId, luogo) => {
        const state = get()
        const worldPosition = state[giocatoreId === 1 ? 'posizione1' : 'posizione2']
        if (luogo === SECRET_LOCATION_ID && !puoAccedereAlLuogoSegreto(state, giocatoreId)) return false
        const fallback = state.fallbackLocationActivity
        if (!getLocalMap(luogo) && fallback?.playerId === giocatoreId && fallback.location === luogo) {
          const sceneMatches = (state.scenaCorrente.scena === 'citta' || state.scenaCorrente.scena === 'percorso')
            && state.scenaCorrente.payload?.luogo === luogo
          if (campaignActivityBlock(state) || state.giocatoreAttivo !== giocatoreId
            || !sceneMatches || worldPosition.mappaId !== 'mappa-principale' || luogoMappaPrincipale(worldPosition) !== luogo) return false
          return set({ fallbackLocationActivity: null })
        }
        if (campaignActivityBlock(state) || !getLocalMap(luogo) || state.giocatoreAttivo !== giocatoreId
          || state.turnoOverworld.giocatoreAttivo !== giocatoreId || state.turnoOverworld.azioniRimaste <= 0
          || worldPosition.mappaId !== 'mappa-principale' || luogoMappaPrincipale(worldPosition) !== luogo) {
          return false
        }
        return set({ turnoOverworld: nuovoTurno(giocatoreId) })
      },

      passaTurnoMappaLocale: () => {
        const state = get()
        if (campaignActivityBlock(state)) return false
        const turnoOverworld = state.giocatoreAttivo !== state.turnoOverworld.giocatoreAttivo
          ? state.turnoOverworld
          : nuovoTurno(state.giocatoreAttivo)
        return set({ turnoOverworld, giocatoreAttivo: turnoOverworld.giocatoreAttivo })
      },

      reset: () =>
        set((s) => ({
          campaignRevision: s.campaignRevision + 1,
          giocatore1: giocatoreVuoto(1),
          giocatore2: giocatoreVuoto(2),
          giocatoreAttivo: 1,
          battaglia: null,
          league: emptyLeagueState(),
          rivaleStarterId: null,
          posizione1: posizioneIniziale(),
          posizione2: posizioneIniziale(),
          turnoOverworld: { giocatoreAttivo: 1, azioniRimaste: 2 },
          posizioniLocali1: {},
          posizioniLocali2: {},
          scenaCorrente: { scena: 'titolo' },
          scenaPrecedente: null,
          saveRecoveryWarnings: [],
          interactionProgress: emptyInteractionProgress(),
          fallbackLocationActivity: null,
          arkadex: emptyArkadexProgress(), matchLog: emptyMatchLog(), teamRuleMessage: null,
        })),
    })},
    {
      name: GAME_SAVE_STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (isUiStudioPreview()) return uiPreviewCampaignStorage
        if (typeof localStorage === 'undefined') throw new Error('Storage non disponibile')
        return scopedGameStorage
      }),
      partialize: (state) => ({ ...serializeGameState(state), ...(state.challengeContext ? { challengeContext: state.challengeContext } : {}) }) as unknown as GameState,
      merge: (persisted, current) => {
        const recovered = normalizeGameSave(persisted, current)
        const context = persisted && typeof persisted === 'object' && 'challengeContext' in persisted ? normalizeChallengeContext(persisted.challengeContext) : null
        if (context && (!recovered.state.battaglia?.seeded || recovered.state.battaglia.seeded.seed !== context.session.seed)) {
          return { ...current, ...normalizeGameSave(context.campaign).state, challengeContext: null,
            saveRecoveryWarnings: ['La sfida non ha un punto dei dadi valido: è stata recuperata la campagna conservata.'] }
        }
        return { ...current, ...recovered.state, challengeContext: context, saveRecoveryWarnings: recovered.warnings }
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) queueMicrotask(() => {
          const storage = useGameStore.persist?.getOptions().storage
          if (storage) useGameStore.persist.setOptions({ storage: { ...storage, setItem: () => undefined } })
          try {
            const warning = { saveRecoveryWarnings: [
              'Il salvataggio non è leggibile. Importa un backup per recuperare i progressi, oppure avvia una nuova partita.',
            ] }
            if (isCampaignWritable()) useGameStore.setState(warning)
            else publishReadonlyGameSnapshot(warning)
          } finally {
            if (storage) useGameStore.persist.setOptions({ storage })
          }
        })
        else if (state?.saveRecoveryWarnings.length) {
          // Recovery details stay in memory until the player acknowledges them.
        }
      },
    }
  )
)

// =====================================================
// HELPER per creare istanze
// =====================================================

export { creaIstanza } from '@/engine/pokemonFactory'

// Public direct writes (imports and integrations) must pass the same owner gate
// as normal actions. Middleware hydration remains internal and read-only.
const setGameState = useGameStore.setState
let publishingReplica = false
useGameStore.setState = ((...args: Parameters<typeof setGameState>) => {
  const key = useGameStore.getState().challengeContext ? ACTIVE_CHALLENGE_STORAGE_KEY : GAME_SAVE_STORAGE_KEY
  if (publishingReplica || isCampaignCheckpointCurrent(key)) setGameState(...args)
}) as typeof useGameStore.setState

/** Replicas are volatile and cannot write back to campaign storage. */
export function publishReadonlyGameSnapshot(patch: Partial<GameState>): boolean {
  if (isCampaignWritable()) return false
  const storage = useGameStore.persist.getOptions().storage
  if (storage) useGameStore.persist.setOptions({ storage: { ...storage, setItem: () => undefined } })
  publishingReplica = true
  try { setGameState(patch); return true }
  finally {
    publishingReplica = false
    if (storage) useGameStore.persist.setOptions({ storage })
  }
}

configureSessionHydration(async () => {
  // A pending command belongs to the previous checkpoint. Explicitly rereading
  // the campaign must never leave a retry capable of publishing that old state.
  useSaveWriteStatus.getState().clear()
  cancelPendingRecoveryCopy()
  const recovery = recoverInterruptedBackupRestore()
  if (!recovery.ok) throw new Error(recovery.message)
  await useGameStore.persist.rehydrate()
  await useInteractionStore.persist.rehydrate()
  const [{ useBattleArchiveStore }, { useChallengeStore }] = await Promise.all([
    import('@/components/battle/battleArchiveStore'), import('@/challenges/challengeStore'),
  ])
  await useBattleArchiveStore.persist.rehydrate()
  await useChallengeStore.persist.rehydrate()
  const state = useGameStore.getState()
  const storage = useGameStore.persist.getOptions().storage
  if (storage) useGameStore.persist.setOptions({ storage: { ...storage, setItem: () => undefined } })
  try { setGameState({ campaignRevision: state.campaignRevision + 1 }) }
  finally { if (storage) useGameStore.persist.setOptions({ storage }) }
})
