import {
  useLayoutEffect,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useAdminStore } from '@store/adminStore'
import type { AdminLayoutRect } from '@/theme/adminThemeTypes'
import { trackAdminPointerDrag } from './adminPointerDrag'

const LAYOUT_SNAP_DISTANCE = 0.85
const CONTENT_OFFSET_LIMIT = 80

function clampLayoutValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function nearestSnap(value: number, candidates: number[]): number | null {
  let nearest: number | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate)
    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }

  return nearest !== null && nearestDistance <= LAYOUT_SNAP_DISTANCE ? nearest : null
}

function getLayoutGuides(root: HTMLElement, current: HTMLElement): {
  x: number[]
  y: number[]
} {
  const rootBounds = root.getBoundingClientRect()
  const x = [0, 50, 100]
  const y = [0, 50, 100]

  root.querySelectorAll<HTMLElement>('[data-admin-layout-item="true"]').forEach((element) => {
    if (element === current) return

    const bounds = element.getBoundingClientRect()
    const left = ((bounds.left - rootBounds.left) / rootBounds.width) * 100
    const top = ((bounds.top - rootBounds.top) / rootBounds.height) * 100
    const width = (bounds.width / rootBounds.width) * 100
    const height = (bounds.height / rootBounds.height) * 100

    x.push(left, left + width / 2, left + width)
    y.push(top, top + height / 2, top + height)
  })

  return { x, y }
}

function snapRect(rect: AdminLayoutRect, mode: 'move' | 'resize', guides: { x: number[]; y: number[] }): AdminLayoutRect {
  const next = { ...rect }

  if (mode === 'move') {
    const snapLeft = nearestSnap(next.x, guides.x)
    const snapCenterX = nearestSnap(next.x + next.w / 2, guides.x)
    const snapRight = nearestSnap(next.x + next.w, guides.x)
    if (snapLeft !== null) next.x = snapLeft
    else if (snapCenterX !== null) next.x = snapCenterX - next.w / 2
    else if (snapRight !== null) next.x = snapRight - next.w

    const snapTop = nearestSnap(next.y, guides.y)
    const snapCenterY = nearestSnap(next.y + next.h / 2, guides.y)
    const snapBottom = nearestSnap(next.y + next.h, guides.y)
    if (snapTop !== null) next.y = snapTop
    else if (snapCenterY !== null) next.y = snapCenterY - next.h / 2
    else if (snapBottom !== null) next.y = snapBottom - next.h

    next.x = clampLayoutValue(next.x, 0, 100 - next.w)
    next.y = clampLayoutValue(next.y, 0, 100 - next.h)
    return next
  }

  const snapRight = nearestSnap(next.x + next.w, guides.x)
  if (snapRight !== null) {
    next.w = snapRight - next.x
  }

  const snapBottom = nearestSnap(next.y + next.h, guides.y)
  if (snapBottom !== null) {
    next.h = snapBottom - next.y
  }

  next.w = clampLayoutValue(next.w, 4, 100 - next.x)
  next.h = clampLayoutValue(next.h, 4, 100 - next.y)
  return next
}

export function AdminLayoutItem({
  rootSelector,
  label,
  rect,
  editing,
  onChange,
  children,
  zIndex = 20,
  uiId,
  layoutOwner,
}: {
  rootSelector: string
  label: string
  rect: AdminLayoutRect
  editing: boolean
  onChange: (rect: AdminLayoutRect) => void
  children: ReactNode
  zIndex?: number
  uiId?: string
  layoutOwner?: string
}) {
  const beginLayoutChange = useAdminStore((state) => state.beginLayoutChange)
  const itemRef = useRef<HTMLDivElement>(null)
  const dragCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanup.current?.(), [editing])

  useLayoutEffect(() => {
    const item = itemRef.current
    if (!item) return

    item.querySelectorAll<HTMLElement>('.arka-layout-content').forEach((element, index) => {
      const key = element.dataset.adminLayoutTextKey ?? `content-${index}`
      const offset = rect.contentOffsets?.[key]
      element.dataset.adminLayoutTextKey = key
      element.style.setProperty('--arka-layout-local-content-x', `${offset?.x ?? 0}%`)
      element.style.setProperty('--arka-layout-local-content-y', `${offset?.y ?? 0}%`)
    })
  })

  const startTextEdit = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing) return

    const target = (event.target as HTMLElement).closest<HTMLElement>('.arka-layout-content')
    if (!target || !event.currentTarget.contains(target)) return

    const key = target.dataset.adminLayoutTextKey
    if (!key) return

    event.preventDefault()
    event.stopPropagation()
    dragCleanup.current?.()
    beginLayoutChange()

    const bounds = target.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const startOffset = rect.contentOffsets?.[key] ?? { x: 0, y: 0 }

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / Math.max(1, bounds.width)) * 100
      const dy = ((moveEvent.clientY - startY) / Math.max(1, bounds.height)) * 100

      onChange({
        ...rect,
        contentOffsets: {
          ...rect.contentOffsets,
          [key]: {
            x: clampLayoutValue(startOffset.x + dx, -CONTENT_OFFSET_LIMIT, CONTENT_OFFSET_LIMIT),
            y: clampLayoutValue(startOffset.y + dy, -CONTENT_OFFSET_LIMIT, CONTENT_OFFSET_LIMIT),
          },
        },
      })
    }

    dragCleanup.current = trackAdminPointerDrag(event.pointerId, onPointerMove)
  }

  const blockTextClickWhileEditing = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!editing) return
    if (!(event.target as HTMLElement).closest('.arka-layout-content')) return

    event.preventDefault()
    event.stopPropagation()
  }

  const startPointerEdit = (
    event: ReactPointerEvent<HTMLButtonElement>,
    mode: 'move' | 'resize' | 'content'
  ) => {
    if (!editing) return

    const root = event.currentTarget.closest(rootSelector) as HTMLElement | null
    const item = event.currentTarget.closest('[data-admin-layout-item="true"]') as HTMLElement | null
    if (!root || !item) return

    event.preventDefault()
    event.stopPropagation()
    dragCleanup.current?.()
    event.currentTarget.setPointerCapture(event.pointerId)
    beginLayoutChange()

    const rootBounds = root.getBoundingClientRect()
    const itemBounds = item.getBoundingClientRect()
    const guides = getLayoutGuides(root, item)
    const startX = event.clientX
    const startY = event.clientY
    const startRect = rect

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (mode === 'content') {
        const dx = ((moveEvent.clientX - startX) / itemBounds.width) * 100
        const dy = ((moveEvent.clientY - startY) / itemBounds.height) * 100

        onChange({
          ...startRect,
          contentX: clampLayoutValue((startRect.contentX ?? 0) + dx, -CONTENT_OFFSET_LIMIT, CONTENT_OFFSET_LIMIT),
          contentY: clampLayoutValue((startRect.contentY ?? 0) + dy, -CONTENT_OFFSET_LIMIT, CONTENT_OFFSET_LIMIT),
        })
        return
      }

      const dx = ((moveEvent.clientX - startX) / rootBounds.width) * 100
      const dy = ((moveEvent.clientY - startY) / rootBounds.height) * 100

      if (mode === 'move') {
        onChange(snapRect({
          ...startRect,
          x: clampLayoutValue(startRect.x + dx, 0, 100 - startRect.w),
          y: clampLayoutValue(startRect.y + dy, 0, 100 - startRect.h),
        }, 'move', guides))
        return
      }

      onChange(snapRect({
        ...startRect,
        w: clampLayoutValue(startRect.w + dx, 4, 100 - startRect.x),
        h: clampLayoutValue(startRect.h + dy, 4, 100 - startRect.y),
      }, 'resize', guides))
    }

    dragCleanup.current = trackAdminPointerDrag(event.pointerId, onPointerMove)
  }

  return (
    <div
      ref={itemRef}
      data-admin-layout-item="true"
      data-ui-label={label}
      data-ui-id={uiId ?? `layout.${label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
      data-ui-layout-owner={layoutOwner}
      data-admin-layout-editing={editing ? 'true' : 'false'}
      onPointerDownCapture={startTextEdit}
      onClickCapture={blockTextClickWhileEditing}
      className="absolute"
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        zIndex,
        '--arka-layout-group-content-x': `${rect.contentX ?? 0}%`,
        '--arka-layout-group-content-y': `${rect.contentY ?? 0}%`,
      } as CSSProperties}
    >
      {editing ? (
        <button
          type="button"
          onPointerDown={(event) => startPointerEdit(event, 'move')}
          className="absolute -top-6 left-0 z-[80] cursor-move rounded border border-amber-300 bg-slate-950/90 px-2 py-1 text-[10px] font-black text-amber-200 shadow-lg"
        >
          {label}
        </button>
      ) : null}
      {editing ? (
        <button
          type="button"
          aria-label={`Sposta contenuto ${label}`}
          onPointerDown={(event) => startPointerEdit(event, 'content')}
          className="absolute -top-6 right-7 z-[80] h-5 w-5 cursor-move rounded border border-sky-300 bg-slate-950/90 text-[10px] font-black text-sky-200 shadow-lg"
        >
          T
        </button>
      ) : null}
      {editing ? (
        <button
          type="button"
          aria-label={`Ridimensiona ${label}`}
          onPointerDown={(event) => startPointerEdit(event, 'resize')}
          className="absolute -bottom-2 -right-2 z-[80] h-5 w-5 cursor-nwse-resize rounded border border-amber-300 bg-slate-950/90 text-[10px] font-black text-amber-200 shadow-lg"
        >
          R
        </button>
      ) : null}
      {editing ? (
        <div className="pointer-events-none absolute inset-0 z-[70] rounded border border-dashed border-amber-300/80" />
      ) : null}
      {children}
    </div>
  )
}
