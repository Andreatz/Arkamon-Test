import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { makeDialogBackgroundInert } from '@/components/battle/modalFocus'
import { DialogNavigationContext, type DialogBackHandler } from './DialogNavigation'
import { assetUrl } from '@/utils/assetUrl'
import { MENU_ARTWORK_MODE, MENU_SVG_ARTWORK_ENABLED } from '@/player-ui/uiAppearancePolicy'
import './studioArtwork.css'
import './menuArtworkFallback.css'

export function GameDialog({ title, onClose, children, className = '', showCloseButton = true }: { title: string; onClose: () => void; children: ReactNode; className?: string; showCloseButton?: boolean }) {
  const root = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  const back = useRef<DialogBackHandler | null>(null)
  close.current = onClose
  useEffect(() => {
    const dialog = root.current
    if (!dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const release = makeDialogBackgroundInert(dialog)
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]'))
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden],[inert]')
        && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
      .sort((a, b) => (a.tabIndex || Number.MAX_SAFE_INTEGER) - (b.tabIndex || Number.MAX_SAFE_INTEGER))
    ;(focusables()[0] ?? dialog).focus()
    const keys = (event: KeyboardEvent) => {
      if (dialog.closest('[inert]')) return
      if (event.target instanceof Element && event.target.closest('[data-battle-log-dialog]')) return
      if (event.key === 'Escape') { if (back.current?.(event)) return; event.preventDefault(); close.current(); return }
      if (event.key !== 'Tab') return
      const items = focusables(), current = items.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey ? (current <= 0 ? items.length - 1 : current - 1) : (current + 1) % items.length
      event.preventDefault(); (items[next] ?? dialog).focus()
    }
    const refocus = (event: FocusEvent) => {
      if (dialog.closest('[inert]')) return
      if (event.target instanceof Element && event.target.closest('[data-battle-log-dialog]')) return
      if (event.target instanceof Node && !dialog.contains(event.target)) (focusables()[0] ?? dialog).focus()
    }
    document.addEventListener('keydown', keys, true)
    document.addEventListener('focusin', refocus)
    return () => { document.removeEventListener('keydown', keys, true); document.removeEventListener('focusin', refocus); release(); if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(<div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 p-3" data-game-dialog>
    <section ref={root} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col rounded-xl border border-violet-400 bg-slate-950 text-white shadow-2xl ${className}`}>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-600 p-4"><h2 className="text-xl font-bold">{title}</h2>{showCloseButton && <button type="button" onClick={onClose} className="studio-dialog-close" data-menu-artwork={MENU_ARTWORK_MODE} aria-label="Chiudi">{MENU_SVG_ARTWORK_ENABLED ? <img src={assetUrl('/ui/studio/Scuro/button-chiusura-rosso.svg')} alt="" draggable={false} /> : <span aria-hidden="true">×</span>}</button>}</header>
      <div className="min-h-0 overflow-y-auto p-4"><DialogNavigationContext.Provider value={handler => { back.current = handler; return () => { if (back.current === handler) back.current = null } }}>{children}</DialogNavigationContext.Provider></div>
    </section>
  </div>, document.body)
}
