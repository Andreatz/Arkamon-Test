/** Keep a Studio drag attached to its initiating pointer until it ends. */
export function listenToStudioPointerDrag(
  currentPointer: () => number | undefined,
  onMove: (event: PointerEvent) => void,
  onEnd: () => void,
): () => void {
  const move = (event: PointerEvent) => {
    if (event.pointerId === currentPointer()) onMove(event)
  }
  const end = (event: PointerEvent) => {
    if (event.pointerId === currentPointer()) onEnd()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  window.addEventListener('blur', onEnd)
  return () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', onEnd)
    onEnd()
  }
}
