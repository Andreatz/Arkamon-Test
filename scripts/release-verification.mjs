import { createHash } from 'node:crypto'
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { NATIVE_FRONT_ACTIONS, validateNativeManifestCompleteness } from './native-manifest-completeness.mjs'
import { pendingFrontSpriteInventory } from './package-web-assets.mjs'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const manifestName = 'release-verification.json'
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const NATIVE_RELEASE_PROOF = 'Native compiled artifact contract'
const nativeReleaseSpecies = Object.freeze([107, 108, 109, 110])
const pendingNativeReleaseSpecies = Object.freeze(Array.from({ length: 46 }, (_, index) => index + 111))
const pendingPortraitReleaseSpecies = Object.freeze([205, 184, 206])
export const NATIVE_RELEASE_SCENARIOS = Object.freeze([
  ...nativeReleaseSpecies.map(species => `compiled ${species}: five native actions against the pinned local media revision`),
  ...[[107, 110], [108, 109]].map(([attacker, target]) => `compiled ${attacker} versus ${target}: native release and reaction cues complete the real VFX lifecycle`),
  ...pendingNativeReleaseSpecies.map(species => `compiled ${species}: pending form plays five native actions without game data`),
  ...pendingPortraitReleaseSpecies.map(species => `compiled ${species}: pending portrait uses the exact pinned original without game data`),
])

async function inventory(root, relative = '') {
  const files = []
  for (const name of (await readdir(path.join(root, relative))).sort()) {
    const filename = path.posix.join(relative, name)
    if (filename === manifestName) continue
    const location = path.join(root, filename)
    const stat = await lstat(location)
    if (stat.isSymbolicLink()) throw new Error(`Release cannot contain symbolic links: ${filename}`)
    if (stat.isDirectory()) files.push(...await inventory(root, filename))
    else if (stat.isFile()) files.push({ file: filename, bytes: stat.size, sha256: sha256(await readFile(location)) })
    else throw new Error(`Unsupported release entry: ${filename}`)
  }
  return files
}

export async function fingerprintRelease(dist) {
  const files = await inventory(dist)
  return { files, contentSha256: sha256(JSON.stringify(files)) }
}

/** Completeness comes from independent source metadata, not a fixed historical total. */
async function pinnedNativeCatalog(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'src/data/arkamon-paged.json'), 'utf8'))
  const pin = JSON.parse(await readFile(path.join(root, 'src/data/media-release.json'), 'utf8'))
  const manifestSha256 = sha256(JSON.stringify(manifest))
  if (pin.version !== 1 || !/^[a-f0-9]{40}$/.test(pin.revision ?? '') || pin.manifestSha256 !== manifestSha256) {
    throw new Error('Native catalog differs from the pinned media release')
  }
  const complete = await validateNativeManifestCompleteness({ root, manifest })
  const { pendingFrontSpritesSha256 } = await pendingFrontSpriteInventory(root)
  if (pin.pendingFrontSpritesSha256 !== pendingFrontSpritesSha256) throw new Error('Pending front sprites differ from the pinned media release')
  for (const species of [...nativeReleaseSpecies, ...pendingNativeReleaseSpecies]) for (const action of NATIVE_FRONT_ACTIONS) {
    if (!Object.hasOwn(manifest.clips, `/sprites/arkamon/${species}/front/${action}.webp`)) {
      throw new Error('The native catalog is missing a required compiled verification action')
    }
  }
  return { mediaRevision: pin.revision, manifestSha256, pendingFrontSpritesSha256, nativeClips: complete.clipCount, nativeFrames: complete.frameCount }
}

function assertMatchingNativeCatalog(media, expected) {
  if (media.version !== 1 || Object.keys(expected).some(key => media[key] !== expected[key])) {
    throw new Error('The artifact has no matching complete native catalog verification')
  }
}

function compiledNativeProof(report, artifact) {
  const scenarios = new Map()
  function visit(suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      if (scenarios.has(spec.title)) throw new Error('Compiled native scenarios must be distinct')
      scenarios.set(spec.title, test)
    }
    for (const child of suite.suites ?? []) visit(child)
  }
  for (const suite of report.suites ?? []) visit(suite)
  if (scenarios.size !== NATIVE_RELEASE_SCENARIOS.length || NATIVE_RELEASE_SCENARIOS.some(title => !scenarios.has(title))) throw new Error('All required compiled native scenarios must execute')
  if (!artifact || !Number.isSafeInteger(artifact.nativeClips) || artifact.nativeClips < (nativeReleaseSpecies.length + pendingNativeReleaseSpecies.length) * NATIVE_FRONT_ACTIONS.length
    || artifact.nativeClips % NATIVE_FRONT_ACTIONS.length !== 0 || !Number.isSafeInteger(artifact.nativeFrames) || artifact.nativeFrames < artifact.nativeClips
    || !/^[a-f0-9]{40}$/.test(artifact.mediaRevision ?? '') || !/^[a-f0-9]{64}$/.test(artifact.manifestSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(artifact.contentSha256 ?? '')) throw new Error('Compiled native evidence requires a complete pinned native artifact')
  for (const test of scenarios.values()) {
    if (test.status !== 'expected' || test.expectedStatus !== 'passed' || test.results?.length !== 1 || test.results[0].status !== 'passed') throw new Error('Compiled native scenarios must pass without retries or skips')
    const attachments = test.results[0].attachments?.filter(value => value.name === NATIVE_RELEASE_PROOF && value.contentType === 'application/json') ?? []
    if (attachments.length !== 1 || typeof attachments[0].body !== 'string') throw new Error('Compiled native artifact evidence is missing')
    const proof = JSON.parse(Buffer.from(attachments[0].body, 'base64').toString('utf8'))
    for (const key of ['contentSha256', 'mediaRevision', 'manifestSha256', 'nativeClips', 'nativeFrames']) {
      if (proof[key] !== artifact[key]) throw new Error(`Compiled native evidence belongs to another artifact: ${key}`)
    }
    if (proof.version !== 1 || proof.transport !== 'verified-local-pinned-media' || proof.cdnAvailabilityVerified !== false) throw new Error('Compiled native transport evidence is invalid')
  }
  return { ...artifact, transport: 'verified-local-pinned-media', cdnAvailabilityVerified: false }
}

export async function readPassingReport(filename, kind, artifact) {
  const raw = await readFile(filename)
  const report = JSON.parse(raw)
  if (kind === 'unit') {
    if (report.success !== true || report.numFailedTests !== 0 || !(report.numPassedTests > 0)) throw new Error('Unit verification is missing or failed')
    return { kind, passed: report.numPassedTests, skipped: report.numPendingTests ?? 0, reportSha256: sha256(raw) }
  }
  const stats = report.stats
  if (!stats || stats.unexpected !== 0 || stats.flaky !== 0 || !(stats.expected > 0) || report.errors?.length) throw new Error(`${kind} verification is missing, failed or flaky`)
  if ((kind === 'compiled' || kind === 'native-compiled') && stats.skipped !== 0) throw new Error('Compiled release scenarios must all execute')
  if (kind === 'native-compiled' && stats.expected !== NATIVE_RELEASE_SCENARIOS.length) throw new Error('All required compiled native scenarios must execute')
  return { kind, passed: stats.expected, skipped: stats.skipped, reportSha256: sha256(raw),
    ...(kind === 'native-compiled' ? { artifact: compiledNativeProof(report, artifact) } : {}) }
}

export async function sealRelease({ dist, revision, unit, browser, compiled, nativeCompiled, root = projectRoot }) {
  if (!/^[a-f0-9]{40}$/i.test(revision ?? '')) throw new Error('The exact 40-character Git revision is required')
  if (!nativeCompiled) throw new Error('The compiled native verification report is required')
  const { files, contentSha256 } = await fingerprintRelease(dist)
  for (const required of ['index.html', 'media-release.json']) if (!files.some(entry => entry.file === required)) throw new Error(`Missing release file: ${required}`)
  const media = JSON.parse(await readFile(path.join(dist, 'media-release.json'), 'utf8'))
  assertMatchingNativeCatalog(media, await pinnedNativeCatalog(root))
  const artifact = { contentSha256, mediaRevision: media.mediaRevision, manifestSha256: media.manifestSha256, nativeClips: media.nativeClips, nativeFrames: media.nativeFrames }
  const reports = await Promise.all([readPassingReport(unit, 'unit'), readPassingReport(browser, 'browser'), readPassingReport(compiled, 'compiled'), readPassingReport(nativeCompiled, 'native-compiled', artifact)])
  const manifest = { version: 2, revision, verifiedAt: new Date().toISOString(), reports, files, contentSha256 }
  await writeFile(path.join(dist, manifestName), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

export async function verifyRelease(dist, revision, { root = projectRoot } = {}) {
  const manifest = JSON.parse(await readFile(path.join(dist, manifestName), 'utf8'))
  if (manifest.version !== 2 || manifest.revision !== revision) throw new Error('The artifact belongs to another revision or uses an obsolete verification contract')
  const files = await inventory(dist)
  if (JSON.stringify(files) !== JSON.stringify(manifest.files) || sha256(JSON.stringify(files)) !== manifest.contentSha256) throw new Error('The artifact changed after verification')
  const kinds = manifest.reports?.map(report => report.kind).sort()
  if (JSON.stringify(kinds) !== JSON.stringify(['browser', 'compiled', 'native-compiled', 'unit'])) throw new Error('The artifact is missing a required verification report')
  const native = manifest.reports.find(report => report.kind === 'native-compiled')
  if (native.passed !== NATIVE_RELEASE_SCENARIOS.length || native.skipped !== 0 || native.artifact?.contentSha256 !== manifest.contentSha256
    || native.artifact.transport !== 'verified-local-pinned-media' || native.artifact.cdnAvailabilityVerified !== false) throw new Error('The artifact has no matching compiled native verification')
  const media = JSON.parse(await readFile(path.join(dist, 'media-release.json'), 'utf8'))
  assertMatchingNativeCatalog(media, await pinnedNativeCatalog(root))
  if (['mediaRevision', 'manifestSha256', 'nativeClips', 'nativeFrames'].some(key => native.artifact[key] !== media[key])) throw new Error('The artifact has no matching complete native catalog verification')
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2)
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2].replace(/^--/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), args[i * 2 + 1]]))
  try {
    const result = command === 'seal' ? await sealRelease(options) : command === 'verify' ? await verifyRelease(options.dist, options.revision, options) : (() => { throw new Error('Use seal or verify') })()
    console.log(JSON.stringify({ revision: result.revision, files: result.files.length, contentSha256: result.contentSha256, reports: result.reports }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
