import { useAdminStore } from '@store/adminStore'
import { adminThemePresets } from '@/theme/adminThemePresets'

export function AdminPresetEditor() {
  const applyVisualTheme = useAdminStore((state) => state.applyVisualTheme)

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-3 py-2 text-xs text-[var(--arka-text-muted)]">
        I preset cambiano colori, pannelli e asset senza modificare layout, strade o posizioni.
      </p>

      {adminThemePresets.map((preset) => (
        <article
          key={preset.id}
          className="rounded-md border border-[var(--arka-border)] bg-[color-mix(in_srgb,var(--arka-surface)_88%,black)] p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-[var(--arka-text)]">{preset.name}</h3>
            <button
              type="button"
              onClick={() => applyVisualTheme(preset)}
              className="rounded-md bg-[var(--arka-primary)] px-3 py-1.5 text-xs font-black text-[var(--arka-bg)] transition hover:bg-[var(--arka-primary-hover)]"
            >
              Applica
            </button>
          </div>

          <div className="mt-3 flex gap-1.5">
            {[
              preset.colors.primary,
              preset.colors.bg,
              preset.colors.surface,
              preset.colors.text,
              preset.colors.hpHigh,
              preset.colors.hpMid,
              preset.colors.hpLow,
            ].map((color) => (
              <span
                key={color}
                className="h-5 flex-1 rounded border border-[var(--arka-border)]"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </article>
      ))}

      <button
        type="button"
        onClick={() => applyVisualTheme(adminThemePresets[0])}
        className="w-full rounded-md border border-[var(--arka-primary)] px-3 py-2 text-sm font-black text-[var(--arka-primary-hover)] transition hover:bg-[var(--arka-surface-hover)]"
      >
        Ripristina stile Arkamon Classico
      </button>
    </div>
  )
}
