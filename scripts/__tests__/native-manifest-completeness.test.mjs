import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NATIVE_FRONT_ACTIONS, validateNativeManifestCompleteness } from '../native-manifest-completeness.mjs'

const folders = []
afterEach(async () => { for (const folder of folders.splice(0)) await fs.rm(folder, { recursive: true, force: true }) })

async function fixture(ids = [13, 34]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-native-contract-')); folders.push(root)
  const manifest = { clips: {} }
  const write = async (relative, data) => {
    const file = path.join(root, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(data))
  }
  const addSpecies = async (id, actions = NATIVE_FRONT_ACTIONS) => {
    const combined = {}
    for (const action of actions) {
      const viewport = { width: 384, height: 384, left: 64, top: 64 }
      const metadata = { speciesId: id, view: 'front', action,
        sheet: { frameCount: 6, fps: 24, cellWidth: 512, cellHeight: 512, sha256: 'b'.repeat(64), viewport } }
      combined[action] = metadata
      await write(`public/sprites/arkamon/${id}/front/${action}.metadata.json`, metadata)
      const identity = `/sprites/arkamon/${id}/front/${action}.webp`
      manifest.clips[identity] = { originalSrc: identity, speciesId: id, side: 'front', animation: action,
        frameCount: 6, frameWidth: 512, frameHeight: 512, fps: 24, sourceSha256: metadata.sheet.sha256, viewport,
        pages: [0, 1, 2].map(index => ({ firstFrame: index * 2, frameCount: 2 })) }
    }
    await write(`public/sprites/arkamon/${id}/front/animation-set.metadata.json`, { speciesId: id, view: 'front', actions: combined })
  }
  for (const id of ids) await addSpecies(id)
  return { root, manifest, write, addSpecies }
}

describe('native page completeness comes from independent source metadata', () => {
  it('accepts a newly added complete species without a fixed clip or species count', async () => {
    const f = await fixture()
    await expect(validateNativeManifestCompleteness(f)).resolves.toEqual({ speciesCount: 2, clipCount: 10, frameCount: 60 })
    await f.addSpecies(38)
    await expect(validateNativeManifestCompleteness(f)).resolves.toEqual({ speciesCount: 3, clipCount: 15, frameCount: 90 })
  })

  it('rejects a missing paged clip even when the generated manifest reports its own smaller set', async () => {
    const f = await fixture()
    delete f.manifest.clips['/sprites/arkamon/34/front/ko.webp']
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow('missing: /sprites/arkamon/34/front/ko.webp')
  })

  it('rejects replacement with the wrong species clip even if the total count is unchanged', async () => {
    const f = await fixture()
    const original = '/sprites/arkamon/34/front/ko.webp', wrong = '/sprites/arkamon/35/front/ko.webp'
    f.manifest.clips[wrong] = { ...f.manifest.clips[original], originalSrc: wrong }
    delete f.manifest.clips[original]
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow('expected 10 source clips, found 10')
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow(`unexpected: ${wrong}`)
  })

  it.each([
    ['fps', 48], ['frameCount', 5], ['frameWidth', 640], ['frameHeight', 640], ['sourceSha256', 'c'.repeat(64)],
  ])('rejects generated %s that disagrees with the original action metadata', async (field, value) => {
    const f = await fixture()
    f.manifest.clips['/sprites/arkamon/34/front/attack.webp'][field] = value
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow(`generated ${field} differs from source metadata`)
  })

  it('rejects a partially converted new species instead of accepting a self-consistent subset', async () => {
    const f = await fixture()
    await f.addSpecies(38, ['idle'])
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow('species 38 must contain exactly five source actions')
  })

  it('rejects a native directory with no completed combined metadata', async () => {
    const f = await fixture()
    await fs.mkdir(path.join(f.root, 'public/sprites/arkamon/38/front'), { recursive: true })
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow('cannot read source metadata')
  })

  it('rejects a missing page that leaves a gap in the original source frames', async () => {
    const f = await fixture()
    f.manifest.clips['/sprites/arkamon/34/front/attack.webp'].pages.splice(1, 1)
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow('generated pages are noncontiguous')
  })

  it('rejects a missing final page instead of silently shortening the animation', async () => {
    const f = await fixture()
    f.manifest.clips['/sprites/arkamon/34/front/ko.webp'].pages.pop()
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow('do not cover every source frame')
  })

  it('rejects a changed viewport so page geometry cannot change the original framing', async () => {
    const f = await fixture()
    f.manifest.clips['/sprites/arkamon/34/front/idle.webp'].viewport = { width: 384, height: 384, left: 65, top: 64 }
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow('generated viewport differs from source metadata')
  })

  it('rejects a stale combined set even when action and page metadata agree', async () => {
    const f = await fixture()
    const relative = 'public/sprites/arkamon/34/front/animation-set.metadata.json'
    const combined = JSON.parse(await fs.readFile(path.join(f.root, relative), 'utf8'))
    combined.actions.attack.sheet.sha256 = 'c'.repeat(64)
    await f.write(relative, combined)
    await expect(validateNativeManifestCompleteness(f)).rejects.toThrow('combined source metadata differs from action metadata')
  })
})
