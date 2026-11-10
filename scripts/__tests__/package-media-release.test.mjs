import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { packageMediaRelease, partitionNativeClips, safeMediaPath, tarArchiveBytes, tarEntryBytes } from '../package-media-release.mjs'

const digest = data => createHash('sha256').update(data).digest('hex')
const revision = '7f0c93114684929e1b678855ab74fe1297281e8f'
const folders = []
afterEach(async () => { for (const folder of folders.splice(0)) await fs.rm(folder, { recursive: true, force: true }) })
async function fixture() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-media-release-')); folders.push(folder)
  const root = path.join(folder, 'checkout'), output = path.join(folder, 'release')
  const source = '/sprites/arkamon/13/front/attack.webp', sourceSha256 = 'b'.repeat(64)
  const pages = []
  for (let i = 0; i < 3; i++) {
    const src = `/sprites/arkamon-paged/13/front/attack/page-0${i}.webp`, data = Buffer.alloc(5000, i + 1)
    const file = path.join(root, 'public', src.slice(1)); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data)
    pages.push({ src, firstFrame: i * 2, frameCount: 2, encodedBytes: data.length, sha256: digest(data) })
  }
  const manifest = { clips: { [source]: { originalSrc: source, sourceSha256, frameWidth: 512, frameHeight: 512, frameCount: 6, fps: 24, pages } } }
  const report = { clips: [{ source, sourceSha256, frames: 6, pages: 3, runtimeEncodedBytes: 15000, allVisibleRgbaPixelsAndAlphaPreserved: true }],
    frames: 6, pageCount: 3, runtimeEncodedBytes: 15000, allVisibleRgbaPixelsAndAlphaPreserved: true }
  const metadata = { sheet: { sha256: sourceSha256, frameCount: 6, fps: 24, cellWidth: 512, cellHeight: 512 } }
  for (const [relative, data] of [['src/data/arkamon-paged.json', manifest], ['docs/arkamon-pages-verification.json', report],
    ['src/data/media-release.json', { version: 1, revision, manifestSha256: digest(JSON.stringify(manifest)) }],
    ['public/sprites/arkamon/13/front/attack.metadata.json', metadata]]) {
    const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n')
  }
  return { root, output, manifest, pages }
}

describe('native release partitioning and portable tar verification', () => {
  it('assigns complete clips deterministically and reserves tar headers plus final record padding', () => {
    const clips = ['c', 'a', 'b'].map(source => ({ source, files: [{ path: source, bytes: 15000 }] }))
    const groups = partitionNativeClips(clips, 30720)
    expect(groups.map(group => group.sources)).toEqual([['a'], ['b'], ['c']])
    expect(partitionNativeClips(clips.reverse(), 30720)).toEqual(groups)
    expect(tarEntryBytes(15000)).toBe(15872)
    expect(tarArchiveBytes(15872)).toBe(20480)
    expect(groups.every(group => group.expectedMaxTarBytes <= 30720)).toBe(true)
    expect(() => partitionNativeClips(clips, 10240)).toThrow('exceeds archive')
  })

  it.each(['/sprites/arkamon-paged/1/front/idle/page-00.webp', 'sprites/arkamon-paged/../arkamon/1.webp',
    'sprites/arkamon-paged/-C/1.webp', 'sprites/arkamon-paged/1\nother.webp', 'sprites/arkamon-paged/1:ads.webp',
    'sprites/arkamon-paged/1\rfile.webp', 'sprites/arkamon-paged/1\0file.webp', 'sprites\\arkamon-paged\\1.webp'])('rejects unsafe file-list paths %s', value => {
    expect(() => safeMediaPath(value)).toThrow('Unsafe')
  })

  it('creates an actual tar, lists only manifest pages and verifies extracted binary bytes and index checksums', async () => {
    const { root, output, pages } = await fixture()
    const release = await packageMediaRelease({ root, output, revision, requireComplete: false, maxBytes: 40960 })
    expect(release.nativePages).toBe(3); expect(release.nativeFrames).toBe(6)
    expect(release.archives).toHaveLength(1)
    expect(release.archives[0].bytes).toBeLessThanOrEqual(40960)
    expect(release.pages.map(page => page.path)).toEqual(pages.map(page => page.src.slice(1)))
    expect(release.pages.every(page => page.archive === release.archives[0].file)).toBe(true)
    expect(release.verification.extractedSamples).toHaveLength(3)
    for (const sample of release.verification.extractedSamples) expect(digest(await fs.readFile(path.join(output, 'verification-samples', sample.path)))).toBe(sample.sha256)
    expect(release.originalsIncluded).toBe(false); expect(release.rasterConversionPerformed).toBe(false)
    expect(release.metadataFiles.find(file => file.path.endsWith('attack.metadata.json'))).toBeDefined()
    expect(release.verification.allExtractedMetadataHashesMatch).toBe(true)
    const index = await fs.readFile(path.join(output, 'release-index.json'))
    expect(await fs.readFile(path.join(output, 'release-index.json.sha256'), 'utf8')).toBe(`${digest(index)}  release-index.json\n`)
    for (const archive of [...release.archives, release.metadataArchive]) expect(digest(await fs.readFile(path.join(output, archive.file)))).toBe(archive.sha256)
    expect(await fs.readFile(path.join(output, 'SHA256SUMS'), 'utf8')).toContain(`${digest(index)}  release-index.json`)
    await expect(packageMediaRelease({ root, output, revision, requireComplete: false })).rejects.toThrow('not empty')
  }, 30000)

  it('refuses corrupted source bytes before writing any archive or release index', async () => {
    const { root, output, pages } = await fixture()
    await fs.writeFile(path.join(root, 'public', pages[0].src.slice(1)), Buffer.alloc(5000, 99))
    await expect(packageMediaRelease({ root, output, revision, requireComplete: false })).rejects.toThrow('fingerprint mismatch')
    await expect(fs.access(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses unpinned revisions, incomplete production manifests and output inside the checkout', async () => {
    const { root, output } = await fixture()
    await expect(packageMediaRelease({ root, output, revision: 'a'.repeat(40), requireComplete: false })).rejects.toThrow('pinned')
    await expect(packageMediaRelease({ root, output, revision })).rejects.toThrow('incomplete')
    await expect(packageMediaRelease({ root, output: path.join(root, 'release'), revision, requireComplete: false })).rejects.toThrow('outside')
  })

  it('rejects duplicate clip or file assignments instead of archiving ambiguous lists', () => {
    expect(() => partitionNativeClips([{ source: 'same', files: [{ path: 'a', bytes: 1 }] }, { source: 'same', files: [{ path: 'b', bytes: 1 }] }])).toThrow('Duplicate')
    expect(() => partitionNativeClips([{ source: 'a', files: [{ path: 'same', bytes: 1 }] }, { source: 'b', files: [{ path: 'same', bytes: 1 }] }])).toThrow('Duplicate')
  })

  it('rejects discontinuous frames or metadata changed after native conversion', async () => {
    const { root, output, manifest } = await fixture()
    manifest.clips['/sprites/arkamon/13/front/attack.webp'].pages[1].firstFrame = 3
    await fs.writeFile(path.join(root, 'src/data/arkamon-paged.json'), JSON.stringify(manifest))
    await fs.writeFile(path.join(root, 'src/data/media-release.json'), JSON.stringify({ version: 1, revision, manifestSha256: digest(JSON.stringify(manifest)) }))
    await expect(packageMediaRelease({ root, output, revision, requireComplete: false })).rejects.toThrow('noncontiguous')
    manifest.clips['/sprites/arkamon/13/front/attack.webp'].pages[1].firstFrame = 2
    await fs.writeFile(path.join(root, 'src/data/arkamon-paged.json'), JSON.stringify(manifest))
    await fs.writeFile(path.join(root, 'src/data/media-release.json'), JSON.stringify({ version: 1, revision, manifestSha256: digest(JSON.stringify(manifest)) }))
    await fs.writeFile(path.join(root, 'public/sprites/arkamon/13/front/attack.metadata.json'), JSON.stringify({ sheet: { sha256: 'c'.repeat(64) } }))
    await expect(packageMediaRelease({ root, output, revision, requireComplete: false })).rejects.toThrow('metadata differs')
  })
})
