import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pendingFrontSpriteInventory } from './package-web-assets.mjs'

// Run only after committing all generated pages. CI can validate the canonical
// manifest fingerprint without fetching the whole binary Git history.
const root = process.cwd()
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const source = JSON.parse(await fs.readFile(path.join(root, 'src/data/arkamon-paged.json'), 'utf8'))
const committed = JSON.parse(execFileSync('git', ['show', `${revision}:src/data/arkamon-paged.json`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
if (JSON.stringify(source) !== JSON.stringify(committed)) throw new Error('Commit the complete native manifest and its pages before pinning a media release')
const manifestSha256 = createHash('sha256').update(JSON.stringify(source)).digest('hex')
const pending = await pendingFrontSpriteInventory(root)
const authored = ['src/data/pokemon.json', 'src/data/arkamon-assets.json']
const tracked = [...authored, ...pending.files.map(([file]) => `public/${file}`)]
try {
  execFileSync('git', ['ls-files', '--error-unmatch', '--', ...tracked], { cwd: root, stdio: 'pipe' })
  const changed = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', ...authored, 'public/sprites/front_sprites'], { cwd: root, encoding: 'utf8' })
  if (changed.trim()) throw new Error('Uncommitted front sprite or catalog changes')
} catch { throw new Error('Commit the original pending PNGs, game catalog and asset catalog before pinning a media release') }
await fs.writeFile(path.join(root, 'src/data/media-release.json'), JSON.stringify({ version: 1, revision, manifestSha256,
  pendingFrontSpritesSha256: pending.pendingFrontSpritesSha256 }, null, 2) + '\n')
console.log(`Media release pinned: ${revision}, manifest ${manifestSha256}`)
