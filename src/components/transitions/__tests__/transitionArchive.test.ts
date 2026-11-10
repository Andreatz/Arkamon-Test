import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface ArchivedFile {
  path: string
  originalPath: string
  storedPath: string
  size: number
  sha256: string
}

interface ArchiveManifest {
  status: string
  originalcommit: string
  sourcebranch: string
  files: ArchivedFile[]
}

const repository = resolve(process.cwd())
const archive = join(repository, 'archive/scene-transitions/energy-portal-v1')
const manifest: ArchiveManifest = JSON.parse(readFileSync(join(archive, 'manifest.json'), 'utf8'))

function listStoredFiles(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory()
      ? listStoredFiles(join(directory, entry.name), relative)
      : [relative]
  })
}

describe('hibernated energy portal archive', () => {
  it('retains the complete earlier version with its source commit and restoration mapping', () => {
    expect(manifest.status).toBe('hibernated')
    expect(manifest.sourcebranch).toBe('feature/vfx-recipe-engine')
    expect(manifest.originalcommit).toBe('330fa451e1eba67f9758f9cadc509049408025f0')
    expect(manifest.files).toHaveLength(9)
    expect(new Set(manifest.files.map((entry) => entry.originalPath)).size).toBe(9)
    expect(new Set(manifest.files.map((entry) => entry.storedPath)).size).toBe(9)
    expect(manifest.files.reduce((total, entry) => total + entry.size, 0)).toBe(33836)

    for (const entry of manifest.files) {
      expect(entry.path).toBe(entry.originalPath)
      expect(entry.originalPath).toMatch(/^(src\/components\/transitions\/|docs\/scene-transitions\.md$)/)
      expect(entry.originalPath.split('/')).not.toContain('..')
      expect(entry.storedPath).toBe(entry.originalPath.endsWith('.test.ts')
        ? `${entry.originalPath}.snapshot`
        : entry.originalPath)
    }
  })

  it('preserves all nine original file contents byte for byte', () => {
    for (const entry of manifest.files) {
      const contents = readFileSync(join(archive, entry.storedPath))
      expect(contents.byteLength, entry.originalPath).toBe(entry.size)
      expect(createHash('sha256').update(contents).digest('hex'), entry.originalPath).toBe(entry.sha256)
    }
  })

  it('keeps both historical tests dormant without changing their original bytes', () => {
    const files = listStoredFiles(archive)
    expect(files.filter((path) => path.endsWith('.test.ts.snapshot')).sort()).toEqual([
      'src/components/transitions/__tests__/sceneTransitionProfiles.test.ts.snapshot',
      'src/components/transitions/__tests__/sceneTransitionState.test.ts.snapshot',
    ])
    expect(files.filter((path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path))).toEqual([])
  })

  it('does not reactivate the old art through an active overlay, style or video fallback', () => {
    const activeFiles = [
      'src/components/transitions/SceneTransition.tsx',
      'src/components/transitions/SceneTransitionOverlay.tsx',
      'src/components/transitions/sceneTransitionProfiles.ts',
      'src/components/transitions/sceneTransitions.css',
    ]

    for (const path of activeFiles) {
      const contents = readFileSync(join(repository, path), 'utf8')
      expect(contents, path).not.toMatch(/energy-portal-v1|(?:['"][^'"\n]*archive[\/\\][^'"\n]*['"])/)
      expect(contents, path).not.toMatch(/arka-energy-|arka-scene-transition__(?:portal|nebula|streaks|lightning|ring|energy)/)
    }

    const profiles = readFileSync(join(repository, 'src/components/transitions/sceneTransitionProfiles.ts'), 'utf8')
    expect(profiles).not.toMatch(/['"]portal['"]/)
  })
})
