import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import authoritative from '@/data/arkamon-paged.json'
import packed from 'virtual:arkamon-runtime-pages'
import { getNativeRuntimeClip } from '../nativeRuntimePages'
import { getArkamonRuntimeAsset, ARKAMON_ANIMATION_MANIFEST } from '../arkamonAnimationManifest'

describe('compact native runtime metadata', () => {
  it('preserves every page path and source-frame geometry for all clips without shipping provenance hashes', () => {
    expect(Object.keys(packed).map(Number)).toEqual([...new Set(Object.values(authoritative.clips).map(clip => clip.speciesId))].sort((a, b) => a - b))
    const count = Object.values(packed).reduce((sum, set) => sum + (set?.reduce((views, view) => views + (!view ? 0 : typeof view[1] === 'string' ? 5 : view.filter(Boolean).length), 0) ?? 0), 0)
    expect(count).toBe(Object.keys(authoritative.clips).length)
    for (const [source, original] of Object.entries(authoritative.clips)) {
      const runtime = getNativeRuntimeClip(source)!
      expect(runtime).toEqual({ frameWidth: original.frameWidth, frameHeight: original.frameHeight, frameCount: original.frameCount, fps: original.fps,
        pages: original.pages.map(({ src, firstFrame, frameCount, columns, rows, width, height, decodedBytes }) => ({ src, firstFrame, frameCount, columns, rows, width, height, decodedBytes })),
      })
      expect(getNativeRuntimeClip(source)).toBe(runtime)
    }
    const serialized = JSON.stringify(packed)
    expect(serialized).not.toMatch(/sha256|sourceRgba|decodedRgba|encodedBytes|viewport/i)
    // Content-addressed filenames are required runtime URLs, not optional
    // provenance fields. Keep the original ceiling for the 735-clip catalog
    // and allow nine bytes per additional digest: eight for the hash and one
    // for encoding overhead. The startup bundle retains its own fixed limits.
    const filenames = Object.values(authoritative.clips).flatMap(clip => clip.pages.map(page => page.src.slice(page.src.lastIndexOf('/') + 1)))
    const filenameBytes = gzipSync(JSON.stringify(filenames)).byteLength
    const runtimeBytes = gzipSync(serialized).byteLength
    const fingerprintedPages = filenames.filter(filename => /-[a-f0-9]{16}\.(webp|png)$/.test(filename)).length
    const baselineFingerprintedPages = 3_855
    const runtimeBudget = 32 * 1024 + Math.max(0, fingerprintedPages - baselineFingerprintedPages) * 9
    expect(runtimeBytes).toBeLessThan(gzipSync(JSON.stringify(authoritative)).byteLength * .02 + filenameBytes)
    expect(runtimeBytes).toBeLessThan(runtimeBudget)
  })

  it('synchronously supplies pages on the first lookup, including all original cues and irregular frame counts', () => {
    for (const set of Object.values(ARKAMON_ANIMATION_MANIFEST)) for (const source of Object.values(set!.front!)) {
      const runtime = getArkamonRuntimeAsset(source!)
      expect(runtime.pages?.length).toBeGreaterThan(0)
      const { pages: _, ...contract } = runtime
      expect(contract).toEqual(source)
    }
    expect(getNativeRuntimeClip('/sprites/arkamon/207/front/idle.webp')).toBeUndefined()
  })
})
