import { useGameStore, type GameState } from '@/store/gameStore'
import { initialGameSave, normalizeGameSave, serializeGameState, GAME_SAVE_STORAGE_KEY, type GameSaveState } from '@/save/gamePersistence'
import { determinaIniziativa, calcolaHPMax } from '@/engine/battleEngine'
import { createSeededRandomState, nextSeededRandom } from './seededRandom'
import { useChallengeStore } from './challengeStore'
import type { ChallengeSession } from './types'
import { isCampaignWritable, sessionOwnershipMessage, writeCampaignCheckpoint, removeCampaignCheckpoint } from '@/session/sessionOwnership'
import { isUiStudioPreview } from '@/ui-studio/previewMode'

import { ACTIVE_CHALLENGE_STORAGE_KEY, canonicalChallengeSession, type ChallengeContext } from './challengePersistence'

function publishWithoutSecondWrite(patch: Partial<GameState>) {
  const storage = useGameStore.persist.getOptions().storage
  if (storage) useGameStore.persist.setOptions({ storage: { ...storage, setItem: () => undefined } })
  try { useGameStore.setState(patch) } finally { if (storage) useGameStore.persist.setOptions({ storage }) }
}
export function launchChallenge(value: ChallengeSession): { ok: boolean; message: string } {
  if (isUiStudioPreview()) return { ok: false, message: 'Avvia le sfide dalla partita. Questa anteprima non modifica i salvataggi.' }
  if (!isCampaignWritable()) return { ok: false, message: sessionOwnershipMessage() }
  const previous = useGameStore.getState()
  if (previous.challengeContext) return { ok: false, message: 'Concludi o abbandona la sfida in corso.' }
  if (previous.league.players[1].status === 'running' || previous.league.players[2].status === 'running') return { ok: false, message: 'Concludi il tentativo della Lega prima di una sfida separata.' }
  if (previous.battaglia || previous.scenaCorrente.scena === 'evoluzione' || previous.scenaCorrente.scena === 'laboratorio') return { ok: false, message: 'Concludi questa attività prima di aprire una sfida separata.' }
  const session = canonicalChallengeSession(value)
  if (!session) return { ok: false, message: 'La configurazione della sfida non è valida.' }
  const context: ChallengeContext = { version: 1, attemptId: `${session.id}-${Date.now()}-${previous.campaignRevision}`, session, campaign: serializeGameState(previous) }
  let rng = createSeededRandomState(session.seed)
  const random = () => { const sample = nextSeededRandom(rng); rng = sample.state; return sample.value }
  const player = { ...initialGameSave().giocatore1, nome: session.mode === 'fanta' ? 'Fanta-Team' : 'Sfida a seed', squadra: session.team }
  const opponent = session.enemyTeam[0], attacker = session.team[0]
  const turn = determinaIniziativa(attacker.livello, opponent.livello, random)
  const game: GameSaveState = { ...initialGameSave(), giocatore1: player, audioMuted: previous.audioMuted,
    scenaCorrente: { scena: 'battaglia' },
    battaglia: { tipo: 'NPC', pokemonA: attacker, pokemonB: opponent, squadraA: session.team, squadraB: session.enemyTeam,
      hpMaxA: calcolaHPMax(attacker), hpMaxB: calcolaHPMax(opponent), turnoCorrente: turn, luogoRitorno: 'mappa-principale',
      log: [`${session.mode === 'fanta' ? 'Fanta-Team' : 'Sfida'} · seed ${session.seed}.`], evoluzioneInAttesa: null, seeded: rng },
  }
  try { writeCampaignCheckpoint(ACTIVE_CHALLENGE_STORAGE_KEY, JSON.stringify({ version: 0, state: { ...serializeGameState(game), challengeContext: context } })) }
  catch { return { ok: false, message: 'Non posso salvare la sfida sul dispositivo. La campagna resta intatta; libera spazio e riprova.' } }
  publishWithoutSecondWrite({ ...game, challengeContext: context, campaignRevision: previous.campaignRevision + 1, saveRecoveryWarnings: [], teamRuleMessage: null })
  useChallengeStore.getState().rememberSession(session)
  return { ok: true, message: 'Sfida avviata. La campagna è conservata separatamente.' }
}
/** Returning is durable before UI publication. An abandoned match never becomes a competitive result. */
export function exitChallenge(completed = false): { ok: boolean; message: string } {
  if (isUiStudioPreview()) return { ok: false, message: 'Gestisci le sfide dalla partita. Questa anteprima non modifica i salvataggi.' }
  if (!isCampaignWritable()) return { ok: false, message: sessionOwnershipMessage() }
  const previous = useGameStore.getState(), context = previous.challengeContext
  if (!context) return { ok: false, message: 'Non c’è una sfida in corso.' }
  const battle = previous.battaglia
  if (completed && (!battle?.checkpoint?.outcome || battle.checkpoint.phase !== 'ended')) return { ok: false, message: 'Lo scontro non è ancora concluso.' }
  const campaign = normalizeGameSave(context.campaign).state
  campaign.audioMuted = previous.audioMuted
  if (completed && battle?.checkpoint?.outcome) {
    const result = useChallengeStore.getState().addResult({ id: context.attemptId, sessionId: context.session.id, rulesVersion: context.session.rulesVersion, mode: context.session.mode,
      seed: context.session.seed, outcome: battle.checkpoint.outcome,
      turns: battle.challengeActionCount ?? battle.cronaca?.events.filter((event) => event.kind === 'attack' || event.kind === 'heal' || event.kind === 'capture').length ?? 0,
      remainingHp: (battle.squadraA ?? [battle.pokemonA]).reduce((sum, pokemon) => sum + pokemon.hp, 0),
      team: context.session.team.map((pokemon) => pokemon.specieId), completedAt: new Date().toISOString() })
    if (!result.ok) return { ok: false, message: 'Il risultato resta nello scontro concluso: libera spazio e premi di nuovo Prosegui per salvarlo.' }
  }
  try {
    writeCampaignCheckpoint(GAME_SAVE_STORAGE_KEY, JSON.stringify({ version: 0, state: serializeGameState(campaign) }))
    removeCampaignCheckpoint(ACTIVE_CHALLENGE_STORAGE_KEY)
  } catch { return { ok: false, message: 'Non posso chiudere il salvataggio della sfida. La campagna resta conservata; libera spazio e riprova.' } }
  publishWithoutSecondWrite({ ...campaign, challengeContext: null, campaignRevision: previous.campaignRevision + 1, teamRuleMessage: null, saveRecoveryWarnings: [] })
  return { ok: true, message: completed ? 'Risultato registrato. Campagna ripristinata.' : 'Sfida chiusa. Campagna ripristinata.' }
}
