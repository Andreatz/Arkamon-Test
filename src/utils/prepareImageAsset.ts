const pendingImages = new Map<string, Promise<void>>()
const readyImages = new Map<string, { image: HTMLImageElement; timeout: number; bytes: number; request: Promise<void> }>()
let readyBudgetBytes = 128 * 1024 * 1024

/** Keep decoded pixels alive only through the current short battle sequence. */
export function isImageAssetPrepared(src: string): boolean {
  return readyImages.has(src)
}

/** Reuse the decoded bitmap while the current renderer holds its own reference. */
export function getPreparedImageAsset(src: string): HTMLImageElement | undefined {
  return readyImages.get(src)?.image
}

function forgetReadyImage(src: string) {
  const entry = readyImages.get(src)
  if (entry) window.clearTimeout(entry.timeout)
  readyImages.delete(src)
}

/** Prepare only the images required by the current action. Failure uses the renderer's fallback. */
export function prepareImageAsset(src: string): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve()
  const ready = readyImages.get(src)
  if (ready) return ready.request
  const pending = pendingImages.get(src)
  if (pending) return pending
  const request = new Promise<void>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    let settled = false
    let decoding = false
    const finish = (decoded = false) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      if (decoded) {
        forgetReadyImage(src)
        readyImages.set(src, {
          image,
          bytes: image.naturalWidth * image.naturalHeight * 4,
          request: pendingImages.get(src) ?? Promise.resolve(),
          timeout: window.setTimeout(() => forgetReadyImage(src), 10000),
        })
        let bytes = Array.from(readyImages.values()).reduce((sum, entry) => sum + entry.bytes, 0)
        while (readyImages.size > 6 || bytes > readyBudgetBytes) {
          const oldest = readyImages.keys().next().value as string | undefined
          if (!oldest) break
          bytes -= readyImages.get(oldest)!.bytes
          forgetReadyImage(oldest)
        }
      }
      resolve()
    }
    const loaded = () => {
      if (settled || decoding) return
      decoding = true
      // onload proves the bytes arrived; decode proves the frame pixels are ready.
      if (typeof image.decode === 'function') void image.decode().then(() => finish(true), () => finish())
      else finish(true)
    }
    // A stalled request must not hold a battle indefinitely.
    const timeout = window.setTimeout(() => finish(), 15000)
    image.onload = loaded
    image.onerror = () => finish()
    image.src = src
    if (image.complete && image.naturalWidth > 0) loaded()
  })
  pendingImages.set(src, request)
  void request.then(() => pendingImages.delete(src))
  return request
}

/** Decoded VFX images share a scene budget; native pages expose their own bounded pool. */
export function setPreparedImageBudget(bytes: number): void {
  readyBudgetBytes = Number.isFinite(bytes) ? Math.max(16 * 1024 * 1024, bytes) : 128 * 1024 * 1024
  let used = [...readyImages.values()].reduce((sum, entry) => sum + entry.bytes, 0)
  for (const [src, entry] of readyImages) {
    if (used <= readyBudgetBytes) break
    used -= entry.bytes
    forgetReadyImage(src)
  }
}
export function getPreparedImageStats() {
  return { budgetBytes: readyBudgetBytes, decodedBytes: [...readyImages.values()].reduce((sum, entry) => sum + entry.bytes, 0), images: readyImages.size, pending: pendingImages.size }
}
