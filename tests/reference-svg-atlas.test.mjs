import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { extractSheet, importAtlas, parseSheet, validateManifest } from '../scripts/import-reference-svg-atlas.mjs'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" color-interpolation="sRGB">
<title>Atlas fixture</title><desc>Static rectangular artwork</desc>
<defs>
<linearGradient id="used" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient>
<linearGradient id="unused" gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="20" y2="20"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
</defs>
<path fill="#012345" fill-opacity="0.5" d="M0 0h8v8h-8ZM15 15h3v3h-3Z"/>
<path fill="url(#used)" d="M3 3h10v10h-10Z"/>
<path fill="#fedcba" fill-opacity="0.5" d="M4 4h1v1h-1Z"/>
</svg>`
const crop = { id: 'button-active', sheet: 'atlas.svg', rect: [2.5, 2.5, 5, 5], role: 'selected button' }

test('clips independent rectangles, preserving paint order, opacity and gradient coordinates', () => {
  const source = parseSheet(svg)
  const result = extractSheet(source, [crop])
  const output = result.crops[0]
  assert.equal(result.sourceRectangleCount, 4)
  assert.equal(output.pathCount, 3)
  assert.equal(output.rectangleCount, 3)
  assert.equal(output.gradientCount, 1)
  assert.match(output.svg, /viewBox="2.5 2.5 5 5" preserveAspectRatio="xMidYMid meet"/)
  assert.match(output.svg, /shape-rendering="crispEdges"/)
  assert.match(output.svg, /fill="#012345" fill-opacity="0.5" d="M2.5 2.5h5v5h-5Z"/)
  assert.match(output.svg, /fill="url\(#used\)" d="M3 3h4.5v4.5h-4.5Z"/)
  assert.match(output.svg, /id="used" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0"/)
  assert.doesNotMatch(output.svg, /id="unused"|M15 15/)
  assert.ok(output.svg.indexOf('fill="#012345"') < output.svg.indexOf('fill="url(#used)"'))
  assert.ok(output.svg.indexOf('fill="url(#used)"') < output.svg.indexOf('fill="#fedcba"'))
  assert.equal(parseSheet(output.svg).paths.length, 3)
})

test('dispatches one source to several crops without leaking other regions', () => {
  const second = { ...crop, id: 'corner', rect: [14, 14, 5, 5] }
  const outputs = extractSheet(parseSheet(svg), [crop, second]).crops
  assert.equal(outputs.length, 2)
  assert.equal(outputs[1].rectangleCount, 1)
  assert.equal(outputs[1].gradientCount, 0)
  assert.match(outputs[1].svg, /M15 15h3v3h-3Z/)
  assert.doesNotMatch(outputs[1].svg, /<defs>|url\(#used\)/)
})

test('rejects unsupported path grammar even outside the requested crop', () => {
  const invalid = svg.replace('M15 15h3v3h-3Z', 'M15 15L18 18Z')
  assert.throws(() => extractSheet(parseSheet(invalid), [crop]), /Unsupported path grammar/)
})

test('rejects malformed rectangles, empty crops and unknown gradients', () => {
  assert.throws(() => extractSheet(parseSheet(svg.replace('h8v8h-8Z', 'h8v8h-7Z')), [crop]), /Invalid rectangular subpath/)
  assert.throws(() => extractSheet(parseSheet(svg), [{ ...crop, rect: [18, 0, 1, 1] }]), /Empty crop/)
  assert.throws(() => parseSheet(svg.replace('url(#used)', 'url(#missing)')), /Unknown gradient/)
})

for (const [name, transform] of [
  ['active element', source => source.replace('</svg>', '<script>alert(1)</script></svg>')],
  ['raster element', source => source.replace('</svg>', '<image href="data:image/png;base64,AAAA"/></svg>')],
  ['event attribute', source => source.replace('fill="#012345"', 'onload="alert(1)" fill="#012345"')],
  ['external paint', source => source.replace('url(#used)', 'url(https://example.org/a.svg#paint)')],
  ['DTD entity', source => '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + source],
  ['external processing instruction', source => '<?xml-stylesheet href="https://example.org/style"?>' + source],
  ['duplicate attributes', source => source.replace('fill="#012345"', 'fill="#012345" fill="#fff"')],
  ['nonlocal gradient sizing', source => source.replace('gradientUnits="userSpaceOnUse"', 'gradientUnits="objectBoundingBox"')],
  ['unsupported shape rendering', source => source.replace('color-interpolation="sRGB"', 'shape-rendering="url(https://example.org/paint)"')],
]) {
  test(`rejects ${name}`, () => assert.throws(() => parseSheet(transform(svg))))
}

test('validates safe filenames and numeric crop dimensions', () => {
  assert.doesNotThrow(() => validateManifest({ version: 1, assets: [crop] }))
  for (const invalid of [
    { ...crop, id: '../escape' },
    { ...crop, sheet: '../atlas.svg' },
    { ...crop, sheet: 'sub/atlas.svg' },
    { ...crop, rect: [0, 0, NaN, 5] },
    { ...crop, rect: [0, 0, -1, 5] },
  ]) assert.throws(() => validateManifest({ version: 1, assets: [invalid] }))
  assert.throws(() => validateManifest({ version: 1, assets: [crop, crop] }), /duplicate asset ID/)
})

test('imports deterministically and --check detects stale files without writing', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-svg-atlas-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const source = path.join(directory, 'source')
  const output = path.join(directory, 'output')
  const manifest = path.join(directory, 'crops.json')
  await fs.mkdir(source)
  await fs.writeFile(path.join(source, 'atlas.svg'), svg)
  await fs.writeFile(manifest, JSON.stringify({ version: 1, assets: [crop] }))
  const metadata = await importAtlas({ source, manifest, output })
  assert.equal(metadata.assets[0].rectangleCount, 3)
  assert.equal(metadata.assets[0].sourceSha256, metadata.sheets[0].sha256)
  assert.match(metadata.assets[0].sha256, /^[a-f0-9]{64}$/)
  assert.equal(metadata.assets[0].bytes, (await fs.stat(path.join(output, 'button-active.svg'))).size)
  const first = await fs.readFile(path.join(output, 'manifest.generated.json'))
  await importAtlas({ source, manifest, output })
  assert.deepEqual(await fs.readFile(path.join(output, 'manifest.generated.json')), first)
  await importAtlas({ source, manifest, output, check: true })
  await fs.writeFile(path.join(output, 'button-active.svg'), 'stale')
  await assert.rejects(importAtlas({ source, manifest, output, check: true }), /missing or stale/)
  assert.equal(await fs.readFile(path.join(output, 'button-active.svg'), 'utf8'), 'stale')
})

test('out-of-bounds crops fail before creating an output folder', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-svg-atlas-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  await fs.writeFile(path.join(directory, 'atlas.svg'), svg)
  const manifest = path.join(directory, 'crops.json')
  const output = path.join(directory, 'output')
  await fs.writeFile(manifest, JSON.stringify({ version: 1, assets: [{ ...crop, rect: [19, 19, 5, 5] }] }))
  await assert.rejects(importAtlas({ source: directory, manifest, output }), /exceeds the source viewBox/)
  await assert.rejects(fs.stat(output), { code: 'ENOENT' })
})

test('runtime import retains the SVG and verifies deterministic transparent WebP derivatives', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-svg-runtime-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  await fs.writeFile(path.join(directory, 'atlas.svg'), svg)
  const manifest = path.join(directory, 'crops.json')
  const output = path.join(directory, 'output')
  await fs.writeFile(manifest, JSON.stringify({ version: 1, assets: [crop] }))
  const metadata = await importAtlas({ source: directory, manifest, output, runtime: true })
  const asset = metadata.assets[0]
  assert.equal(asset.file, 'button-active.svg')
  assert.equal(asset.runtime.file, 'button-active.webp')
  assert.ok(asset.runtime.width > 0 && asset.runtime.height > 0)
  assert.equal(asset.runtime.bytes, (await fs.stat(path.join(output, asset.runtime.file))).size)
  assert.match(asset.runtime.sha256, /^[a-f0-9]{64}$/)
  assert.match(await fs.readFile(path.join(output, asset.file), 'utf8'), /preserveAspectRatio="xMidYMid meet"/)
  const { default: sharp } = await import('sharp')
  assert.equal((await sharp(await fs.readFile(path.join(output, asset.runtime.file))).metadata()).hasAlpha, true)
  await importAtlas({ source: directory, manifest, output, runtime: true, check: true })
  await fs.writeFile(path.join(output, asset.runtime.file), 'stale derivative')
  await assert.rejects(importAtlas({ source: directory, manifest, output, runtime: true, check: true }), /missing or stale/)
})

test('imports split source folders and rejects ambiguous duplicate sheet names', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-svg-split-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const main = path.join(directory, 'main'), symbols = path.join(directory, 'symbols')
  await Promise.all([fs.mkdir(main), fs.mkdir(symbols)])
  await fs.writeFile(path.join(main, 'atlas.svg'), svg)
  await fs.writeFile(path.join(symbols, 'symbols.svg'), svg)
  const manifest = path.join(directory, 'crops.json'), output = path.join(directory, 'output')
  await fs.writeFile(manifest, JSON.stringify({ version: 1, assets: [crop, { ...crop, id: 'symbol', sheet: 'symbols.svg' }] }))
  const metadata = await importAtlas({ source: [main, symbols], manifest, output })
  assert.equal(metadata.sheets.length, 2)
  assert.equal(metadata.assets.length, 2)
  await importAtlas({ source: [main, symbols], manifest, output, check: true })
  await assert.rejects(importAtlas({ source: main, manifest, output }), /Sheet not found/)
  await fs.writeFile(path.join(symbols, 'atlas.svg'), svg)
  await assert.rejects(importAtlas({ source: [main, symbols], manifest, output }), /Ambiguous sheet/)
})
