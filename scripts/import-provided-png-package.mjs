import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (root, target) => {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

/** A manifest can select PNG files, never arbitrary paths or executable inputs. */
export function validateManifest(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.assets) || !value.assets.length) throw new Error('Manifest must have version 1 and a nonempty assets array')
  if (!value.package || typeof value.package.file !== 'string' || !value.package.file.trim() || !/^[a-f0-9]{64}$/i.test(value.package.sha256 ?? '')) throw new Error('Package requires its filename and SHA-256')
  const ids = new Set()
  const assets = value.assets.map(asset => {
    if (!asset || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id ?? '')) throw new Error('Invalid asset ID')
    if (ids.has(asset.id)) throw new Error(`Duplicate asset ID: ${asset.id}`)
    ids.add(asset.id)
    if (typeof asset.source !== 'string' || asset.source.includes('\\') || asset.source.includes('\0') || /[:?#]/.test(asset.source) || path.posix.isAbsolute(asset.source) || !/\.png$/i.test(asset.source) || asset.source.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw new Error(`${asset.id}: source must be a safe relative PNG path using forward slashes`)
    if (typeof asset.role !== 'string' || !asset.role.trim()) throw new Error(`${asset.id}: missing role`)
    for (const key of ['maxWidth', 'maxHeight']) {
      if (asset[key] !== undefined && (!Number.isInteger(asset[key]) || asset[key] < 1 || asset[key] > 16383)) throw new Error(`${asset.id}: ${key} must be an integer from 1 to 16383`)
    }
    if (asset.trim !== undefined && typeof asset.trim !== 'boolean') throw new Error(`${asset.id}: trim must be boolean`)
    if (asset.rotate !== undefined && ![0, 90, 180, 270].includes(asset.rotate)) throw new Error(`${asset.id}: rotate must be 0, 90, 180 or 270 degrees`)
    return { ...asset, trim: asset.trim ?? true, rotate: asset.rotate ?? 0 }
  })
  return { version: 1, package: { file: value.package.file, sha256: value.package.sha256.toLowerCase() }, assets }
}

/** Alpha strictly greater than zero counts, including the faintest authored glow. */
export function alphaBounds(data, width, height, trim = true) {
  if (!trim) return { left: 0, top: 0, width, height }
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) throw new Error('PNG has no visible pixels')
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

export async function convertPng(bytes, asset) {
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
  if (metadata.format !== 'png' || (metadata.pages ?? 1) !== 1) throw new Error(`${asset.id}: source must be a single PNG image`)
  const decoded = await sharp(bytes, { failOn: 'error' }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const originalWidth = decoded.info.width, originalHeight = decoded.info.height
  const bounds = alphaBounds(decoded.data, originalWidth, originalHeight, asset.trim)
  // Resolve extraction before rotation so its bounds always refer to original pixels.
  const cropped = await sharp(decoded.data, { raw: { width: originalWidth, height: originalHeight, channels: 4 } }).extract(bounds).raw().toBuffer({ resolveWithObject: true })
  const rendered = sharp(cropped.data, { raw: { width: cropped.info.width, height: cropped.info.height, channels: 4 } }).rotate(asset.rotate)
  if (asset.maxWidth || asset.maxHeight) rendered.resize({ width: asset.maxWidth, height: asset.maxHeight, fit: 'inside', withoutEnlargement: true })
  const encoded = await rendered.webp({ quality: 94, alphaQuality: 100, effort: 4 }).toBuffer({ resolveWithObject: true })
  return {
    bytes: encoded.data,
    metadata: {
      originalWidth, originalHeight, trim: asset.trim, trimBounds: bounds,
      cropWidth: bounds.width, cropHeight: bounds.height, rotate: asset.rotate,
      width: encoded.info.width, height: encoded.info.height,
    },
  }
}

async function safeSource(root, relative) {
  const candidate = path.resolve(root, relative)
  if (!inside(root, candidate)) throw new Error(`Source escapes the package: ${relative}`)
  const resolved = await fs.realpath(candidate)
  if (!inside(root, resolved)) throw new Error(`Source symlink escapes the package: ${relative}`)
  if (!(await fs.stat(resolved)).isFile()) throw new Error(`Source is not a file: ${relative}`)
  return resolved
}

async function verifyOutputTarget(root, filename) {
  const target = path.join(root, filename)
  try {
    const stat = await fs.lstat(target)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Output target must be a regular file: ${filename}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return target
}

async function resolveFutureDirectory(directory) {
  let candidate = directory
  const missing = []
  while (true) {
    try { return path.join(await fs.realpath(candidate), ...missing.reverse()) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = path.dirname(candidate)
      if (candidate === parent) throw error
      missing.push(path.basename(candidate))
      candidate = parent
    }
  }
}

/** Only fields needed to request and size artwork enter the browser bundle. */
export function createRuntimeCatalog(metadata) {
  if (!metadata || metadata.version !== 1 || !Array.isArray(metadata.assets)) throw new Error('Invalid generated PNG manifest')
  const ids = new Set()
  return {
    version: 1,
    assets: metadata.assets.map(asset => {
      if (!asset || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id ?? '') || asset.file !== `${asset.id}.webp` || !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < 1 || asset.height < 1 || ids.has(asset.id)) throw new Error('Invalid generated PNG asset metadata')
      ids.add(asset.id)
      return { id: asset.id, file: asset.file, width: asset.width, height: asset.height }
    }),
  }
}

/** Regenerates the tiny browser catalog without decoding or changing any images. */
export async function writeRuntimeCatalog({ output, metadata, check = false, runtimeOutput }) {
  if (!output) throw new Error('Required argument: --output')
  const destination = await fs.realpath(output)
  const fullManifest = metadata ?? JSON.parse(await fs.readFile(path.join(destination, 'manifest.generated.json'), 'utf8'))
  const runtime = createRuntimeCatalog(fullManifest)
  const encoded = Buffer.from(`${JSON.stringify(runtime)}\n`)
  const targets = [await verifyOutputTarget(destination, 'catalog.runtime.json')]
  if (runtimeOutput) {
    const target = path.resolve(runtimeOutput)
    if (!check) await fs.mkdir(path.dirname(target), { recursive: true })
    targets.push(await verifyOutputTarget(await fs.realpath(path.dirname(target)), path.basename(target)))
  }
  for (const target of new Set(targets)) {
    if (check) {
      let existing
      try { existing = await fs.readFile(target) } catch (error) {
        if (error.code === 'ENOENT') throw new Error(`Missing generated runtime catalog: ${target}`)
        throw error
      }
      if (!existing.equals(encoded)) throw new Error(`Stale generated runtime catalog: ${target}`)
    } else await fs.writeFile(target, encoded)
  }
  return runtime
}

/** Deterministic import from an already extracted, locally supplied PNG package. */
export async function importPngPackage({ source, manifest, output, check = false, runtimeOutput }) {
  if (!source || !manifest || !output) throw new Error('Required arguments: --source, --manifest and --output')
  const root = await fs.realpath(source)
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Source must be a directory')
  const configuration = validateManifest(JSON.parse(await fs.readFile(manifest, 'utf8')))
  const outputPath = path.resolve(output)
  const futureDestination = await resolveFutureDirectory(outputPath)
  if (futureDestination === root || inside(root, futureDestination)) throw new Error('Output must be outside the immutable source package')
  if (runtimeOutput) {
    const futureRuntime = await resolveFutureDirectory(path.resolve(runtimeOutput))
    if (futureRuntime === root || inside(root, futureRuntime)) throw new Error('Runtime output must be outside the immutable source package')
  }
  if (!check) await fs.mkdir(outputPath, { recursive: true })
  const destination = await fs.realpath(outputPath)
  if (destination === root || inside(root, destination)) throw new Error('Output must be outside the immutable source package')
  const results = []
  for (const asset of configuration.assets) {
    const filename = `${asset.id}.webp`
    const target = await verifyOutputTarget(destination, filename)
    const original = await fs.readFile(await safeSource(root, asset.source))
    const converted = await convertPng(original, asset)
    if (check) {
      let existing
      try { existing = await fs.readFile(target) } catch (error) {
        if (error.code === 'ENOENT') throw new Error(`Missing generated asset: ${filename}`)
        throw error
      }
      if (!existing.equals(converted.bytes)) throw new Error(`Stale generated asset: ${filename}`)
    } else await fs.writeFile(target, converted.bytes)
    results.push({
      id: asset.id, source: asset.source, sourceSha256: sha256(original), sourceBytes: original.length,
      role: asset.role, ...converted.metadata, file: filename,
      bytes: converted.bytes.length, sha256: sha256(converted.bytes),
    })
  }
  const generated = { version: 1, package: configuration.package, encoding: { format: 'webp', quality: 94, alphaQuality: 100, effort: 4 }, assets: results }
  const encodedManifest = Buffer.from(`${JSON.stringify(generated, null, 2)}\n`)
  const target = await verifyOutputTarget(destination, 'manifest.generated.json')
  if (check) {
    let existing
    try { existing = await fs.readFile(target) } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Missing generated manifest')
      throw error
    }
    if (!existing.equals(encodedManifest)) throw new Error('Stale generated manifest')
  } else await fs.writeFile(target, encodedManifest)
  await writeRuntimeCatalog({ output: destination, metadata: generated, check, runtimeOutput })
  return generated
}

async function main(args) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--check') { options.check = true; continue }
    if (argument === '--runtime-only') { options.runtimeOnly = true; continue }
    if (!['--source', '--manifest', '--output', '--runtime-output'].includes(argument) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Invalid argument: ${argument}`)
    const key = argument === '--runtime-output' ? 'runtimeOutput' : argument.slice(2)
    if (options[key]) throw new Error(`Duplicate argument: ${argument}`)
    options[key] = args[++index]
  }
  if (options.runtimeOnly) {
    const catalog = await writeRuntimeCatalog(options)
    process.stdout.write(`${options.check ? 'Verified' : 'Generated'} runtime catalog for ${catalog.assets.length} supplied PNG assets.\n`)
    return
  }
  const result = await importPngPackage(options)
  const total = result.assets.reduce((sum, asset) => sum + asset.bytes, 0)
  process.stdout.write(`${options.check ? 'Verified' : 'Imported'} ${result.assets.length} supplied PNG assets (${(total / 1024 / 1024).toFixed(2)} MiB WebP).\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
}
