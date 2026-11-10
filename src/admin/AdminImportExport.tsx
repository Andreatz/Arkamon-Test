import { useMemo, useState } from 'react'
import { useAdminStore } from '@store/adminStore'
import { parseThemeJson } from '@/theme/parseAdminTheme'
import { assertVisualStorageWritable } from '@/presentation/presentationTransaction'
export { parseThemeJson } from '@/theme/parseAdminTheme'

export function AdminImportExport() {
  const theme = useAdminStore((state) => state.theme)
  const importTheme = useAdminStore((state) => state.importTheme)
  const json = useMemo(() => JSON.stringify(theme, null, 2), [theme])
  const [importValue, setImportValue] = useState(json)
  const [message, setMessage] = useState<string | null>(null)

  const copyJson = async () => {
    if (!navigator.clipboard) {
      setMessage('Appunti non disponibili in questo browser.')
      return
    }

    try {
      await navigator.clipboard.writeText(json)
      setMessage('JSON copiato negli appunti.')
    } catch {
      setMessage('Impossibile accedere agli appunti. Usa Scarica per esportare il tema.')
    }
  }

  const downloadJson = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'arkamon-theme.json'
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Export pronto come arkamon-theme.json.')
  }

  const importJson = () => {
    const result = parseThemeJson(importValue)
    if (result.theme === null) {
      setMessage(result.error)
      return
    }

    try { assertVisualStorageWritable(); importTheme(result.theme); setMessage('Tema importato correttamente.') }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Tema non importato.') }
  }

  return (
    <div className="space-y-4">
      {theme.design?.media.some(entry => entry.source.startsWith('ui-media:')) ? <p className="rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-3 py-2 text-xs text-[var(--arka-text-muted)]">Questo JSON conserva i riferimenti ai file importati nel browser. Per trasferire anche immagini e font su un altro dispositivo, usa Esporta nell’Editor delle schermate.</p> : null}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-[var(--arka-text)]">Tema corrente</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyJson}
              className="rounded-md bg-[var(--arka-primary)] px-3 py-1.5 text-xs font-black text-[var(--arka-bg)] transition hover:bg-[var(--arka-primary-hover)]"
            >
              Copia
            </button>
            <button
              type="button"
              onClick={downloadJson}
              className="rounded-md border border-[var(--arka-border)] px-3 py-1.5 text-xs font-black text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
            >
              Scarica
            </button>
          </div>
        </div>
        <textarea
          aria-label="JSON del tema corrente"
          value={json}
          readOnly
          className="h-40 w-full resize-none rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] p-3 font-mono text-[11px] text-[var(--arka-text)] outline-none"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-black text-[var(--arka-text)]">Importa JSON</h3>
        <textarea
          aria-label="JSON del tema da importare"
          value={importValue}
          onChange={(event) => setImportValue(event.target.value)}
          className="h-40 w-full resize-none rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] p-3 font-mono text-[11px] text-[var(--arka-text)] outline-none focus:border-[var(--arka-primary)]"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={importJson}
          className="mt-2 w-full rounded-md bg-[var(--arka-primary)] px-3 py-2 text-sm font-black text-[var(--arka-bg)] transition hover:bg-[var(--arka-primary-hover)]"
        >
          Importa tema
        </button>
      </div>

      {message ? (
        <p role="status" className="rounded-md border border-[var(--arka-border)] bg-[var(--arka-bg)] px-3 py-2 text-xs text-[var(--arka-text-muted)]">
          {message}
        </p>
      ) : null}
    </div>
  )
}
