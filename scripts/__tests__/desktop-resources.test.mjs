import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { separateDesktopResources } from '../separate-desktop-resources.mjs'

test('desktop keeps generated JS embedded and moves only validated public files to installer resources', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-desktop-'))
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const output = path.join(temporary, 'frontend'), resources = path.join(temporary, 'resources')
  await fs.mkdir(path.join(output, 'assets'), { recursive: true })
  await fs.mkdir(path.join(output, 'ui'), { recursive: true })
  await fs.writeFile(path.join(output, 'index.html'), '<html>app</html>')
  await fs.writeFile(path.join(output, 'assets/index-test.js'), 'application')
  await fs.writeFile(path.join(output, 'assets/title.mp4'), 'movie')
  await fs.writeFile(path.join(output, 'ui/art.webp'), 'image')
  await fs.writeFile(path.join(output, 'media-release.json'), JSON.stringify({ nativeClips: 455, mediaRevision: 'a'.repeat(40), localAssets: [{ path: 'assets/title.mp4' }, { path: 'ui/art.webp' }] }))
  const result = await separateDesktopResources({ output, resources })
  assert.equal(await fs.readFile(path.join(output, 'assets/index-test.js'), 'utf8'), 'application')
  assert.equal(await fs.readFile(path.join(resources, 'assets/title.mp4'), 'utf8'), 'movie')
  assert.equal(await fs.readFile(path.join(resources, 'ui/art.webp'), 'utf8'), 'image')
  await assert.rejects(fs.access(path.join(output, 'ui/art.webp')))
  assert.equal(result.nativeClips, 455)
  assert.ok(result.embedded.bytes < result.maxEmbeddedBytes)
})

test('desktop packaging rejects traversal before moving any outside resource', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-desktop-deny-'))
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const output = path.join(temporary, 'frontend'), resources = path.join(temporary, 'resources')
  await fs.mkdir(output)
  await fs.writeFile(path.join(output, 'media-release.json'), JSON.stringify({ localAssets: [{ path: '../outside.png' }] }))
  await assert.rejects(separateDesktopResources({ output, resources }), /Unsafe/)
  await assert.rejects(separateDesktopResources({ output, resources: output }), /separate sibling/)
})

test('a removed resource cannot silently remain in the next installer', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-desktop-stale-'))
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const output = path.join(temporary, 'frontend'), resources = path.join(temporary, 'resources')
  await fs.mkdir(output); await fs.mkdir(path.join(resources, 'ui'), { recursive: true })
  await fs.writeFile(path.join(resources, 'ui/removed.webp'), 'old image')
  await fs.writeFile(path.join(output, 'media-release.json'), JSON.stringify({ localAssets: [] }))
  await assert.rejects(separateDesktopResources({ output, resources }), /Stale desktop resource: ui\/removed.webp/)
  assert.equal(await fs.readFile(path.join(resources, 'ui/removed.webp'), 'utf8'), 'old image')
})

test('direct static output verifies the package without a second media copy', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-desktop-direct-'))
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const output = path.join(temporary, 'frontend'), resources = path.join(temporary, 'resources')
  await fs.mkdir(output); await fs.mkdir(path.join(resources, 'ui'), { recursive: true })
  await fs.writeFile(path.join(output, 'index.html'), '<html>app</html>')
  await fs.writeFile(path.join(resources, 'ui/only.webp'), 'image')
  await fs.writeFile(path.join(output, 'media-release.json'), JSON.stringify({ nativeClips: 455, localAssets: [{ path: 'ui/only.webp', bytes: 5 }] }))
  const result = await separateDesktopResources({ output, resources, alreadySeparated: true })
  assert.equal(result.nativeClips, 455)
  await assert.rejects(fs.access(path.join(output, 'ui/only.webp')))
  await fs.writeFile(path.join(resources, 'ui/only.webp'), 'wrong size')
  await assert.rejects(separateDesktopResources({ output, resources, alreadySeparated: true }), /Invalid separated/)
})
