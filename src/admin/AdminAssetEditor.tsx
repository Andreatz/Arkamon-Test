import { useEffect, useState } from 'react'
import { useAdminStore } from '@store/adminStore'
import type { AdminThemeAssets } from '@/theme/adminThemeTypes'
import { assetUrl } from '@/utils/assetUrl'
import { isSafeThemeAssetPath } from '@/theme/adminThemeAssetPaths'

type AssetKey = keyof AdminThemeAssets

const assetFields: {
  key: AssetKey
  label: string
  options: { label: string; value: string }[]
}[] = [
  {
    key: 'titleLogo',
    label: 'Logo titolo',
    options: [
      { label: 'Default', value: '' },
      { label: 'Logo Arkamon', value: '/ui/logo_arkamon.png' },
      { label: 'Start button', value: '/ui/start_button.png' },
    ],
  },
  {
    key: 'titleBackground',
    label: 'Sfondo titolo',
    options: [
      { label: 'Default', value: '' },
      { label: 'Venezia', value: '/backgrounds/venezia.png' },
      { label: 'Laboratorio', value: '/backgrounds/laboratory.png' },
      { label: 'Foresta battaglia', value: '/backgrounds/battle_forest.jpg' },
    ],
  },
  {
    key: 'battleBackground',
    label: 'Sfondo battaglia',
    options: [
      { label: 'Default', value: '' },
      { label: 'Foresta battaglia', value: '/backgrounds/battle_forest.jpg' },
      { label: 'Percorso 1', value: '/backgrounds/route_1.jpg' },
      { label: 'Percorso 6', value: '/backgrounds/route_6.jpg' },
      { label: 'Napoli', value: '/backgrounds/napoli.png' },
    ],
  },
  {
    key: 'panelTexture',
    label: 'Texture pannelli',
    options: [
      { label: 'Nessuna', value: '' },
      { label: 'Infobox', value: '/ui/infobox.png' },
      { label: 'Box mosse', value: '/ui/moves_box.png' },
      { label: 'Pulsante generale', value: '/ui/general_button.png' },
      { label: 'Box deposito', value: '/ui/box_deposit.png' },
    ],
  },
]

function isSafeAssetPath(path: string): boolean {
  return path === '' || isSafeThemeAssetPath(path)
}

function AssetPreview({ path }: { path: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [path])

  if (!path) {
    return (
      <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-[var(--arka-border)] bg-[var(--arka-bg)] text-xs text-[var(--arka-text-muted)]">
        Default
      </div>
    )
  }

  if (!isSafeAssetPath(path) || failed) {
    return (
      <div className="flex h-20 items-center justify-center rounded-md border border-red-500 bg-[var(--arka-bg)] px-3 text-center text-xs text-red-300">
        Preview non disponibile
      </div>
    )
  }

  return (
    <img
      src={assetUrl(path)}
      alt=""
      className="h-20 w-full rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] object-contain"
      onError={() => setFailed(true)}
    />
  )
}

export function AdminAssetEditor() {
  const assets = useAdminStore((state) => state.theme.assets)
  const updateAsset = useAdminStore((state) => state.updateAsset)

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-3 py-2 text-xs text-[var(--arka-text-muted)]">
        Scegli asset gia presenti in public o inserisci un path manuale che inizi con /.
      </p>

      {assetFields.map((field) => {
        const value = assets[field.key] ?? ''
        const valid = isSafeAssetPath(value)

        return (
          <section
            key={field.key}
            className="rounded-md border border-[var(--arka-border)] bg-[color-mix(in_srgb,var(--arka-surface)_88%,black)] p-3"
          >
            <h3 className="mb-3 text-sm font-black text-[var(--arka-text)]">{field.label}</h3>
            <div className="grid gap-2">
              <select
                value={field.options.some((option) => option.value === value) ? value : ''}
                onChange={(event) => updateAsset(field.key, event.target.value)}
                className="h-9 rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)] outline-none focus:border-[var(--arka-primary)]"
              >
                {field.options.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={value}
                onChange={(event) => updateAsset(field.key, event.target.value)}
                className={`h-9 rounded-md border bg-[var(--arka-bg)] px-2 font-mono text-xs text-[var(--arka-text)] outline-none ${
                  valid ? 'border-[var(--arka-border)]' : 'border-red-500'
                }`}
                placeholder="/backgrounds/battle_forest.jpg"
                spellCheck={false}
              />

              <AssetPreview path={value} />
            </div>
          </section>
        )
      })}
    </div>
  )
}
