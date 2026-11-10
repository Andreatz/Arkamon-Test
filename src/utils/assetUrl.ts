/**
 * Risolve un path relativo agli asset statici di `public/` rispetto alla `base`
 * configurata in vite.config.ts.
 *
 * In dev `import.meta.env.BASE_URL = '/'`.
 * In build con `GITHUB_PAGES=true` diventa `'/Arkamon-Beta/'`.
 *
 * Vite riscrive automaticamente solo gli asset importati staticamente; per i
 * path costruiti a runtime (es. ``/sprites/${id}.png``) bisogna prefissare
 * manualmente con `BASE_URL`.
 */
export function assetUrl(path: string): string {
  return resolveAssetUrl(path, import.meta.env.BASE_URL, import.meta.env.VITE_SPLIT_MEDIA ? import.meta.env.VITE_MEDIA_REVISION : undefined,
    import.meta.env.VITE_MEDIA_BASE_URL, false, import.meta.env.VITE_LOCAL_FRONT_SPRITE_IDS, import.meta.env.VITE_OMITTED_MEDIA_PATHS)
}

export function resolveAssetUrl(value: string, base: string, mediaRevision?: string, mediaBase?: string, encodeLocal = false, localFrontSpriteIds?: readonly number[], omittedMediaPaths: readonly string[] = []): string {
  if (/^(https?:|data:|blob:)/i.test(value)) return value
  const clean = value.replace(/^\//, '')
  const front = /^sprites\/front_sprites\/([1-9]\d*)\.png$/.exec(clean)
  if (front && (mediaBase || mediaRevision) && !localFrontSpriteIds) throw new Error('Local front sprite catalog is required for split media')
  const pendingFront = front && !localFrontSpriteIds?.includes(Number(front[1]))
  const heavy = omittedMediaPaths.includes(clean) || pendingFront || /^(sprites\/arkamon(?:-paged)?\/|sounds\/|vfx\/)/.test(clean)
  const encoded = clean.split('/').map(part => encodeURIComponent(part)).join('/')
  if (heavy && (mediaBase || mediaRevision)) {
    const origin = mediaBase || `https://raw.githubusercontent.com/Andreatz/Arkamon-Beta/${mediaRevision}/public/`
    const url = new URL(origin)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid media origin')
    return `${url.href.endsWith('/') ? url.href : url.href + '/'}${encoded}`
  }
  return `${base.endsWith('/') ? base : base + '/'}${encodeLocal ? encoded : clean}`
}
