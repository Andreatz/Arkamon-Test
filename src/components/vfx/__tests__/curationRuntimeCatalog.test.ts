import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import runtime from '@/data/vfx-curation-runtime.json'
import { getVfxCuration } from '../vfxCuration'

describe('slim runtime editorial catalog', () => {
  it('preserves every editorial field from the source catalog and deduplicates shared notes', () => {
    const source = JSON.parse(readFileSync('public/vfx/moves/ai-generated/catalog.json', 'utf8')) as {
      assets: { id: string; categories: string[]; intensity: string; anchor: string; notes: string }[]
    }
    expect(runtime.assets).toHaveLength(source.assets.length)
    expect(runtime.notes).toEqual([...new Set(source.assets.map(entry => entry.notes))])
    for (const entry of source.assets) expect(getVfxCuration(entry.id)).toMatchObject({
      categories: entry.categories, intensity: entry.intensity, preview: { anchor: entry.anchor, scaleMultiplier: 1 }, notes: entry.notes,
    })
    expect(readFileSync('src/data/vfx-curation-runtime.json').byteLength).toBeLessThan(30_000)
    expect(runtime.assets.every(entry => !('sha256' in entry) && !('sprite' in entry))).toBe(true)
  })
})
