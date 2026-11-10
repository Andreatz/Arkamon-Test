/** Keep original cells intact while bounding every decoded page to 16 MiB. */
export const MAX_PAGE_DECODED_BYTES = 16 * 1024 * 1024

/** RGB under alpha zero is invisible; all alpha and every visible RGB byte must match. */
export function hasSameVisibleRgba(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== b[i + 3]) return false
    if (a[i + 3] && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) return false
  }
  return true
}

export function getNativePageGrid(frameWidth, frameHeight) {
  const bytesPerFrame = frameWidth * frameHeight * 4
  if (!Number.isSafeInteger(bytesPerFrame) || bytesPerFrame <= 0 || bytesPerFrame > MAX_PAGE_DECODED_BYTES) {
    throw new Error('Invalid native cell geometry')
  }
  let best = { columns: 1, rows: 1, framesPerPage: 1 }
  for (let columns = 1; columns <= 4; columns++) for (let rows = 1; rows <= 4; rows++) {
    const capacity = columns * rows
    if (capacity * bytesPerFrame > MAX_PAGE_DECODED_BYTES) continue
    if (capacity > best.framesPerPage || capacity === best.framesPerPage && Math.abs(columns - rows) < Math.abs(best.columns - best.rows)) {
      best = { columns, rows, framesPerPage: capacity }
    }
  }
  return { ...best, decodedBytes: best.framesPerPage * bytesPerFrame }
}

/** RGBA row copies preserve invisible RGB, alpha, frame order and padded cell geometry. */
export function copyNativeFramesToPage(source, geometry, firstFrame, frameCount, grid) {
  const { frameWidth, frameHeight, columns: sourceColumns, width: sourceWidth } = geometry
  const width = grid.columns * frameWidth, height = grid.rows * frameHeight
  const pixels = Buffer.alloc(width * height * 4)
  for (let frame = 0; frame < frameCount; frame++) {
    const original = firstFrame + frame
    const sourceX = original % sourceColumns * frameWidth
    const sourceY = Math.floor(original / sourceColumns) * frameHeight
    const destinationX = frame % grid.columns * frameWidth
    const destinationY = Math.floor(frame / grid.columns) * frameHeight
    for (let y = 0; y < frameHeight; y++) {
      const offset = ((sourceY + y) * sourceWidth + sourceX) * 4
      source.copy(pixels, ((destinationY + y) * width + destinationX) * 4, offset, offset + frameWidth * 4)
    }
  }
  return { pixels, width, height }
}
