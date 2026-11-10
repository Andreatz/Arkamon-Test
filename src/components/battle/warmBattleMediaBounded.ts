/**
 * Warm decoded media without launching every move in parallel. Two workers
 * leave room for the native sprite renderer and never alter attack timings.
 * Cancelling prevents new tasks from starting; in-flight decodes finish safely.
 */
export async function warmBattleMediaBounded<T>(
  items: readonly T[],
  prepare: (item: T) => Promise<unknown>,
  shouldContinue: () => boolean = () => true,
  concurrency = 2,
): Promise<void> {
  let cursor = 0
  const count = Math.min(items.length, Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : 2)))
  async function work() {
    while (shouldContinue()) {
      const index = cursor++
      if (index >= items.length) return
      try { await prepare(items[index]) } catch {
        // A missing image uses the existing VFX fallback. Do not block turns.
      }
    }
  }
  await Promise.all(Array.from({ length: count }, work))
}
