import { useState } from 'react'
import { POKEMON_BASE } from '@data/index'
import { useAdminStore } from '@store/adminStore'
import { assetUrl } from '@/utils/assetUrl'

const MIN_SCALE = 0.35
const MAX_SCALE = 3

export function AdminSpriteScaleEditor() {
  const [speciesId, setSpeciesId] = useState(POKEMON_BASE[0]?.id ?? 1)
  const spriteScales = useAdminStore((state) => state.theme.spriteScales)
  const updateSpriteScale = useAdminStore((state) => state.updateSpriteScale)
  const resetSpriteScales = useAdminStore((state) => state.resetSpriteScales)
  const species = POKEMON_BASE.find((entry) => entry.id === speciesId)
  const scale = spriteScales[String(speciesId)] ?? 1

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-3 py-2 text-xs text-[var(--arka-text-muted)]">
        Regola la dimensione dello sprite di ogni specie in battaglia. Il valore viene applicato sia allo sprite frontale sia a quello posteriore.
      </p>

      <label className="block text-xs font-bold text-[var(--arka-text)]">
        Pokemon
        <select
          value={speciesId}
          onChange={(event) => setSpeciesId(Number(event.target.value))}
          className="mt-2 h-10 w-full rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-2 text-xs text-[var(--arka-text)] outline-none focus:border-[var(--arka-primary)]"
        >
          {POKEMON_BASE.map((entry) => (
            <option key={entry.id} value={entry.id}>
              #{entry.id} {entry.nome}
            </option>
          ))}
        </select>
      </label>

      <div className="flex h-40 items-center justify-center overflow-visible rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)]">
        {species ? (
          <img
            src={assetUrl(`/sprites/front_sprites/${species.id}.png`)}
            alt={species.nome}
            className="h-28 w-28 object-contain"
            style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
          />
        ) : null}
      </div>

      <label className="block rounded-md border border-[var(--arka-border)] bg-[color-mix(in_srgb,var(--arka-surface)_88%,black)] p-3">
        <span className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--arka-text)]">
          Scala sprite
          <span className="font-mono text-[var(--arka-primary-hover)]">{scale.toFixed(2)}x</span>
        </span>
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step="0.05"
          value={scale}
          onChange={(event) => updateSpriteScale(speciesId, Number(event.target.value))}
          className="mt-3 w-full accent-[var(--arka-primary)]"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => updateSpriteScale(speciesId, 1)}
          className="rounded-md border border-[var(--arka-border)] px-3 py-2 text-xs font-bold text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
        >
          Reset selezionato
        </button>
        <button
          type="button"
          onClick={resetSpriteScales}
          className="rounded-md border border-[var(--arka-border)] px-3 py-2 text-xs font-bold text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
        >
          Reset tutti
        </button>
      </div>
    </div>
  )
}
