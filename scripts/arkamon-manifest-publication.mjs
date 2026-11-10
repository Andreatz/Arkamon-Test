import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { MAX_PAGE_DECODED_BYTES } from './arkamon-page-packing.mjs'

const positive = value => Number.isSafeInteger(value) && value > 0
/** A filtered build may merge only a manifest with a coherent complete frame map. */
export function validatePagedManifest(value) {
  if (!value || value.schemaVersion !== 1 || value.maxPageDecodedBytes !== MAX_PAGE_DECODED_BYTES || !value.clips || typeof value.clips !== 'object' || Array.isArray(value.clips)) throw new Error('Invalid existing paged manifest')
  for (const [key, clip] of Object.entries(value.clips)) {
    const identity = /^\/sprites\/arkamon\/(\d+)\/front\/(idle|attack|hit|victory|ko)\.webp$/.exec(key)
    if (!identity || clip.speciesId !== Number(identity[1]) || clip.animation !== identity[2]
      || clip.originalSrc !== key || !positive(clip.speciesId) || clip.side !== 'front' || !/^[a-f0-9]{64}$/.test(clip.sourceSha256)
      || !positive(clip.frameWidth) || !positive(clip.frameHeight) || !positive(clip.frameCount) || !positive(clip.fps) || !Array.isArray(clip.pages) || !clip.pages.length) throw new Error(`Invalid existing clip: ${key}`)
    let nextFrame = 0
    for (const page of clip.pages) {
      if (page.firstFrame !== nextFrame || !positive(page.frameCount) || !positive(page.columns) || !positive(page.rows)
        || !positive(page.width) || !positive(page.height) || !positive(page.encodedBytes) || !positive(page.decodedBytes)
        || page.width !== page.columns * clip.frameWidth || page.height !== page.rows * clip.frameHeight || page.decodedBytes !== page.width * page.height * 4
        || page.decodedBytes > value.maxPageDecodedBytes || page.frameCount > page.columns * page.rows
        || typeof page.src !== 'string' || !page.src.startsWith('/sprites/arkamon-paged/') || page.src.includes('..')
        || !/^[a-f0-9]{64}$/.test(page.sha256)) throw new Error(`Invalid existing page: ${key}/${nextFrame}`)
      nextFrame += page.frameCount
    }
    if (nextFrame !== clip.frameCount) throw new Error(`Incomplete existing clip: ${key}`)
  }
  return value
}
export async function readManifestForMerge(filename, maxPageDecodedBytes) {
  try { return validatePagedManifest(JSON.parse(await fs.readFile(filename, 'utf8'))) }
  catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, maxPageDecodedBytes, clips: {} }
    throw error
  }
}
export async function atomicWriteJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
    await fs.rename(temporary, filename)
  } finally { await fs.rm(temporary, { force: true }) }
}
