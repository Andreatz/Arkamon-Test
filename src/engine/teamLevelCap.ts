import type { PokemonIstanza } from '@/types'

export const TEAM_LEVEL_GAP = 5
export function teamLevelRange(team: readonly PokemonIstanza[]): { min: number; max: number; gap: number } {
  if (!team.length) return { min: 0, max: 0, gap: 0 }
  const levels = team.map((pokemon) => pokemon.livello)
  const min = Math.min(...levels), max = Math.max(...levels)
  return { min, max, gap: max - min }
}
export function isTeamWithinLevelCap(team: readonly PokemonIstanza[]): boolean {
  return teamLevelRange(team).gap <= TEAM_LEVEL_GAP
}
export function canJoinTeam(team: readonly PokemonIstanza[], pokemon: PokemonIstanza): boolean {
  return team.length < 6 && isTeamWithinLevelCap([...team, pokemon])
}
/** Include fainted team members. A lone creature can progress to the normal level maximum. */
export function teamProgressionLimit(team: readonly PokemonIstanza[], instanceId: string): number {
  const teammates = team.filter((pokemon) => pokemon.istanzaId !== instanceId)
  return teammates.length ? Math.min(100, Math.min(...teammates.map((pokemon) => pokemon.livello)) + TEAM_LEVEL_GAP) : 100
}
export function teamCapMessage(team: readonly PokemonIstanza[]): string {
  const range = teamLevelRange(team)
  return `La squadra può avere al massimo ${TEAM_LEVEL_GAP} livelli di differenza. Livelli attuali: ${range.min}–${range.max}. Sposta gli Arkamon fuori fascia nel deposito.`
}
