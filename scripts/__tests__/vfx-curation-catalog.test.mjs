import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { syncVfxCurationCatalog } from '../build-vfx-curation-catalog.mjs'

const fixtures = []
afterEach(async () => {
  for (const root of fixtures.splice(0)) {
    if (!root.startsWith(path.join(os.tmpdir(), 'arkamon-curation-test-'))) throw new Error('Invalid fixture cleanup path')
    await fs.rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkamon-curation-test-'))
  fixtures.push(root)
  await fs.mkdir(path.join(root, 'public/vfx/moves/ai-generated'), { recursive: true })
  await fs.mkdir(path.join(root, 'src/data'), { recursive: true })
  await fs.writeFile(path.join(root, 'public/vfx/moves/ai-generated/catalog.json'), JSON.stringify({ schemaVersion: 1, assets: [{
    id: 'sample', categories: ['electric'], notes: 'Verified source', intensity: 'light', anchor: 'target',
  }] }))
  await syncVfxCurationCatalog(root)
  return root
}

describe('VFX runtime catalog consistency across Git checkouts', () => {
  it('accepts Windows CRLF checkouts without rewriting or regenerating assets', async () => {
    const root = await fixture(), target = path.join(root, 'src/data/vfx-curation-runtime.json')
    const windows = (await fs.readFile(target, 'utf8')).replace(/\n/g, '\r\n')
    await fs.writeFile(target, windows)
    await expect(syncVfxCurationCatalog(root, true)).resolves.toMatchObject({ assets: 1 })
    expect(await fs.readFile(target, 'utf8')).toBe(windows)
  })
  it('still rejects a catalog with outdated editorial content', async () => {
    const root = await fixture(), target = path.join(root, 'src/data/vfx-curation-runtime.json')
    await fs.writeFile(target, (await fs.readFile(target, 'utf8')).replace('"light"', '"heavy"'))
    await expect(syncVfxCurationCatalog(root, true)).rejects.toThrow('catalog is stale')
  })
})
