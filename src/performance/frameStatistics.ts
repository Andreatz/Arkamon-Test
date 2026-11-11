export const TARGET_FRAME_MS = 1000 / 60

export interface FrameStatistics {
  count: number
  fps: number
  p50Ms: number
  p95Ms: number
  lateFrames: number
  /** Estimates rAF gaps against 60 Hz, not actual GPU-dropped frames. */
  estimatedMissed60HzFrames: number
}

const round = (value: number) => Number(value.toFixed(2))
const quantile = (sorted: readonly number[], percentile: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1))]

export function summarizeFrameIntervals(intervals: readonly number[]): FrameStatistics {
  const valid = intervals.filter(delta => Number.isFinite(delta) && delta > 0 && delta <= 250)
  if (!valid.length) return { count: 0, fps: 0, p50Ms: 0, p95Ms: 0, lateFrames: 0, estimatedMissed60HzFrames: 0 }
  const sorted = [...valid].sort((a, b) => a - b)
  const total = valid.reduce((sum, delta) => sum + delta, 0)
  return {
    count: valid.length,
    fps: round(1000 * valid.length / total),
    p50Ms: round(quantile(sorted, 0.50)),
    p95Ms: round(quantile(sorted, 0.95)),
    lateFrames: valid.filter(delta => delta > TARGET_FRAME_MS * 1.5).length,
    estimatedMissed60HzFrames: valid.reduce((total, delta) => total + Math.max(0, Math.round(delta / TARGET_FRAME_MS) - 1), 0),
  }
}
