#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const outputPath = path.join(repositoryRoot, 'src/player-ui/portraitMetadata.json')
const checkOnly = process.argv.includes('--check')
const unsupported = process.argv.slice(2).filter(argument => argument !== '--check')
if (unsupported.length) throw new Error(`Unsupported arguments: ${unsupported.join(', ')}`)

/** Include every non-transparent pixel, with exclusive right/bottom bounds. */
async function measurePortrait(sourcePath) {
  const { data, info } = await sharp(path.join(repositoryRoot, 'public', sourcePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const alphaOffset = info.channels - 1
  let left = info.width
  let top = info.height
  let right = 0
  let bottom = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + alphaOffset] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x + 1)
      bottom = Math.max(bottom, y + 1)
    }
  }
  if (right <= left || bottom <= top) throw new Error(`Empty portrait: ${sourcePath}`)
  return { width: info.width, height: info.height, alphaBounds: [left, top, right, bottom] }
}

async function exists(sourcePath) {
  try {
    await fs.access(path.join(repositoryRoot, 'public', sourcePath))
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

const catalog = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'src/data/pokemon.json'), 'utf8'))
const metadata = {}
let posterCount = 0
for (const species of catalog) {
  const sourcePath = `/sprites/front_sprites/${species.id}.png`
  metadata[sourcePath] = await measurePortrait(sourcePath)
  const posterPath = `/sprites/arkamon/${species.id}/front/idle-poster.webp`
  if (await exists(posterPath)) {
    metadata[posterPath] = await measurePortrait(posterPath)
    posterCount++
  }
}

const contents = `${JSON.stringify(metadata, null, 2)}\n`
if (checkOnly) {
  const previousContents = (await fs.readFile(outputPath, 'utf8')).replace(/\r\n/g, '\n')
  if (previousContents !== contents) {
    throw new Error('Portrait metadata is stale. Run node scripts/build-player-portrait-metadata.mjs to refresh it.')
  }
} else {
  await fs.writeFile(outputPath, contents)
}
console.log(`${checkOnly ? 'Verified' : 'Measured'} ${catalog.length} original portraits and ${posterCount} idle posters; artwork files remain unchanged.`)
