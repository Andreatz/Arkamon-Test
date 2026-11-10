import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const reviewFile = 'art-source/splash/fullscreen-composition-review-2026-10-26.json'
const review = JSON.parse(await fs.readFile(path.join(root, reviewFile), 'utf8'))
const changes = [], ids = new Set()
const valid = bounds => bounds && ['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(bounds[key]) && bounds[key] >= 0 && bounds[key] <= 1)
  && bounds.left < bounds.right && bounds.top < bounds.bottom
// Validate the complete review before modifying any record.
for (const item of review.records) {
  if (!Number.isInteger(item.id) || item.id < 1 || item.id > 110 || ids.has(item.id)) throw new Error('Invalid or duplicate reviewed form')
  ids.add(item.id)
  const padded = String(item.id).padStart(3, '0'), file = `art-source/splash/status/${padded}.json`
  const record = JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))
  const bytes = await fs.readFile(path.join(root, record.outputFile))
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (item.sourceSha256 !== hash || record.sha256 !== hash || item.version !== record.version) throw new Error(`Stale source review for ${padded}`)
  const { focusBounds: focus, subjectBounds: subject } = item
  if (!valid(focus) || !valid(subject) || focus.left < subject.left || focus.top < subject.top || focus.right > subject.right || focus.bottom > subject.bottom) throw new Error(`Invalid face/torso review for ${padded}`)
  const next = { ...record, compositionPolicy: 'full-canvas-focus', subjectBounds: subject, focusBounds: focus,
    framingVersion: 'full-canvas-focus-v1', framingReview: { file: reviewFile, policy: review.policy, notes: item.notes } }
  delete next.displayScale
  delete next.displayOffset
  changes.push({ file, previous: record, next, history: `art-source/splash/history/${padded}-before-full-canvas-focus-v1.json` })
}
await fs.mkdir(path.join(root, 'art-source/splash/history'), { recursive: true })
for (const item of changes) {
  try { await fs.writeFile(path.join(root, item.history), JSON.stringify(item.previous, null, 2) + '\n', { flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  await fs.writeFile(path.join(root, item.file), JSON.stringify(item.next, null, 2) + '\n')
}
console.log(JSON.stringify({ reviewed: changes.length, policy: review.policy, resizedPaintings: 0 }))
