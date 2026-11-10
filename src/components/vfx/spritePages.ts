export interface SpritePage {
  src: string
  firstFrame: number
  frameCount: number
  columns: number
  rows: number
  width: number
  height: number
  decodedBytes: number
}

/** Source frame identity stays global; only its local cell coordinates change. */
export function locateSpritePage(pages: readonly SpritePage[], frame: number) {
  const pageIndex = pages.findIndex(page => frame >= page.firstFrame && frame < page.firstFrame + page.frameCount)
  if (pageIndex < 0) throw new Error(`Missing native sprite page for frame ${frame}`)
  const page = pages[pageIndex]
  const localFrame = frame - page.firstFrame
  return { pageIndex, page, localFrame, col: localFrame % page.columns, row: Math.floor(localFrame / page.columns) }
}

export function validateSpritePages(pages: readonly SpritePage[], frameCount: number, frameWidth: number, frameHeight: number) {
  let nextFrame = 0
  for (const page of pages) {
    if (page.firstFrame !== nextFrame || !Number.isInteger(page.frameCount) || page.frameCount < 1
      || page.columns < 1 || page.rows < 1 || page.columns * page.rows < page.frameCount
      || page.width !== page.columns * frameWidth || page.height !== page.rows * frameHeight
      || page.decodedBytes !== page.width * page.height * 4 || page.decodedBytes > 16 * 1024 * 1024) return false
    nextFrame += page.frameCount
  }
  return nextFrame === frameCount
}
