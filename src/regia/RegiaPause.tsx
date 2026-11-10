import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRegiaStore } from './regiaStore'
import './regia.css'

export function RegiaPause() {
  const paused = useRegiaStore(state => state.paused)
  useEffect(() => {
    if (!paused) return
    const stage = document.querySelector<HTMLElement>('[data-presented-scene]')
    const before = stage?.inert ?? false
    if (stage) stage.inert = true
    const block = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-admin-overlay],.arka-pause-overlay')) return
      if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey)) return
      event.preventDefault(); event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', block, true)
    window.addEventListener('pointerdown', block, true)
    return () => {
      if (stage) stage.inert = before
      window.removeEventListener('keydown', block, true); window.removeEventListener('pointerdown', block, true)
    }
  }, [paused])
  return paused ? createPortal(<div className="arka-pause-overlay" role="dialog" aria-modal="true" aria-label="Pausa di regia"><div><h2>Pausa di regia</h2><p>La partita riprende dallo stesso punto.</p><button autoFocus onClick={() => useRegiaStore.getState().setPaused(false)}>Riprendi la regia</button></div></div>, document.body) : null
}
