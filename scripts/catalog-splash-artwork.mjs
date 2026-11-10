import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

const defaultRoot = fileURLToPath(new URL('..', import.meta.url))
const approvedStatuses = new Set(['approved-visual', 'ui-validated', 'ui-validated-v2'])
const safeZone = { left: .35, top: .18, right: .65, bottom: .82 }
const focusSafeZone = { left: .31, top: .23, right: .65, bottom: .80 }
const sha256 = value => createHash('sha256').update(value).digest('hex')

function requireValue(condition, message, context) {
  if (!condition) throw new Error(`${context}: ${message}`)
}

function normalizedBounds(value, name, context) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `reviewed ${name} are required`, context)
  const bounds = Object.fromEntries(['left', 'top', 'right', 'bottom'].map(key => [key, value[key]]))
  requireValue(Object.values(bounds).every(number => typeof number === 'number' && Number.isFinite(number)), `${name} must contain four finite normalized numbers`, context)
  requireValue(bounds.left < bounds.right && bounds.top < bounds.bottom, `${name} must describe a nonempty ${name === 'subjectBounds' ? 'silhouette' : 'rectangle'}`, context)
  requireValue(Object.values(bounds).every(number => number >= 0 && number <= 1), `${name} must remain inside the normalized canvas0–1`, context)
  return bounds
}

function contains(outer, inner) {
  const epsilon = 1e-9
  return inner.left >= outer.left - epsilon && inner.top >= outer.top - epsilon && inner.right <= outer.right + epsilon && inner.bottom <= outer.bottom + epsilon
}

function displayTransform(record, context) {
  const scale = record.displayScale ?? 1
  if (record.displayScale !== undefined) requireValue(typeof record.displayScale === 'number' && Number.isFinite(record.displayScale) && record.displayScale >= .5 && record.displayScale <= 2.5, 'displayScale must be a finite number in0.5–2.5', context)
  let offset = { x: 0, y: 0 }
  if (record.displayOffset !== undefined) {
    const value = record.displayOffset
    requireValue(value && typeof value === 'object' && !Array.isArray(value) && ['x', 'y'].every(axis => typeof value[axis] === 'number' && Number.isFinite(value[axis]) && value[axis] >= -.3 && value[axis] <= .3), 'displayOffset must contain finite x and y in-.3–.3', context)
    offset = { x: value.x, y: value.y }
  }
  const metadata = {}
  if (record.displayScale !== undefined) metadata.displayScale = scale
  if (record.displayOffset !== undefined) metadata.displayOffset = offset
  const project = bounds => ({
    left: .5 + (bounds.left - .5) * scale + offset.x,
    top: .5 + (bounds.top - .5) * scale + offset.y,
    right: .5 + (bounds.right - .5) * scale + offset.x,
    bottom: .5 + (bounds.bottom - .5) * scale + offset.y,
  })
  return { metadata, project }
}

function reviewedComposition(record, context) {
  requireValue(record.compositionPolicy === undefined || ['hero-focus', 'full-canvas-focus'].includes(record.compositionPolicy), 'unsupported compositionPolicy', context)
  const subjectBounds = normalizedBounds(record.subjectBounds, 'subjectBounds', context)
  if (record.compositionPolicy === 'full-canvas-focus') {
    // Preserve honest source measurements. The actual panel opening is measured
    // in the browser; a fixed guide must not silently clip a real face rectangle.
    requireValue(record.displayScale === undefined && record.displayOffset === undefined, 'full-canvas-focus cannot use displayScale or displayOffset compensation', context)
    const focusBounds = normalizedBounds(record.focusBounds, 'focusBounds', context)
    requireValue(contains(subjectBounds, focusBounds), 'focusBounds must be contained in the full subjectBounds', context)
    return { subjectBounds, compositionPolicy: 'full-canvas-focus', focusBounds }
  }
  const { metadata, project } = displayTransform(record, context)
  const composition = { subjectBounds, ...metadata }
  if (record.compositionPolicy === 'hero-focus') {
    const focusBounds = normalizedBounds(record.focusBounds, 'focusBounds', context)
    requireValue(contains(subjectBounds, focusBounds), 'focusBounds must be contained in the full subjectBounds', context)
    requireValue(contains(focusSafeZone, project(focusBounds)), 'the projected critical face and torso must fit x31–65% / y23–80%', context)
    Object.assign(composition, { compositionPolicy: 'hero-focus', focusBounds })
  } else {
    // Unversioned review records retain the original complete-silhouette rule.
    requireValue(contains(safeZone, subjectBounds), 'the complete silhouette must fit x35–65% / y18–82%', context)
    requireValue(contains(safeZone, project(subjectBounds)), 'the display transform moves the complete silhouette outside x35–65% / y18–82%', context)
  }
  return composition
}

/** Only explicit review records publish artwork; image files alone never opt in. */
export async function buildSplashArtworkCatalog({ root = defaultRoot, check = false } = {}) {
  const directory = path.join(root, 'art-source/splash/status')
  const output = path.join(root, 'ui-source/splash-artwork.generated.json')
  const filenames = (await fs.readdir(directory)).filter(file => file.endsWith('.json')).sort()
  const assets = [], skipped = [], ids = new Set()
  for (const filename of filenames) {
    const context = `art-source/splash/status/${filename}`
    const record = JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'))
    if (!approvedStatuses.has(record.status)) {
      skipped.push({ id: record.id, status: record.status ?? 'unreviewed' })
      continue
    }
    requireValue(Number.isInteger(record.id) && record.id >= 1 && record.id <= 110, 'id must identify a playable catalog form (1–110)', context)
    requireValue(!ids.has(record.id), `duplicate approved form ${record.id}`, context)
    ids.add(record.id)
    requireValue(filename === `${String(record.id).padStart(3, '0')}.json`, 'status filename must match the form ID', context)
    requireValue(typeof record.name === 'string' && record.name.trim().length > 0 && !/[\r\n]/.test(record.name), 'a reviewed creature name is required', context)
    requireValue(typeof record.outputFile === 'string' && /^public\/backgrounds\/arkamon-splash\/\d{3}-[a-z0-9-]+\.webp$/.test(record.outputFile), 'outputFile must be a local splash WebP', context)
    requireValue(path.posix.basename(record.outputFile).startsWith(`${String(record.id).padStart(3, '0')}-`), 'output filename must match the form ID', context)
    const src = `/${record.outputFile.slice('public/'.length)}`
    requireValue(record.runtimePath === src, 'runtimePath must match outputFile', context)
    requireValue(typeof record.sha256 === 'string' && /^[a-f\d]{64}$/i.test(record.sha256), 'a reviewed SHA256 is required', context)
    const bytes = await fs.readFile(path.join(root, record.outputFile))
    requireValue(sha256(bytes) === record.sha256.toLowerCase(), 'WebP SHA256 differs from the reviewed file', context)
    const metadata = await sharp(bytes).metadata()
    requireValue(metadata.format === 'webp', 'the artwork must decode as WebP', context)
    requireValue(metadata.width > 0 && metadata.height > 0 && metadata.width * 9 === metadata.height * 16, 'the decoded artwork must have an exact 16:9 ratio', context)
    requireValue(metadata.width === record.width && metadata.height === record.height, 'decoded dimensions differ from the review record', context)
    if (record.bytes !== undefined) requireValue(record.bytes === bytes.length, 'encoded bytes differ from the review record', context)
    requireValue(record.objectPosition === undefined || record.objectPosition === '50% 50%', 'the reviewed composition must remain centered', context)
    assets.push({
      speciesId: record.id,
      src,
      sha256: record.sha256.toLowerCase(),
      label: `Illustrazione di ${record.name.trim()}`,
      objectPosition: '50% 50%',
      aspectRatio: '16 / 9',
      ...reviewedComposition(record, context),
    })
  }
  assets.sort((left, right) => left.speciesId - right.speciesId)
  const serialized = `${JSON.stringify(assets, null, 2)}\n`
  if (check) {
    requireValue(await fs.readFile(output, 'utf8') === serialized, 'generated catalog is stale; run node scripts/catalog-splash-artwork.mjs', 'splash catalog')
  } else {
    await fs.mkdir(path.dirname(output), { recursive: true })
    await fs.writeFile(output, serialized)
  }
  return { assets, skipped, output }
}

async function main() {
  let root = defaultRoot, check = false
  for (let index = 0; index < process.argv.slice(2).length; index++) {
    const args = process.argv.slice(2), arg = args[index]
    if (arg === '--check') check = true
    else if (arg === '--root' && args[index + 1]) root = path.resolve(args[++index])
    else throw new Error(`Unknown or incomplete argument: ${arg}`)
  }
  const result = await buildSplashArtworkCatalog({ root, check })
  console.log(JSON.stringify({ approved: result.assets.length, excluded: result.skipped.length, output: path.relative(root, result.output).replaceAll('\\', '/'), check }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
