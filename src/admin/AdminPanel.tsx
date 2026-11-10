import { lazy, Suspense, useEffect, useState } from 'react'
import { useAdminStore } from '@store/adminStore'
import { AdminAudiencePanel } from '@/audience/AdminAudiencePanel'
import { AdminAssetEditor } from './AdminAssetEditor'
import { AdminColorEditor } from './AdminColorEditor'
import { AdminImportExport } from './AdminImportExport'
import { AdminLayoutEditor } from './AdminLayoutEditor'
import { AdminPresetEditor } from './AdminPresetEditor'
import { AdminSpriteScaleEditor } from './AdminSpriteScaleEditor'
import { AdminUiEditor } from './AdminUiEditor'
import { AdminVfxEditor } from './AdminVfxEditor'
import './adminPanel.css'
import { PresentationProjectPanel } from '@/presentation/PresentationProjectPanel'
import { VisualRecoveryNotice } from '@/presentation/VisualRecoveryNotice'

const ADMIN_MODE_MARKER = 'ARKAMON_ADMIN_MODE_V1_THEME_EDITOR'
const AdminInteractionEditor = lazy(() => import('@/interactions/AdminInteractionEditor').then((module) => ({ default: module.AdminInteractionEditor })))
const AdminLeaguePanel = lazy(() => import('@/league/AdminLeaguePanel').then((module) => ({ default: module.AdminLeaguePanel })))
const AdminSessionPanel = lazy(() => import('@/readiness/AdminSessionPanel').then((module) => ({ default: module.AdminSessionPanel })))

type AdminTab = 'session' | 'project' | 'colors' | 'ui' | 'layout' | 'assets' | 'sprites' | 'vfx' | 'presets' | 'json' | 'audience' | 'interactions' | 'league'

const tabs: { id: AdminTab; label: string }[] = [
  { id: 'session', label: 'Regia' },
  { id: 'project', label: 'Progetto visivo' },
  { id: 'colors', label: 'Colori' },
  { id: 'ui', label: 'UI' },
  { id: 'layout', label: 'Layout' },
  { id: 'assets', label: 'Asset' },
  { id: 'sprites', label: 'Sprite' },
  { id: 'vfx', label: 'VFX' },
  { id: 'presets', label: 'Preset' },
  { id: 'json', label: 'Import/Export' },
  { id: 'audience', label: 'Pubblico' },
  { id: 'interactions', label: 'Interazioni' },
  { id: 'league', label: 'Lega' },
]

export function AdminPanel() {
  const [width, setWidth] = useState(() => { try { return Math.max(360, Math.min(1200, Number(localStorage.getItem('arkamon-admin-width')) || 720)) } catch { return 720 } })
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { try { localStorage.setItem('arkamon-admin-width', String(width)) } catch { /* Optional preference. */ } }, [width])
  const [activeTab, setActiveTab] = useState<AdminTab>('session')
  const setPanelOpen = useAdminStore((state) => state.setPanelOpen)

  return (
    <section
      id="arkamon-admin-panel"
      aria-label="Modalità Admin"
      data-admin-marker={ADMIN_MODE_MARKER}
      style={{ width: expanded ? 'calc(100% - 1.5rem)' : `min(${width}px, calc(100% - 1.5rem))`, height: expanded ? 'calc(100% - 4rem)' : undefined, fontSize: '14px' }}
      className="arka-admin-panel pointer-events-auto absolute right-3 top-12 flex max-h-[calc(100%-4rem)] w-[min(25rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[var(--arka-panel-radius)] border border-[var(--arka-primary)] bg-[var(--arka-surface)] text-[var(--arka-text)] shadow-2xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--arka-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-black leading-tight">Modalita Admin</h2>
          <span className="mt-1 inline-flex rounded-full border border-[var(--arka-primary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-normal text-[var(--arka-primary-hover)]">
            Console della regia
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          className="rounded-md border border-[var(--arka-border)] px-2 py-1 text-xs font-bold text-[var(--arka-text)] transition hover:bg-[var(--arka-surface-hover)]"
        >
          Chiudi
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--arka-border)] p-3">
        <a href="#ui-studio" onClick={() => setPanelOpen(false)} className="w-full rounded-md border border-[var(--arka-primary)] bg-[var(--arka-primary)] px-3 py-3 text-center font-bold text-[var(--arka-bg)]">
          Apri editor completo dell’interfaccia
        </a>
        <label className="flex items-center gap-2 text-xs">Larghezza pannello <input aria-label="Larghezza pannello Admin" type="range" min="360" max="1200" step="20" value={width} onChange={(e) => setWidth(Number(e.target.value))} /> {width}px</label>
        <button type="button" className="rounded border px-3 py-2" onClick={() => setExpanded(!expanded)}>{expanded ? 'Riduci pannello' : 'Espandi pannello'}</button>
        <details className="w-full"><summary className="cursor-pointer font-bold">Apri un laboratorio</summary><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{[
          ['battle-rules-lab', 'Moneta e status'], ['vfx-lab', 'VFX mosse'], ['audio-lab', 'Suoni'], ['arkamon-lab', 'Animazioni Arkamon'], ['dice-lab', 'Dadi'], ['transition-lab', 'Transizioni'], ['deposit-lab', 'Deposito'],
        ].map(([hash, label]) => <a key={hash} className="rounded border p-2 text-center" href={`#${hash}`} onClick={() => setPanelOpen(false)}>{label}</a>)}</div></details>
      </div>
      <VisualRecoveryNotice />
      <nav aria-label="Sezioni Admin" className="grid grid-cols-3 sm:grid-cols-5 border-b border-[var(--arka-border)] text-[10px] font-bold">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-10 px-1 py-2 leading-tight transition ${
              activeTab === tab.id
                ? 'bg-[var(--arka-primary)] text-[var(--arka-bg)]'
                : 'text-[var(--arka-text-muted)] hover:bg-[var(--arka-surface-hover)] hover:text-[var(--arka-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === 'session' ? <Suspense fallback={<p role="status">Caricamento regia…</p>}><AdminSessionPanel onNavigate={setActiveTab} /></Suspense> : null}
        {activeTab === 'project' ? <PresentationProjectPanel /> : null}
        {activeTab === 'colors' ? <AdminColorEditor /> : null}
        {activeTab === 'ui' ? <AdminUiEditor /> : null}
        {activeTab === 'layout' ? <AdminLayoutEditor /> : null}
        {activeTab === 'assets' ? <AdminAssetEditor /> : null}
        {activeTab === 'sprites' ? <AdminSpriteScaleEditor /> : null}
        {activeTab === 'vfx' ? <AdminVfxEditor /> : null}
        {activeTab === 'presets' ? <AdminPresetEditor /> : null}
        {activeTab === 'json' ? <AdminImportExport /> : null}
        {activeTab === 'audience' ? <AdminAudiencePanel /> : null}
        {activeTab === 'interactions' ? <Suspense fallback={<p role="status">Caricamento interazioni…</p>}><AdminInteractionEditor /></Suspense> : null}
        {activeTab === 'league' ? <Suspense fallback={<p role="status">Caricamento Lega…</p>}><AdminLeaguePanel /></Suspense> : null}
      </div>
    </section>
  )
}
