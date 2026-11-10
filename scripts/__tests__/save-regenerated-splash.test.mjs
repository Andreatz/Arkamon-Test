import { afterEach, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const directories = []
const script = fileURLToPath(new URL('../save-regenerated-splash.mjs', import.meta.url))
afterEach(async () => { for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-regeneration-'))
  directories.push(root)
  const old = { id: 22, name: 'Voltrake', type: 'Elettro', version: 'v3-centered', outputFile: 'public/backgrounds/arkamon-splash/022-voltrake.webp', runtimePath: '/backgrounds/arkamon-splash/022-voltrake.webp', displayScale: 2.5 }
  const status = path.join(root, 'art-source/splash/status/022.json'), asset = path.join(root, old.outputFile)
  await fs.mkdir(path.dirname(status), { recursive: true })
  await fs.mkdir(path.dirname(asset), { recursive: true })
  await fs.mkdir(path.join(root, 'art-source/splash/prompts'), { recursive: true })
  const original = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#203c6a' } }).webp().toBuffer()
  await fs.writeFile(asset, original)
  await fs.writeFile(status, JSON.stringify(old))
  const input = path.join(root, 'generated.png'), prompt = path.join(root, 'prompt.txt')
  await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#827249' } }).png().toFile(input)
  await fs.writeFile(prompt, 'Large central Voltrake, based on the official form and Oniros.\n')
  const run = (focus = { left: .3, top: .16, right: .68, bottom: .82 }, extra = []) => execFileSync(process.execPath, [script, '--id', '22', '--input', input, '--prompt', prompt, '--focus', JSON.stringify(focus), '--subject', JSON.stringify({ left: 0, top: 0, right: 1, bottom: 1 }), ...extra], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return { root, status, asset, original, input, old, run }
}

it('replaces the actual painting, preserves its provenance and removes the old CSS enlargement', async () => {
  const fixtureValue = await fixture(), { root, status, asset, original, old, run } = fixtureValue
  run()
  const record = JSON.parse(await fs.readFile(status, 'utf8'))
  expect(record.version).toBe('hero-source-v2')
  expect(record.sourceComposition).toBe('large-central-foreground')
  expect(record.displayScale).toBeLessThanOrEqual(1)
  expect(record.focusBounds).toEqual({ left: .3, top: .16, right: .68, bottom: .82 })
  const imageMetadata = await sharp(await fs.readFile(asset)).metadata()
  expect(imageMetadata.width).toBe(1920)
  expect(imageMetadata.height).toBe(1080)
  expect(await fs.readFile(path.join(root, 'output/splash-regeneration-2026-10-26/previous/022-voltrake.webp'))).toEqual(original)
  expect(JSON.parse(await fs.readFile(path.join(root, record.regeneration.previousStatusFile), 'utf8'))).toEqual(old)
  expect(await fs.readFile(path.join(root, record.promptFile), 'utf8')).toContain('Large central Voltrake')
})

it('rejects invalid focus geometry before altering the painting or its review record', async () => {
  const { asset, status, original, old, run } = await fixture()
  expect(() => run({ left: .4, top: .2, right: .3, bottom: .8 })).toThrow()
  expect(await fs.readFile(asset)).toEqual(original)
  expect(JSON.parse(await fs.readFile(status, 'utf8'))).toEqual(old)
})

it('rejects a non-landscape generated source before replacing the approved painting', async () => {
  const { input, asset, status, original, old, run } = await fixture()
  await sharp({ create: { width: 512, height: 512, channels: 3, background: '#827249' } }).png().toFile(input)
  expect(() => run()).toThrow()
  expect(await fs.readFile(asset)).toEqual(original)
  expect(JSON.parse(await fs.readFile(status, 'utf8'))).toEqual(old)
})

it('keeps the first previous painting and review record when regenerating the same form again', async () => {
  const { root, original, old, run } = await fixture()
  run()
  run({ left: .31, top: .18, right: .66, bottom: .8 })
  expect(await fs.readFile(path.join(root, 'output/splash-regeneration-2026-10-26/previous/022-voltrake.webp'))).toEqual(original)
  expect(JSON.parse(await fs.readFile(path.join(root, 'art-source/splash/history/022-before-hero-source-v2.json'), 'utf8'))).toEqual(old)
})

it('imports a full-canvas replacement without silently shrinking or translating its reviewed face', async () => {
  const { root, status, original, old, run } = await fixture()
  const focus = { left: .29, top: .25, right: .64, bottom: .79 }
  run(focus, ['--fullscreen'])
  const record = JSON.parse(await fs.readFile(status, 'utf8'))
  expect(record.version).toBe('fullscreen-source-v3')
  expect(record.compositionPolicy).toBe('full-canvas-focus')
  expect(record.focusBounds).toEqual(focus)
  expect(record).not.toHaveProperty('displayScale')
  expect(record).not.toHaveProperty('displayOffset')
  expect(await fs.readFile(path.join(root, 'output/splash-fullscreen-2026-10-26/previous/022-voltrake.webp'))).toEqual(original)
  expect(JSON.parse(await fs.readFile(path.join(root, record.regeneration.previousStatusFile), 'utf8'))).toEqual(old)
})

it('publishes a previously unavailable form from its catalog identity and preserves the blocked review', async () => {
  const { root, status, asset, old, run } = await fixture()
  const blocked = { id: 22, name: 'Voltrake', status: 'generation-blocked', failure: { code: 'moderation_blocked' } }
  await fs.writeFile(status, JSON.stringify(blocked))
  await fs.unlink(asset)
  await fs.writeFile(path.join(root, 'art-source/splash/production-plan.json'), JSON.stringify({ entries: [old] }))
  run({ left: .37, top: .3, right: .59, bottom: .75 }, ['--fullscreen'])
  const record = JSON.parse(await fs.readFile(status, 'utf8'))
  expect(record).toMatchObject({ id: 22, name: 'Voltrake', type: 'Elettro', status: 'approved-visual', runtimePath: old.runtimePath })
  expect((await sharp(await fs.readFile(asset)).metadata()).width).toBe(1920)
  expect(JSON.parse(await fs.readFile(path.join(root, record.regeneration.previousStatusFile), 'utf8'))).toEqual(blocked)
})
