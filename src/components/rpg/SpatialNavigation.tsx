import { useEffect, useRef, type HTMLAttributes, type KeyboardEvent } from 'react'

export function nextSpatialIndex(index: number, count: number, key: string, columns = 1): number {
  if (!count) return -1
  const step = key === 'ArrowDown' ? columns : key === 'ArrowUp' ? -columns : key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return Math.max(0, Math.min(count - 1, index + step))
}

/** Only a focused list owns its arrows. Inputs retain all native editing keys. */
export function SpatialNavigation({ children, columns = 1, selectOnFocus = true, onKeyDown, ...props }: HTMLAttributes<HTMLDivElement> & { columns?: number; selectOnFocus?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const group = root.current
    if (!group) return
    const items = [...group.querySelectorAll<HTMLButtonElement>('[data-rpg-item]:not(:disabled)')]
    const chosen = items.find(item => item === document.activeElement)
      ?? items.find(item => item.getAttribute('aria-pressed') === 'true') ?? items[0]
    items.forEach(item => { item.tabIndex = item === chosen ? 0 : -1 })
  }, [children])
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const target = event.target as HTMLElement
    if (target.matches('input, select, textarea, [contenteditable="true"]')) return
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-rpg-item]:not(:disabled)')]
    const current = items.findIndex(item => item === target || item.contains(target))
    if (current < 0) return
    const next = items[nextSpatialIndex(current, items.length, event.key, columns)]
    if (!next) return
    event.preventDefault()
    items.forEach(item => { item.tabIndex = item === next ? 0 : -1 })
    next.focus()
    if (selectOnFocus) next.click()
  }
  return <div {...props} ref={root} data-rpg-navigation onKeyDown={navigate}>{children}</div>
}
