import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { atomicWriteJson, readManifestForMerge, validatePagedManifest } from '../arkamon-manifest-publication.mjs'
import { MAX_PAGE_DECODED_BYTES } from '../arkamon-page-packing.mjs'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const run = promisify(execFile)
const temporaryRoots = []
afterEach(async () => { for (const root of temporaryRoots.splice(0)) {
  const target = path.resolve(root), temporary = path.resolve(os.tmpdir()) + path.sep
  if (!target.startsWith(temporary) || !path.basename(target).startsWith('arkamon-manifest-test-')) throw new Error('Refusing to remove a directory outside this test fixture')
  await fs.rm(target, { recursive: true, force: true })
} })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-manifest-test-'))
  temporaryRoots.push(root)
  const source = path.join(root, 'source'), output = path.join(root, 'output'), manifest = path.join(root, 'manifest.json'), report = path.join(root, 'report.json')
  const clip = async (species, action = 'idle', color = '#44aaee') => {
    const directory = path.join(source, String(species), 'front')
    await fs.mkdir(directory, { recursive: true })
    const bytes = await sharp({ create: { width: 4, height: 2, channels: 4, background: color } }).webp({ lossless: true }).toBuffer()
    await fs.writeFile(path.join(directory, `${action}.webp`), bytes)
    await atomicWriteJson(path.join(directory, `${action}.metadata.json`), { sheet: { width: 4, height: 2, cellWidth: 2, cellHeight: 2, columns: 2, frameCount: 2, fps: 24, sha256: sha(bytes) } })
  }
  const build = (...filters) => run(process.execPath, ['scripts/build-arkamon-pages.mjs', '--source', source, '--output', output, '--manifest', manifest, '--report', report,
    ...(!filters.includes('--actions') ? ['--actions', 'idle'] : []), '--effort', '0', ...filters], { cwd: repository })
  return { root, source, output, manifest, report, clip, build }
}
describe('safe publication of native animation pages', () => {
  it('a filtered conversion preserves unrelated clips and their original fingerprints', async () => {
    const { clip, build, manifest, output } = await fixture()
    await clip(1); await clip(2)
    await build()
    const previous = JSON.parse(await fs.readFile(manifest, 'utf8'))
    const unselected = previous.clips['/sprites/arkamon/2/front/idle.webp']
    const oldPage = previous.clips['/sprites/arkamon/1/front/idle.webp'].pages[0]
    const oldFile = path.join(output, '1/front/idle', path.basename(oldPage.src))
    const oldBytes = await fs.readFile(oldFile)
    await clip(1, 'idle', '#ee4422')
    await build('--species', '1')
    const updated = JSON.parse(await fs.readFile(manifest, 'utf8'))
    expect(Object.keys(updated.clips)).toHaveLength(2)
    expect(updated.clips['/sprites/arkamon/2/front/idle.webp']).toEqual(unselected)
    expect(updated.clips['/sprites/arkamon/1/front/idle.webp'].sourceSha256).not.toBe(previous.clips['/sprites/arkamon/1/front/idle.webp'].sourceSha256)
    expect(updated.clips['/sprites/arkamon/1/front/idle.webp'].pages[0].src).not.toBe(oldPage.src)
    expect(await fs.readFile(oldFile)).toEqual(oldBytes)
  })
  it('a conversion failing after a generated clip never publishes a partial manifest or overwrites its old pages', async () => {
    const { source, clip, build, manifest, report, output } = await fixture()
    await clip(1); await clip(2); await build()
    const before = await fs.readFile(manifest), reportBefore = await fs.readFile(report)
    const old = JSON.parse(before).clips['/sprites/arkamon/1/front/idle.webp'].pages[0]
    const oldFile = path.join(output, '1/front/idle', path.basename(old.src)), oldBytes = await fs.readFile(oldFile)
    await clip(1, 'idle', '#ff00aa'); await clip(1, 'attack')
    const metadata = path.join(source, '1/front/attack.metadata.json')
    const broken = JSON.parse(await fs.readFile(metadata, 'utf8'))
    broken.sheet.sha256 = '0'.repeat(64)
    await atomicWriteJson(metadata, broken)
    await expect(build('--species', '1', '--actions', 'idle,attack')).rejects.toThrow()
    expect(await fs.readFile(manifest)).toEqual(before)
    expect(await fs.readFile(report)).toEqual(reportBefore)
    expect(await fs.readFile(oldFile)).toEqual(oldBytes)
  })
  it('refuses an invalid existing manifest rather than overwriting it and writes JSON atomically', async () => {
    const { manifest } = await fixture()
    const empty = { schemaVersion: 1, maxPageDecodedBytes: MAX_PAGE_DECODED_BYTES, clips: {} }
    await atomicWriteJson(manifest, empty)
    expect(await readManifestForMerge(manifest, MAX_PAGE_DECODED_BYTES)).toEqual(empty)
    await fs.writeFile(manifest, '{damaged')
    await expect(readManifestForMerge(manifest, MAX_PAGE_DECODED_BYTES)).rejects.toThrow()
    expect(await fs.readFile(manifest, 'utf8')).toBe('{damaged')
    expect(() => validatePagedManifest({ ...empty, clips: { bad: {} } })).toThrow()
  })
})
