import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd(), file = path.join(root, 'art-source/splash/production-plan.json')
const plan = JSON.parse(await fs.readFile(file, 'utf8'))
const records = await Promise.all((await fs.readdir(path.join(root, 'art-source/splash/status'))).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await fs.readFile(path.join(root, 'art-source/splash/status', name), 'utf8'))))
records.sort((a, b) => a.id - b.id)
const byId = new Map(records.map(record => [record.id, record]))
const catalogBytes = await fs.readFile(path.join(root, 'ui-source/splash-artwork.generated.json'))
const catalog = JSON.parse(catalogBytes), catalogSha256 = createHash('sha256').update(catalogBytes).digest('hex')
const published = new Set(catalog.map(entry => entry.speciesId)), generated = records.filter(record => record.outputFile), blocked = records.filter(record => record.status === 'generation-blocked')
const currentReport = report => report.framingPolicy === 'cover-only-v2' && report.catalogSha256 === catalogSha256
  && Array.isArray(report.renderIssues) && (report.records ?? report.results ?? []).length > 0
  && (report.records ?? report.results).every(record => record.fullCanvas?.coversCanvas && record.fullCanvas?.singlePainting)
const reports = []
for (const project of ['desktop', 'compact', 'fullhd']) {
  try {
    const resultFile = `output/splash-art/catalog-ui/${project}/measurements.json`
    const report = JSON.parse(await fs.readFile(path.join(root, resultFile), 'utf8'))
    reports.push({ project, date: report.date, inspectedScreens: report.inspectedScreens, ids: report.catalogIds, current: currentReport(report), passed: currentReport(report) && report.catalogIds.length > 0 && report.issues.length === 0 && report.errors.length === 0 && report.renderIssues.length === 0, resultFile })
  } catch {}
}
try {
  const resultFile = 'output/splash-art/gallery-autofit-audit.json'
  const report = JSON.parse(await fs.readFile(path.join(root, resultFile), 'utf8'))
  reports.push({ project: 'gallery-compact', date: report.date, inspectedScreens: report.inspectedScreens, ids: report.catalogIds, current: currentReport(report), passed: currentReport(report) && report.catalogIds.length === published.size && report.inspectedScreens === published.size * 2 && report.faceIssues.length === 0 && report.layoutIssues.length === 0 && report.renderIssues.length === 0 && report.errors.length === 0, resultFile })
} catch {}
try {
  const resultFile = 'output/splash-art/built-ui/measurements.json'
  const report = JSON.parse(await fs.readFile(path.join(root, resultFile), 'utf8'))
  for (const [width, project] of [[1366, 'compact'], [1600, 'desktop'], [1920, 'fullhd']]) {
    const inspected = report.results.filter(result => result.viewport.width === width)
    const ids = [...new Set(inspected.map(result => result.id))]
    const complete = ids.length === report.catalogIds.length && inspected.length === ids.length * 2 && ids.every(id => ['squadra', 'arkadex'].every(screen => inspected.some(result => result.id === id && result.screen === screen)))
    reports.push({ project, date: report.date, inspectedScreens: inspected.length, ids, current: currentReport(report), passed: currentReport(report) && complete && report.issues.length === 0 && report.renderIssues.length === 0, resultFile, source: 'compiled-build', viewportWidth: width })
  }
} catch {}
const validated = entry => [...new Set(reports.filter(report => report.passed && report.ids.includes(entry.id)).map(report => report.project))]
const validatedDesktop = entry => validated(entry).filter(project => ['desktop', 'compact', 'fullhd'].includes(project))
const sourceSizeIds = []
for (const record of generated) {
  let cursor = record, completed = cursor.version === 'hero-source-v2'
  const visited = new Set()
  while (!completed && cursor.regeneration?.previousStatusFile && !visited.has(cursor.regeneration.previousStatusFile)) {
    const previous = cursor.regeneration.previousStatusFile
    visited.add(previous)
    cursor = JSON.parse(await fs.readFile(path.join(root, previous), 'utf8'))
    completed = cursor.version === 'hero-source-v2'
  }
  if (completed) sourceSizeIds.push(record.id)
}
const fullscreenIds = generated.filter(record => record.version === 'fullscreen-source-v3').map(record => record.id)
const validatedAtAllThreeResolutions = generated.filter(record => validatedDesktop(record).length === 3).map(record => record.id)
const allGallery = published.size === plan.scope.defaultArtworkCount && records.every(record => published.has(record.id) && validated(record).includes('gallery-compact'))
const allDesktop = validatedAtAllThreeResolutions.length === plan.scope.defaultArtworkCount
plan.purpose = 'Splash16:9 grandi e centrali, visualizzati come un unico dipinto nitido a schermo intero. Volto e corpo principale devono rimanere leggibili tra i pannelli di Squadra e Arkadex.'
Object.assign(plan.scope, {
  productionStatus: blocked.length ? 'partial-external-generation-block' : allDesktop ? 'ui-validated-three-desktop-sizes' : allGallery ? 'generated-and-gallery-ui-validated' : 'generated-awaiting-ui-review',
  progressNote: `${generated.length} immagini disponibili su110; ${published.size} pubblicate nel catalogo locale; ${blocked.length} bloccate dal generatore. Solo rapporti cover-only-v2 con SHA256 corrente e prove fullCanvas attestano la verifica attuale.`,
})
Object.assign(plan.production, {
  compositionPolicy: 'full-canvas-focus',
  subjectSafeZone: { kind: 'editorial-composition-guide', guideOnly: true, appliesTo: 'Suggested placement of the face and main torso; wings, tail, crests and peripheral limbs may be covered by UI.', xPercent: [31, 65], yPercent: [23, 80], enforcement: 'Preserve honest normalized source measurements within subjectBounds. These percentages are editorial guidance, not a fixed acceptance gate; actual browser-measured UI clearance decides whether the source fits.', reference: 'C:/Users/andre/Downloads/Sprite/4.png' },
  previousFullSilhouetteRule: 'Superseded by the user on25October2026. The original76-source-size revision is historical; the later fullscreen request also supersedes runtime shrink over a blurred duplicate.',
  sourceScaleRevision: { date: '2026-10-26', policy: 'large-central-foreground', reviewFile: 'art-source/splash/source-scale-review-2026-10-26.json', regeneratedIds: sourceSizeIds, regeneratedCount: sourceSizeIds.length, referenceIds: [109, 110, 30], runtimeScaleRule: 'Historical source-size revision retained through versioned status history. Current rendering is cover-only-v2 and never shrinks the whole painting.' },
  fullscreenSourceRevision: { date: '2026-10-26', version: 'fullscreen-source-v3', sourceIds: fullscreenIds, sourceCount: fullscreenIds.length, rule: 'Correct source composition where required. One full-canvas crisp painting, no inset, blur, mask or runtime shrink.' },
  futureUiZones: { guideOnly: true, leftPercent: [0, 30], rightPercent: [66, 100], topNonessentialPercent: [0, 23], bottomNonessentialPercent: [80, 100], enforcement: 'Editorial composition reference only. Current panel and title geometry is measured from the actual UI.' },
  completedArtIds: generated.map(record => record.id), completedArtCount: generated.length,
  publishedArtIds: [...published].sort((a, b) => a - b), publishedArtCount: published.size,
  blockedArtIds: blocked.map(record => record.id), pendingArtCount: plan.scope.defaultArtworkCount - generated.length, integrationInProgressIds: [], revisionRequestedArtIds: [], productionPaused: false,
  commonPrompt: 'Original cinematic painterly fantasy illustration16:9. Exact official form anatomy and colors. Large central figure; face and main torso clearly readable between live panels. Wings, tail and peripheral limbs may extend behind UI. One coherent sharp environment across the entire source. No text or baked interface. A distinct painting for each catalog form.',
  sharedRules: ['The user prioritizes a large readable face and torso over visibility of every extremity.', 'Use the exact official frontPNG for each form.', 'One distinct artwork for each of110catalog forms, including forms with the same name.', 'Environment and lighting proposals are editorial art direction, not canonical lore.', 'Never alter gameplay statistics, evolution data, native animations or compact portrait identity.', 'Export1920x1080WebP; preserve source paintings and generation prompts.', 'Publish only explicit reviewed records; verify projected face/torso bounds and crisp full-canvas coverage in the live interface.'],
  qaChecklist: ['Review exact official form identity and the painted face/main torso.', 'Verify1920x1080decoded16:9 derivative andSHA256.', 'Verify the projected focus in Squadra and Arkadex at1366x768,1600x900,1920x1080.', 'Verify one cover background fills the shell, without transform, mask, filter or duplicate; exact16:9 retains the full source and other aspect ratios use natural cover cropping.', 'Check title and panel overlaps, content overflow, image loading, player switching and undiscovered species privacy.', 'Keep generated image counts, local publication, browser validation, build, commit and push as distinct states.'],
  runtimeFraming: { policy: 'cover-only-v2', marginPixels: [14, 22], protectedRegion: 'Actual opening between roster/index, dossier, title, lower caption and commands. Recomputed on resize, font loading and lazy screen changes.', sourceRendering: 'One crisp cover layer with bounded natural panning; no runtime shrink or blurred duplicate. An unfit source focus is an explicit QA failure.', catalogSha256 },
  uiValidationInProgressIds: generated.filter(record => validatedDesktop(record).length < 3).map(record => record.id),
  qualityCheckpoint: { policy: 'cover-only-v2', reports, scope: 'Only matching current catalog SHA256 and cover-only-v2 reports with fullCanvas evidence establish current validation. Earlier shrink/static-framing reports are historical and superseded.', validatedAtAllThreeResolutions },
})
for (const entry of plan.entries) {
  const record = byId.get(entry.id)
  Object.assign(entry, {
    artStatus: record?.status ?? 'pending', integrationStatus: published.has(entry.id) ? validatedDesktop(entry).length === 3 ? 'ui-validated-three-desktop-sizes' : validated(entry).includes('gallery-compact') ? 'ui-validated-compact-gallery' : 'published-local-awaiting-full-ui-check' : 'official-portrait-fallback',
    fileExistsAtAudit: !!record?.outputFile, sourcePromptFile: record?.promptFile ?? null, sourceOriginalFile: record?.sourceMaster ?? null, exportDimensions: record?.outputFile ? { width: record.width, height: record.height } : null,
    compositionSafeZone: { policy: record?.compositionPolicy ?? 'legacy-full-silhouette', guideOnly: record?.compositionPolicy === 'full-canvas-focus', faceAndTorsoXPercent: [31, 65], faceAndTorsoYPercent: [23, 80], peripheralAnatomyMayBeCovered: record?.compositionPolicy !== undefined, validation: record?.compositionPolicy === 'full-canvas-focus' ? 'Honest normalized focus within subjectBounds; actual browser UI clearance is authoritative. The percentages here are editorial guidance only.' : 'The individual status record retains its own legacy or hero-focus catalog validation rule; browser clearance remains separately verified.' },
    sourceStatusFile: `art-source/splash/status/${entry.paddedId}.json`, uiValidatedProjects: validated(entry),
  })
}
plan.updatedAt = new Date().toISOString()
await fs.writeFile(file, JSON.stringify(plan, null, 2) + '\n')
const rows = plan.entries.map(entry => `|${entry.paddedId}|${entry.name}|${entry.artStatus}|${entry.integrationStatus}|`).join('\n')
const blockedText = blocked.length ? ` Le forme ${blocked.map(record => String(record.id).padStart(3, '0')).join(' e ')} conservano il ritratto ufficiale dopo il blocco del generatore; non sono dichiarate completate.` : ' Nessuna forma resta sul ritratto di ripiego per mancanza dello splash.'
const text = '# Produzione splash Arkamon\n\nAggiornamento: 26 ottobre 2026. Ambito confermato: 110 illustrazioni distinte, una per forma.\n\n'
  + `**${generated.length}/110 immagini disponibili**, ${published.size} collegate alla UI locale.${blockedText}\n\n`
  + 'Il criterio attuale è un **unico dipinto nitido a schermo intero**, con volto e torso grandi e leggibili tra i pannelli. Il renderer non riduce il dipinto sopra una copia sfocata: a 16:9 mostra l\'intera sorgente; negli altri rapporti usa il ritaglio naturale cover e uno spostamento limitato. Ali, coda, creste e arti periferici possono finire dietro i pannelli. Una composizione sorgente incompatibile resta un problema visibile nei rapporti di verifica.\n\n'
  + 'La policy corrente **full-canvas-focus** conserva le misure reali del volto e del torso entro quelle del soggetto. La fascia indicativa x31–65% / y23–80% è una guida artistica e non un limite fisso: la verifica del browser usa l\'apertura effettiva fra pannelli, titoli e comandi. Le singole voci riportano la policy del proprio record; eventuali regole precedenti restano esplicite.\n\n'
  + `La precedente revisione delle dimensioni del personaggio comprende ${sourceSizeIds.length} dipinti rigenerati. I suoi 76 ID originali e le versioni precedenti restano nello storico; la fase corrente fullscreen-source-v3 comprende ${fullscreenIds.length} sorgenti (${fullscreenIds.map(id => String(id).padStart(3, '0')).join(', ')}). I 32 dipinti conservati e le due forme allora assenti descrivono la revisione precedente, non lo stato attuale.\n\n`
  + 'Fonti: [piano completo](./production-plan.json), [revisione delle sorgenti](./source-scale-review-2026-10-26.json), record individuali in status/. Originali e prove in output/splash-art sono locali e ignorati da Git. Solo rapporti cover-only-v2 con SHA256 corrente e controlli fullCanvas possono attestare la verifica corrente; le misure precedenti restano storiche.\n\n'
  + 'Le scene sono proposte artistiche e non introducono nuova lore. Nessun dato di gioco viene alterato. I WebP 1920×1080 sono esportazioni dai master del generatore, non master nativi Full HD o 4K.\n\n'
  + '|ID|Forma|Stato art|Integrazione|\n|---|---|---|---|\n' + rows + '\n'
await fs.writeFile(path.join(root, 'art-source/splash/production-plan.md'), text)
console.log(JSON.stringify({ generated: generated.length, published: published.size, blocked: blocked.map(record => record.id), sourceSizeRevisionCount: sourceSizeIds.length, fullscreenSourceIds: fullscreenIds, validationReports: reports.map(report => ({ project: report.project, current: report.current, passed: report.passed, forms: report.ids.length })) }))
