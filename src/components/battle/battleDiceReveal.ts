export interface BattleDiceRevealOptions {
  diceCount: number
  /** Queue a callback after the already-visible dice have had a chance to paint. */
  scheduleAfterPaint: (callback: () => void) => () => void
  onReveal: () => void
}

/** Reveal damage once the panel and every distinct die are actually visible. */
export function createBattleDiceReveal(options: BattleDiceRevealOptions) {
  const diceCount = Number.isFinite(options.diceCount)
    ? Math.max(0, Math.floor(options.diceCount))
    : 0
  const visibleDice = new Set<number>()
  let active = true
  let panelVisible = false
  let queued = false
  let revealed = false
  let cancelScheduled: (() => void) | undefined

  const advance = () => {
    if (!active || queued || revealed || !panelVisible || visibleDice.size !== diceCount) return
    queued = true
    cancelScheduled = options.scheduleAfterPaint(() => {
      if (!active || revealed) return
      revealed = true
      cancelScheduled = undefined
      options.onReveal()
    })
  }

  return {
    dieVisible(index: number) {
      if (!active || revealed || !Number.isInteger(index) || index < 0 || index >= diceCount) return
      visibleDice.add(index)
      advance()
    },
    panelVisible() {
      if (!active || revealed) return
      panelVisible = true
      advance()
    },
    cancel() {
      if (!active) return
      active = false
      const cancel = cancelScheduled
      cancelScheduled = undefined
      cancel?.()
    },
  }
}
