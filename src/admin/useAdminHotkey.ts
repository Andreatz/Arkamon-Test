import { useEffect } from 'react'
import { useAdminStore } from '@store/adminStore'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  )
}

export function useAdminHotkey(): void {
  const enabled = useAdminStore((state) => state.enabled)
  const panelOpen = useAdminStore((state) => state.panelOpen)
  const layoutEditing = useAdminStore((state) => state.layoutEditing)
  const layoutUndoCount = useAdminStore((state) => state.layoutUndoStack.length)
  const toggleEnabled = useAdminStore((state) => state.toggleEnabled)
  const setPanelOpen = useAdminStore((state) => state.setPanelOpen)
  const undoLayoutChange = useAdminStore((state) => state.undoLayoutChange)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const primaryModifier = event.ctrlKey || event.metaKey

      if (primaryModifier && event.shiftKey && key === 'a') {
        event.preventDefault()

        if (!enabled) {
          toggleEnabled()
          setPanelOpen(true)
          return
        }

        setPanelOpen(!panelOpen)
        return
      }

      if (
        primaryModifier &&
        !event.shiftKey &&
        key === 'z' &&
        enabled &&
        layoutEditing &&
        layoutUndoCount > 0 &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault()
        undoLayoutChange()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    enabled,
    layoutEditing,
    layoutUndoCount,
    panelOpen,
    setPanelOpen,
    toggleEnabled,
    undoLayoutChange,
  ])
}
