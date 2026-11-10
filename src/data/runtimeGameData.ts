import compact from './runtime-game-data.json'
import type { MossaDef } from '@/types'

function levelTable(index: number): Record<string, number> {
  const [start, values] = compact.tables[index] as [number, number[]]
  const table: Record<string, number> = {}
  for (let offset = 0; offset < values.length; offset++) table[String(start + offset)] = values[offset]
  return table
}

/** Each move retains independent mutable tables, exactly as in the authored catalog. */
export const BASE_RUNTIME_MOVES: MossaDef[] = compact.moves.map(move => ({
  ...move, dadiPerLivello: levelTable(move.dadiPerLivello), incrementoPerLivello: levelTable(move.incrementoPerLivello),
})) as MossaDef[]

export const RUNTIME_STATUS_ASSIGNMENTS = compact.statusAssignments
