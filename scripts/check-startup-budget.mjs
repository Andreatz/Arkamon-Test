import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export const STARTUP_BUDGET = { entryBytes: 500_000, javascriptBytes: 800_000, stylesheetBytes: 100_000 }

/** Follow only static edges. Deferred editor, battle and catalog chunks are not counted as title prerequisites. */
export async function inspectStartupBudget(output, budget = STARTUP_BUDGET) {
  const root = path.resolve(output)
  const manifest = JSON.parse(await fs.readFile(path.join(root, '.vite/manifest.json'), 'utf8'))
  const entry = manifest['index.html']
  if (!entry?.isEntry || !entry.file) throw new Error('The build manifest must contain the index.html entry.')
  const seen = new Set(), scripts = new Set(), styles = new Set()
  const visit = key => {
    if (seen.has(key)) return
    const chunk = manifest[key]
    if (!chunk?.file) throw new Error(`Missing static build dependency: ${key}`)
    seen.add(key); scripts.add(chunk.file)
    for (const file of chunk.css ?? []) styles.add(file)
    for (const dependency of chunk.imports ?? []) visit(dependency)
  }
  visit('index.html')
  const sizes = async files => Promise.all([...files].map(async file => {
    const target = path.resolve(root, file)
    if (!target.startsWith(root + path.sep)) throw new Error('Build dependency escapes its output directory.')
    const source = await fs.readFile(target)
    return { file, bytes: source.length, gzipBytes: gzipSync(source).length }
  }))
  const javascript = await sizes(scripts), stylesheets = await sizes(styles)
  const totals = {
    entryBytes: javascript.find(chunk => chunk.file === entry.file).bytes,
    javascriptBytes: javascript.reduce((sum, chunk) => sum + chunk.bytes, 0),
    stylesheetBytes: stylesheets.reduce((sum, chunk) => sum + chunk.bytes, 0),
  }
  const violations = Object.entries(budget).filter(([key, limit]) => totals[key] > limit)
    .map(([key, limit]) => `${key}: ${totals[key]} exceeds ${limit}`)
  return { ok: violations.length === 0, totals, budget, javascript, stylesheets, violations }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await inspectStartupBudget(process.argv[2] ?? 'dist')
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
