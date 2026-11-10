import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statusIds = new Set([221, 225, 227, 230, 242, 253, 256, 270, 271])

/** Keep the authored JSON intact; the startup catalog needs values, not repeated level keys or VFX review notes. */
export function compactRuntimeGameData(moves, catalog) {
  const tables = [], tableIds = new Map()
  const tableIndex = table => {
    const entries = Object.entries(table), start = Number(entries[0]?.[0])
    if (!entries.length || !Number.isInteger(start) || entries.some(([key, value], i) => String(start + i) !== key || !Number.isFinite(value)))
      throw new Error('Move level tables must contain consecutive numeric levels.')
    const key = JSON.stringify(table)
    if (!tableIds.has(key)) { tableIds.set(key, tables.length); tables.push([start, entries.map(([, value]) => value)]) }
    return tableIds.get(key)
  }
  const compactMoves = moves.map(({ dadiPerLivello, incrementoPerLivello, ...definition }) => ({
    ...definition, dadiPerLivello: tableIndex(dadiPerLivello), incrementoPerLivello: tableIndex(incrementoPerLivello),
  }))
  const statusAssignments = catalog.moves.filter(entry => statusIds.has(entry.sourceMoveId)
    && entry.gameMoveId === null && entry.type === 'Status (Paralisi)')
    .map(({ sourceMoveId, gameMoveId, name, type, element, arkamon }) => ({ sourceMoveId, gameMoveId, name, type, element, arkamon }))
  if (statusAssignments.length !== statusIds.size) throw new Error('The nine authorized status assignments must remain available.')
  return { version: 1, tables, moves: compactMoves, statusAssignments }
}

export async function generateRuntimeGameData({ check = false } = {}) {
  const moves = JSON.parse(await fs.readFile(path.join(root, 'src/data/mosse.json'), 'utf8'))
  const catalog = JSON.parse(await fs.readFile(path.join(root, 'src/data/move-vfx-assignments.json'), 'utf8'))
  const data = compactRuntimeGameData(moves, catalog)
  const destination = path.join(root, 'src/data/runtime-game-data.json')
  const source = JSON.stringify(data) + '\n'
  if (check) {
    if (await fs.readFile(destination, 'utf8') !== source) throw new Error('Runtime game data is stale. Run node scripts/build-runtime-game-data.mjs.')
  } else await fs.writeFile(destination, source)
  return { moves: data.moves.length, sharedTables: data.tables.length, statusAssignments: data.statusAssignments.length, bytes: Buffer.byteLength(source) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await generateRuntimeGameData({ check: process.argv.includes('--check') })))
}
