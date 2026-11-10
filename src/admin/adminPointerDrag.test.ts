import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackAdminPointerDrag } from './adminPointerDrag'

describe('trascinamento layout Admin', () => {
  let target: EventTarget
  const move = (pointerId: number, type = 'pointermove') => {
    const event = new Event(type)
    Object.defineProperty(event, 'pointerId', { value: pointerId })
    target.dispatchEvent(event)
  }
  beforeEach(() => { target = new EventTarget(); vi.stubGlobal('window', target) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('non lascia che un secondo dito modifichi o termini il trascinamento del primo', () => {
    const onMove = vi.fn()
    const cleanup = trackAdminPointerDrag(7, onMove)
    move(8)
    move(8, 'pointerup')
    expect(onMove).not.toHaveBeenCalled()
    move(7)
    expect(onMove).toHaveBeenCalledOnce()
    cleanup()
  })

  it.each(['pointerup', 'pointercancel'])('libera i listener quando il dito termina con %s', (type) => {
    const onMove = vi.fn()
    trackAdminPointerDrag(7, onMove)
    move(7)
    move(7, type)
    move(7)
    expect(onMove).toHaveBeenCalledOnce()
  })

  it('annulla il trascinamento quando la finestra perde il focus', () => {
    const onMove = vi.fn()
    trackAdminPointerDrag(7, onMove)
    target.dispatchEvent(new Event('blur'))
    move(7)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('il cleanup allo smontaggio è ripetibile e non aggiorna più il layout', () => {
    const onMove = vi.fn()
    const cleanup = trackAdminPointerDrag(7, onMove)
    cleanup()
    cleanup()
    move(7)
    expect(onMove).not.toHaveBeenCalled()
  })
})
