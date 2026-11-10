import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_EMBEDDED_DESKTOP_BYTES = 12 * 1024 * 1024

/** Separate the already validated, bounded public media from Rust's embedded frontend. */
export async function separateDesktopResources({ output, resources, alreadySeparated = false }) {
  const frontend = path.resolve(output), destination = path.resolve(resources)
  if (frontend === destination || destination.startsWith(frontend + path.sep) || frontend.startsWith(destination + path.sep))
    throw new Error('Desktop resources and frontend must be separate sibling directories.')
  const proof = JSON.parse(await fs.readFile(path.join(frontend, 'media-release.json'), 'utf8'))
  if (!Array.isArray(proof.localAssets)) throw new Error('A validated asset manifest is required before separating desktop resources.')
  await fs.mkdir(destination, { recursive: true })
  if ((await fs.lstat(destination)).isSymbolicLink()) throw new Error('Desktop resource root cannot be a symlink.')
  const canonicalDestination = await fs.realpath(destination)
  const expectedResources = new Set(['media-release.json', ...proof.localAssets.map(entry => entry.path)])
  const checkInventory = async (folder, relative = '') => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) throw new Error('Desktop resources cannot contain symlinks.')
      if (entry.isDirectory()) await checkInventory(path.join(folder, entry.name), next)
      else if (!expectedResources.has(next)) throw new Error(`Stale desktop resource: ${next}. Clean the generated dist-desktop-resources directory before rebuilding.`)
    }
  }
  // An old media file must never slip into a new installer after an authored
  // asset is removed. Refuse stale generated output; never delete source data.
  await checkInventory(destination)
  for (const entry of proof.localAssets) {
    const relative = entry.path
    if (typeof relative !== 'string' || !relative || /[\\:]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..'))
      throw new Error('Unsafe desktop resource path.')
    const source = path.resolve(frontend, relative), target = path.resolve(destination, relative)
    if (!source.startsWith(frontend + path.sep) || !target.startsWith(destination + path.sep)) throw new Error('Desktop resource escapes its generated package.')
    await fs.mkdir(path.dirname(target), { recursive: true })
    const canonicalParent = await fs.realpath(path.dirname(target))
    if (canonicalParent !== canonicalDestination && !canonicalParent.startsWith(canonicalDestination + path.sep))
      throw new Error('Desktop resource parent escapes the generated package.')
    if (alreadySeparated) {
      const stat = await fs.lstat(target)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.bytes) throw new Error(`Invalid separated desktop resource: ${relative}`)
      continue
    }
    // Move individual public files: generated JS and authored media both use
    // assets/, and moving the whole directory would remove the application.
    await fs.rename(source, target)
  }
  await fs.copyFile(path.join(frontend, 'media-release.json'), path.join(destination, 'media-release.json'))
  await checkInventory(destination)
  const sizes = async folder => {
    let bytes = 0, files = 0
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name)
      if (entry.isSymbolicLink()) throw new Error('Desktop resources cannot contain symlinks.')
      if (entry.isDirectory()) { const child = await sizes(file); bytes += child.bytes; files += child.files }
      else { bytes += (await fs.stat(file)).size; files++ }
    }
    return { bytes, files }
  }
  const embedded = await sizes(frontend), bundled = await sizes(destination)
  if (embedded.bytes > MAX_EMBEDDED_DESKTOP_BYTES) throw new Error(`Embedded desktop frontend exceeds its budget: ${embedded.bytes}`)
  const result = { version: 1, embedded, bundled, maxEmbeddedBytes: MAX_EMBEDDED_DESKTOP_BYTES,
    nativeClips: proof.nativeClips, mediaRevision: proof.mediaRevision }
  await fs.writeFile(path.join(frontend, 'desktop-package.json'), JSON.stringify(result, null, 2))
  console.log(`Desktop frontend: ${(embedded.bytes / 1048576).toFixed(1)} MiB embedded; ${(bundled.bytes / 1048576).toFixed(1)} MiB separate installer resources`)
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  await separateDesktopResources({ output: path.join(root, 'dist-desktop'), resources: path.join(root, 'dist-desktop-resources') })
}
