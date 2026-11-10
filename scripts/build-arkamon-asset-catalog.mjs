#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const repository = fileURLToPath(new URL('../', import.meta.url))
const folders = { front: 'front_sprites', back: 'back_sprites', small: 'small_sprites' }

/** Inventory supplied images independently from the playable species catalog. */
export async function buildArkamonAssetCatalog(root = repository) {
  const gameData = JSON.parse(await fs.readFile(path.join(root, 'src/data/pokemon.json'), 'utf8'))
  const playableIds = new Set(gameData.map(species => species.id))
  const entries = new Map()
  for (const [view, folder] of Object.entries(folders)) {
    const directory = path.join(root, 'public/sprites', folder)
    const files = await fs.readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!file.isFile()) continue
      const identity = (view === 'small' ? /^(?:Sprite Small )?(\d+)\.png$/i : /^(\d+)\.png$/i).exec(file.name)
      if (!identity) continue
      const id = Number(identity[1])
      if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Invalid sprite ID: ${folder}/${file.name}`)
      const entry = entries.get(id) ?? { id, status: playableIds.has(id) ? 'game-data-present' : 'pending-game-data', sprites: {} }
      if (entry.sprites[view]) throw new Error(`Duplicate ${view} sprite for ID ${id}`)
      const encoded = await fs.readFile(path.join(directory, file.name))
      const { data, info } = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let left = info.width, top = info.height, right = 0, bottom = 0
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * info.channels + info.channels - 1] === 0) continue
        left = Math.min(left, x); top = Math.min(top, y)
        right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1)
      }
      if (right <= left || bottom <= top) throw new Error(`Empty sprite: ${folder}/${file.name}`)
      entry.sprites[view] = {
        source: `/sprites/${folder}/${file.name}`, width: info.width, height: info.height,
        alphaBounds: [left, top, right, bottom], bytes: encoded.length,
        sha256: createHash('sha256').update(encoded).digest('hex'),
      }
      entries.set(id, entry)
    }
  }
  return { schemaVersion: 1, entries: [...entries.values()].sort((a, b) => a.id - b.id) }
}

export async function writeArkamonAssetCatalog(root = repository, check = false) {
  const catalog = await buildArkamonAssetCatalog(root)
  const filename = path.join(root, 'src/data/arkamon-assets.json')
  const contents = `${JSON.stringify(catalog, null, 2)}\n`
  if (check) {
    const existing = await fs.readFile(filename, 'utf8')
    if (existing.replace(/\r\n/g, '\n') !== contents) throw new Error('Arkamon asset catalog is stale. Run npm run assets:catalog.')
  } else {
    const temporary = `${filename}.tmp`
    try {
      await fs.writeFile(temporary, contents)
      await fs.rename(temporary, filename)
    } finally { await fs.rm(temporary, { force: true }) }
  }
  return catalog
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(value => value !== '--check')) throw new Error('Only --check is supported.')
  const check = process.argv.includes('--check')
  const catalog = await writeArkamonAssetCatalog(repository, check)
  console.log(`${check ? 'Verified' : 'Cataloged'} ${catalog.entries.length} supplied Arkamon sprite IDs; ${catalog.entries.filter(entry => entry.status === 'pending-game-data').length} await game data. Original PNGs are unchanged.`)
}
