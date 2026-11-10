import { describe, expect, it } from 'vitest'
import { packNativeRuntimeManifest, groupNativeRuntimeManifest, compactNativeRuntimeViews } from '../native-runtime-manifest.mjs'

const source = '/sprites/arkamon/79/front/victory.webp'
const directory = '/sprites/arkamon-paged/79/front/victory/'
function fixture(file) {
  return { schemaVersion: 1, clips: { [source]: { frameWidth: 512, frameHeight: 512, frameCount: 16, fps: 24,
    pages: [{ src: directory + file, firstFrame: 0, frameCount: 16, columns: 4, rows: 4, width: 2048, height: 2048, decodedBytes: 16777216 }] } } }
}

describe('native runtime manifest page filenames', () => {
  it('shares all five grids without changing hash order and preserves partial or differing views', () => {
    const hash = '!ASNFZ4mrze8'
    const clip = [512, 512, 16, 24, [16, 4, hash]]
    const complete = Array.from({ length: 5 }, () => structuredClone(clip))
    const partial = [clip, null, clip]
    const differing = structuredClone(complete)
    differing[4][2] = 15
    const legacy = complete.map(value => [...value.slice(0, 4), [16, 4, '']])
    const sparse = []; sparse[4] = clip
    const sets = {79: [complete, partial], 80: [differing, legacy], 81: [null, complete], 82: [sparse]}
    const compact = compactNativeRuntimeViews(sets)
    expect(compact[79][0]).toEqual([[512, 512, 16, 24, 16, 4], '!' + Buffer.concat(Array.from({ length: 5 }, () => Buffer.from(hash.slice(1), 'base64url'))).toString('base64url')])
    expect(compact[79][1]).toBe(partial)
    expect(compact[80]).toEqual([differing, legacy])
    expect(compact[81]).toEqual([null, compact[79][0]])
    expect(compact[82][0]).toBe(sparse)
    expect(sets[79][0]).toEqual(complete)
  })
  it('groups independent front/back action slots without losing sparse views or identifiers', () => {
    const clip = [512, 512, 16, 24, [16, 4, '']]
    const grouped = JSON.parse(JSON.stringify(groupNativeRuntimeManifest({
      '/sprites/arkamon/79/front/victory.webp': clip,
      '/sprites/arkamon/79/back/hit.webp': clip,
      '/sprites/arkamon/205/back/ko.webp': clip,
    })))
    expect(grouped).toEqual({79: [[null, null, null, clip], [null, null, clip]], 205: [null, [null, null, null, null, clip]]})
    expect(() => groupNativeRuntimeManifest({'/another/path.webp': clip})).toThrow('Invalid native clip identity')
  })
  it.each([['page-00.webp', ''], ['page-00.png', '.png'], ['page-00-0123456789abcdef.webp', '0123456789abcdef'], ['page-00-fedcba9876543210.png', 'fedcba9876543210.png']])(
    'retains legacy and content fingerprint tokens without changing frame timing: %s', (file, token) => {
      const encoded = /^[a-f0-9]{16}$/.test(token) ? '!' + Buffer.from(token, 'hex').toString('base64url') : token
      expect(packNativeRuntimeManifest(fixture(file))[source]).toEqual([512, 512, 16, 24, [16, 4, encoded]])
    },
  )
  it.each(['../attack/page-00.webp', 'page-00-0123.webp', 'page-00-ABCDEF0123456789.webp', 'page-00.svg', '/page-00.webp'])(
    'rejects filenames outside the emitted native page contract: %s', file => {
      expect(() => packNativeRuntimeManifest(fixture(file))).toThrow('Native page belongs to another clip')
    },
  )
  it('rejects a page from a different animation directory even with a valid fingerprint', () => {
    const value = fixture('page-00-0123456789abcdef.webp')
    value.clips[source].pages[0].src = directory.replace('/victory/', '/attack/') + 'page-00-0123456789abcdef.webp'
    expect(() => packNativeRuntimeManifest(value)).toThrow('Native page belongs to another clip')
  })
  it('rejects filename indexes that cannot be reconstructed from their position', () => {
    expect(() => packNativeRuntimeManifest(fixture('page-01.webp'))).toThrow('index differs')
    expect(() => packNativeRuntimeManifest(fixture('page-000.webp'))).toThrow('index differs')
  })
  it('refuses to discard geometry that differs from the exact derived page dimensions', () => {
    for (const field of ['firstFrame', 'rows', 'width', 'height', 'decodedBytes', 'frameCount', 'columns']) {
      const value = fixture('page-00.webp')
      value.clips[source].pages[0][field] += 1
      expect(() => packNativeRuntimeManifest(value)).toThrow(/geometry|complete clip/)
    }
    const value = fixture('page-00.webp')
    value.clips[source].frameCount = 95
    expect(() => packNativeRuntimeManifest(value)).toThrow('complete clip')
  })
  it('shares a uniform grid while preserving a short final page and mixed file formats', () => {
    const value = fixture('page-00.webp')
    value.clips[source].frameCount = 19
    value.clips[source].pages.push({ src: directory + 'page-01-0123456789abcdef.png', firstFrame: 16,
      frameCount: 3, columns: 4, rows: 1, width: 2048, height: 512, decodedBytes: 4194304 })
    expect(packNativeRuntimeManifest(value)[source]).toEqual([512, 512, 19, 24, [16, 4, ',0123456789abcdef.png']])
  })
  it('retains explicit geometry for historical grids whose capacity changes mid clip', () => {
    const value = fixture('page-00.webp')
    value.clips[source].frameCount = 22
    value.clips[source].pages.push({ src: directory + 'page-01.png', firstFrame: 16,
      frameCount: 4, columns: 2, rows: 2, width: 1024, height: 1024, decodedBytes: 4194304 },
      { src: directory + 'page-02.webp', firstFrame: 20, frameCount: 2, columns: 2,
        rows: 1, width: 1024, height: 512, decodedBytes: 2097152 })
    expect(packNativeRuntimeManifest(value)[source][4]).toEqual([['', 16, 4], ['.png', 4, 2], ['', 2, 2]])
  })
})
