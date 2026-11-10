import { useLayoutEffect, useRef, useState } from 'react'
import { ARKAMON_SPLASH_ARTWORK } from '@/player-ui/reference/splashArtwork'
import { getPokemon, POKEMON_BASE } from '@/data'
import './referenceUiPreview.css'

const screens = [['menu','Menù principale'],['squadra','Squadra'],['deposito','Deposito'],['arkadex','Arkadex'],['negozio','Negozio'],['borsa','Borsa'],['analisi','Analisi'],['citta','Mappa locale']] as const
const splashArtworks = Object.values(ARKAMON_SPLASH_ARTWORK)
type Screen = typeof screens[number][0]
export function ReferenceUiPreview() {
  const [screen,setScreen] = useState<Screen>(()=>screens.find(([id])=>id === new URLSearchParams(window.location.search).get('screen'))?.[0] ?? 'menu')
  const [splashId,setSplashId] = useState(()=>Number(new URLSearchParams(window.location.search).get('splash')) || 5)
  const stageRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    // Scale the complete preview, including its interface. Its logical viewport
    // stays1920×1080, matching the fullscreen layout instead of cropping the art.
    const resize = new ResizeObserver(([entry]) => {
      const scale = Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080)
      stage.style.setProperty('--reference-preview-scale', String(scale))
    })
    resize.observe(stage)
    return () => resize.disconnect()
  }, [])
  const showSplash = (screen === 'squadra' || screen === 'arkadex') && splashArtworks.length > 0
  const preview = `${import.meta.env.BASE_URL}?uiStudioPreview=1&uiConceptFluid=1&uiConcept=aurora&screen=${screen}${showSplash ? `&splash=${splashId}` : ''}`
  return <main className="reference-preview-lab">
    <header><div><span>ARKAMON · NUOVA INTERFACCIA</span><h1>La tua avventura, incorniciata d’oro.</h1></div><a href={preview} target="_blank" rel="noreferrer">Apri a pieno schermo ↗</a></header>
    <nav aria-label="Schermate della nuova interfaccia">{screens.map(([id,label])=><button key={id} type="button" aria-pressed={screen === id} onClick={()=>setScreen(id)}>{label}</button>)}</nav>
    {showSplash && <label className="reference-splash-picker">Illustrazione di sfondo <select aria-label="Arkamon dello splash" value={splashId} onChange={event=>setSplashId(Number(event.target.value))}>{splashArtworks.map(art=>{
      const name=getPokemon(art.speciesId)?.nome ?? `Arkamon ${art.speciesId}`
      const form=POKEMON_BASE.filter(entry=>entry.nome===name).findIndex(entry=>entry.id===art.speciesId)+1
      return <option key={art.speciesId} value={art.speciesId}>N° {String(art.speciesId).padStart(3,'0')} · {name} · Forma {form}</option>
    })}</select></label>}
    <div ref={stageRef} className={`reference-preview-stage${showSplash ? ' is-landscape' : ''}`}>
      <div className="reference-preview-fit">
        <iframe key={`${screen}-${showSplash ? splashId : ''}`} src={preview} title={`Nuova UI Arkamon: ${screens.find(([id])=>id===screen)?.[1]}`} />
      </div>
    </div>
    <footer><span>Interfaccia ispirata ai tuoi riferimenti · Sfondi attuali provvisori</span><span>Anteprima interattiva con dati dimostrativi</span></footer>
  </main>
}
