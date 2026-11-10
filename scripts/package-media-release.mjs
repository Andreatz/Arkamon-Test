import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateNativeManifestCompleteness } from './native-manifest-completeness.mjs'

export const MAX_MEDIA_ARCHIVE_BYTES = 192 * 1024 * 1024
const BLOCK_BYTES = 512, RECORD_BYTES = 20 * BLOCK_BYTES
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0
const digest = data => createHash('sha256').update(data).digest('hex')
const json = data => JSON.stringify(data, null, 2) + '\n'

export function safeMediaPath(value) {
  if (typeof value !== 'string' || !/^sprites\/arkamon-paged\/.+\.(webp|png)$/.test(value)
    || /[\\:\r\n\0]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('-'))) {
    throw new Error(`Unsafe native media path: ${value}`)
  }
  // USTAR stores these ASCII native paths without extended or platform-specific headers.
  if (!/^[\x20-\x7e]+$/.test(value) || Buffer.byteLength(value) > 100) throw new Error(`Native media path exceeds portable USTAR name: ${value}`)
  return value
}

export const tarEntryBytes = bytes => BLOCK_BYTES + Math.ceil(bytes / BLOCK_BYTES) * BLOCK_BYTES
export const tarArchiveBytes = entryBytes => Math.ceil((entryBytes + 2 * BLOCK_BYTES) / RECORD_BYTES) * RECORD_BYTES

/** Keep complete clips together. Input order cannot change the release partition assignment. */
export function partitionNativeClips(clips, maxBytes = MAX_MEDIA_ARCHIVE_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < RECORD_BYTES) throw new Error('Invalid archive byte limit')
  const groups = [], sorted = [...clips].sort((a, b) => order(a.source, b.source))
  const sourceNames = new Set(), fileNames = new Set()
  let files = [], sources = [], entryBytes = 0
  for (const clip of sorted) {
    if (sourceNames.has(clip.source) || !clip.files.length) throw new Error(`Duplicate or empty native clip: ${clip.source}`)
    sourceNames.add(clip.source)
    const pages = [...clip.files].sort((a, b) => order(a.path, b.path))
    for (const page of pages) {
      if (fileNames.has(page.path) || !Number.isSafeInteger(page.bytes) || page.bytes < 1) throw new Error(`Duplicate or invalid native file: ${page.path}`)
      fileNames.add(page.path)
    }
    const clipBytes = pages.reduce((sum, page) => sum + tarEntryBytes(page.bytes), 0)
    if (tarArchiveBytes(clipBytes) > maxBytes) throw new Error(`Native clip exceeds archive byte limit: ${clip.source}`)
    if (files.length && tarArchiveBytes(entryBytes + clipBytes) > maxBytes) {
      groups.push({ files, sources, expectedMaxTarBytes: tarArchiveBytes(entryBytes) })
      files = []; sources = []; entryBytes = 0
    }
    files.push(...pages); sources.push(clip.source); entryBytes += clipBytes
  }
  if (files.length) groups.push({ files, sources, expectedMaxTarBytes: tarArchiveBytes(entryBytes) })
  return groups
}

async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function regularFileInside(root, relative) {
  const file = path.join(root, relative), relativeToRoot = path.relative(await fs.realpath(root), await fs.realpath(file))
  if (relativeToRoot.startsWith('..' + path.sep) || relativeToRoot === '..' || path.isAbsolute(relativeToRoot)
    || !(await fs.lstat(file)).isFile()) throw new Error(`Native file escapes the public root or is not a regular file: ${relative}`)
  return file
}

function runTar(args, cwd, tar = 'tar') {
  return new Promise((resolve, reject) => {
    const process = spawn(tar, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    process.stdout.setEncoding('utf8'); process.stderr.setEncoding('utf8')
    process.stdout.on('data', chunk => { stdout += chunk })
    process.stderr.on('data', chunk => { stderr += chunk })
    process.once('error', reject)
    process.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`tar failed (${code}): ${stderr.trim()}`)))
  })
}

async function makeArchive({ files, sourceRoot, output, name, maxBytes, tar, listDirectory }) {
  const list = path.join(listDirectory, name + '.files')
  await fs.writeFile(list, files.map(file => file.path).join('\0') + '\0')
  const destination = path.join(output, name)
  // Refuse accidental replacement of a reviewed artifact; choose a fresh output directory for a rebuild.
  try { await fs.access(destination); throw new Error(`Release archive already exists: ${destination}`) } catch (error) { if (error.code !== 'ENOENT') throw error }
  await runTar(['--format=ustar', '-b', '20', '-cf', destination, '-C', sourceRoot, '--no-recursion', '--null', '-T', list], output, tar)
  const bytes = (await fs.stat(destination)).size
  if (bytes > maxBytes) throw new Error(`Archive exceeds ${maxBytes} bytes: ${name} (${bytes})`)
  const paths = (await runTar(['-tf', destination], output, tar)).split(/\r?\n/).filter(Boolean)
  const expected = files.map(file => file.path)
  if (paths.length !== expected.length || paths.some((value, index) => value !== expected[index])) throw new Error(`Archive contents differ from file list: ${name}`)
  return { file: name, bytes, sha256: await hashFile(destination), fileCount: files.length, listVerified: true }
}

/** Verify source fingerprints and create archives only; raster files are never decoded or re-encoded. */
export async function packageMediaRelease({ root, output, revision, maxBytes = MAX_MEDIA_ARCHIVE_BYTES, requireComplete = true, tar = 'tar', progress = () => {} }) {
  const startedAt = performance.now()
  root = path.resolve(root); output = path.resolve(output)
  const outputRelative = path.relative(root, output)
  if (!outputRelative || !outputRelative.startsWith('..' + path.sep) && !path.isAbsolute(outputRelative)) throw new Error('Media release output must be outside the checkout')
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('A complete immutable media revision is required')
  const publicRoot = path.join(root, 'public')
  const manifestBuffer = await fs.readFile(path.join(root, 'src/data/arkamon-paged.json'))
  const verificationBuffer = await fs.readFile(path.join(root, 'docs/arkamon-pages-verification.json'))
  const pinBuffer = await fs.readFile(path.join(root, 'src/data/media-release.json'))
  const manifest = JSON.parse(manifestBuffer), verification = JSON.parse(verificationBuffer), pin = JSON.parse(pinBuffer)
  const clips = Object.values(manifest.clips ?? {}).sort((a, b) => order(a.originalSrc, b.originalSrc))
  if (pin.version !== 1 || pin.revision !== revision || pin.manifestSha256 !== digest(JSON.stringify(manifest))) throw new Error('Native manifest or revision differs from the pinned media release')
  if (requireComplete) await validateNativeManifestCompleteness({ root, manifest })
  if (!clips.length || verification.clips?.length !== clips.length || verification.allVisibleRgbaPixelsAndAlphaPreserved !== true) throw new Error('Native conversion proof is incomplete')
  const proofBySource = new Map(verification.clips.map(clip => [clip.source, clip]))
  const nativeClips = [], originals = [], allPaths = new Set()
  for (const clip of clips) {
    if (!/^\/sprites\/arkamon\/\d+\/front\/(idle|attack|hit|victory|ko)\.webp$/.test(clip.originalSrc)) throw new Error('Invalid original clip identity')
    const sourceProof = proofBySource.get(clip.originalSrc)
    if (sourceProof?.sourceSha256 !== clip.sourceSha256 || sourceProof.frames !== clip.frameCount || sourceProof.pages !== clip.pages.length
      || sourceProof.allVisibleRgbaPixelsAndAlphaPreserved !== true) throw new Error(`Native conversion proof differs: ${clip.originalSrc}`)
    const relativeMetadata = clip.originalSrc.slice(1).replace(/\.webp$/, '.metadata.json')
    const metadataFile = await regularFileInside(publicRoot, relativeMetadata)
    const metadataBuffer = await fs.readFile(metadataFile), metadata = JSON.parse(metadataBuffer)
    if (metadata.sheet?.sha256 !== clip.sourceSha256 || metadata.sheet.frameCount !== clip.frameCount || metadata.sheet.fps !== clip.fps
      || metadata.sheet.cellWidth !== clip.frameWidth || metadata.sheet.cellHeight !== clip.frameHeight) throw new Error(`Original metadata differs: ${clip.originalSrc}`)
    originals.push({ path: `original-metadata/${relativeMetadata}`, bytes: metadataBuffer.length, sha256: digest(metadataBuffer), data: metadataBuffer })
    let frame = 0
    const files = []
    for (const page of clip.pages) {
      const relative = safeMediaPath(page.src.replace(/^\//, ''))
      if (!relative.startsWith(clip.originalSrc.slice(1).replace('sprites/arkamon/', 'sprites/arkamon-paged/').replace(/\.webp$/, '/'))) throw new Error(`Native page belongs to another clip: ${relative}`)
      if (allPaths.has(relative) || page.firstFrame !== frame || !Number.isSafeInteger(page.frameCount) || page.frameCount < 1) throw new Error(`Duplicate or noncontiguous native page: ${relative}`)
      allPaths.add(relative); frame += page.frameCount
      const file = await regularFileInside(publicRoot, relative), bytes = (await fs.stat(file)).size
      if (bytes !== page.encodedBytes || await hashFile(file) !== page.sha256) throw new Error(`Native page fingerprint mismatch: ${relative}`)
      files.push({ path: relative, bytes, sha256: page.sha256, firstFrame: page.firstFrame, frameCount: page.frameCount })
    }
    if (frame !== clip.frameCount || files.reduce((sum, file) => sum + file.bytes, 0) !== sourceProof.runtimeEncodedBytes) throw new Error(`Native frame or byte totals differ: ${clip.originalSrc}`)
    nativeClips.push({ source: clip.originalSrc, sourceSha256: clip.sourceSha256, frameCount: clip.frameCount, fps: clip.fps, files })
  }
  const groups = partitionNativeClips(nativeClips, maxBytes)
  const frames = nativeClips.reduce((sum, clip) => sum + clip.frameCount, 0)
  const encodedBytes = nativeClips.flatMap(clip => clip.files).reduce((sum, file) => sum + file.bytes, 0)
  if (frames !== verification.frames || allPaths.size !== verification.pageCount || encodedBytes !== verification.runtimeEncodedBytes) throw new Error('Native release totals differ from the conversion proof')
  try { if ((await fs.readdir(output)).length) throw new Error('Media release output is not empty; reviewed artifacts must not be replaced') } catch (error) { if (error.code !== 'ENOENT') throw error }
  await fs.mkdir(output, { recursive: true })
  const listDirectory = path.join(output, '.file-lists'), metadataRoot = path.join(output, 'metadata'), sampleRoot = path.join(output, 'verification-samples')
  await fs.mkdir(listDirectory, { recursive: true }); await fs.mkdir(metadataRoot, { recursive: true }); await fs.mkdir(sampleRoot, { recursive: true })
  const metadataFiles = [
    { path: 'arkamon-paged.json', data: manifestBuffer }, { path: 'arkamon-pages-verification.json', data: verificationBuffer },
    { path: 'media-release.json', data: pinBuffer }, ...originals,
  ].map(file => ({ ...file, bytes: file.data.length, sha256: digest(file.data) })).sort((a, b) => order(a.path, b.path))
  for (const file of metadataFiles) { const destination = path.join(metadataRoot, file.path); await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, file.data) }
  const archives = [], mappings = [], extractedSamples = []
  for (const [index, group] of groups.entries()) {
    const name = `arkamon-native-${revision}-part-${String(index + 1).padStart(2, '0')}-of-${String(groups.length).padStart(2, '0')}.tar`
    const archive = await makeArchive({ files: group.files, sourceRoot: publicRoot, output, name, maxBytes, tar, listDirectory })
    archives.push({ ...archive, clips: group.sources })
    mappings.push(...group.files.map(file => ({ ...file, archive: name })))
    const samples = new Map([group.files[0], group.files[Math.floor(group.files.length / 2)], group.files.at(-1)].map(file => [file.path, file]))
    for (const file of group.files) if (/\/13\/front\/attack\/page-(00|01|02|03|04|07)\.(webp|png)$/.test(file.path)) samples.set(file.path, file)
    await runTar(['-xf', path.join(output, name), '-C', sampleRoot, ...samples.keys()], output, tar)
    for (const file of samples.values()) {
      const extracted = path.join(sampleRoot, file.path), sha256 = await hashFile(extracted)
      if (sha256 !== file.sha256 || (await fs.stat(extracted)).size !== file.bytes) throw new Error(`Extracted native page differs: ${file.path}`)
      extractedSamples.push({ path: file.path, archive: name, sha256, matchesManifest: true })
    }
    progress(`Native archive ${index + 1}/${groups.length}: ${group.files.length} pages, ${(archive.bytes / 1024 / 1024).toFixed(2)} MiB; list and extracted SHA-256 verified`)
  }
  const metadataArchive = await makeArchive({ files: metadataFiles, sourceRoot: metadataRoot, output,
    name: `arkamon-native-${revision}-metadata.tar`, maxBytes, tar, listDirectory })
  const metadataSamples = path.join(sampleRoot, 'metadata')
  await fs.mkdir(metadataSamples, { recursive: true })
  await runTar(['-xf', path.join(output, metadataArchive.file), '-C', metadataSamples], output, tar)
  for (const file of metadataFiles) {
    if (await hashFile(path.join(metadataSamples, file.path)) !== file.sha256) throw new Error(`Extracted metadata differs: ${file.path}`)
  }
  const release = {
    version: 1, mediaRevision: revision, mediaBase: `https://raw.githubusercontent.com/Andreatz/Arkamon-Beta/${revision}/public/`,
    archiveFormat: 'ustar', maxArchiveBytes: maxBytes, nativeClips: nativeClips.length, nativeFrames: frames, nativePages: allPaths.size,
    runtimeEncodedBytes: encodedBytes, manifestSha256: digest(manifestBuffer), manifestCanonicalSha256: pin.manifestSha256,
    originalsIncluded: false, rasterConversionPerformed: false, archives, metadataArchive,
    metadataFiles: metadataFiles.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    clips: nativeClips.map(({ source, sourceSha256, frameCount, fps }) => ({ source, sourceSha256, frameCount, fps })),
    pages: mappings, verification: { allSourcePageHashesMatchManifest: true, allArchiveListsMatchManifest: true, allExtractedMetadataHashesMatch: true, extractedSamples },
  }
  const indexFile = path.join(output, 'release-index.json'), indexText = json(release)
  await fs.writeFile(indexFile, indexText)
  await fs.writeFile(path.join(output, 'release-index.json.sha256'), `${digest(indexText)}  release-index.json\n`)
  const checksums = [...archives, metadataArchive, { file: 'release-index.json', sha256: digest(indexText) }].sort((a, b) => order(a.file, b.file))
  await fs.writeFile(path.join(output, 'SHA256SUMS'), checksums.map(file => `${file.sha256}  ${file.file}`).join('\n') + '\n')
  progress(`Native release ready: ${release.nativeClips} clips / ${release.nativeFrames} frames / ${release.nativePages} pages in ${((performance.now() - startedAt) / 1000).toFixed(1)} seconds`)
  return release
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const arg = key => { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1] }
  const revision = arg('--revision') ?? JSON.parse(await fs.readFile(path.join(root, 'src/data/media-release.json'), 'utf8')).revision
  const output = path.resolve(arg('--output') ?? path.join(root, '../native-media-release-2026-10-12'))
  await packageMediaRelease({ root, output, revision, progress: console.log })
}
