import { useState } from 'react'
import { exportVisualRecovery, preserveCurrentVisualSettings, useVisualRecoveryStatus } from './presentationTransaction'

export function VisualRecoveryNotice() {
  const { error, reloadRequired } = useVisualRecoveryStatus()
  const [downloadError, setDownloadError] = useState('')
  if (!error) return null
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([exportVisualRecovery()], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = 'arkamon-recupero-visivo-originali.json'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloadError('')
    } catch { setDownloadError('Download non riuscito. Gli originali restano conservati nel browser.') }
  }
  return <div role="alert" className="border-b border-amber-400 bg-slate-950 p-3 text-sm text-amber-200" style={{ flexShrink: 0 }}>
    <p>{error}</p>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={download}>Scarica originali del recupero</button>
      <button type="button" onClick={() => { if (reloadRequired || preserveCurrentVisualSettings().ok) window.location.reload() }}>{reloadRequired ? 'Riapri il gioco' : 'Conserva originali e mantieni impostazioni attuali'}</button></div>
    {downloadError && <p>{downloadError}</p>}
  </div>
}
