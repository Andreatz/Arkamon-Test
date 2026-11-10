import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const SVG_NS = 'http://www.w3.org/2000/svg'
const NUMBER = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?'
const RECTANGLE = new RegExp(`M\\s*(${NUMBER})[\\s,]+(${NUMBER})\\s*h\\s*(${NUMBER})\\s*v\\s*(${NUMBER})\\s*h\\s*(${NUMBER})\\s*Z`, 'gy')
const ATTRIBUTES = {
  svg: new Set(['xmlns', 'width', 'height', 'viewBox', 'color-interpolation', 'version', 'preserveAspectRatio', 'shape-rendering']),
  title: new Set(), desc: new Set(), defs: new Set(),
  linearGradient: new Set(['id', 'gradientUnits', 'x1', 'y1', 'x2', 'y2', 'spreadMethod']),
  stop: new Set(['offset', 'stop-color', 'stop-opacity']),
  path: new Set(['fill', 'fill-opacity', 'd']),
}
const CHILDREN = { svg: new Set(['title', 'desc', 'defs', 'path']), defs: new Set(['linearGradient']), linearGradient: new Set(['stop']) }
const sha256 = value => createHash('sha256').update(value).digest('hex')
const escapeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const attributesXml = attributes => Object.entries(attributes).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join('')
const formatNumber = value => String(Object.is(value, -0) ? 0 : Number(value.toFixed(9)))

function fail(message, context) {
  throw new Error(context ? `${context}: ${message}` : message)
}

function decodeXml(value, context) {
  return value.replace(/&([^;]+);/g, (_, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
    if (Object.hasOwn(named, entity)) return named[entity]
    const number = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : entity.startsWith('#') ? Number(entity.slice(1)) : NaN
    if (!Number.isInteger(number) || number < 1 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) fail('Unsupported XML entity', context)
    return String.fromCodePoint(number)
  })
}

function parseAttributes(raw, tag, context) {
  const values = {}
  let index = 0
  while (index < raw.length) {
    const whitespace = /^\s+/.exec(raw.slice(index))
    if (!whitespace) fail(`Invalid ${tag} attributes`, context)
    index += whitespace[0].length
    if (index === raw.length) break
    const match = /^([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(raw.slice(index))
    if (!match) fail(`Invalid ${tag} attribute`, context)
    const name = match[1]
    if (!ATTRIBUTES[tag].has(name)) fail(`Unsupported or active attribute ${tag}.${name}`, context)
    if (Object.hasOwn(values, name)) fail(`Duplicate attribute ${tag}.${name}`, context)
    const rawValue = match[2] ?? match[3]
    if (rawValue.includes('<') || /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/.test(rawValue)) fail('Invalid XML attribute value', context)
    values[name] = decodeXml(rawValue, context)
    index += match[0].length
  }
  return values
}

function finiteNumber(value, context) {
  if (typeof value !== 'string' || !new RegExp(`^${NUMBER}$`).test(value) || !Number.isFinite(Number(value))) fail(`Invalid number ${value}`, context)
  return Number(value)
}

function opacity(value, context) {
  if (value === undefined) return
  const number = finiteNumber(value, context)
  if (number < 0 || number > 1) fail('Opacity must be in [0, 1]', context)
}

function colour(value, context) {
  if (!/^#[\da-fA-F]{3,8}$/.test(value ?? '') || ![4, 5, 7, 9].includes(value.length)) fail('Only literal hex colours are supported', context)
}

/** Strict parser for the static SVG subset used by the supplied atlas sheets. */
export function parseSheet(xml, context = 'SVG') {
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml)) fail('DTD, entities and CDATA are not accepted', context)
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[A-Za-z_][^<>"']*(?:(?:"[^"]*"|'[^']*')[^<>"']*)*>|[^<]+/gy
  const stack = []
  const gradients = new Map()
  const paths = []
  let root = null
  let gradient = null
  let consumed = 0
  for (let match; (match = token.exec(xml));) {
    if (match.index !== consumed) fail('Malformed XML', context)
    consumed = token.lastIndex
    const text = match[0]
    if (text.startsWith('<!--')) continue
    if (text.startsWith('<?')) {
      if (root || !/^<\?xml\s[^?]*\?>$/.test(text)) fail('Processing instructions are not accepted', context)
      continue
    }
    if (!text.startsWith('<')) {
      const parent = stack.at(-1)
      if (!['title', 'desc'].includes(parent) && text.trim()) fail('Unexpected XML text', context)
      continue
    }
    const close = /^<\/([A-Za-z_][\w:.-]*)\s*>$/.exec(text)
    if (close) {
      if (stack.pop() !== close[1]) fail('Mismatched closing element', context)
      if (close[1] === 'linearGradient') gradient = null
      continue
    }
    const open = /^<([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/.exec(text)
    if (!open || !Object.hasOwn(ATTRIBUTES, open[1])) fail('Unsupported, active or raster element', context)
    const [, tag, raw, selfClosing] = open
    const parent = stack.at(-1)
    if (tag === 'svg' ? (root !== null || parent !== undefined) : !CHILDREN[parent]?.has(tag)) fail(`Invalid element placement: ${tag}`, context)
    const attrs = parseAttributes(raw, tag, context)
    if (tag === 'svg') {
      if (attrs.xmlns !== SVG_NS) fail('Expected the SVG namespace', context)
      const box = attrs.viewBox?.trim().split(/[\s,]+/).map(value => finiteNumber(value, context))
      if (!box || box.length !== 4 || box[2] <= 0 || box[3] <= 0) fail('Expected a positive four-number viewBox', context)
      if (attrs['color-interpolation'] && !['sRGB', 'linearRGB'].includes(attrs['color-interpolation'])) fail('Unsupported colour interpolation', context)
      if (attrs['shape-rendering'] && !['auto', 'crispEdges', 'geometricPrecision', 'optimizeSpeed'].includes(attrs['shape-rendering'])) fail('Unsupported shape rendering', context)
      root = { viewBox: box, colourInterpolation: attrs['color-interpolation'] }
    } else if (tag === 'linearGradient') {
      if (!/^[A-Za-z_][\w.-]*$/.test(attrs.id ?? '') || gradients.has(attrs.id)) fail('Missing or duplicate gradient ID', context)
      if (attrs.gradientUnits !== 'userSpaceOnUse') fail('Gradient must use userSpaceOnUse to preserve cropped paint', context)
      for (const coordinate of ['x1', 'y1', 'x2', 'y2']) finiteNumber(attrs[coordinate], context)
      if (attrs.spreadMethod && !['pad', 'reflect', 'repeat'].includes(attrs.spreadMethod)) fail('Unsupported gradient spread', context)
      gradient = { attrs, stops: [] }
      gradients.set(attrs.id, gradient)
    } else if (tag === 'stop') {
      colour(attrs['stop-color'], context)
      opacity(attrs['stop-opacity'], context)
      const offset = attrs.offset?.endsWith('%') ? finiteNumber(attrs.offset.slice(0, -1), context) / 100 : finiteNumber(attrs.offset, context)
      if (offset < 0 || offset > 1) fail('Gradient stop offset must be in [0, 1]', context)
      gradient.stops.push(attrs)
    } else if (tag === 'path') {
      if (!attrs.d?.trim()) fail('Empty path data', context)
      opacity(attrs['fill-opacity'], context)
      const reference = /^url\(#([A-Za-z_][\w.-]*)\)$/.exec(attrs.fill ?? '')
      if (!reference) colour(attrs.fill, context)
      paths.push({ attrs, gradientId: reference?.[1] })
    }
    if (!selfClosing) stack.push(tag)
    else if (tag === 'linearGradient') gradient = null
  }
  if (consumed !== xml.length || stack.length || !root) fail('Incomplete or malformed SVG', context)
  for (const item of paths) if (item.gradientId && !gradients.has(item.gradientId)) fail(`Unknown gradient ${item.gradientId}`, context)
  for (const item of gradients.values()) if (!item.stops.length) fail('Gradient has no stops', context)
  return { ...root, gradients, paths }
}

function rectangles(data, context, visit) {
  let index = 0
  let count = 0
  while (index < data.length) {
    while (/\s/.test(data[index] ?? '') && index < data.length) index++
    if (index === data.length) break
    RECTANGLE.lastIndex = index
    const match = RECTANGLE.exec(data)
    if (!match) fail(`Unsupported path grammar at offset ${index}; expected independent rectangular subpaths`, context)
    const [x, y, width, height, back] = match.slice(1).map(Number)
    if (![x, y, width, height, back].every(Number.isFinite) || width <= 0 || height <= 0 || Math.abs(width + back) > 1e-8) fail('Invalid rectangular subpath', context)
    visit(x, y, width, height)
    index = RECTANGLE.lastIndex
    count++
  }
  return count
}

/** Parse each sheet once and dispatch its rectangles to the requested regions. */
export function extractSheet(sheet, assets, context = 'SVG') {
  const regions = assets.map(asset => ({ asset, paths: [], gradients: new Set(), rectangleCount: 0 }))
  let sourceRectangleCount = 0
  for (const [index, item] of sheet.paths.entries()) {
    const selections = regions.map(() => [])
    sourceRectangleCount += rectangles(item.attrs.d, `${context}, path ${index + 1}`, (x, y, width, height) => {
      for (let i = 0; i < regions.length; i++) {
        const [left, top, cropWidth, cropHeight] = regions[i].asset.rect
        const x0 = Math.max(x, left), y0 = Math.max(y, top)
        const x1 = Math.min(x + width, left + cropWidth), y1 = Math.min(y + height, top + cropHeight)
        if (x1 <= x0 || y1 <= y0) continue
        const clippedWidth = x1 - x0, clippedHeight = y1 - y0
        selections[i].push(`M${formatNumber(x0)} ${formatNumber(y0)}h${formatNumber(clippedWidth)}v${formatNumber(clippedHeight)}h${formatNumber(-clippedWidth)}Z`)
      }
    })
    for (let i = 0; i < regions.length; i++) {
      if (!selections[i].length) continue
      const { d: _data, ...paint } = item.attrs
      regions[i].paths.push(`<path${attributesXml(paint)} d="${selections[i].join('')}"/>`)
      regions[i].rectangleCount += selections[i].length
      if (item.gradientId) regions[i].gradients.add(item.gradientId)
    }
  }
  const crops = regions.map(region => {
    if (!region.paths.length) fail(`Empty crop ${region.asset.id}`, context)
    const definitions = [...sheet.gradients.entries()].filter(([id]) => region.gradients.has(id)).map(([, gradient]) => `<linearGradient${attributesXml(gradient.attrs)}>${gradient.stops.map(stop => `<stop${attributesXml(stop)}/>`).join('')}</linearGradient>`).join('')
    const [, , width, height] = region.asset.rect
    // These atlases approximate artwork with adjacent pixel rectangles. Snapping
    // their shared edges avoids antialiased seams when the crop is scaled down.
    const attrs = { xmlns: SVG_NS, width: formatNumber(width), height: formatNumber(height), viewBox: region.asset.rect.map(formatNumber).join(' '), preserveAspectRatio: 'xMidYMid meet', 'shape-rendering': 'crispEdges' }
    if (sheet.colourInterpolation) attrs['color-interpolation'] = sheet.colourInterpolation
    const svg = `<svg${attributesXml(attrs)}>\n<title>${escapeXml(region.asset.id)}</title>\n${definitions ? `<defs>${definitions}</defs>\n` : ''}${region.paths.join('\n')}\n</svg>\n`
    return { asset: region.asset, svg, pathCount: region.paths.length, rectangleCount: region.rectangleCount, gradientCount: region.gradients.size }
  })
  return { crops, sourceRectangleCount }
}

function safeRelativeSheet(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.svg$/.test(value) && !value.includes('..')
}

export function validateManifest(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.assets) || !manifest.assets.length) fail('Manifest requires version: 1 and a non-empty assets array')
  const ids = new Set()
  for (const asset of manifest.assets) {
    if (!asset || !/^[a-z0-9][a-z0-9_-]*$/.test(asset.id ?? '') || ids.has(asset.id)) fail(`Unsafe or duplicate asset ID: ${asset?.id}`)
    if (!safeRelativeSheet(asset.sheet)) fail(`Unsafe SVG sheet filename: ${asset.sheet}`)
    if (!Array.isArray(asset.rect) || asset.rect.length !== 4 || !asset.rect.every(Number.isFinite) || asset.rect[2] <= 0 || asset.rect[3] <= 0) fail(`Invalid crop rectangle: ${asset.id}`)
    if (typeof asset.role !== 'string' || !asset.role.trim()) fail(`Missing role: ${asset.id}`)
    ids.add(asset.id)
  }
  return manifest
}

export async function importAtlas({ source, manifest: manifestFile, output, check = false, runtime = false }) {
  if (!source || !manifestFile || !output) fail('Required options: --source <folder> --manifest <config.json> --output <folder>')
  const folders = Array.isArray(source) ? source : [source]
  if (!folders.length || folders.some(folder => typeof folder !== 'string' || !folder.trim())) fail('At least one source folder is required')
  const sourceRoots = [...new Set(await Promise.all(folders.map(folder => fs.realpath(path.resolve(folder)))))]
  const manifestBytes = await fs.readFile(path.resolve(manifestFile))
  const manifest = validateManifest(JSON.parse(manifestBytes.toString('utf8')))
  const groups = new Map()
  for (const asset of manifest.assets) {
    if (!groups.has(asset.sheet)) groups.set(asset.sheet, [])
    groups.get(asset.sheet).push(asset)
  }
  const files = []
  const metadata = { version: 1, manifestSha256: sha256(manifestBytes), sheets: [], assets: [] }
  const sharp = runtime ? (await import('sharp')).default : null
  for (const [filename, assets] of groups) {
    const candidates = []
    for (const sourceRoot of sourceRoots) {
      const candidate = await fs.realpath(path.join(sourceRoot, filename)).catch(error => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
        throw error
      })
      if (!candidate) continue
      const relative = path.relative(sourceRoot, candidate)
      if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`Sheet escapes the source folder: ${filename}`)
      candidates.push(candidate)
    }
    if (!candidates.length) fail(`Sheet not found in the source folders: ${filename}`)
    if (candidates.length > 1) fail(`Ambiguous sheet found in multiple source folders: ${filename}`)
    const sourcePath = candidates[0]
    const bytes = await fs.readFile(sourcePath)
    const sourceSha256 = sha256(bytes)
    const sheet = parseSheet(bytes.toString('utf8'), filename)
    const [x, y, width, height] = sheet.viewBox
    for (const asset of assets) {
      const [left, top, cropWidth, cropHeight] = asset.rect
      if (left < x || top < y || left + cropWidth > x + width || top + cropHeight > y + height) fail(`Crop ${asset.id} exceeds the source viewBox`)
    }
    const result = extractSheet(sheet, assets, filename)
    metadata.sheets.push({ file: filename, sha256: sourceSha256, bytes: bytes.length, viewBox: sheet.viewBox, pathCount: sheet.paths.length, rectangleCount: result.sourceRectangleCount, gradientCount: sheet.gradients.size })
    for (const crop of result.crops) {
      const filename = `${crop.asset.id}.svg`
      const buffer = Buffer.from(crop.svg)
      files.push({ filename, buffer })
      const assetMetadata = { ...crop.asset, file: filename, sourceSha256, sha256: sha256(buffer), bytes: buffer.length, pathCount: crop.pathCount, rectangleCount: crop.rectangleCount, gradientCount: crop.gradientCount }
      if (sharp) {
        // Keep the editable SVG sidecar, but decode the very dense atlas paint
        // once at import time rather than on every browser's first menu visit.
        const rendered = await sharp(buffer, { density: 144 })
          .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 92, alphaQuality: 100, effort: 4 })
          .toBuffer({ resolveWithObject: true })
        const runtimeFilename = `${crop.asset.id}.webp`
        files.push({ filename: runtimeFilename, buffer: rendered.data })
        assetMetadata.runtime = { file: runtimeFilename, sha256: sha256(rendered.data), bytes: rendered.data.length, width: rendered.info.width, height: rendered.info.height }
      }
      metadata.assets.push(assetMetadata)
    }
  }
  // Keep metadata in the declared asset order, even when sheets are interleaved.
  const order = new Map(manifest.assets.map((asset, index) => [asset.id, index]))
  metadata.assets.sort((a, b) => order.get(a.id) - order.get(b.id))
  files.push({ filename: 'manifest.generated.json', buffer: Buffer.from(JSON.stringify(metadata, null, 2) + '\n') })
  if (check) {
    for (const file of files) {
      const saved = await fs.readFile(path.join(output, file.filename)).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
      if (!saved?.equals(file.buffer)) fail(`Generated asset is missing or stale: ${file.filename}`)
    }
  } else {
    await fs.mkdir(output, { recursive: true })
    for (const file of files) await fs.writeFile(path.join(output, file.filename), file.buffer)
  }
  return metadata
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === '--check') { args.check = true; continue }
    if (flag === '--runtime') { args.runtime = true; continue }
    if (flag === '--help' || flag === '-h') { args.help = true; continue }
    if (!['--source', '--manifest', '--output'].includes(flag) || !argv[index + 1] || argv[index + 1].startsWith('--')) fail(`Unknown option or missing value: ${flag}`)
    const key = flag.slice(2)
    if (key === 'source') {
      args.source = [...(args.source ?? []), argv[++index]]
      continue
    }
    if (Object.hasOwn(args, key)) fail(`Duplicate option: ${flag}`)
    args[key] = argv[++index]
  }
  return args
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) console.log('Usage: node scripts/import-reference-svg-atlas.mjs --source <SVG folder> [--source <another SVG folder>] --manifest <config.json> --output <asset folder> [--runtime] [--check]')
    else {
      const result = await importAtlas(args)
      const vectorBytes = result.assets.reduce((total, asset) => total + asset.bytes, 0)
      const runtimeBytes = result.assets.reduce((total, asset) => total + (asset.runtime?.bytes ?? 0), 0)
      console.log(`${args.check ? 'Verified' : 'Imported'} ${result.assets.length} assets from ${result.sheets.length} SVG sheets (${vectorBytes.toLocaleString('en-US')} SVG bytes${args.runtime ? `; ${runtimeBytes.toLocaleString('en-US')} runtime WebP bytes` : ''}).`)
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
