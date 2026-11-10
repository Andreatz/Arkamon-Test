/** A drag belongs to one pointer and releases global listeners on every exit. */
export function trackAdminPointerDrag(pointerId: number, onMove: (event: PointerEvent) => void): () => void {
  let active = true
  const move = (event: PointerEvent) => {
    if (active && event.pointerId === pointerId) onMove(event)
  }
  const finish = (event: PointerEvent) => {
    if (event.pointerId === pointerId) dispose()
  }
  const dispose = () => {
    if (!active) return
    active = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    window.removeEventListener('blur', dispose)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  window.addEventListener('blur', dispose)
  return dispose
}
