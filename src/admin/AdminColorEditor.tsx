import { useEffect, useState } from 'react'
import { useAdminStore } from '@store/adminStore'
import type { AdminThemeColors } from '@/theme/adminThemeTypes'

type ColorKey = keyof AdminThemeColors

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const colorFields: { key: ColorKey; label: string }[] = [
  { key: 'primary', label: 'Primario' },
  { key: 'primaryHover', label: 'Primario hover' },
  { key: 'bg', label: 'Sfondo' },
  { key: 'surface', label: 'Superficie' },
  { key: 'surfaceHover', label: 'Superficie hover' },
  { key: 'text', label: 'Testo' },
  { key: 'textMuted', label: 'Testo secondario' },
  { key: 'border', label: 'Bordo' },
  { key: 'hpHigh', label: 'HP alta' },
  { key: 'hpMid', label: 'HP media' },
  { key: 'hpLow', label: 'HP bassa' },
]

export function AdminColorEditor() {
  const colors = useAdminStore((state) => state.theme.colors)
  const updateColor = useAdminStore((state) => state.updateColor)
  const [drafts, setDrafts] = useState<AdminThemeColors>(colors)

  useEffect(() => {
    setDrafts(colors)
  }, [colors])

  const updateDraft = (key: ColorKey, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }))
    if (HEX_COLOR_PATTERN.test(value)) {
      updateColor(key, value)
    }
  }

  return (
    <div className="space-y-3">
      {colorFields.map((field) => {
        const value = drafts[field.key]
        const valid = HEX_COLOR_PATTERN.test(value)

        return (
          <label
            key={field.key}
            className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-[var(--arka-border)] bg-[color-mix(in_srgb,var(--arka-surface)_88%,black)] p-3"
          >
            <span className="text-xs font-bold text-[var(--arka-text)]">{field.label}</span>
            <span
              aria-hidden="true"
              className="h-6 w-6 rounded border border-[var(--arka-border)]"
              style={{ backgroundColor: valid ? value : 'transparent' }}
            />
            <input
              type="color"
              value={valid ? value : colors[field.key]}
              onChange={(event) => updateDraft(field.key, event.target.value)}
              className="h-8 w-full cursor-pointer rounded border border-[var(--arka-border)] bg-transparent"
            />
            <input
              type="text"
              value={value}
              onChange={(event) => updateDraft(field.key, event.target.value)}
              className={`h-8 rounded border bg-[var(--arka-bg)] px-2 text-xs font-mono text-[var(--arka-text)] outline-none ${
                valid ? 'border-[var(--arka-border)]' : 'border-red-500'
              }`}
              spellCheck={false}
            />
          </label>
        )
      })}
    </div>
  )
}
