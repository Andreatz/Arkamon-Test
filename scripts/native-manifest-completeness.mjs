import fs from 'node:fs/promises'
import path from 'node:path'

export const NATIVE_FRONT_ACTIONS = Object.freeze(['idle', 'attack', 'hit', 'victory', 'ko'])
const fail = message => { throw new Error(`Native animation contract incomplete: ${message}`) }
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const positiveInteger = value => Number.isSafeInteger(value) && value > 0

async function readMetadata(file) {
  try {
    const stat = await fs.lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`metadata must be a regular file: ${file}`)
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    fail(`cannot read source metadata ${file}: ${error.message}`)
  }
}

function sheetContract(metadata, identity) {
  const sheet = metadata?.sheet
  if (!isObject(sheet) || !positiveInteger(sheet.frameCount) || !positiveInteger(sheet.cellWidth)
    || !positiveInteger(sheet.cellHeight) || !Number.isFinite(sheet.fps) || sheet.fps <= 0
    || !/^[a-f0-9]{64}$/.test(sheet.sha256 ?? '')) fail(`invalid source sheet: ${identity}`)
  const viewport = sheet.viewport ?? metadata.viewport
  if (viewport !== undefined && (!isObject(viewport) || !positiveInteger(viewport.width)
    || !positiveInteger(viewport.height) || !Number.isSafeInteger(viewport.left) || viewport.left < 0
    || !Number.isSafeInteger(viewport.top) || viewport.top < 0
    || viewport.left + viewport.width > sheet.cellWidth || viewport.top + viewport.height > sheet.cellHeight)) {
    fail(`invalid source viewport: ${identity}`)
  }
  return { frameCount: sheet.frameCount, frameWidth: sheet.cellWidth, frameHeight: sheet.cellHeight,
    fps: sheet.fps, sourceSha256: sheet.sha256,
    ...(viewport === undefined ? {} : { viewport: { width: viewport.width, height: viewport.height, left: viewport.left, top: viewport.top } }) }
}

/** Source metadata defines completeness independently of the generated page manifest. */
export async function validateNativeManifestCompleteness({ root, manifest }) {
  const sourceRoot = path.join(root, 'public/sprites/arkamon')
  let directories
  try { directories = await fs.readdir(sourceRoot, { withFileTypes: true }) } catch (error) {
    fail(`cannot enumerate native species: ${error.message}`)
  }
  const species = directories.filter(entry => /^\d+$/.test(entry.name))
    .sort((a, b) => Number(a.name) - Number(b.name))
  if (!species.length) fail('no authoritative native species metadata')
  const expected = new Map()
  for (const entry of species) {
    const id = Number(entry.name)
    if (!entry.isDirectory() || entry.isSymbolicLink() || !positiveInteger(id) || String(id) !== entry.name) {
      fail(`invalid native species directory: ${entry.name}`)
    }
    const front = path.join(sourceRoot, entry.name, 'front')
    const set = await readMetadata(path.join(front, 'animation-set.metadata.json'))
    if (set.speciesId !== id || set.view !== 'front' || !isObject(set.actions)
      || Object.keys(set.actions).sort().join(',') !== [...NATIVE_FRONT_ACTIONS].sort().join(',')) {
      fail(`species ${id} must contain exactly five source actions: ${NATIVE_FRONT_ACTIONS.join(', ')}`)
    }
    for (const action of NATIVE_FRONT_ACTIONS) {
      const identity = `/sprites/arkamon/${id}/front/${action}.webp`
      const combined = set.actions[action]
      const metadata = await readMetadata(path.join(front, `${action}.metadata.json`))
      for (const value of [combined, metadata]) if (value?.speciesId !== id || value.view !== 'front' || value.action !== action) {
        fail(`source action identity differs: ${identity}`)
      }
      const contract = sheetContract(metadata, identity)
      if (JSON.stringify(sheetContract(combined, identity)) !== JSON.stringify(contract)) {
        fail(`combined source metadata differs from action metadata: ${identity}`)
      }
      expected.set(identity, contract)
    }
  }
  if (!isObject(manifest?.clips)) fail('generated page clips are missing')
  const actual = Object.keys(manifest.clips)
  const missing = [...expected.keys()].filter(key => !Object.hasOwn(manifest.clips, key))
  const unexpected = actual.filter(key => !expected.has(key))
  if (missing.length || unexpected.length) fail(`expected ${expected.size} source clips, found ${actual.length}; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`)
  for (const [identity, contract] of expected) {
    const clip = manifest.clips[identity]
    if (!isObject(clip) || clip.originalSrc !== identity) fail(`generated clip identity differs: ${identity}`)
    for (const field of ['frameCount', 'frameWidth', 'frameHeight', 'fps', 'sourceSha256']) {
      if (clip[field] !== contract[field]) fail(`generated ${field} differs from source metadata: ${identity}`)
    }
    const viewport = clip.viewport
    if (viewport !== undefined && !isObject(viewport)) fail(`invalid generated viewport: ${identity}`)
    const normalizedViewport = viewport === undefined ? undefined : {
      width: viewport.width, height: viewport.height, left: viewport.left, top: viewport.top,
    }
    if (JSON.stringify(normalizedViewport) !== JSON.stringify(contract.viewport)) fail(`generated viewport differs from source metadata: ${identity}`)
    if (!Array.isArray(clip.pages) || !clip.pages.length) fail(`generated pages are missing: ${identity}`)
    let frame = 0
    for (const page of clip.pages) {
      if (!isObject(page) || page.firstFrame !== frame || !positiveInteger(page.frameCount)) fail(`generated pages are noncontiguous: ${identity}`)
      frame += page.frameCount
    }
    if (frame !== contract.frameCount) fail(`generated pages do not cover every source frame: ${identity}`)
  }
  return { speciesCount: species.length, clipCount: expected.size,
    frameCount: [...expected.values()].reduce((sum, clip) => sum + clip.frameCount, 0) }
}
