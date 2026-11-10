import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { buildArkamonAssetCatalog, writeArkamonAssetCatalog } from '../build-arkamon-asset-catalog.mjs'

async function fixture(run) {
  const temporaryParent = path.resolve(os.tmpdir())
  const root = await fs.mkdtemp(path.join(temporaryParent, 'arkamon-asset-catalog-'))
  try {
    await fs.mkdir(path.join(root, 'src/data'), { recursive: true })
    await fs.writeFile(path.join(root, 'src/data/pokemon.json'), JSON.stringify([{ id: 1, nome: 'Existing' }]))
    await fs.mkdir(path.join(root, 'public/sprites/front_sprites'), { recursive: true })
    const pixels = Buffer.alloc(8 * 6 * 4)
    for (let y = 1; y < 5; y++) for (let x = 2; x < 7; x++) {
      const offset = (y * 8 + x) * 4
      pixels[offset] = 230; pixels[offset + 2] = 90; pixels[offset + 3] = 255
    }
    const encoded = await sharp(pixels, { raw: { width: 8, height: 6, channels: 4 } }).png().toBuffer()
    await fs.writeFile(path.join(root, 'public/sprites/front_sprites/1.png'), encoded)
    await fs.writeFile(path.join(root, 'public/sprites/front_sprites/150.png'), encoded)
    await run(root, encoded)
  } finally {
    if (path.dirname(root) !== temporaryParent || !path.basename(root).startsWith('arkamon-asset-catalog-')) throw new Error('Unsafe fixture cleanup path')
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe('supplied sprite inventory without fabricated gameplay', () => {
  it('records visible source bounds, file fingerprints and only actual sparse IDs', async () => fixture(async (root, encoded) => {
    const before = await fs.readFile(path.join(root, 'src/data/pokemon.json'))
    const catalog = await buildArkamonAssetCatalog(root)
    expect(catalog.entries.map(entry => [entry.id, entry.status])).toEqual([[1, 'game-data-present'], [150, 'pending-game-data']])
    expect(catalog.entries[1]).toEqual({ id: 150, status: 'pending-game-data', sprites: { front: {
      source: '/sprites/front_sprites/150.png', width: 8, height: 6, alphaBounds: [2, 1, 7, 5],
      bytes: encoded.length, sha256: createHash('sha256').update(encoded).digest('hex'),
    } } })
    expect(await fs.readFile(path.join(root, 'src/data/pokemon.json'))).toEqual(before)
    expect(await fs.readFile(path.join(root, 'public/sprites/front_sprites/150.png'))).toEqual(encoded)
  }))

  it('supports the supplied small-sprite naming and exposes no missing view', async () => fixture(async (root, encoded) => {
    await fs.mkdir(path.join(root, 'public/sprites/small_sprites'))
    await fs.writeFile(path.join(root, 'public/sprites/small_sprites/Sprite Small 150.png'), encoded)
    const entry = (await buildArkamonAssetCatalog(root)).entries[1]
    expect(entry.sprites.small.source).toBe('/sprites/small_sprites/Sprite Small 150.png')
    expect(entry.sprites.back).toBeUndefined()
  }))

  it('detects stale files and does not rewrite the saved catalog in check mode', async () => fixture(async root => {
    await writeArkamonAssetCatalog(root)
    const saved = await fs.readFile(path.join(root, 'src/data/arkamon-assets.json'))
    await writeArkamonAssetCatalog(root, true)
    await fs.rm(path.join(root, 'public/sprites/front_sprites/150.png'))
    await expect(writeArkamonAssetCatalog(root, true)).rejects.toThrow('catalog is stale')
    expect(await fs.readFile(path.join(root, 'src/data/arkamon-assets.json'))).toEqual(saved)
  }))

  it('rejects transparent images and duplicate IDs rather than publishing ambiguous assets', async () => fixture(async (root, encoded) => {
    await fs.writeFile(path.join(root, 'public/sprites/front_sprites/0150.png'), encoded)
    await expect(buildArkamonAssetCatalog(root)).rejects.toThrow('Duplicate front sprite')
    await fs.rm(path.join(root, 'public/sprites/front_sprites/0150.png'))
    await sharp({ create: { width: 2, height: 2, channels: 4, background: '#0000' } }).png().toFile(path.join(root, 'public/sprites/front_sprites/150.png'))
    await expect(buildArkamonAssetCatalog(root)).rejects.toThrow('Empty sprite')
  }))
})
