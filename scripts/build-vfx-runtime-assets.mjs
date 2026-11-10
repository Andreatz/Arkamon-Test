#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { syncVfxCurationCatalog } from './build-vfx-curation-catalog.mjs'

const GENERATED_MANIFEST_PATH = 'public/vfx/generated/sprite-manifest.json'
const GIF_DIR = 'public/vfx/gif'
const MOVESET_CATALOG_PATH = 'public/vfx/moves/ai-generated/catalog.json'
const OUTPUT_PATH = 'src/components/vfx/generatedVfxAssets.ts'
const MAX_RUNTIME_DURATION_MS = 3400

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function runtimePath(publicPath) {
  return toPosix(publicPath).replace(/^public\//, '')
}

function sanitizeId(value) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '')
    .replace(/\//g, '__')
}

function humanize(value) {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function clampDisplaySize(width, height, maxWidth = 420, maxHeight = 320) {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight)

  return {
    width: Math.round(safeWidth * scale),
    height: Math.round(safeHeight * scale),
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function buildGeneratedSheetAssets() {
  if (!(await exists(GENERATED_MANIFEST_PATH))) return []

  const manifest = JSON.parse(await fs.readFile(GENERATED_MANIFEST_PATH, 'utf8'))
  const assets = []

  for (const entry of manifest) {
    if (!(await exists(entry.sheetPath))) continue

    const display = clampDisplaySize(entry.cellWidth, entry.cellHeight)
    const runtimeSheetPath = runtimePath(entry.sheetPath)

    assets.push({
      id: `generated:${sanitizeId(runtimeSheetPath.replace(/^vfx\/generated\//, ''))}`,
      label: `Generated / ${entry.label}`,
      kind: 'sprite-sheet',
      src: runtimeSheetPath,
      sprite: {
        frameWidth: entry.cellWidth,
        frameHeight: entry.cellHeight,
        columns: entry.columns,
        rows: entry.rows,
        frameCount: entry.frameCount,
        fps: entry.fps,
      },
      durationMs: Math.min(entry.durationMs, MAX_RUNTIME_DURATION_MS),
      impactAtMs: Math.min(Math.round(entry.durationMs * 0.5), MAX_RUNTIME_DURATION_MS),
      anchor: entry.cellWidth >= 900 || entry.cellHeight >= 600 ? 'center' : 'target',
      layer: entry.cellWidth >= 900 || entry.cellHeight >= 600 ? 'front-ui' : 'over-pokemon',
      width: display.width,
      height: display.height,
      scale: 1,
      mirrorForEnemy: true,
      blendMode: 'screen',
    })
  }

  return assets
}

async function buildLooseGifAssets() {
  if (!(await exists(GIF_DIR))) return []

  const files = (await fs.readdir(GIF_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => /\.(gif|png|jpe?g|webp)$/i.test(fileName))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

  const assets = []

  for (const fileName of files) {
    const filePath = path.join(GIF_DIR, fileName)
    const metadata = await sharp(filePath).metadata()
    const width = metadata.width || 256
    const height = metadata.height || 256
    const ext = path.extname(fileName).toLowerCase()
    const display = clampDisplaySize(width, height)
    const isGif = ext === '.gif'
    const delayTotal = Array.isArray(metadata.delay)
      ? metadata.delay.reduce((total, delay) => total + delay, 0)
      : 0
    const durationMs = isGif
      ? Math.min(delayTotal || (metadata.pages || 12) * 80, MAX_RUNTIME_DURATION_MS)
      : 900

    assets.push({
      id: `gif:${sanitizeId(fileName)}`,
      label: `${isGif ? 'GIF' : 'Image'} / ${humanize(fileName)}`,
      kind: isGif ? 'gif' : 'static-image',
      src: runtimePath(filePath),
      durationMs,
      impactAtMs: Math.min(Math.round(durationMs * 0.5), MAX_RUNTIME_DURATION_MS),
      anchor: width >= 900 || height >= 600 ? 'center' : 'target',
      layer: width >= 900 || height >= 600 ? 'front-ui' : 'over-pokemon',
      width: display.width,
      height: display.height,
      scale: 1,
      mirrorForEnemy: true,
      blendMode: metadata.hasAlpha ? 'normal' : 'screen',
    })
  }

  return assets
}

async function buildMovesetAssets() {
  if (!(await exists(MOVESET_CATALOG_PATH))) return []

  const catalog = JSON.parse(await fs.readFile(MOVESET_CATALOG_PATH, 'utf8'))
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.assets) || catalog.assets.length !== 276) {
    throw new Error('The moveset VFX catalog must contain all 276 assets with schemaVersion 1.')
  }
  const seenIds = new Set()
  const seenSources = new Set()
  const assets = []

  for (const entry of [...catalog.assets].sort((a, b) => a.sourceMoveId - b.sourceMoveId)) {
    const expectedId = `moveset:${String(assets.length + 1).padStart(3, '0')}`
    if (entry.sourceMoveId !== assets.length + 1 || entry.id !== expectedId || seenIds.has(entry.id)) {
      throw new Error(`Invalid or duplicate moveset VFX ID: ${entry.id}`)
    }
    if (typeof entry.src !== 'string'
      || !/^vfx\/moves\/ai-generated\/[^/\\]+\.png$/.test(entry.src)
      || seenSources.has(entry.src)) {
      throw new Error(`Invalid or duplicate moveset VFX PNG path: ${entry.id}`)
    }
    const filePath = path.join('public', entry.src)
    const input = await fs.readFile(filePath)
    const metadata = await sharp(input).metadata()
    if (metadata.format !== 'png' || metadata.width !== 2048 || metadata.height !== 2048
      || !metadata.hasAlpha || metadata.channels !== 4) {
      throw new Error(`Moveset VFX must be a 2048x2048 RGBA PNG: ${entry.id}`)
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')
      || createHash('sha256').update(input).digest('hex') !== entry.sha256) {
      throw new Error(`Moveset VFX fingerprint does not match its catalog: ${entry.id}`)
    }
    const sprite = entry.sprite
    if (!sprite || sprite.frameWidth !== 512 || sprite.frameHeight !== 512
      || sprite.columns !== 4 || sprite.rows !== 4 || sprite.frameCount !== 16
      || !Number.isFinite(sprite.fps) || sprite.fps <= 0) {
      throw new Error(`Invalid moveset VFX sprite grid: ${entry.id}`)
    }
    if (!['attacker', 'target', 'self', 'center', 'screen'].includes(entry.anchor)
      || !['static', 'projectile'].includes(entry.motion)
      || !['behind-pokemon', 'over-pokemon', 'front-ui'].includes(entry.layer ?? 'over-pokemon')
      || entry.scale !== 1 || entry.blendMode !== 'normal') {
      throw new Error(`Invalid moveset VFX presentation: ${entry.id}`)
    }
    const durationMs = Math.round(16 * 1000 / sprite.fps)
    const impactAtMs = Math.round(9 * 1000 / sprite.fps)
    if (durationMs < 1 || durationMs > MAX_RUNTIME_DURATION_MS || impactAtMs >= durationMs) {
      throw new Error(`Moveset VFX timing exceeds its playback limits: ${entry.id}`)
    }
    seenIds.add(entry.id)
    seenSources.add(entry.src)
    assets.push({
      id: entry.id,
      label: entry.label,
      kind: 'sprite-sheet',
      src: entry.src,
      sprite: { ...sprite },
      durationMs,
      impactAtMs,
      anchor: entry.anchor,
      layer: entry.layer ?? 'over-pokemon',
      width: 420,
      height: 420,
      scale: 1,
      mirrorForEnemy: entry.mirrorForEnemy ?? true,
      blendMode: 'normal',
      motion: entry.motion,
    })
  }
  return assets
}

function toTypeScript(assets) {
  return `import type { MoveVfxAsset } from './types'

// Generated by scripts/build-vfx-runtime-assets.mjs.
// Do not edit by hand; add files under public/vfx and regenerate.
export const GENERATED_MOVE_VFX_ASSETS: Record<string, MoveVfxAsset> = ${JSON.stringify(Object.fromEntries(assets.map((asset) => [asset.id, asset])), null, 2)}
`
}

async function main() {
  const assets = [
    ...(await buildGeneratedSheetAssets()),
    ...(await buildLooseGifAssets()),
    ...(await buildMovesetAssets()),
  ]

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, toTypeScript(assets), 'utf8')
  await syncVfxCurationCatalog(process.cwd())

  console.log(`Wrote ${OUTPUT_PATH}`)
  console.log(`Catalogued ${assets.length} VFX asset(s).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
