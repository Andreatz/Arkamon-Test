import fs from 'node:fs/promises'
import path from 'node:path'

const MODULE_ID = 'virtual:arkamon-runtime-pages'
const RESOLVED_ID = '\0' + MODULE_ID

/**
 * The provenance manifest remains authoritative for packaging and pixel checks.
 * The browser needs only frame geometry. Tuples remove repeated property names
 * and derive repeated page geometry and filename prefixes/extensions. Decoded
 * page objects are created on first use, preserving the original runtime URLs.
 * This changes no media, source frames, source contract or atlas format.
 */
export function packNativeRuntimeManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !manifest.clips || typeof manifest.clips !== 'object') throw new Error('Unsupported native page manifest')
  return Object.fromEntries(Object.entries(manifest.clips).map(([source, clip]) => {
    if (!/^\/sprites\/arkamon\/\d+\/(front|back)\/(idle|attack|hit|victory|ko)\.webp$/.test(source)) throw new Error(`Invalid native clip identity: ${source}`)
    const directory = source.replace('/sprites/arkamon/', '/sprites/arkamon-paged/').replace(/\.webp$/, '/')
    let firstFrame = 0
    const pages = clip.pages.map((page, index) => {
      const file = page.src.slice(directory.length)
      const match = /^page-(\d+)(?:-([a-f0-9]{16}))?\.(webp|png)$/.exec(file)
      if (!page.src.startsWith(directory) || !match) throw new Error(`Native page belongs to another clip: ${page.src}`)
      if (match[1] !== String(index).padStart(2, '0')) throw new Error(`Native page index differs from its filename: ${page.src}`)
      const rows = Math.ceil(page.frameCount / page.columns), width = page.columns * clip.frameWidth, height = rows * clip.frameHeight
      if (!Number.isSafeInteger(page.columns) || page.columns < 1 || !Number.isSafeInteger(page.frameCount) || page.frameCount < 1
        || page.firstFrame !== firstFrame || page.rows !== rows || page.width !== width || page.height !== height
        || page.decodedBytes !== width * height * 4) throw new Error(`Native page geometry cannot be derived without changes: ${page.src}`)
      firstFrame += page.frameCount
      return [(match[2] ?? '') + (match[3] === 'png' ? '.png' : ''), page.frameCount, page.columns]
    })
    if (firstFrame !== clip.frameCount) throw new Error(`Native pages do not cover the complete clip: ${source}`)
    // Page capacity and columns are constant in generated grids. Store them
    // once, deriving the short final page from the native clip frame count.
    // Keep the explicit representation for historical irregular grids.
    const [, capacity, columns] = pages[0] ?? []
    const uniform = pages.length > 0 && pages.every((page, index) => page[2] === columns
      && page[1] === Math.min(capacity, clip.frameCount - index * capacity))
    const tokens = pages.map(page => page[0])
    // Consecutive content hashes are eight bytes each. A single base64url
    // block avoids per-page string/delimiter overhead without losing a bit.
    // Mixed PNG/legacy filenames keep their explicit tokens.
    const packedTokens = tokens.length > 0 && tokens.every(token => /^[a-f0-9]{16}$/.test(token))
      ? '!' + Buffer.from(tokens.join(''), 'hex').toString('base64url') : tokens.join(',')
    const packedPages = uniform ? [capacity, columns, packedTokens] : pages
    return [source, [clip.frameWidth, clip.frameHeight, clip.frameCount, clip.fps, packedPages]]
  }))
}

/** Repeated source paths are derivable from species, view and action slots. */
export function groupNativeRuntimeManifest(clips) {
  const actions = ['idle', 'attack', 'hit', 'victory', 'ko']
  const sets = {}
  for (const [source, clip] of Object.entries(clips)) {
    const match = /^\/sprites\/arkamon\/(\d+)\/(front|back)\/(idle|attack|hit|victory|ko)\.webp$/.exec(source)
    if (!match) throw new Error(`Invalid native clip identity: ${source}`)
    const [, species, side, action] = match
    const sideIndex = side === 'front' ? 0 : 1
    const set = sets[species] ??= []
    const view = set[sideIndex] ??= []
    view[actions.indexOf(action)] = clip
  }
  return sets
}

/** Share one exact grid and hash block only when all five action contracts agree. */
export function compactNativeRuntimeViews(sets) {
  return Object.fromEntries(Object.entries(sets).map(([species, sides]) => [species, sides.map(view => {
    if (!view || view.length !== 5 || Array.from(view).some(clip => !clip || typeof clip[4][2] !== 'string' || !clip[4][2].startsWith('!'))) return view
    const header = [...view[0].slice(0, 4), ...view[0][4].slice(0, 2)]
    if (!view.every(clip => [...clip.slice(0, 4), ...clip[4].slice(0, 2)].every((value, index) => value === header[index]))) return view
    const tokens = Buffer.concat(view.map(clip => Buffer.from(clip[4][2].slice(1), 'base64url')))
    return [header, '!' + tokens.toString('base64url')]
  })]))
}

/** Build-time projection prevents hashes and other verification-only data from entering JS. */
export function nativeRuntimeManifestPlugin(root) {
  const manifestPath = path.resolve(root, 'src/data/arkamon-paged.json')
  return {
    name: 'arkamon-runtime-page-metadata',
    resolveId(id) { if (id === MODULE_ID) return RESOLVED_ID },
    async load(id) {
      if (id !== RESOLVED_ID) return
      this.addWatchFile(manifestPath)
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
      return `export default ${JSON.stringify(compactNativeRuntimeViews(groupNativeRuntimeManifest(packNativeRuntimeManifest(manifest))))};`
    },
  }
}
