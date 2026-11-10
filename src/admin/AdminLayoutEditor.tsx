import { useAdminStore } from '@store/adminStore'

export function AdminLayoutEditor() {
  const layoutEditing = useAdminStore((state) => state.layoutEditing)
  const layoutUndoCount = useAdminStore((state) => state.layoutUndoStack.length)
  const setLayoutEditing = useAdminStore((state) => state.setLayoutEditing)
  const undoLayoutChange = useAdminStore((state) => state.undoLayoutChange)
  const resetBattleLayout = useAdminStore((state) => state.resetBattleLayout)
  const resetMainMapNodePositions = useAdminStore((state) => state.resetMainMapNodePositions)
  const resetMainMapRoads = useAdminStore((state) => state.resetMainMapRoads)
  const resetSceneLayout = useAdminStore((state) => state.resetSceneLayout)

  return (
    <div className="space-y-4">
      <p className="arka-authoring-route">Per l’aspetto delle schermate usa <a href="#ui-studio" onClick={() => useAdminStore.getState().setPanelOpen(false)}>Studio interfaccia</a>. Questi strumenti mantengono la geometria delle strade e i layout storici; non sostituiscono la schermata giocata.</p>
      <section className="rounded-md border border-[var(--arka-border)] bg-[color-mix(in_srgb,var(--arka-surface)_88%,black)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-[var(--arka-text)]">
              Geometria e layout storici
            </h3>
            <p className="mt-1 text-xs leading-snug text-[var(--arka-text-muted)]">
              Trascina le etichette per spostare, R per ridimensionare, T per muovere il testo interno. Gli elementi si agganciano a bordi e centri vicini.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[var(--arka-text)]">
            <input
              type="checkbox"
              checked={layoutEditing}
              onChange={(event) => setLayoutEditing(event.target.checked)}
              className="h-4 w-4 accent-[var(--arka-primary)]"
            />
            Modifica
          </label>
        </div>

        <button
          type="button"
          onClick={resetBattleLayout}
          className="mt-4 w-full rounded-md border border-[var(--arka-primary)] px-3 py-2 text-sm font-black text-[var(--arka-primary-hover)] transition hover:bg-[var(--arka-surface-hover)]"
        >
          Ripristina layout battaglia
        </button>
        <button
          type="button"
          onClick={undoLayoutChange}
          disabled={layoutUndoCount === 0}
          className="mt-2 w-full rounded-md border border-[var(--arka-border)] px-3 py-2 text-sm font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          Undo ultima modifica
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={resetMainMapNodePositions}
            className="rounded-md border border-[var(--arka-border)] px-2 py-2 text-xs font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
          >
            Nodi mappa
          </button>
          <button
            type="button"
            onClick={() => resetSceneLayout('mapGrid')}
            className="rounded-md border border-[var(--arka-border)] px-2 py-2 text-xs font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
          >
            Mappa
          </button>
          <button
            type="button"
            onClick={resetMainMapRoads}
            className="rounded-md border border-[var(--arka-border)] px-2 py-2 text-xs font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
          >
            Strade mappa
          </button>
          <button
            type="button"
            onClick={() => resetSceneLayout('mainMapUi')}
            className="rounded-md border border-[var(--arka-border)] px-2 py-2 text-xs font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
          >
            UI mappa
          </button>
          <button
            type="button"
            onClick={() => resetSceneLayout('deposit')}
            className="rounded-md border border-[var(--arka-border)] px-2 py-2 text-xs font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
          >
            Deposito
          </button>
          <button
            type="button"
            onClick={() => resetSceneLayout('luogo')}
            className="rounded-md border border-[var(--arka-border)] px-2 py-2 text-xs font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
          >
            Percorsi / Citta
          </button>
          <button
            type="button"
            onClick={() => resetSceneLayout('evolution')}
            className="rounded-md border border-[var(--arka-border)] px-2 py-2 text-xs font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
          >
            Evoluzione
          </button>
        </div>
      </section>

      <p className="rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-3 py-2 text-xs text-[var(--arka-text-muted)]">
        Le posizioni vengono salvate nel tema admin e non modificano il salvataggio della partita.
        I layout Percorsi e Citta sono condivisi: una modifica vale per ogni luogo dello stesso tipo.
      </p>
    </div>
  )
}
