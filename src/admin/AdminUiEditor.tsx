import { useAdminStore } from '@store/adminStore'
import type { AdminThemeUi } from '@/theme/adminThemeTypes'
import { ADMIN_THEME_UI_BOUNDS } from '@/theme/adminThemeUiBounds'

type UiKey = keyof AdminThemeUi

const uiFields: {
  key: UiKey
  label: string
  description: string
  step: number
}[] = [
  {
    key: 'panelRadius',
    label: 'Raggio pannelli',
    description: 'Arrotonda o squadratura dei pannelli.',
    step: 1,
  },
  {
    key: 'buttonRadius',
    label: 'Raggio bottoni',
    description: 'Forma dei pulsanti principali e secondari.',
    step: 1,
  },
  {
    key: 'panelOpacity',
    label: 'Opacita pannelli',
    description: 'Trasparenza generale dei pannelli.',
    step: 0.01,
  },
  {
    key: 'shadowIntensity',
    label: 'Intensita ombra',
    description: 'Profondita visiva di pannelli e bottoni.',
    step: 0.05,
  },
  {
    key: 'buttonScale',
    label: 'Scala click bottoni',
    description: 'Quanto si comprimono i bottoni al click.',
    step: 0.01,
  },
  {
    key: 'stageScale',
    label: 'Scala stage',
    description: 'Ingrandimento dell area di gioco.',
    step: 0.01,
  },
  {
    key: 'fontScale',
    label: 'Scala font',
    description: 'Dimensione globale dei testi del gioco.',
    step: 0.01,
  },
  {
    key: 'mainMapRoadOpacity',
    label: 'Opacita strade mappa',
    description: 'Trasparenza del grigio interno delle strade.',
    step: 0.01,
  },
]

function formatValue(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2)
}

export function AdminUiEditor() {
  const ui = useAdminStore((state) => state.theme.ui)
  const updateUi = useAdminStore((state) => state.updateUi)

  return (
    <div className="space-y-4">
      {uiFields.map((field) => {
        const value = ui[field.key]

        return (
          <label
            key={field.key}
            className="block rounded-md border border-[var(--arka-border)] bg-[color-mix(in_srgb,var(--arka-surface)_88%,black)] p-3"
          >
            <span className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--arka-text)]">
              {field.label}
              <span className="font-mono text-[var(--arka-primary-hover)]">
                {formatValue(value)}
              </span>
            </span>
            <input
              type="range"
              min={ADMIN_THEME_UI_BOUNDS[field.key].min}
              max={ADMIN_THEME_UI_BOUNDS[field.key].max}
              step={field.step}
              value={value}
              onChange={(event) => updateUi(field.key, Number(event.target.value))}
              className="mt-3 w-full accent-[var(--arka-primary)]"
            />
            <span className="mt-2 block text-[11px] leading-snug text-[var(--arka-text-muted)]">
              {field.description}
            </span>
          </label>
        )
      })}
    </div>
  )
}
