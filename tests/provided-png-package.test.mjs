import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { alphaBounds, convertPng, createRuntimeCatalog, importPngPackage, validateManifest, writeRuntimeCatalog } from '../scripts/import-provided-png-package.mjs'

const asset = { id: 'button-normal', source: 'UI/button.png', role: 'Native button artwork', maxWidth: 12, maxHeight: 4, trim: true, rotate: 0 }
const packageInfo = { file: 'Arkamon.zip', sha256: 'a'.repeat(64) }
const manifestValue = assets => ({ version: 1, package: packageInfo, assets })

async function fixture(t, assets = [asset]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-png-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const source = path.join(directory, 'source'), output = path.join(directory, 'output'), manifest = path.join(directory, 'manifest.json')
  await fs.mkdir(path.join(source, 'UI'), { recursive: true })
  const pixels = Buffer.alloc(20 * 10 * 4)
  for (let y = 3; y < 7; y++) for (let x = 4; x < 16; x++) pixels.set([70, 160, 220, x < 8 ? 128 : 255], (y * 20 + x) * 4)
  const png = await sharp(pixels, { raw: { width: 20, height: 10, channels: 4 } }).png().toBuffer()
  await fs.writeFile(path.join(source, 'UI', 'button.png'), png)
  await fs.writeFile(manifest, JSON.stringify(manifestValue(assets)))
  return { directory, source, output, manifest, png }
}

test('alpha trimming retains one-bit alpha glows and ignores transparent RGB', () => {
  const pixels = Buffer.alloc(5 * 4 * 4)
  pixels.set([255, 0, 255, 0], 0)
  pixels.set([20, 100, 200, 255], (1 * 5 + 2) * 4)
  pixels.set([20, 100, 200, 1], (3 * 5 + 4) * 4)
  assert.deepEqual(alphaBounds(pixels, 5, 4), { left: 2, top: 1, width: 3, height: 3 })
  assert.deepEqual(alphaBounds(pixels, 5, 4, false), { left: 0, top: 0, width: 5, height: 4 })
  assert.throws(() => alphaBounds(Buffer.alloc(16), 2, 2), /no visible pixels/)
})

test('preserves alpha bounds and original PNG while producing a fitted WebP', async t => {
  const files = await fixture(t, [{ ...asset, maxWidth: 6, maxHeight: 3 }])
  const result = await importPngPackage(files)
  const imported = result.assets[0]
  assert.equal(imported.originalWidth, 20)
  assert.equal(imported.originalHeight, 10)
  assert.deepEqual(imported.trimBounds, { left: 4, top: 3, width: 12, height: 4 })
  assert.equal(imported.width, 6)
  assert.equal(imported.height, 2)
  assert.equal(imported.file, 'button-normal.webp')
  assert.match(imported.sourceSha256, /^[a-f0-9]{64}$/)
  const metadata = await sharp(await fs.readFile(path.join(files.output, imported.file))).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.width, 6)
  assert.equal(metadata.height, 2)
  assert.equal(metadata.hasAlpha, true)
  assert.deepEqual(await fs.readFile(path.join(files.source, asset.source)), files.png)
})

test('does not enlarge source artwork and supports untrimmed artwork', async t => {
  const files = await fixture(t)
  const result = await convertPng(files.png, { ...asset, maxWidth: 1000, maxHeight: 1000 })
  assert.deepEqual([result.metadata.width, result.metadata.height], [12, 4])
  const untrimmed = await convertPng(files.png, { ...asset, trim: false, maxWidth: 1000, maxHeight: 1000 })
  assert.deepEqual([untrimmed.metadata.width, untrimmed.metadata.height], [20, 10])
})

test('rotation uses original coordinates for trimming before fitting', async t => {
  const files = await fixture(t)
  const result = await convertPng(files.png, { ...asset, rotate: 90, maxWidth: 100, maxHeight: 100 })
  assert.deepEqual(result.metadata.trimBounds, { left: 4, top: 3, width: 12, height: 4 })
  assert.deepEqual([result.metadata.width, result.metadata.height], [4, 12])
})

test('conversion and generated manifest are deterministic; check is read only', async t => {
  const files = await fixture(t)
  const first = await importPngPackage(files)
  const imageBefore = await fs.readFile(path.join(files.output, 'button-normal.webp'))
  const manifestBefore = await fs.readFile(path.join(files.output, 'manifest.generated.json'))
  const runtimeBefore = await fs.readFile(path.join(files.output, 'catalog.runtime.json'))
  assert.deepEqual(JSON.parse(runtimeBefore), {
    version: 1, assets: first.assets.map(({ id, file, width, height }) => ({ id, file, width, height })),
  })
  assert.deepEqual(await importPngPackage({ ...files, check: true }), first)
  assert.deepEqual(await importPngPackage(files), first)
  assert.deepEqual(await fs.readFile(path.join(files.output, 'button-normal.webp')), imageBefore)
  assert.deepEqual(await fs.readFile(path.join(files.output, 'manifest.generated.json')), manifestBefore)
  assert.deepEqual(await fs.readFile(path.join(files.output, 'catalog.runtime.json')), runtimeBefore)
  await fs.writeFile(path.join(files.output, 'button-normal.webp'), 'stale')
  await assert.rejects(importPngPackage({ ...files, check: true }), /Stale generated asset/)
  assert.equal(await fs.readFile(path.join(files.output, 'button-normal.webp'), 'utf8'), 'stale')
  await fs.unlink(path.join(files.output, 'button-normal.webp'))
  await assert.rejects(importPngPackage({ ...files, check: true }), /Missing generated asset/)
})

test('runtime catalog is a minimal deterministic projection without provenance', () => {
  const metadata = { version: 1, package: packageInfo, assets: [{ id: 'button-normal', file: 'button-normal.webp', width: 12, height: 4, role: 'button', source: 'private/original.png', sourceSha256: 'a'.repeat(64) }] }
  const expected = { version: 1, assets: [{ id: 'button-normal', file: 'button-normal.webp', width: 12, height: 4 }] }
  assert.deepEqual(createRuntimeCatalog(metadata), expected)
  assert.deepEqual(createRuntimeCatalog(metadata), createRuntimeCatalog(metadata))
  assert.doesNotMatch(JSON.stringify(createRuntimeCatalog(metadata)), /package|private|source|role|sha256/)
  for (const invalid of [undefined, { ...metadata, version: 2 }, { ...metadata, assets: [{ ...metadata.assets[0], file: '../escape.webp' }] }, { ...metadata, assets: [{ ...metadata.assets[0], width: 0 }] }, { ...metadata, assets: [...metadata.assets, ...metadata.assets] }]) assert.throws(() => createRuntimeCatalog(invalid), /Invalid generated PNG/)
})

test('runtime catalog can be rebuilt from metadata without reading PNGs or rewriting images', async t => {
  const files = await fixture(t)
  await importPngPackage(files)
  const imagePath = path.join(files.output, 'button-normal.webp')
  const manifestPath = path.join(files.output, 'manifest.generated.json')
  const catalogPath = path.join(files.output, 'catalog.runtime.json')
  const [imageBytes, manifestBytes, runtimeBytes] = await Promise.all([fs.readFile(imagePath), fs.readFile(manifestPath), fs.readFile(catalogPath)])
  const [imageStat, manifestStat] = await Promise.all([fs.stat(imagePath), fs.stat(manifestPath)])
  await fs.unlink(path.join(files.source, asset.source))
  await fs.unlink(catalogPath)
  await writeRuntimeCatalog({ output: files.output })
  assert.deepEqual(await fs.readFile(catalogPath), runtimeBytes)
  assert.deepEqual(await fs.readFile(imagePath), imageBytes)
  assert.deepEqual(await fs.readFile(manifestPath), manifestBytes)
  assert.equal((await fs.stat(imagePath)).mtimeMs, imageStat.mtimeMs)
  assert.equal((await fs.stat(manifestPath)).mtimeMs, manifestStat.mtimeMs)
  await writeRuntimeCatalog({ output: files.output, check: true })
})

test('check detects stale or missing runtime catalog without repairing it', async t => {
  const files = await fixture(t)
  await importPngPackage(files)
  const runtimePath = path.join(files.output, 'catalog.runtime.json')
  await fs.writeFile(runtimePath, 'stale runtime')
  await assert.rejects(importPngPackage({ ...files, check: true }), /Stale generated runtime catalog/)
  assert.equal(await fs.readFile(runtimePath, 'utf8'), 'stale runtime')
  await fs.unlink(runtimePath)
  await assert.rejects(importPngPackage({ ...files, check: true }), /Missing generated runtime catalog/)
  await assert.rejects(fs.stat(runtimePath), { code: 'ENOENT' })
})

test('optionally mirrors the runtime catalog to source imports and checks both copies', async t => {
  const files = await fixture(t)
  const runtimeOutput = path.join(files.directory, 'ui-source', 'provided-png-runtime.generated.json')
  await importPngPackage({ ...files, runtimeOutput })
  const publicBytes = await fs.readFile(path.join(files.output, 'catalog.runtime.json'))
  assert.deepEqual(await fs.readFile(runtimeOutput), publicBytes)
  await importPngPackage({ ...files, runtimeOutput, check: true })
  await fs.writeFile(runtimeOutput, 'outdated import catalog')
  await assert.rejects(importPngPackage({ ...files, runtimeOutput, check: true }), /Stale generated runtime catalog/)
  assert.equal(await fs.readFile(runtimeOutput, 'utf8'), 'outdated import catalog')
  await fs.unlink(path.join(files.source, asset.source))
  await writeRuntimeCatalog({ output: files.output, runtimeOutput })
  assert.deepEqual(await fs.readFile(runtimeOutput), publicBytes)
  await writeRuntimeCatalog({ output: files.output, runtimeOutput, check: true })
  await fs.unlink(runtimeOutput)
  await assert.rejects(writeRuntimeCatalog({ output: files.output, runtimeOutput, check: true }), /Missing generated runtime catalog/)
})

test('rejects the optional runtime destination inside the immutable PNG package', async t => {
  const files = await fixture(t)
  const runtimeOutput = path.join(files.source, 'generated', 'catalog.json')
  await assert.rejects(importPngPackage({ ...files, runtimeOutput }), /Runtime output must be outside/)
  await assert.rejects(fs.stat(path.dirname(runtimeOutput)), { code: 'ENOENT' })
})

test('check catches stale provenance even when output pixels match', async t => {
  const files = await fixture(t)
  await importPngPackage(files)
  await fs.writeFile(files.manifest, JSON.stringify({ ...manifestValue([asset]), package: { ...packageInfo, sha256: 'b'.repeat(64) } }))
  await assert.rejects(importPngPackage({ ...files, check: true }), /Stale generated manifest/)
})

test('accepts defaults and rejects unsafe paths, IDs and malformed options', () => {
  const defaults = validateManifest(manifestValue([{ id: 'portrait-001', source: 'Arkamon-Icone/001.png', role: 'Official portrait' }]))
  assert.equal(defaults.assets[0].trim, true)
  assert.equal(defaults.assets[0].rotate, 0)
  for (const source of ['/outside.png', '../outside.png', 'UI/../outside.png', 'C:/outside.png', 'UI\\button.png', 'UI//button.png', 'UI/./button.png', '//server/image.png', 'UI/image.svg', 'UI/image.png?x']) assert.throws(() => validateManifest(manifestValue([{ ...asset, source }])), /safe relative PNG/)
  for (const changes of [{ id: '../escape' }, { id: 'A' }, { maxWidth: 0 }, { maxHeight: 1.5 }, { maxWidth: Infinity }, { trim: 'yes' }, { rotate: 45 }, { role: '' }]) assert.throws(() => validateManifest(manifestValue([{ ...asset, ...changes }])))
  assert.throws(() => validateManifest(manifestValue([asset, asset])), /Duplicate asset ID/)
  assert.throws(() => validateManifest({ ...manifestValue([asset]), package: { file: 'a.zip', sha256: 'invalid' } }), /SHA-256/)
})

test('rejects source links escaping the extracted package', async t => {
  const files = await fixture(t)
  const outside = path.join(files.directory, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'button.png'), files.png)
  await fs.symlink(outside, path.join(files.source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await fs.writeFile(files.manifest, JSON.stringify(manifestValue([{ ...asset, source: 'linked/button.png' }])))
  await assert.rejects(importPngPackage(files), /symlink escapes/)
})

test('rejects destination nested in the original source package', async t => {
  const files = await fixture(t)
  await assert.rejects(importPngPackage({ ...files, output: path.join(files.source, 'generated') }), /immutable source package/)
  await assert.rejects(fs.stat(path.join(files.source, 'generated')), { code: 'ENOENT' })
})

test('rejects non PNG contents regardless of extension', async t => {
  const files = await fixture(t)
  const jpeg = await sharp(files.png).jpeg().toBuffer()
  await assert.rejects(convertPng(jpeg, asset), /single PNG image/)
})
