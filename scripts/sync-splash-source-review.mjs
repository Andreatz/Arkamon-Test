import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd(), range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index)
const requestedIds = [2, 3, 5, 6, 7, 8, ...range(10, 28), ...range(39, 69), ...range(77, 96)]
const directory = path.join(root, 'art-source/splash/status')
const records = await Promise.all((await fs.readdir(directory)).filter(file => file.endsWith('.json')).map(async file => JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'))))
records.sort((a, b) => a.id - b.id)
const catalogBytes = await fs.readFile(path.join(root, 'ui-source/splash-artwork.generated.json'))
const catalog = JSON.parse(catalogBytes), catalogSha256 = createHash('sha256').update(catalogBytes).digest('hex')
let galleryProof = null
try {
  const proof = JSON.parse(await fs.readFile(path.join(root, 'output/splash-art/gallery-autofit-audit.json'), 'utf8'))
  if (proof.catalogSha256 === catalogSha256 && proof.framingPolicy === 'cover-only-v2'
    && proof.inspectedScreens === catalog.length * 2 && proof.catalogIds.length === catalog.length
    && proof.faceIssues.length === 0 && proof.layoutIssues.length === 0 && proof.renderIssues?.length === 0 && proof.errors.length === 0
    && proof.records?.every(record => record.fullCanvas?.coversCanvas && record.fullCanvas?.singlePainting)) galleryProof = proof
} catch {}
const entries = await Promise.all(records.map(async record => {
  const regenerate = requestedIds.includes(record.id)
  const history = [record], visited = new Set()
  let previous = record.regeneration?.previousStatusFile
  while (previous && !visited.has(previous)) {
    visited.add(previous)
    const archived = JSON.parse(await fs.readFile(path.join(root, previous), 'utf8'))
    history.push(archived)
    previous = archived.regeneration?.previousStatusFile
  }
  const original = history.at(-1)
  const sourceSizeRevisionCompleted = history.some(archived => archived.version === 'hero-source-v2')
  return {
    id: record.id, name: record.name, decision: !original.outputFile ? 'not-an-existing-painting' : regenerate ? 'regenerate' : 'retain',
    reason: !original.outputFile ? 'No painting existed at the original source-size review.' : regenerate
      ? [2, 3, 5].includes(record.id) ? 'Medium source figure; regenerate to match the foreground presence of the approved references.' : 'The source painting was dominated by scenery and had a small distant character.'
      : record.id === 4 ? 'Exact painting previously supplied and approved by the user.' : 'Already had a prominent central foreground character at the original review.',
    originalSha256: original.sha256 ?? null, originalSubjectBounds: original.subjectBounds ?? null,
    currentSha256: record.sha256 ?? null, currentVersion: record.version ?? null,
    sourceSizeRevisionCompleted,
    subsequentFullscreenRevision: record.version === 'fullscreen-source-v3',
    regenerationStatus: regenerate ? sourceSizeRevisionCompleted ? galleryProof?.catalogIds.includes(record.id) ? 'integrated-and-gallery-ui-validated' : 'integrated-awaiting-current-ui-proof' : 'pending' : 'not-requested',
    statusFile: `art-source/splash/status/${String(record.id).padStart(3, '0')}.json`,
  }
}))
const completedIds = entries.filter(entry => entry.decision === 'regenerate' && entry.sourceSizeRevisionCompleted).map(entry => entry.id)
const report = {
  schemaVersion: 2, date: '2026-10-26', updatedAt: new Date().toISOString(),
  request: 'Regenerate the actual source paintings whose Arkamon is too small. A central large face and body, following Oniros, Voider and Eclyps, take precedence over distant scenery.',
  references: [{ id: 109, role: 'Primary source-size and finish standard' }, { id: 110, role: 'Large central presence' }, { id: 30, role: 'Large central presence' }],
  method: 'Historical visual review of all108 paintings available before the fullscreen-source-v3 phase, using contact sheets and individual sources. Current version/history chains preserve completion of that76-painting phase. Size estimates are manual, not automatic subject segmentation.',
  reviewedSources: 108,
  requestedIds, requestedCount: requestedIds.length, completedIds, completedCount: completedIds.length,
  pendingIds: requestedIds.filter(id => !completedIds.includes(id)),
  retainedIds: entries.filter(entry => entry.decision === 'retain').map(entry => entry.id),
  sourcePolicy: 'large-central-foreground',
  currentGalleryValidation: galleryProof ? { date: galleryProof.date, catalogSha256, framingPolicy: 'cover-only-v2', inspectedScreens: galleryProof.inspectedScreens, viewport: galleryProof.viewport, resultFile: 'output/splash-art/gallery-autofit-audit.json', faceIssues: 0, layoutIssues: 0, renderIssues: 0, javascriptErrors: 0 } : null,
  framingRule: 'Current runtime uses one crisp full-canvas cover painting with bounded natural panning, no shrink transform, no mask and no blurred duplicate. At16:9 the entire source painting is shown. A source focus that cannot fit remains an explicit QA failure rather than being hidden by resizing.',
  previousFramingRule: 'The earlier hero-source-v2 phase allowed uniform runtime shrink to protect face and torso. The later fullscreen request superseded that rendering rule; source-size revision history remains intact.',
  unchangedScope: 'Official front sprites, native animations and gameplay data remain separate. The32 retained paintings and absent037/038 describe the original source-size review, not a claim about subsequent fullscreen source revisions.',
  entries,
}
const file = path.join(root, 'art-source/splash/source-scale-review-2026-10-26.json')
await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ reviewedSources: 108, planned: requestedIds.length, completed: completedIds.length, pending: report.pendingIds.length, retained: report.retainedIds.length, currentCatalogForms: catalog.length }))
