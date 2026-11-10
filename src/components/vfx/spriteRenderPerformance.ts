import type { SpritePage } from './spritePages'

/**
 * Keep expensive cache scans and DOM telemetry out of the 60 FPS paint loop.
 * A page transition samples immediately so the inspector still sees handovers.
 */
export function shouldSampleSpriteMemory(
  lastSampleAtMs: number,
  nowMs: number,
  lastPage: number,
  currentPage: number,
  minimumIntervalMs = 500,
): boolean {
  return lastPage !== currentPage || !Number.isFinite(lastSampleAtMs)
    || nowMs - lastSampleAtMs >= minimumIntervalMs
}

/**
 * Do not decode the next native atlas seconds before it will be displayed.
 * The lead time deliberately favours smooth handover on slower connections;
 * a missed deadline still holds the previous painted frame, never skipping art.
 */
export function shouldWarmNextSpritePage(
  page: Pick<SpritePage, 'firstFrame' | 'frameCount'>,
  absoluteFrame: number,
  frameMs: number,
  leadMs = 1200,
): boolean {
  const remaining = page.firstFrame + page.frameCount - 1 - absoluteFrame
  const safeFrameMs = Number.isFinite(frameMs) && frameMs > 0 ? frameMs : 1000 / 30
  return remaining >= 0 && remaining * safeFrameMs <= leadMs
}
