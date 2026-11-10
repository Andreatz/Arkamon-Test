import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listenToStudioPointerDrag } from './studioPointerDrag'

describe('UI Studio drag pointer ownership', () => {
  let target: EventTarget
  const dispatchPointer = (pointerId: number, type = 'pointermove') => {
    const event = new Event(type)
    Object.defineProperty(event, 'pointerId', { value: pointerId })
    target.dispatchEvent(event)
  }
  beforeEach(() => { target = new EventTarget(); vi.stubGlobal('window', target) })
  afterEach(() => vi.unstubAllGlobals())

  it('ignores movement and termination from another pointer and resumes the original drag', () => {
    let pointer: number | undefined = 7
    const onMove = vi.fn()
    const end = vi.fn(() => { pointer = undefined })
    const cleanup = listenToStudioPointerDrag(() => pointer, onMove, end)
    dispatchPointer(8)
    dispatchPointer(8, 'pointerup')
    dispatchPointer(8, 'pointercancel')
    expect(onMove).not.toHaveBeenCalled()
    expect(end).not.toHaveBeenCalled()
    dispatchPointer(7)
    expect(onMove).toHaveBeenCalledOnce()
    cleanup()
  })

  it.each(['pointerup', 'pointercancel', 'blur'])('stops stale movement after %s and permits a new drag', type => {
    let pointer: number | undefined = 7
    const onMove = vi.fn()
    const cleanup = listenToStudioPointerDrag(() => pointer, onMove, () => { pointer = undefined })
    if (type === 'blur') target.dispatchEvent(new Event(type))
    else dispatchPointer(7, type)
    dispatchPointer(7)
    expect(onMove).not.toHaveBeenCalled()
    pointer = 9
    dispatchPointer(9)
    expect(onMove).toHaveBeenCalledOnce()
    cleanup()
  })

  it('removes all listeners and clears the active drag when the editor unmounts', () => {
    let pointer: number | undefined = 7
    const onMove = vi.fn()
    const cleanup = listenToStudioPointerDrag(() => pointer, onMove, () => { pointer = undefined })
    cleanup()
    pointer = 7
    dispatchPointer(7)
    target.dispatchEvent(new Event('blur'))
    expect(onMove).not.toHaveBeenCalled()
    expect(pointer).toBe(7)
  })
})
