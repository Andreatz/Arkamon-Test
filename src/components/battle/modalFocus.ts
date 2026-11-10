/** Disable every background branch, including controls above the game's overlay. */
export function makeDialogBackgroundInert(dialog: HTMLElement): () => void {
  const changed: HTMLElement[] = []
  let branch: HTMLElement | null = dialog
  while (branch?.parentElement) {
    const parent: HTMLElement = branch.parentElement
    for (const sibling of Array.from(parent.children)) {
      if (sibling instanceof HTMLElement && sibling !== branch && !sibling.inert) {
        sibling.inert = true
        changed.push(sibling)
      }
    }
    if (parent === document.body) break
    branch = parent
  }
  let restored = false
  return () => {
    if (restored) return
    restored = true
    for (const element of changed) element.inert = false
  }
}
