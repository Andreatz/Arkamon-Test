import { useState } from 'react'
import { UI_CONCEPTS, resolveUiConcept, type UiConcept } from '@/player-ui/concepts/uiConcepts'
import './uiConceptLab.css'

const screens = [['squadra', 'Squadra'], ['borsa', 'Borsa'], ['menu', 'Menù partita'], ['deposito', 'Deposito'], ['arkadex', 'Arkadex'], ['analisi', 'Analisi']] as const
type ConceptScreen = typeof screens[number][0]
export function UiConceptLab() {
  const query = new URLSearchParams(window.location.search)
  const [concept, setConcept] = useState<UiConcept>(() => resolveUiConcept(query.get('style')))
  const [screen, setScreen] = useState<ConceptScreen>(() => screens.find(([id]) => id === query.get('screen'))?.[0] ?? 'squadra')
  const [loaded, setLoaded] = useState(false)
  const selected = UI_CONCEPTS.find(entry => entry.id === concept)!
  const preview = `${import.meta.env.BASE_URL}?uiStudioPreview=1&uiConceptFluid=1&uiConcept=${concept}&screen=${screen}`
  function chooseStyle(next: UiConcept) { if (next !== concept) { setLoaded(false); setConcept(next) } }
  function chooseScreen(next: ConceptScreen) { if (next !== screen) { setLoaded(false); setScreen(next) } }
  return <main className="uc-lab">
    <header className="uc-heading"><div><span className="uc-eyebrow">ARKAMON / NUOVE DIREZIONI</span><h1>Un’altra idea di avventura.</h1></div><p>Cinque interfacce. Le stesse funzioni del gioco.</p><a href={import.meta.env.BASE_URL}>Torna al gioco <span aria-hidden="true">↗</span></a></header>
    <nav className="uc-styles" aria-label="Stile dell’interfaccia">{UI_CONCEPTS.map(entry => <button type="button" key={entry.id} aria-pressed={concept === entry.id} data-concept-choice={entry.id} onClick={() => chooseStyle(entry.id)}>
      <span className="uc-style-number">{entry.number}</span><span className="uc-style-name">{entry.name}<small>{entry.subtitle}</small></span><span className="uc-swatches" aria-hidden="true">{entry.colors.map(color => <i key={color} style={{ background: color }} />)}</span>
    </button>)}</nav>
    <div className="uc-screen-tools"><nav aria-label="Schermata da confrontare">{screens.map(([id, name]) => <button type="button" aria-pressed={screen === id} key={id} onClick={() => chooseScreen(id)}>{name}</button>)}</nav><a href={preview} target="_blank" rel="noreferrer">Apri a pieno schermo <span aria-hidden="true">↗</span></a></div>
    <section className="uc-preview" aria-label={`Anteprima ${selected.name}`} aria-busy={!loaded}>
      {!loaded && <p className="uc-loading" role="status">Preparazione di {selected.name}…</p>}
      <iframe key={`${concept}-${screen}`} src={preview} title={`${selected.name}: ${screens.find(([id]) => id === screen)?.[1]}`} onLoad={() => setLoaded(true)} />
    </section>
    <footer className="uc-caption"><p aria-live="polite"><b>{selected.number} / {selected.name}</b> {selected.description}</p><span>Anteprima interattiva · dati dimostrativi</span></footer>
  </main>
}
