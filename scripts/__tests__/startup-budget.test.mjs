import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inspectStartupBudget } from '../check-startup-budget.mjs'

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-startup-'))
  try {
    await fs.mkdir(path.join(root, '.vite'))
    await fs.writeFile(path.join(root, '.vite/manifest.json'), JSON.stringify({
      'index.html': { isEntry: true, file: 'entry.js', imports: ['react'], dynamicImports: ['studio'], css: ['base.css'] },
      react: { file: 'react.js', imports: [] }, studio: { file: 'studio.js', imports: ['react'], css: ['studio.css'] },
    }))
    for (const [file, size] of [['entry.js', 10], ['react.js', 20], ['studio.js', 1000], ['base.css', 5], ['studio.css', 500]])
      await fs.writeFile(path.join(root, file), 'x'.repeat(size))
    await run(root)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
}

test('startup budget counts real static imports once and excludes deferred editor assets', () => fixture(async root => {
  const report = await inspectStartupBudget(root, { entryBytes: 10, javascriptBytes: 30, stylesheetBytes: 5 })
  assert.equal(report.ok, true)
  assert.deepEqual(report.totals, { entryBytes: 10, javascriptBytes: 30, stylesheetBytes: 5 })
  assert.deepEqual(report.javascript.map(chunk => chunk.file), ['entry.js', 'react.js'])
}))

test('a larger entry or transitive prerequisite fails the build budget', () => fixture(async root => {
  const report = await inspectStartupBudget(root, { entryBytes: 9, javascriptBytes: 29, stylesheetBytes: 4 })
  assert.equal(report.ok, false)
  assert.equal(report.violations.length, 3)
}))

test('a broken dependency is an error instead of reporting an artificially small entry', () => fixture(async root => {
  await fs.unlink(path.join(root, 'react.js'))
  await assert.rejects(inspectStartupBudget(root), /ENOENT/)
}))
