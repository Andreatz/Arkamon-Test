import { cp, mkdir, readdir, readFile, writeFile, stat, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, relative, resolve, dirname } from 'node:path'

// This is a one-time, pinned bootstrap. Never use it to overwrite a reworked checkout.
const ROOT = process.cwd()
const UPSTREAM = resolve(process.argv[2] || '')
const SOURCE_REVISION = '62d24f0361611daff1ca5211c444fa4acefc196d'
const MAX_STATIC_BYTES = 650 * 1024 * 1024
const MAX_INDIVIDUAL_BYTES = 35 * 1024 * 1024
const IMPORT_FOLDERS = [
  'src', 'scripts', 'tests', 'e2e', 'e2e-desktop', 'e2e-release', 'e2e-native-release',
  'public/ui', 'public/maps', 'public/backgrounds', 'public/assets',
  'public/sprites/front_sprites', 'public/sprites/back_sprites', 'public/sprites/small_sprites',
  'public/audio', 'public/audio-lab'
]
const ROOT_FILES = [
  '.gitignore', '.gitattributes', '.npmrc', 'index.html', 'package.json', 'package-lock.json',
  'postcss.config.js', 'tailwind.config.js', 'tsconfig.json', 'tsconfig.node.json',
  'vite.config.ts', 'vitest.config.ts',
  'playwright.config.ts', 'playwright.desktop.config.ts', 'playwright.durable.config.ts',
  'playwright.native-release.config.ts', 'playwright.private-guest.config.ts',
  'playwright.release.config.ts', 'arkamon-theme.json'
]
const REQUIRED_DOCS = ['docs/current-game-spec.md','docs/battle-presentation.md','docs/front-animation-import-2026-11-09.md']
const run = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }).trim()
if (run('-C', UPSTREAM, 'rev-parse', 'HEAD') !== SOURCE_REVISION) throw new Error('Upstream SHA mismatch: refusing an unpinned import')
const sentinel = join(ROOT, 'docs/rework/import-report.json')
try { await access(sentinel); throw new Error('Already imported: bootstrap cannot overwrite work in progress') } catch (error) { if (error?.code !== 'ENOENT') throw error }
let staticBytes = 0, copiedFiles = 0, copiedBytes = 0
const omitted = []
async function copyFile(source, target, name) {
  const s = await stat(source)
  if (!s.isFile()) throw new Error('Refusing a symlink or non-file: ' + name)
  const isStatic = name.startsWith('public/')
  if (isStatic && (s.size > MAX_INDIVIDUAL_BYTES || staticBytes + s.size > MAX_STATIC_BYTES)) {
    omitted.push({ path: name, bytes: s.size, reason: 'size-budget' }); return
  }
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { force: false, errorOnExist: true })
  copiedBytes += s.size; copiedFiles++; if (isStatic) staticBytes += s.size
}
async function copyTree(base) {
  const directory = join(UPSTREAM, base)
  try { await access(directory) } catch { return }
  async function walk(path) {
    const nodes = (await readdir(path, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))
    for (const node of nodes) {
      const full = join(path, node.name), name = relative(UPSTREAM, full).replaceAll('\\','/')
      if (node.isDirectory()) await walk(full)
      else if (node.isFile()) await copyFile(full, join(ROOT, name), name)
      else throw new Error('Unsupported symlink in imported subset: ' + name)
    }
  }
  await walk(directory)
}
for (const file of ROOT_FILES) await copyFile(join(UPSTREAM, file), join(ROOT, file), file)
for (const folder of IMPORT_FOLDERS) await copyTree(folder)
for (const doc of REQUIRED_DOCS) {
  await mkdir(dirname(join(ROOT, doc)), { recursive: true })
  const contents = execFileSync('git', ['-C', UPSTREAM, 'show', 'HEAD:' + doc], { encoding: 'utf8', maxBuffer: 200000 })
  await writeFile(join(ROOT, doc), contents)
}
// The fork uses the intact TS game and its real UI, but never packages all 6+ GB of original video and VFX.
const vitePath = join(ROOT, 'vite.config.ts')
let vite = await readFile(vitePath, 'utf8')
function replaceExact(before, after) {
  if (!vite.includes(before)) throw new Error('Pinned upstream vite.config.ts changed: missing ' + before)
  vite = vite.replace(before, after)
}
replaceExact("const bounded = command === 'build'", "const bounded = command === 'build' && process.env.ARKAMON_TEST_FULL_MEDIA === 'true'")
replaceExact("const mediaRevision = bounded ? assertPinnedMediaRevision(process.env.VITE_MEDIA_REVISION ?? mediaRelease.revision, mediaRelease) : ''",
  "const mediaRevision = bounded ? assertPinnedMediaRevision(process.env.VITE_MEDIA_REVISION ?? mediaRelease.revision, mediaRelease) : mediaRelease.revision")
replaceExact("'import.meta.env.VITE_SPLIT_MEDIA': JSON.stringify(bounded)", "'import.meta.env.VITE_SPLIT_MEDIA': JSON.stringify(true)")
replaceExact("base: web ? '/Arkamon-Beta/' : '/'", "base: web ? '/Arkamon-Test/' : '/'")
replaceExact('copyPublicDir: false', 'copyPublicDir: !bounded')
await writeFile(vitePath, vite)
// Posters not included in the compact fork also use the immutable pinned media store.
const assetPath = join(ROOT, 'src/utils/assetUrl.ts')
let assets = await readFile(assetPath, 'utf8')
const oldPredicate = "/^(sprites\\/arkamon-paged\\/|sounds\\/|vfx\\/)/.test(clean)"
if (!assets.includes(oldPredicate)) throw new Error('Pinned upstream assetUrl.ts changed: refusing silent fallback')
assets = assets.replace(oldPredicate, "/^(sprites\\/arkamon(?:-paged)?\\/|sounds\\/|vfx\\/)/.test(clean)")
await writeFile(assetPath, assets)
await mkdir(join(ROOT, 'docs/rework'), { recursive: true })
const report = { version: 1, source: 'Andreatz/Arkamon-Beta', sourceRevision: SOURCE_REVISION, copiedFiles,
  copiedMiB: +(copiedBytes / 1048576).toFixed(2), staticMiB: +(staticBytes / 1048576).toFixed(2),
  folders: IMPORT_FOLDERS, omitted, remoteMedia: 'https://raw.githubusercontent.com/Andreatz/Arkamon-Beta/' + SOURCE_REVISION + '/public/' }
await writeFile(sentinel, JSON.stringify(report, null, 2) + '\n')
console.log('Imported', report.copiedFiles, 'files /', report.copiedMiB, 'MiB, static', report.staticMiB, 'MiB; omitted', omitted.length, 'oversize files')
console.log('Original media remain on immutable Arkamon-Beta revision; no existing campaign state has been copied.')