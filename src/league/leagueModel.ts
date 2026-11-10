import { getPokemon } from '@/data'
import { calcolaHPMax, determinaIniziativa } from '@/engine/battleEngine'
import type { AllenatoreDef, PokemonIstanza, StatoBattaglia } from '@/types'

export interface LeagueOpponent {
  name: string
  team: { pokemonId: number; livello: number }[]
}
export interface LeagueConfiguration {
  version: 1
  /** The four consecutive battles are a confirmed rule. Content remains user configured. */
  opponents: [LeagueOpponent, LeagueOpponent, LeagueOpponent, LeagueOpponent]
  champion: LeagueOpponent | null
  defeat: 'restart' | 'retry-stage' | null
  betweenBattleItems: boolean
  /** null means the optional champion decision has not been made. */
  championEnabled: boolean | null
}
export interface LeagueProgress {
  runId: string | null
  nextStage: number
  status: 'idle' | 'running' | 'defeated' | 'completed'
  attempt: number
  completedStages: number[]
  /** A completed fight is settled before the next opponent can be opened. */
  stageCompleted: boolean
}
export interface LeagueWinner {
  playerId: 1 | 2
  name: string
  team: PokemonIstanza[]
  completedAt: string
  runId: string
}
export interface LeagueState {
  version: 1
  config: LeagueConfiguration | null
  players: { 1: LeagueProgress; 2: LeagueProgress }
  winner: LeagueWinner | null
}
export const emptyLeagueProgress = (): LeagueProgress => ({ runId: null, nextStage: 0, status: 'idle', attempt: 0, completedStages: [], stageCompleted: false })
export const emptyLeagueState = (): LeagueState => ({ version: 1, config: null, players: { 1: emptyLeagueProgress(), 2: emptyLeagueProgress() }, winner: null })
export const draftLeagueConfiguration = (): LeagueConfiguration => ({ version: 1,
  opponents: [{ name: '', team: [] }, { name: '', team: [] }, { name: '', team: [] }, { name: '', team: [] }],
  champion: null, defeat: null, betweenBattleItems: true, championEnabled: null })
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const bounded = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max

export function validateLeagueOpponent(value: unknown): LeagueOpponent | null {
  if (!record(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80
    || !Array.isArray(value.team) || value.team.length < 1 || value.team.length > 6) return null
  const team: LeagueOpponent['team'] = []
  for (const entry of value.team) {
    if (!record(entry) || typeof entry.pokemonId !== 'number' || !getPokemon(entry.pokemonId) || !bounded(entry.livello, 5, 100)) return null
    team.push({ pokemonId: entry.pokemonId, livello: entry.livello })
  }
  return { name: value.name.trim(), team }
}

/** Partial configuration is kept as a draft and can never start a campaign run. */
export function normalizeLeagueConfiguration(value: unknown): LeagueConfiguration | null {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.opponents) || value.opponents.length !== 4) return null
  const draft = (v: unknown): LeagueOpponent => {
    const valid = validateLeagueOpponent(v)
    if (valid) return valid
    return { name: record(v) && typeof v.name === 'string' ? v.name.trim().slice(0, 80) : '', team: [] }
  }
  return { version: 1, opponents: value.opponents.map(draft) as LeagueConfiguration['opponents'],
    champion: value.champion ? draft(value.champion) : null,
    defeat: value.defeat === 'restart' || value.defeat === 'retry-stage' ? value.defeat : null,
    betweenBattleItems: typeof value.betweenBattleItems === 'boolean' ? value.betweenBattleItems : true,
    championEnabled: typeof value.championEnabled === 'boolean' ? value.championEnabled : null }
}

export function leagueConfigurationProblems(config: LeagueConfiguration | null): string[] {
  if (!config) return ['Configura i quattro Superquattro nell’Admin.']
  const problems = config.opponents.flatMap((opponent, index) => validateLeagueOpponent(opponent) ? [] : [`Superquattro ${index + 1}: indica nome e squadra.`])
  if (config.defeat === null) problems.push('Scegli la regola dopo una sconfitta.')
  if (config.championEnabled === null) problems.push('Conferma se ci sarà un Campione finale.')
  if (config.championEnabled && !validateLeagueOpponent(config.champion)) problems.push('Indica nome e squadra del Campione finale.')
  return problems
}
export function leagueOpponents(config: LeagueConfiguration): LeagueOpponent[] {
  return config.championEnabled && config.champion ? [...config.opponents, config.champion] : config.opponents
}
export function leagueTrainer(config: LeagueConfiguration, index: number): AllenatoreDef | null {
  const opponent = leagueOpponents(config)[index]
  if (!opponent || !validateLeagueOpponent(opponent)) return null
  return { id: 1_000_001 + index, nome: opponent.name, luogo: 'Roma', tipo: index === 4 ? 'Campione' : 'Superquattro', squadra: opponent.team }
}

export function normalizeLeagueState(value: unknown, restorePokemon: (v: unknown) => PokemonIstanza | null, warn: (message: string) => void): LeagueState {
  const initial = emptyLeagueState()
  if (value === undefined) return initial
  if (!record(value) || value.version !== 1) { warn('La Lega non aveva un formato valido: recuperato lo stato iniziale.'); return initial }
  const config = normalizeLeagueConfiguration(value.config)
  if (value.config !== null && !config) warn('La configurazione della Lega non è valida e deve essere completata.')
  const total = config ? leagueOpponents(config).length : 4
  const progress = (v: unknown): LeagueProgress => {
    if (!record(v) || !['idle', 'running', 'defeated', 'completed'].includes(v.status as string)
      || !bounded(v.nextStage, 0, total) || !bounded(v.attempt, 0, 100_000) || !Array.isArray(v.completedStages)
      || !v.completedStages.every((stage, index) => stage === index && bounded(stage, 0, total - 1))
      || v.completedStages.length !== v.nextStage
      || (v.status !== 'idle' && (typeof v.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(v.runId)))
      || (v.status === 'completed' && v.nextStage !== total)
      || (v.status === 'running' && v.nextStage >= total)
      || (v.status !== 'idle' && leagueConfigurationProblems(config).length > 0)) {
      warn('Recuperato un progresso della Lega non valido; nessuna vittoria assegnata.')
      return emptyLeagueProgress()
    }
    return { runId: typeof v.runId === 'string' ? v.runId : null, nextStage: v.nextStage, status: v.status as LeagueProgress['status'],
      attempt: v.attempt, completedStages: [...v.completedStages] as number[], stageCompleted: v.stageCompleted === true }
  }
  const players = record(value.players) ? { 1: progress(value.players[1]), 2: progress(value.players[2]) } : initial.players
  let winner: LeagueWinner | null = null
  const candidate = value.winner
  if (candidate !== null && candidate !== undefined) {
    if (record(candidate) && (candidate.playerId === 1 || candidate.playerId === 2) && typeof candidate.name === 'string'
      && candidate.name.length <= 80 && typeof candidate.completedAt === 'string' && Number.isFinite(Date.parse(candidate.completedAt))
      && candidate.runId === players[candidate.playerId].runId && players[candidate.playerId].status === 'completed'
      && Array.isArray(candidate.team) && candidate.team.length > 0 && candidate.team.length <= 6) {
      const team = candidate.team.map(restorePokemon).filter((p): p is PokemonIstanza => p !== null)
      if (team.length === candidate.team.length) winner = { playerId: candidate.playerId, name: candidate.name, completedAt: candidate.completedAt, runId: candidate.runId as string, team }
    }
    if (!winner) warn('La proclamazione della Lega non era valida: nessun Campione assegnato.')
  }
  return { version: 1, config, players, winner }
}

export function makeLeagueBattle(config: LeagueConfiguration, progress: LeagueProgress, playerId: 1 | 2, team: PokemonIstanza[], rng = Math.random): StatoBattaglia | null {
  const trainer = leagueTrainer(config, progress.nextStage)
  const pokemonA = team.find((p) => p.hp > 0)
  if (!trainer || !pokemonA || !progress.runId) return null
  const squadraB = trainer.squadra.map((slot, index) => {
    const p: PokemonIstanza = { istanzaId: `${progress.runId}-stage-${progress.nextStage}-${index}`, specieId: slot.pokemonId,
      nome: getPokemon(slot.pokemonId)!.nome, livello: slot.livello, hp: 0, xp: 0 }
    return { ...p, hp: calcolaHPMax(p) }
  })
  const pokemonB = squadraB[0]
  return { tipo: 'PVP', pokemonA, pokemonB, squadraA: team, squadraB, hpMaxA: calcolaHPMax(pokemonA), hpMaxB: calcolaHPMax(pokemonB),
    turnoCorrente: determinaIniziativa(pokemonA.livello, pokemonB.livello, rng, pokemonA.stato?.tipo, pokemonB.stato?.tipo), luogoRitorno: 'lega',
    allenatoreId: trainer.id, leagueOpponent: trainer, leagueBattle: { runId: progress.runId, stageIndex: progress.nextStage, playerId },
    log: [`Lega · incontro ${progress.nextStage + 1}/${leagueOpponents(config).length}: ${trainer.nome}.`], evoluzioneInAttesa: null }
}

export function isLeagueTurnLocked(league: LeagueState): boolean {
  return !!league.winner || league.players[1].status === 'running' || league.players[2].status === 'running'
}
