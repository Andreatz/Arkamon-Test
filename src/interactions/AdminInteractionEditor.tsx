import { useState } from 'react'
import { ALLENATORI, POKEMON_BASE, getAllenatoriInLuogo, getIncontri } from '@/data'
import { LOCAL_MAPS } from '@/data/localMaps'
import { assetUrl } from '@/utils/assetUrl'
import { useInteractionStore } from './interactionStore'
import { useInteractionRecoveryStatus } from './interactionRecovery'
import { newInteractionDefinition, type InteractionAction, type InteractionDefinition } from './types'
import { exportTiledInteractions, importTiledInteractions } from './tiledAdapter'
import './interactions.css'
import { hasArkaStore } from '@/shop/catalog'
import { completionPrerequisiteOptions } from './schema'

const maps = Object.values(LOCAL_MAPS)
const createDraft = (mapId: string, nodeId: string) => newInteractionDefinition(mapId, nodeId, `interaction-${crypto.randomUUID()}`)
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
export function AdminInteractionEditor() {
  const interactions = useInteractionStore((s) => s.interactions)
  const save = useInteractionStore((s) => s.saveInteraction)
  const remove = useInteractionStore((s) => s.removeInteraction)
  const importCatalog = useInteractionStore((s) => s.importCatalog)
  const exportCatalog = useInteractionStore((s) => s.exportCatalog)
  const replaceDamagedCatalog = useInteractionStore((s) => s.replaceDamagedCatalog)
  const recovery = useInteractionRecoveryStatus((s) => s.recovery)
  const [acceptRecovery, setAcceptRecovery] = useState(false)
  const [mapId, setMapId] = useState('Venezia')
  const map = LOCAL_MAPS[mapId]
  const [draft, setDraft] = useState<InteractionDefinition>(() => createDraft(mapId, map.startNode))
  const [transfer, setTransfer] = useState('')
  const [message, setMessage] = useState('')
  const [dimensions, setDimensions] = useState({ width: 1619, height: 971 })
  const change = (patch: Partial<InteractionDefinition>) => setDraft((current) => ({ ...current, ...patch }))
  const changeNumber = (section: 'cost' | 'reward', key: 'coins' | 'masterball', value: string) => {
    const number = Number(value)
    change({ [section]: key === 'coins' ? { ...draft[section], coins: number } : { ...draft[section], items: { masterball: number } } })
  }
  const trainers = getAllenatoriInLuogo(mapId)
  const bushes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter((bush) => getIncontri(mapId, bush).length)
  const selectPoint = (nodeId: string) => {
    const existing = interactions.find((entry) => entry.mapId === mapId && entry.nodeId === nodeId)
    setDraft(existing ? structuredClone(existing) : createDraft(mapId, nodeId)); setMessage('')
  }
  const chooseAction = (kind: InteractionAction['kind']) => {
    const action: InteractionAction = kind === 'trainer' ? { kind, trainerId: trainers[0]?.id ?? 0 }
      : kind === 'bush' ? { kind, bush: bushes[0] ?? 'A' } : kind === 'encounter' ? { kind, speciesId: POKEMON_BASE[0].id, level: 5 } : { kind }
    change({ action, repeatable: kind === 'shop' || ((kind === 'dialogue' || kind === 'heal') && draft.repeatable),
      ...(kind === 'shop' ? { cost: { coins: 0, items: {} }, reward: { coins: 0, items: {} } } : {}) })
  }
  const pointName = (id: string) => map.nodes.find((node) => node.id === id)?.label ?? id
  return <section className="interaction-editor" aria-label="Editor delle interazioni">
    <h2>Interazioni dei pallini</h2>
    <p>I numeri compaiono soltanto in questo editor. Le strade e le posizioni rimangono quelle delle foto. Le configurazioni vuote lasciano disponibili le attività attuali.</p>
    {recovery && <section role="alert" aria-label="Recupero catalogo interazioni">
      <h3>Catalogo da recuperare</h3><p>{recovery.error}</p>
      <p>Le interazioni salvate sono sospese. L’originale è conservato: scaricalo prima di sostituirlo con un catalogo valido nell’area Importa / esporta.</p>
      <button type="button" className="arka-button-secondary" disabled={recovery.raw === null} onClick={() => download('arkamon-interazioni-originale-da-recuperare.json', recovery.raw!)}>Scarica originale da recuperare</button>
    </section>}
    <label>Luogo<select value={mapId} onChange={(e) => {
      const id = e.target.value; setMapId(id); setDraft(createDraft(id, LOCAL_MAPS[id].startNode)); setMessage('')
    }}>{maps.map((item) => <option key={item.id} value={item.id}>{item.id.replace(/_/g, ' ')}</option>)}</select></label>
    {mapId === 'Percorso_15' && <p className="interaction-note">Luogo segreto: l’accesso conserva il requisito delle otto palestre. Nessun contenuto viene creato automaticamente.</p>}
    <div className="interaction-editor-map" role="group" aria-label="Scegli un pallino sulla mappa">
      <img src={assetUrl(map.image)} alt={`Riferimento ${mapId}`} onLoad={(e) => setDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
      {map.nodes.map((node) => <button type="button" key={node.id} aria-label={`Modifica ${node.label ?? node.id}`} aria-pressed={draft.nodeId === node.id}
        style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => selectPoint(node.id)}>{(node.label ?? node.id).replace('Punto ', '')}</button>)}
    </div>
    <div className="interaction-editor-fields">
      <label>Pallino<select value={draft.nodeId} onChange={(e) => selectPoint(e.target.value)}>{map.nodes.map((node) => <option key={node.id} value={node.id}>{node.label ?? node.id} · {node.id}</option>)}</select></label>
      <label>Interazione esistente<select value={interactions.some((entry) => entry.id === draft.id) ? draft.id : ''} onChange={(e) => {
        const entry = interactions.find((item) => item.id === e.target.value)
        if (entry) setDraft(structuredClone(entry)); else setDraft(createDraft(mapId, draft.nodeId))
      }}><option value="">Nuova interazione</option>{interactions.filter((entry) => entry.mapId === mapId).map((entry) => <option key={entry.id} value={entry.id}>{pointName(entry.nodeId)} · {entry.title}</option>)}</select></label>
      <label>Titolo<input maxLength={120} value={draft.title} onChange={(e) => change({ title: e.target.value })} /></label>
      <label>Dialogo o istruzioni<textarea rows={4} maxLength={4000} value={draft.dialogue} onChange={(e) => change({ dialogue: e.target.value })} /></label>
      <label>Completamento<select value={draft.scope} onChange={(e) => change({ scope: e.target.value as InteractionDefinition['scope'] })}>
        <option value="player">Indipendente per ogni giocatore</option><option value="shared">Condiviso: completa il primo giocatore</option>
      </select></label>
      <p className="interaction-note">Nel completamento condiviso il premio va soltanto al giocatore che completa per primo. I requisiti riguardano sempre il giocatore che agisce.</p>
      <label>Attività<select value={draft.action.kind} onChange={(e) => chooseAction(e.target.value as InteractionAction['kind'])}>
        <option value="dialogue">Dialogo / missione / ricompensa</option><option value="heal">Cura della squadra</option>
        <option value="shop" disabled={!hasArkaStore(mapId)}>Arkastore</option>
        <option value="trainer" disabled={!trainers.length}>Allenatore esistente</option><option value="bush" disabled={!bushes.length}>Cespuglio esistente</option><option value="encounter">Incontro definito dalla regia</option>
      </select></label>
      {draft.action.kind === 'trainer' && <label>Allenatore<select value={draft.action.trainerId} onChange={(e) => change({ action: { kind: 'trainer', trainerId: Number(e.target.value) } })}>{trainers.map((trainer) => <option value={trainer.id} key={trainer.id}>{trainer.nome} · {trainer.tipo}</option>)}</select></label>}
      {draft.action.kind === 'bush' && <label>Cespuglio<select value={draft.action.bush} onChange={(e) => change({ action: { kind: 'bush', bush: e.target.value } })}>{bushes.map((bush) => <option key={bush}>{bush}</option>)}</select></label>}
      {draft.action.kind === 'encounter' && <>
        <label>Specie<select value={draft.action.speciesId} onChange={(e) => { if (draft.action.kind === 'encounter') change({ action: { ...draft.action, speciesId: Number(e.target.value) } }) }}>{POKEMON_BASE.map((species) => <option key={species.id} value={species.id}>{species.nome}</option>)}</select></label>
        <label>Livello incontro<input type="number" min={5} max={100} value={draft.action.level} onChange={(e) => { if (draft.action.kind === 'encounter') change({ action: { ...draft.action, level: Number(e.target.value) } }) }} /></label>
      </>}
      <label className="interaction-check"><input type="checkbox" checked={draft.enabled} onChange={(e) => change({ enabled: e.target.checked })} />Disponibile nel gioco</label>
      <label className="interaction-check"><input type="checkbox" disabled={draft.action.kind !== 'dialogue' && draft.action.kind !== 'heal'} checked={draft.repeatable} onChange={(e) => change({ repeatable: e.target.checked })} />Ripetibile (dialoghi, cure e Arkastore, senza premio)</label>
      <fieldset><legend>Requisiti, controllati prima di consumare il turno</legend>
        <label>Livello minimo in squadra<input type="number" min={0} max={100} value={draft.requirements.minLevel} onChange={(e) => change({ requirements: { ...draft.requirements, minLevel: Number(e.target.value) } })} /></label>
        <label>Monete minime possedute<input type="number" min={0} max={1000000} value={draft.requirements.minCoins} onChange={(e) => change({ requirements: { ...draft.requirements, minCoins: Number(e.target.value) } })} /></label>
        <label>Masterball minime possedute<input type="number" min={0} max={999} value={draft.requirements.items.masterball ?? 0} onChange={(e) => change({ requirements: { ...draft.requirements, items: { masterball: Number(e.target.value) } } })} /></label>
        <div>Medaglie richieste</div>{ALLENATORI.filter((trainer) => trainer.tipo === 'Capopalestra').map((trainer) => <label key={trainer.id} className="interaction-check"><input type="checkbox" checked={draft.requirements.gymIds.includes(trainer.id)} onChange={(e) => change({ requirements: { ...draft.requirements, gymIds: e.target.checked ? [...draft.requirements.gymIds, trainer.id] : draft.requirements.gymIds.filter((id) => id !== trainer.id) } })} />{trainer.luogo}</label>)}
        <div>Tappe precedenti (anche in altre città)</div><p className="interaction-note">Sono selezionabili solo attività che registrano un completamento. Dialoghi e cure ripetibili, come i negozi, non possono essere prerequisiti.</p>{completionPrerequisiteOptions(interactions, draft).map((entry) => <label key={entry.id} className="interaction-check"><input type="checkbox" checked={draft.requirements.completedInteractions.includes(entry.id)} onChange={(e) => change({ requirements: { ...draft.requirements, completedInteractions: e.target.checked ? [...draft.requirements.completedInteractions, entry.id] : draft.requirements.completedInteractions.filter((id) => id !== entry.id) } })} />{entry.mapId.replace(/_/g, ' ')} · {entry.title}{entry.repeatable ? ' · Requisito storico impossibile: deselezionalo per correggerlo.' : ''}</label>)}
      </fieldset>
      {(['cost', 'reward'] as const).map((section) => <fieldset key={section} disabled={draft.action.kind === 'shop'}><legend>{section === 'cost' ? 'Costo all’avvio' : 'Ricompensa al completamento'}</legend>
        <label>{section === 'cost' ? 'Monete da spendere' : 'Monete da assegnare'}<input type="number" min={0} max={1000000} value={draft[section].coins} onChange={(e) => changeNumber(section, 'coins', e.target.value)} /></label>
        <label>{section === 'cost' ? 'Masterball da spendere' : 'Masterball da assegnare'}<input type="number" min={0} max={999} value={draft[section].items.masterball ?? 0} onChange={(e) => changeNumber(section, 'masterball', e.target.value)} /></label>
      </fieldset>)}
      <p className="interaction-note">L’interazione conclude il turno: due movimenti oppure un movimento e un’interazione. L’Arkastore si apre gratuitamente; solo l’acquisto del carrello conclude il turno. Negli incontri il costo viene speso all’avvio; il premio aggiuntivo arriva solo alla vittoria o cattura. Restano le ricompense ordinarie degli allenatori.</p>
      <div className="interaction-actions"><button className="arka-button" disabled={!!recovery} onClick={() => setMessage(save(draft) ?? 'Interazione salvata.')}>Salva interazione</button>
        <button className="arka-button-secondary" onClick={() => { setDraft(createDraft(mapId, draft.nodeId)); setMessage('Nuova interazione sul pallino selezionato.') }}>Nuova sul pallino</button>
        <button className="arka-button-secondary" disabled={!interactions.some((entry) => entry.id === draft.id)} onClick={() => { const error = remove(draft.id); setMessage(error ?? 'Interazione eliminata.'); if (!error) setDraft(createDraft(mapId, draft.nodeId)) }}>Elimina interazione</button>
      </div>
    </div>
    <p role="status" aria-live="polite">{message}</p>
    <details><summary>Importa / esporta e Tiled</summary>
      <p>Il catalogo JSON contiene tutte le mappe. Il file Tiled modifica soltanto le interazioni del luogo selezionato: coordinate e collegamenti del gioco non vengono riscritti. Metti il file Tiled accanto al PNG originale per visualizzare lo sfondo.</p>
      <label>Configurazione delle interazioni<textarea rows={8} value={transfer} onChange={(e) => setTransfer(e.target.value)} /></label>
      <div className="interaction-actions">
        <button className="arka-button-secondary" disabled={!!recovery} onClick={() => setTransfer(exportCatalog())}>Prepara esportazione</button>
        <button className="arka-button-secondary" disabled={!!recovery} onClick={() => download('arkamon-interazioni.json', exportCatalog())}>Scarica catalogo</button>
        <button className="arka-button" disabled={!!recovery} onClick={() => { const error = importCatalog(transfer); setMessage(error ?? 'Catalogo importato.'); if (!error) setDraft(createDraft(mapId, map.startNode)) }}>Sostituisci catalogo con questo JSON</button>
        <button className="arka-button-secondary" disabled={!!recovery} onClick={() => download(`${mapId}.tmj`, exportTiledInteractions(map, interactions, dimensions.width, dimensions.height))}>Esporta luogo per Tiled</button>
        <button className="arka-button-secondary" disabled={!!recovery} onClick={() => {
          const result = importTiledInteractions(transfer, interactions)
          if (result.error) setMessage(result.error)
          else setMessage(importCatalog(JSON.stringify({ version: 1, interactions: result.interactions })) ?? 'Interazioni del luogo importate da Tiled.')
        }}>Importa proprietà Tiled</button>
      </div>
      {recovery && <div>
        <label><input type="checkbox" checked={acceptRecovery} onChange={event => setAcceptRecovery(event.target.checked)} />Ho conservato l’originale e autorizzo la sostituzione con il catalogo JSON qui sopra.</label>
        <button type="button" className="arka-button" disabled={!acceptRecovery} onClick={() => {
          const error = replaceDamagedCatalog(transfer); setMessage(error ?? 'Catalogo recuperato e salvato.'); if (!error) { setAcceptRecovery(false); setDraft(createDraft(mapId, map.startNode)) }
        }}>Sostituisci archivio da recuperare</button>
      </div>}
    </details>
  </section>
}
