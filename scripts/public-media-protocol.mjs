// Independent image payloads keep the public snapshot's 2 MiB limit unchanged.
export const PUBLIC_MEDIA_MAX_BYTES = 12 * 1024 * 1024
export const PUBLIC_MEDIA_MAX_FILES = 3
export const PUBLIC_MEDIA_BUFFER_FILES = PUBLIC_MEDIA_MAX_FILES * 2
export const PUBLIC_MEDIA_BUFFER_BYTES = PUBLIC_MEDIA_MAX_BYTES * PUBLIC_MEDIA_BUFFER_FILES
export const PUBLIC_MEDIA_EXTENSIONS = Object.freeze({ 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })
export const publicMediaId = source => typeof source === 'string' ? /^public-media:([a-f0-9]{64})$/.exec(source)?.[1] : undefined
export function publicSnapshotMediaIds(snapshot) {
  const appearance = snapshot?.battle?.appearance
  const sources = [appearance?.enemyFrame?.source, appearance?.playerFrame?.source, appearance?.background]
  const ids = new Set()
  for (const source of sources) if (typeof source === 'string' && source.startsWith('public-media:')) {
    const id = publicMediaId(source)
    if (!id) return null
    ids.add(id)
  }
  return [...ids]
}
