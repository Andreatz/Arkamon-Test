import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assertPinnedMediaRevision, packageWebAssets, pendingFrontSpriteInventory, readPlayableFrontSpriteIds } from '../package-web-assets.mjs'

const directories = []
afterEach(async () => { await Promise.all(directories.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-package-')); directories.push(root)
  const output = path.join(root, 'dist')
  const write = async (file, content = 'fixture') => { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), content) }
  const src = '/sprites/arkamon-paged/1/front/idle/page-00.webp'
  const page = { src, encodedBytes: 7, sha256: createHash('sha256').update('fixture').digest('hex') }
  const manifest = { clips: { a: { frameCount: 96, pages: [page] } } }
  await write('src/data/arkamon-paged.json', JSON.stringify(manifest))
  await write('src/data/pokemon.json', JSON.stringify([{ id: 13 }]))
  for (const file of ['public' + src, 'public/ui/button.svg', 'public/maps/world.jpg', 'public/sprites/front_sprites/13.png', 'public/sprites/front_sprites/150.png',
    'public/sprites/small_sprites/Sprite Small 1.png', 'public/sprites/arkamon/1/front/idle-poster.webp', 'public/sprites/arkamon/1/front/idle.webp', 'public/sounds/sound.wav', 'public/vfx/move.webp']) await write(file)
  await write('dist/index.html', 'shell')
  return { root, output, manifest, write, args: { root, output, revision: 'a'.repeat(40), requireComplete: false } }
}
describe('bounded web asset packaging', () => {
  it('ships playable portraits locally and pins pending front sprites with heavy media without modifying originals', async () => {
    const f = await fixture(), proof = await packageWebAssets(f.args)
    expect(proof.localAssets.map(file => file.path)).toContain('sprites/arkamon/1/front/idle-poster.webp')
    expect(proof.localAssets.map(file => file.path)).toContain('sprites/front_sprites/13.png')
    expect(proof.externalAssets.map(file => file.path)).toContain('sprites/front_sprites/150.png')
    expect(proof.externalAssets.map(file => file.path)).toHaveLength(4)
    expect(proof.sourceOnlyAssets.map(file => file.path)).toEqual(['sprites/arkamon/1/front/idle.webp'])
    await expect(fs.access(path.join(f.output, 'sprites/arkamon/1/front/idle.webp'))).rejects.toThrow()
    await expect(fs.access(path.join(f.output, 'sprites/front_sprites/150.png'))).rejects.toThrow()
    expect(await fs.readFile(path.join(f.root, 'public/sprites/front_sprites/150.png'), 'utf8')).toBe('fixture')
    expect(await fs.readFile(path.join(f.output, 'sprites/front_sprites/13.png'), 'utf8')).toBe('fixture')
    await expect(fs.access(path.join(f.output, 'sprites/small_sprites/Sprite Small 1.png'))).resolves.toBeUndefined()
    expect(JSON.parse(await fs.readFile(path.join(f.output, 'media-release.json'), 'utf8')).mediaRevision).toBe('a'.repeat(40))
  })
  it('derives local IDs from game data rather than numbering thresholds and requires an authoritative catalog', async () => {
    const f = await fixture()
    await f.write('src/data/pokemon.json', JSON.stringify([{ id: 150 }, { id: 13 }]))
    expect(readPlayableFrontSpriteIds(f.root)).toEqual([13, 150])
    const proof = await packageWebAssets(f.args)
    expect(proof.localAssets.map(file => file.path)).toContain('sprites/front_sprites/150.png')
    expect(proof.externalAssets.map(file => file.path)).not.toContain('sprites/front_sprites/150.png')
    for (const gameData of [[], {}, [{ id: 0 }], [{ id: '13' }], [{ id: 13 }, { id: 13 }]]) {
      await f.write('src/data/pokemon.json', JSON.stringify(gameData))
      await expect(packageWebAssets(f.args)).rejects.toThrow(/species|IDs/)
    }
    await fs.rm(path.join(f.root, 'src/data/pokemon.json'))
    await expect(packageWebAssets(f.args)).rejects.toThrow()
  })
  it('refuses partial native manifests, mutable revisions and an oversized Pages package', async () => {
    const f = await fixture()
    await expect(packageWebAssets({ ...f.args, requireComplete: true })).rejects.toThrow('Native animation contract incomplete')
    await expect(packageWebAssets({ ...f.args, revision: 'main' })).rejects.toThrow('immutable')
    await expect(packageWebAssets({ ...f.args, maxBytes: 1 })).rejects.toThrow('exceeds')
  })
  it('verifies exact page names, sizes and SHA fingerprints before releasing', async () => {
    const f = await fixture()
    await f.write('public/sprites/arkamon-paged/1/front/idle/page-00.webp', 'changed')
    await expect(packageWebAssets(f.args)).rejects.toThrow('fingerprint')
    f.manifest.clips.a.pages[0].src = '/sprites/arkamon-paged/1/front/idle/Page-00.webp'
    await f.write('src/data/arkamon-paged.json', JSON.stringify(f.manifest))
    await expect(packageWebAssets(f.args)).rejects.toThrow('case mismatched')
  })
  it('rejects a manifest path outside the asset root', async () => {
    const f = await fixture(); f.manifest.clips.a.pages[0].src = '/../outside.webp'
    await f.write('src/data/arkamon-paged.json', JSON.stringify(f.manifest))
    await expect(packageWebAssets(f.args)).rejects.toThrow('Unsafe')
  })
  it('refuses a stale revision even when all five source actions and the pinned manifest hash are valid', async () => {
    const f = await fixture(), clips = {}, actions = {}
    const digest = createHash('sha256').update('fixture').digest('hex')
    for (const action of ['idle', 'attack', 'hit', 'victory', 'ko']) {
      const originalSrc = `/sprites/arkamon/1/front/${action}.webp`, src = `/sprites/arkamon-paged/1/front/${action}/page-00.webp`
      const sheet = { frameCount: 1, cellWidth: 1, cellHeight: 1, fps: 24, sha256: digest }
      actions[action] = { speciesId: 1, view: 'front', action, sheet }
      clips[originalSrc] = { originalSrc, frameCount: 1, frameWidth: 1, frameHeight: 1, fps: 24, sourceSha256: digest,
        pages: [{ src, encodedBytes: 7, sha256: digest, firstFrame: 0, frameCount: 1 }] }
      await f.write(`public${src}`, 'fixture')
      await f.write(`public/sprites/arkamon/1/front/${action}.metadata.json`, JSON.stringify(actions[action]))
    }
    await f.write('public/sprites/arkamon/1/front/animation-set.metadata.json', JSON.stringify({ speciesId: 1, view: 'front', actions }))
    await f.write('src/data/arkamon-paged.json', JSON.stringify({ clips }))
    const pin = { version: 1, revision: 'a'.repeat(40), manifestSha256: createHash('sha256').update(JSON.stringify({ clips })).digest('hex'),
      pendingFrontSpritesSha256: (await pendingFrontSpriteInventory(f.root)).pendingFrontSpritesSha256 }
    await f.write('src/data/media-release.json', JSON.stringify(pin))
    await expect(packageWebAssets({ ...f.args, requireComplete: true, revision: 'b'.repeat(40) })).rejects.toThrow('differs from the pinned media release')
    await expect(fs.access(path.join(f.output, 'media-release.json'))).rejects.toThrow()
    const proof = await packageWebAssets({ ...f.args, requireComplete: true })
    expect(proof).toMatchObject({ mediaRevision: pin.revision, manifestSha256: pin.manifestSha256,
      pendingFrontSpritesSha256: pin.pendingFrontSpritesSha256, nativeClips: 5, nativeFrames: 5 })
    expect(assertPinnedMediaRevision(pin.revision, pin)).toBe(pin.revision)
    expect(() => assertPinnedMediaRevision('b'.repeat(40), pin)).toThrow('differs from the pinned media release')
    expect(() => assertPinnedMediaRevision(pin.revision, { ...pin, version: 0 })).toThrow('valid immutable')
    await f.write('src/data/media-release.json', JSON.stringify({ ...pin, pendingFrontSpritesSha256: undefined }))
    await expect(packageWebAssets({ ...f.args, requireComplete: true })).rejects.toThrow('Pending front sprites differ')
    await f.write('src/data/media-release.json', JSON.stringify(pin))
    await f.write('public/sprites/front_sprites/150.png', 'replacement')
    await expect(packageWebAssets({ ...f.args, requireComplete: true })).rejects.toThrow('Pending front sprites differ')
    await f.write('public/sprites/front_sprites/150.png', 'fixture')
    await f.write('public/sprites/front_sprites/151.png', 'new')
    await expect(packageWebAssets({ ...f.args, requireComplete: true })).rejects.toThrow('Pending front sprites differ')
  })
})
