import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Runtime needs editorial fields only; pixel hashes and conversion grids stay in the source catalog. */
export function slimVfxCurationCatalog(source) {
  if (source.schemaVersion !== 1 || !Array.isArray(source.assets)) throw new Error('Unsupported VFX source catalog')
  const notes = [], indexes = new Map()
  const assets = source.assets.map(entry => {
    if (typeof entry.id !== 'string' || !Array.isArray(entry.categories) || typeof entry.notes !== 'string') throw new Error('Invalid VFX source entry')
    let noteIndex = indexes.get(entry.notes)
    if (noteIndex === undefined) { noteIndex = notes.length; indexes.set(entry.notes, noteIndex); notes.push(entry.notes) }
    return { id: entry.id, categories: entry.categories, intensity: entry.intensity, anchor: entry.anchor, noteIndex }
  })
  return { schemaVersion: 1, notes, assets }
}

export async function syncVfxCurationCatalog(root, check = false) {
  const source = JSON.parse(await fs.readFile(path.join(root, 'public/vfx/moves/ai-generated/catalog.json'), 'utf8'))
  const target = path.join(root, 'src/data/vfx-curation-runtime.json')
  const contents = `${JSON.stringify(slimVfxCurationCatalog(source))}\n`
  if (check) {
    const saved = (await fs.readFile(target, 'utf8')).replace(/\r\n/g, '\n')
    if (saved !== contents) throw new Error('Runtime VFX curation catalog is stale: run node scripts/build-vfx-curation-catalog.mjs')
  } else await fs.writeFile(target, contents)
  return { assets: source.assets.length, bytes: Buffer.byteLength(contents) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await syncVfxCurationCatalog(process.cwd(), process.argv.includes('--check'))
  console.log(`Runtime VFX curation: ${summary.assets} entries, ${summary.bytes} bytes`)
}
