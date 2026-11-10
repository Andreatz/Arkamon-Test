import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pendingFrontSpriteInventory } from '../package-web-assets.mjs'
import { fingerprintRelease, NATIVE_RELEASE_PROOF, NATIVE_RELEASE_SCENARIOS, readPassingReport, sealRelease, verifyRelease } from '../release-verification.mjs'

function nativeReport(artifact) {
  return { stats: { expected: NATIVE_RELEASE_SCENARIOS.length, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ specs: NATIVE_RELEASE_SCENARIOS.map(title => ({ title, tests: [{
    status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed', attachments: [{ name: NATIVE_RELEASE_PROOF, contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ version: 1, ...artifact, transport: 'verified-local-pinned-media', cdnAvailabilityVerified: false })).toString('base64') }] }],
  }] })) }] }
}

async function releaseFixture(t, { species = Array.from({ length: 50 }, (_, index) => index + 107), frames = () => 10 } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arkamon-release-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dist = path.join(root, 'dist'); await mkdir(dist)
  const manifest = { clips: {} }
  for (const [index, id] of species.entries()) {
    const front = path.join(root, 'public/sprites/arkamon', String(id), 'front')
    await mkdir(front, { recursive: true })
    const actions = {}
    for (const [actionIndex, action] of ['idle', 'attack', 'hit', 'victory', 'ko'].entries()) {
      const identity = `/sprites/arkamon/${id}/front/${action}.webp`
      const frameCount = frames(index * 5 + actionIndex)
      const sheet = { frameCount, cellWidth: 192, cellHeight: 192, fps: 24, sha256: 'b'.repeat(64) }
      const metadata = { speciesId: id, view: 'front', action, sheet }
      actions[action] = metadata
      await writeFile(path.join(front, `${action}.metadata.json`), JSON.stringify(metadata))
      manifest.clips[identity] = { originalSrc: identity, frameCount, frameWidth: sheet.cellWidth, frameHeight: sheet.cellHeight,
        fps: sheet.fps, sourceSha256: sheet.sha256, pages: [{ firstFrame: 0, frameCount }] }
    }
    await writeFile(path.join(front, 'animation-set.metadata.json'), JSON.stringify({ speciesId: id, view: 'front', actions }))
  }
  await mkdir(path.join(root, 'src/data'), { recursive: true })
  await mkdir(path.join(root, 'public/sprites/front_sprites'), { recursive: true })
  await writeFile(path.join(root, 'src/data/pokemon.json'), JSON.stringify([{ id: 107 }]))
  const { pendingFrontSpritesSha256 } = await pendingFrontSpriteInventory(root)
  const manifestSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
  const pin = { version: 1, revision: 'c'.repeat(40), manifestSha256, pendingFrontSpritesSha256 }
  await writeFile(path.join(root, 'src/data/arkamon-paged.json'), JSON.stringify(manifest))
  await writeFile(path.join(root, 'src/data/media-release.json'), JSON.stringify(pin))
  const media = { version: 1, mediaRevision: pin.revision, manifestSha256, pendingFrontSpritesSha256, nativeClips: Object.keys(manifest.clips).length,
    nativeFrames: Object.values(manifest.clips).reduce((sum, clip) => sum + clip.frameCount, 0) }
  await writeFile(path.join(dist, 'index.html'), '<html>verified application</html>')
  await writeFile(path.join(dist, 'media-release.json'), JSON.stringify(media))
  const unit = path.join(root, 'unit.json'), browser = path.join(root, 'browser.json'), compiled = path.join(root, 'compiled.json'), nativeCompiled = path.join(root, 'compiled-native.json')
  await writeFile(unit, JSON.stringify({ success: true, numFailedTests: 0, numPassedTests: 10 }))
  await writeFile(browser, JSON.stringify({ stats: { expected: 12, unexpected: 0, flaky: 0, skipped: 2 } }))
  await writeFile(compiled, JSON.stringify({ stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0 } }))
  const artifact = { contentSha256: (await fingerprintRelease(dist)).contentSha256, mediaRevision: media.mediaRevision, manifestSha256: media.manifestSha256, nativeClips: media.nativeClips, nativeFrames: media.nativeFrames }
  await writeFile(nativeCompiled, JSON.stringify(nativeReport(artifact)))
  return { root, dist, revision: 'a'.repeat(40), unit, browser, compiled, nativeCompiled, artifact }
}

test('the published artifact belongs to the checked revision and rejects changed or added bytes', async t => {
  const fixture = await releaseFixture(t), { dist, revision } = fixture
  const sealed = await sealRelease(fixture)
  const command = spawnSync(process.execPath, ['scripts/release-verification.mjs', 'seal', '--dist', dist, '--revision', revision,
    '--root', fixture.root, '--unit', fixture.unit, '--browser', fixture.browser, '--compiled', fixture.compiled, '--native-compiled', fixture.nativeCompiled], { encoding: 'utf8' })
  assert.equal(command.status, 0, command.stderr)
  assert.deepEqual((await verifyRelease(dist, revision, fixture)).files, sealed.files)
  assert.equal(sealed.version, 2)
  assert.equal(sealed.reports.find(report => report.kind === 'native-compiled').artifact.cdnAvailabilityVerified, false)
  await assert.rejects(verifyRelease(dist, 'b'.repeat(40), fixture), /another revision/)
  await writeFile(path.join(dist, 'injected.js'), 'unverified')
  await assert.rejects(verifyRelease(dist, revision, fixture), /changed after verification/)
})

test('empty, failed, flaky, or skipped compiled suites cannot authorize publication', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arkamon-release-report-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'report.json')
  for (const stats of [
    { expected: 0, unexpected: 0, flaky: 0, skipped: 4 },
    { expected: 3, unexpected: 1, flaky: 0, skipped: 0 },
    { expected: 3, unexpected: 0, flaky: 1, skipped: 0 },
    { expected: 3, unexpected: 0, flaky: 0, skipped: 1 },
  ]) { await writeFile(file, JSON.stringify({ stats })); await assert.rejects(readPassingReport(file, 'compiled')) }
  await writeFile(file, JSON.stringify({ success: false, numFailedTests: 1, numPassedTests: 10 }))
  await assert.rejects(readPassingReport(file, 'unit'))
})

test('a missing, partial, skipped or unbound native compiled group cannot seal a release', async t => {
  const fixture = await releaseFixture(t)
  await assert.rejects(sealRelease({ ...fixture, nativeCompiled: undefined }), /native verification report is required/)
  const passing = nativeReport(fixture.artifact)
  const invalid = [
    { ...passing, stats: { ...passing.stats, expected: 5 } },
    { ...passing, stats: { ...passing.stats, skipped: 1 } },
    { ...passing, suites: [] },
    nativeReport({ ...fixture.artifact, contentSha256: 'e'.repeat(64) }),
    nativeReport({ ...fixture.artifact, mediaRevision: 'f'.repeat(40) }),
    nativeReport({ ...fixture.artifact, manifestSha256: 'f'.repeat(64) }),
    nativeReport({ ...fixture.artifact, nativeClips: 455 }),
  ]
  const missingProof = structuredClone(passing); missingProof.suites[0].specs[0].tests[0].results[0].attachments = []
  const duplicate = structuredClone(passing); duplicate.suites[0].specs[1].title = duplicate.suites[0].specs[0].title
  const falsePass = structuredClone(passing); falsePass.suites[0].specs[0].tests[0].results[0].status = 'skipped'
  invalid.push(missingProof, duplicate, falsePass)
  for (const report of invalid) {
    await writeFile(fixture.nativeCompiled, JSON.stringify(report))
    await assert.rejects(sealRelease(fixture), /native|Compiled/)
  }
  await writeFile(fixture.nativeCompiled, JSON.stringify(passing))
  await writeFile(path.join(fixture.dist, 'index.html'), 'rebuilt after the native tests')
  await assert.rejects(sealRelease(fixture), /belongs to another artifact/)
})

test('every pending native form and pinned portrait scenario is required in addition to the six original cases', async t => {
  const fixture = await releaseFixture(t)
  assert.equal(NATIVE_RELEASE_SCENARIOS.length, 55)
  const requiredPending = [
    ...Array.from({ length: 46 }, (_, index) => index + 111).map(id => `compiled ${id}: pending form plays five native actions without game data`),
    ...[205, 184, 206].map(id => `compiled ${id}: pending portrait uses the exact pinned original without game data`),
  ]
  assert.deepEqual(NATIVE_RELEASE_SCENARIOS.slice(6), requiredPending)
  const full = nativeReport(fixture.artifact)
  const legacy = structuredClone(full)
  legacy.stats.expected = 6
  legacy.suites[0].specs = legacy.suites[0].specs.slice(0, 6)
  await writeFile(fixture.nativeCompiled, JSON.stringify(legacy))
  await assert.rejects(sealRelease(fixture), /All required compiled native scenarios must execute/)
  for (const title of requiredPending) {
    const partial = structuredClone(full)
    // A fabricated passing total cannot hide a missing scenario identity.
    partial.suites[0].specs = partial.suites[0].specs.filter(spec => spec.title !== title)
    await writeFile(fixture.nativeCompiled, JSON.stringify(partial))
    await assert.rejects(sealRelease(fixture), /All required compiled native scenarios must execute/)
  }
  const unboundPortrait = structuredClone(full)
  unboundPortrait.suites[0].specs.at(-1).tests[0].results[0].attachments = []
  await writeFile(fixture.nativeCompiled, JSON.stringify(unboundPortrait))
  await assert.rejects(sealRelease(fixture), /artifact evidence is missing/)
  await writeFile(fixture.nativeCompiled, JSON.stringify(full))
  await sealRelease(fixture)
  const receiptFile = path.join(fixture.dist, 'release-verification.json')
  const receipt = JSON.parse(await readFile(receiptFile, 'utf8'))
  receipt.reports.find(report => report.kind === 'native-compiled').passed = 6
  await writeFile(receiptFile, JSON.stringify(receipt))
  await assert.rejects(verifyRelease(fixture.dist, fixture.revision, fixture), /no matching compiled native verification/)
  const oldCatalog = await releaseFixture(t, { species: [107, 108, 109, 110] })
  await assert.rejects(sealRelease(oldCatalog), /missing a required compiled verification action/)
})

test('verification rejects receipts from the old gate and receipts without native evidence', async t => {
  const fixture = await releaseFixture(t), { dist, revision } = fixture
  await sealRelease(fixture)
  const filename = path.join(dist, 'release-verification.json'), sealed = JSON.parse(await readFile(filename, 'utf8'))
  await writeFile(filename, JSON.stringify({ ...sealed, version: 1 }))
  await assert.rejects(verifyRelease(dist, revision, fixture), /obsolete verification contract/)
  await writeFile(filename, JSON.stringify({ ...sealed, reports: sealed.reports.filter(report => report.kind !== 'native-compiled') }))
  await assert.rejects(verifyRelease(dist, revision, fixture), /missing a required verification report/)
  const wrongCatalog = structuredClone(sealed)
  wrongCatalog.reports.find(report => report.kind === 'native-compiled').artifact.nativeClips = 455
  await writeFile(filename, JSON.stringify(wrongCatalog))
  await assert.rejects(verifyRelease(dist, revision, fixture), /no matching complete native catalog verification/)
})

test('catalog growth is verified against source metadata and the pin instead of historical totals', async t => {
  const fixture = await releaseFixture(t, {
    species: Array.from({ length: 156 }, (_, index) => index + 1),
    frames: index => index === 779 ? 21 : 96,
  })
  assert.equal(fixture.artifact.nativeClips, 780)
  assert.equal(fixture.artifact.nativeFrames, 74_805)
  await sealRelease(fixture)
  assert.equal((await verifyRelease(fixture.dist, fixture.revision, fixture)).reports.find(report => report.kind === 'native-compiled').artifact.nativeClips, 780)
  const cli = spawnSync(process.execPath, ['scripts/release-verification.mjs', 'verify', '--dist', fixture.dist,
    '--revision', fixture.revision, '--root', fixture.root], { encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
})

test('matching reports cannot authorize a truncated or stale catalog summary', async t => {
  const fixture = await releaseFixture(t)
  const filename = path.join(fixture.dist, 'media-release.json')
  const media = JSON.parse(await readFile(filename, 'utf8'))
  for (const override of [
    { nativeClips: media.nativeClips - 5 }, { nativeFrames: media.nativeFrames - 1 },
    { mediaRevision: 'e'.repeat(40) }, { manifestSha256: 'e'.repeat(64) },
  ]) {
    const changed = { ...media, ...override }
    await writeFile(filename, JSON.stringify(changed))
    await writeFile(fixture.nativeCompiled, JSON.stringify(nativeReport({ ...fixture.artifact, ...override,
      contentSha256: (await fingerprintRelease(fixture.dist)).contentSha256 })))
    await assert.rejects(sealRelease(fixture), /no matching complete native catalog verification/)
  }
})

test('source metadata and the pin independently reject an incomplete generated native manifest', async t => {
  const fixture = await releaseFixture(t)
  await sealRelease(fixture)
  const file = path.join(fixture.root, 'src/data/arkamon-paged.json')
  const original = JSON.parse(await readFile(file, 'utf8'))
  const truncated = structuredClone(original)
  delete truncated.clips['/sprites/arkamon/107/front/idle.webp']
  await writeFile(file, JSON.stringify(truncated))
  await assert.rejects(sealRelease(fixture), /differs from the pinned media release/)
  await assert.rejects(verifyRelease(fixture.dist, fixture.revision, fixture), /differs from the pinned media release/)
  const pinFile = path.join(fixture.root, 'src/data/media-release.json')
  const pin = JSON.parse(await readFile(pinFile, 'utf8'))
  await writeFile(pinFile, JSON.stringify({ ...pin, manifestSha256: createHash('sha256').update(JSON.stringify(truncated)).digest('hex') }))
  await assert.rejects(sealRelease(fixture), /Native animation contract incomplete/)
  await assert.rejects(verifyRelease(fixture.dist, fixture.revision, fixture), /Native animation contract incomplete/)
  await writeFile(file, JSON.stringify(original))
  await writeFile(pinFile, JSON.stringify(pin))
  const metadataFile = path.join(fixture.root, 'public/sprites/arkamon/107/front/idle.metadata.json')
  const metadata = JSON.parse(await readFile(metadataFile, 'utf8'))
  await writeFile(metadataFile, JSON.stringify({ ...metadata, sheet: { ...metadata.sheet, frameCount: metadata.sheet.frameCount + 1 } }))
  await assert.rejects(sealRelease(fixture), /combined source metadata differs/)
  await assert.rejects(verifyRelease(fixture.dist, fixture.revision, fixture), /combined source metadata differs/)
})

test('release sealing and receipt verification reject pending PNG changes even if the native manifest is unchanged', async t => {
  const fixture = await releaseFixture(t)
  await sealRelease(fixture)
  await writeFile(path.join(fixture.root, 'public/sprites/front_sprites/150.png'), 'new original PNG')
  await assert.rejects(sealRelease(fixture), /Pending front sprites differ/)
  await assert.rejects(verifyRelease(fixture.dist, fixture.revision, fixture), /Pending front sprites differ/)
})
