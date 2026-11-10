#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const DEFAULT_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg']
const DEFAULT_SUFFIX = '_sheet'
const DEFAULT_FPS = 24
const DEFAULT_PADDING = 0
const DEFAULT_MAX_COLUMNS = 8
const DEFAULT_MIN_FRAMES = 2
const DEFAULT_MAX_CELL_WIDTH = 640
const DEFAULT_MAX_CELL_HEIGHT = 640

function printHelp() {
  console.log(`
Usage:
  node build-vfx-spritesheets.mjs --input <dir> [options]

Required:
  --input, -i          Root directory that contains one or more folders with frame images

Optional:
  --output, -o         Output directory for sprite sheets
                       default: <input>/../generated-sheets

  --fps                FPS to write into metadata
                       default: ${DEFAULT_FPS}

  --suffix             Suffix for output files
                       default: ${DEFAULT_SUFFIX}

  --extensions         Comma-separated image extensions to scan
                       default: ${DEFAULT_EXTENSIONS.join(',')}

  --padding            Padding inside each cell
                       default: ${DEFAULT_PADDING}

  --maxColumns         Maximum columns per sheet
                       default: ${DEFAULT_MAX_COLUMNS}

  --minFrames          Minimum number of frames required to treat a folder as a sequence
                       default: ${DEFAULT_MIN_FRAMES}

  --cellWidth          Force cell width
  --cellHeight         Force cell height

  --manifest           Output file name for the global manifest
                       default: sprite-manifest.json

  --overwrite          Overwrite existing files
  --verbose            Extra logs
  --help, -h           Show this help

Examples:
  node build-vfx-spritesheets.mjs --input ./public/vfx/raw
  node build-vfx-spritesheets.mjs --input ./public/vfx/raw --output ./public/vfx/generated --fps 18 --maxColumns 6
  node build-vfx-spritesheets.mjs --input ./public/vfx/raw --cellWidth 256 --cellHeight 256 --overwrite
`)
}

function parseArgs(argv) {
  const args = {
    fps: DEFAULT_FPS,
    suffix: DEFAULT_SUFFIX,
    extensions: [...DEFAULT_EXTENSIONS],
    padding: DEFAULT_PADDING,
    maxColumns: DEFAULT_MAX_COLUMNS,
    minFrames: DEFAULT_MIN_FRAMES,
    maxCellWidth: DEFAULT_MAX_CELL_WIDTH,
    maxCellHeight: DEFAULT_MAX_CELL_HEIGHT,
    manifest: 'sprite-manifest.json',
    overwrite: false,
    verbose: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }

    if (arg === '--overwrite') {
      args.overwrite = true
      continue
    }

    if (arg === '--verbose') {
      args.verbose = true
      continue
    }

    if (!arg.startsWith('--') && arg !== '-i' && arg !== '-o') {
      continue
    }

    const [rawKey, inlineValue] = arg.startsWith('--')
      ? arg.split('=')
      : [arg, null]

    const keyMap = {
      '--input': 'input',
      '-i': 'input',
      '--output': 'output',
      '-o': 'output',
      '--fps': 'fps',
      '--suffix': 'suffix',
      '--extensions': 'extensions',
      '--padding': 'padding',
      '--maxColumns': 'maxColumns',
      '--minFrames': 'minFrames',
      '--cellWidth': 'cellWidth',
      '--cellHeight': 'cellHeight',
      '--manifest': 'manifest',
      '--maxCellWidth': 'maxCellWidth',
      '--maxCellHeight': 'maxCellHeight',
    }

    const key = keyMap[rawKey]
    if (!key) continue

    const nextValue = inlineValue ?? argv[i + 1]
    if (nextValue == null) {
      throw new Error(`Missing value for ${rawKey}`)
    }

    if (inlineValue == null) i++

    if (key === 'fps' || key === 'padding' || key === 'maxColumns' || key === 'minFrames' || key === 'cellWidth' || key === 'cellHeight' || key === 'maxCellWidth' || key === 'maxCellHeight') {
      args[key] = Number(nextValue)
    } else if (key === 'extensions') {
      args.extensions = nextValue
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .map((value) => (value.startsWith('.') ? value : `.${value}`))
    } else {
      args[key] = nextValue
    }
  }

  return args
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function sanitizeId(value) {
  return toPosix(value)
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

function ensurePositiveNumber(value, name) {
  if (value == null) return
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`)
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

function isImageFile(fileName, extensions) {
  return extensions.includes(path.extname(fileName).toLowerCase())
}

async function collectSequenceDirectories(rootDir, extensions) {
  const results = []

  async function visit(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })

    const imageFiles = entries
      .filter((entry) => entry.isFile() && isImageFile(entry.name, extensions))
      .map((entry) => entry.name)

    if (imageFiles.length > 0) {
      results.push({
        dir: currentDir,
        files: imageFiles.sort(naturalSort),
      })
    }

    const childDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(currentDir, entry.name))
      .sort(naturalSort)

    for (const childDir of childDirs) {
      await visit(childDir)
    }
  }

  await visit(rootDir)

  return results
}

async function makeSheetForSequence(sequence, config) {
  const { input, output, overwrite, verbose } = config
  const relativeDir = path.relative(input, sequence.dir)
  const baseName = relativeDir ? path.basename(relativeDir) : path.basename(input)
  const relativeParent = relativeDir ? path.dirname(relativeDir) : ''
  const outputSubDir = relativeParent === '.' ? output : path.join(output, relativeParent)

  await fs.mkdir(outputSubDir, { recursive: true })

  const outputImage = path.join(outputSubDir, `${baseName}${config.suffix}.png`)
  const outputMeta = path.join(outputSubDir, `${baseName}${config.suffix}.json`)

  if (!overwrite && ((await exists(outputImage)) || (await exists(outputMeta)))) {
    throw new Error(`Output already exists for "${sequence.dir}". Use --overwrite to replace it.`)
  }

  const framePaths = sequence.files.map((file) => path.join(sequence.dir, file))
  const metas = await Promise.all(framePaths.map((framePath) => sharp(framePath).metadata()))

  const intrinsicWidths = metas.map((meta) => meta.width || 0)
  const intrinsicHeights = metas.map((meta) => meta.height || 0)

  const maxIntrinsicWidth = Math.max(...intrinsicWidths)
  const maxIntrinsicHeight = Math.max(...intrinsicHeights)

  let cellWidth
  let cellHeight

  if (config.cellWidth || config.cellHeight) {
    cellWidth = config.cellWidth || maxIntrinsicWidth
    cellHeight = config.cellHeight || maxIntrinsicHeight
  } else {
    const maxCellWidth = config.maxCellWidth || maxIntrinsicWidth
    const maxCellHeight = config.maxCellHeight || maxIntrinsicHeight

    const scale = Math.min(
      1,
      maxCellWidth / maxIntrinsicWidth,
      maxCellHeight / maxIntrinsicHeight
    )

    cellWidth = Math.max(1, Math.round(maxIntrinsicWidth * scale))
    cellHeight = Math.max(1, Math.round(maxIntrinsicHeight * scale))
  }

  const frameCount = framePaths.length
  const columns = Math.max(1, Math.min(config.maxColumns, frameCount))
  const rows = Math.ceil(frameCount / columns)

  const sheetWidth = columns * cellWidth
  const sheetHeight = rows * cellHeight

  const innerWidth = Math.max(1, cellWidth - config.padding * 2)
  const innerHeight = Math.max(1, cellHeight - config.padding * 2)

  const composites = []

  for (let index = 0; index < framePaths.length; index++) {
    const framePath = framePaths[index]
    const frameName = sequence.files[index]
    const meta = metas[index]

    const col = index % columns
    const row = Math.floor(index / columns)

    const resized = await sharp(framePath)
      .resize({
        width: innerWidth,
        height: innerHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer()

    const resizedMeta = await sharp(resized).metadata()

    const left =
      col * cellWidth +
      config.padding +
      Math.round((innerWidth - (resizedMeta.width || innerWidth)) / 2)

    const top =
      row * cellHeight +
      config.padding +
      Math.round((innerHeight - (resizedMeta.height || innerHeight)) / 2)

    composites.push({
      input: resized,
      left,
      top,
    })

    if (verbose) {
      console.log(
        `  frame ${String(index).padStart(3, '0')} | ${frameName} | original ${meta.width}x${meta.height} -> cell ${cellWidth}x${cellHeight}`
      )
    }
  }

  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputImage)

  const durationMs = Math.round((frameCount / config.fps) * 1000)

  const manifestEntry = {
    id: sanitizeId(relativeDir || baseName),
    name: baseName,
    label: humanize(baseName),
    sequenceDir: toPosix(path.relative(process.cwd(), sequence.dir)),
    sheetPath: toPosix(path.relative(process.cwd(), outputImage)),
    metadataPath: toPosix(path.relative(process.cwd(), outputMeta)),
    frameCount,
    fps: config.fps,
    durationMs,
    cellWidth,
    cellHeight,
    columns,
    rows,
    maxSourceWidth: maxIntrinsicWidth,
    maxSourceHeight: maxIntrinsicHeight,
    sourceFiles: sequence.files,
  }

  await fs.writeFile(outputMeta, JSON.stringify(manifestEntry, null, 2), 'utf8')

  return manifestEntry
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  if (!args.input) {
    printHelp()
    throw new Error('Missing required argument: --input')
  }

  ensurePositiveNumber(args.fps, 'fps')
  ensurePositiveNumber(args.maxColumns, 'maxColumns')
  ensurePositiveNumber(args.minFrames, 'minFrames')
  ensurePositiveNumber(args.maxCellWidth, 'maxCellWidth')
  ensurePositiveNumber(args.maxCellHeight, 'maxCellHeight')
  if (args.cellWidth != null) ensurePositiveNumber(args.cellWidth, 'cellWidth')
  if (args.cellHeight != null) ensurePositiveNumber(args.cellHeight, 'cellHeight')
  if (!Number.isFinite(args.padding) || args.padding < 0) {
    throw new Error('padding must be 0 or a positive number')
  }

  const inputDir = path.resolve(args.input)
  const outputDir = args.output
    ? path.resolve(args.output)
    : path.resolve(path.dirname(inputDir), 'generated-sheets')

  if (!(await exists(inputDir))) {
    throw new Error(`Input directory does not exist: ${inputDir}`)
  }

  await fs.mkdir(outputDir, { recursive: true })

  const config = {
    ...args,
    input: inputDir,
    output: outputDir,
  }

  console.log(`Scanning: ${inputDir}`)
  const candidates = await collectSequenceDirectories(inputDir, args.extensions)

  const validSequences = candidates.filter((sequence) => sequence.files.length >= args.minFrames)

  if (validSequences.length === 0) {
    console.log('No valid frame folders found.')
    return
  }

  console.log(`Found ${validSequences.length} sequence folder(s).`)
  const manifest = []

  for (const sequence of validSequences) {
    const relative = path.relative(inputDir, sequence.dir) || '.'
    console.log(`\nBuilding sheet for: ${relative}`)

    try {
      const entry = await makeSheetForSequence(sequence, config)
      manifest.push(entry)
      console.log(
        `  ✔ ${entry.sheetPath} | ${entry.frameCount} frames | ${entry.columns}x${entry.rows} grid | ${entry.cellWidth}x${entry.cellHeight} cell`
      )
    } catch (error) {
      console.error(`  ✖ Failed: ${sequence.dir}`)
      console.error(`    ${error.message}`)
    }
  }

  const manifestPath = path.join(outputDir, args.manifest)
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  console.log(`\nDone.`)
  console.log(`Global manifest: ${manifestPath}`)
  console.log(`Output directory: ${outputDir}`)
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`)
  process.exit(1)
})
