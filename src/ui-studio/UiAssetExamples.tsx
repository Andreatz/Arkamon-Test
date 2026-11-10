import { useState, type CSSProperties, type ReactNode } from 'react'
import { RpgFrame } from '@/components/rpg'
import { getPokemon } from '@/data'
import { calcolaHPMax } from '@/engine/battleEngine'
import { ITEM_ICONS, TYPE_ICONS } from '@/player-ui/kit'
import { getPortraitFraming } from '@/player-ui/portraitFraming'
import { SHOP_ITEMS, type ShopItemId } from '@/shop/catalog'
import { assetUrl } from '@/utils/assetUrl'
import { previewCreature } from './previewFixtures'
import './assetExamples.css'

type Example = 'borsa' | 'squadra' | 'laboratorio' | 'controlli'
const examples: [Example, string][] = [['borsa', 'Borsa'], ['squadra', 'Squadra'], ['laboratorio', 'Laboratorio'], ['controlli', 'Comandi e opzioni']]
const team = [1, 5, 9, 13, 20, 43].map((id, index) => previewCreature(id, index))
const stock: Record<ShopItemId, number> = { potion: 8, 'super-potion': 4, revive: 2, antidote: 3, 'paralysis-heal': 2, awakening: 2, masterball: 5 }
const studio = (name: string) => `/ui/studio/${name}`
const dark = (name: string) => studio(`Scuro/${name}.svg`)
const inventoryCenters = [232, 430, 630, 828]
const squadCenters = [137.5, 302.5, 467.5, 632.5, 797.5, 962.5]
const sourceLists: Record<Example, string[]> = {
  borsa: ['Scuro/box-inventario.svg', 'Scuro/box-1.svg', 'Scuro/bottone.svg', 'Scuro/cornice-piccola-selezionata.svg'],
  squadra: ['Scuro/squadra.svg', 'Scuro/cornice-arkamon.svg', 'Scuro/box-2.svg', 'Scuro/bottone.svg'],
  laboratorio: ['Comuni/capsula-lab-blu.svg', 'Comuni/capsula-lab-nera.svg', 'Comuni/capsula-lab-viola.svg', 'Comuni/dialogo-lab.svg'],
  controlli: ['Scuro/toggle-on.svg', 'Scuro/toggle-off.svg', 'Scuro/pulsante-freccia-sinistra.svg', 'Scuro/pulsante-freccia-destra.svg', 'individuali/Scuro/quantita/meno.svg', 'individuali/Scuro/quantita/display.svg', 'individuali/Scuro/quantita/piu.svg', 'Scuro/button-chiusura-rosso.svg'],
}

/** A complete SVG is scaled uniformly in its own viewBox; nothing is sliced or filled. */
function Art({ source, width, height, classic, className = '', children }: {
  source: string; width: number; height: number; classic: boolean; className?: string; children?: ReactNode
}) {
  return <div className={`ua-art ${className}`} data-example-asset={classic ? 'rpg-window' : source}
    style={{ aspectRatio: `${width} / ${height}` }}>
    {classic ? <RpgFrame /> : <img className="ua-surface" src={assetUrl(source)} alt="" draggable={false} />}
    {children}
  </div>
}

function Command({ children, selected = false, disabled = false, classic, onClick }: {
  children: ReactNode; selected?: boolean; disabled?: boolean; classic: boolean; onClick?: () => void
}) {
  return <button type="button" className="ua-command" disabled={disabled} onClick={onClick}>
    {classic ? <RpgFrame kind={selected ? 'selected' : 'command'} />
      : <img className="ua-surface" src={assetUrl(dark(selected ? 'bottone-selezionato' : 'bottone'))} alt="" />}
    <span>{children}</span>
  </button>
}

function Sprite({ speciesId, className = '' }: { speciesId: number; className?: string }) {
  const source = `/sprites/front_sprites/${speciesId}.png`
  const framing = getPortraitFraming(source)
  return <svg className={`ua-sprite ${className}`} viewBox={framing.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <image href={assetUrl(source)} width={framing.width} height={framing.height} />
  </svg>
}

function KitImage({ id }: { id: string }) {
  return <img src={assetUrl(`/ui/player-kit/${id}.svg`)} alt="" draggable={false} />
}

function BagExample({ classic }: { classic: boolean }) {
  const [selectedId, selectItem] = useState<ShopItemId>('potion')
  const [category, setCategory] = useState('all')
  const filtered = SHOP_ITEMS.filter(item => category === 'all' || (category === 'heal'
    ? ['heal', 'revive'].includes(item.effect.kind) : item.effect.kind === category))
  const selected = filtered.find(item => item.id === selectedId) ?? filtered[0]
  return <>
    <div className="ua-product-heading"><div><span>SCORTE DI VIAGGIO</span><h2>La borsa di Melia</h2></div><strong>26 oggetti <small>7 articoli</small></strong></div>
    <div className="ua-category" aria-label="Categoria degli esempi">{[['all', 'Tutti'], ['heal', 'Cure'], ['status', 'Status'], ['capture', 'Cattura']].map(([id, label]) =>
      <button type="button" key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div>
    <div className="ua-bag-layout">
      <section className="ua-inventory-column" aria-label="Scorte dimostrative">
        <Art source={dark('box-inventario')} width={1060} height={650} classic={classic} className="ua-inventory">
          <span className="ua-grid-title">LE TUE SCORTE</span>
          {Array.from({ length: 12 }, (_, index) => {
            const item = filtered[index]
            const coordinates: CSSProperties = { left: `${inventoryCenters[index % 4] / 10.6}%`, top: `${[195, 355, 515][Math.floor(index / 4)] / 6.5}%` }
            return <div className="ua-inventory-cell" key={index} style={coordinates}>
              {item ? <button type="button" aria-pressed={selected.id === item.id} aria-label={`${item.name}: ${stock[item.id]} disponibili`} onClick={() => selectItem(item.id)}>
                {classic && <RpgFrame kind={selected.id === item.id ? 'selected' : 'command'} />}
                {!classic && selected.id === item.id && <img className="ua-slot-selection" src={assetUrl(dark('cornice-piccola-selezionata'))} alt="" />}
                <KitImage id={ITEM_ICONS[item.id]} /><span className="ua-stock">×{stock[item.id]}</span>
              </button> : <span className="ua-slot-empty" aria-hidden="true">·</span>}
              {item && <span className="ua-item-name">{item.name}</span>}
            </div>
          })}
        </Art>
        <div className="ua-mobile-items">{filtered.map(item => <button type="button" key={item.id} aria-pressed={selected.id === item.id}
          aria-label={`${item.name}: ${stock[item.id]} disponibili`} onClick={() => selectItem(item.id)}>
          <span className="ua-mobile-item-art">{classic ? <RpgFrame kind={selected.id === item.id ? 'selected' : 'command'} />
            : <img className="ua-surface" src={assetUrl(dark(selected.id === item.id ? 'cornice-piccola-selezionata' : 'cornice-piccola'))} alt="" />}
            <KitImage id={ITEM_ICONS[item.id]} /><span className="ua-stock">×{stock[item.id]}</span></span><strong>{item.name}</strong>
        </button>)}</div>
        <p className="ua-product-footnote">Seleziona un oggetto per consultarne l’effetto.</p>
      </section>
      <section className="ua-item-detail" aria-live="polite">
        <div className="ua-item-illustration"><KitImage id={ITEM_ICONS[selected.id]} /></div>
        <span className="ua-eyebrow">ARTICOLO SELEZIONATO</span><h3>{selected.name}</h3>
        <p>{selected.description}</p>
        <Art source={dark('box-1')} width={1060} height={320} classic={classic} className="ua-stock-panel">
          <div><span>IN BORSA</span><strong>{stock[selected.id]} <small>disponibili</small></strong></div>
        </Art>
        <Command classic={classic} selected onClick={() => selectItem('super-potion')}>Confronta Superpozione</Command>
        <p className="ua-demo-hint">Dati dimostrativi · nessun oggetto viene consumato</p>
      </section>
    </div>
  </>
}

function TeamExample({ classic }: { classic: boolean }) {
  const [index, setIndex] = useState(0)
  const pokemon = team[index], definition = getPokemon(pokemon.specieId)
  const maximum = calcolaHPMax(pokemon)
  return <>
    <div className="ua-product-heading"><div><span>COMPAGNI DI VIAGGIO</span><h2>La squadra di Melia</h2></div><strong>6 <small>Arkamon</small></strong></div>
    <div className="ua-team-layout">
      <section className="ua-hero-preview" aria-label="Arkamon selezionato">
        <Art source={dark('cornice-arkamon')} width={540} height={520} classic={classic}><Sprite speciesId={pokemon.specieId} /></Art>
        <span className="ua-eyebrow">ARKA / {String(pokemon.specieId).padStart(3, '0')}</span><h3>{pokemon.nome}</h3>
        <span className="ua-type-label"><KitImage id={TYPE_ICONS[definition?.tipo ?? 'Normale']} />{definition?.tipo}</span>
      </section>
      <section className="ua-team-info" aria-live="polite">
        <Art source={dark('box-2')} width={1060} height={330} classic={classic} className="ua-facts-art"><div><span>LIVELLO {pokemon.livello}</span><strong>{pokemon.nome}</strong><small>{pokemon.stato?.tipo ?? 'Pronto al viaggio'}</small></div></Art>
        <div className="ua-health-copy"><span>HP</span><strong>{pokemon.hp} / {maximum}</strong></div>
        <progress value={pokemon.hp} max={maximum} aria-label={`HP di ${pokemon.nome}`} />
        <p>Seleziona uno dei sei compagni nella barra della squadra.</p>
        <div className="ua-team-actions"><Command classic={classic} onClick={() => setIndex(value => (value + 5) % 6)}>Precedente</Command><Command classic={classic} selected onClick={() => setIndex(value => (value + 1) % 6)}>Successivo</Command></div>
      </section>
    </div>
    <Art source={dark('squadra')} width={1100} height={240} classic={classic} className="ua-squad-strip">
      {team.map((entry, slot) => <button type="button" key={entry.istanzaId} aria-label={`Seleziona ${entry.nome}`} aria-pressed={index === slot} style={{ left: `${squadCenters[slot] / 11}%` }} onClick={() => setIndex(slot)}>
        {classic && <RpgFrame kind={index === slot ? 'selected' : 'command'} />}<Sprite speciesId={entry.specieId} /><span>{entry.nome}</span>
      </button>)}
    </Art>
    <div className="ua-mobile-squad">{team.map((entry, slot) => <button type="button" key={entry.istanzaId} aria-label={`Seleziona ${entry.nome}`} aria-pressed={index === slot} onClick={() => setIndex(slot)}>
      <span className="ua-mobile-squad-portrait">{classic ? <RpgFrame kind={index === slot ? 'selected' : 'command'} />
        : <img className="ua-surface" src={assetUrl(dark(index === slot ? 'cornice-piccola-selezionata' : 'cornice-piccola'))} alt="" />}<Sprite speciesId={entry.specieId} /></span><span>{entry.nome}</span>
    </button>)}</div>
  </>
}

/** Cropping only unused canvas preserves every painted coordinate and its aspect. */
function CroppedArt({ source, crop, children }: { source: string; crop: string; children?: ReactNode }) {
  return <div className="ua-crop"><svg viewBox={crop} preserveAspectRatio="xMidYMid meet" aria-hidden="true"><image href={assetUrl(studio(source))} width={880} height={360} /></svg>{children}</div>
}

function LabExample({ classic }: { classic: boolean }) {
  const [selected, setSelected] = useState(0)
  const starters = [{ id: 1, capsule: 'blu' }, { id: 5, capsule: 'nera' }, { id: 9, capsule: 'viola' }]
  return <>
    <div className="ua-product-heading"><div><span>LABORATORIO</span><h2>Il primo compagno</h2></div><strong>G1 <small>Melia</small></strong></div>
    <div className="ua-lab-capsules">{starters.map((entry, index) => <button type="button" className="ua-capsule" key={entry.id} aria-pressed={selected === index} aria-label={`Seleziona ${getPokemon(entry.id)?.nome}`} onClick={() => setSelected(index)}>
      {classic ? <><RpgFrame /><Sprite speciesId={entry.id} /></> : <><Sprite speciesId={entry.id} /><CroppedArt source={`Comuni/capsula-lab-${entry.capsule}.svg`} crop="0 0 260 360" /></>}
      <span className="ua-capsule-name">{getPokemon(entry.id)?.nome}</span>
    </button>)}</div>
    <div className="ua-lab-dialog">{classic ? <div className="ua-classic-dialog"><RpgFrame /><strong>PROFESSORE</strong><p>Scegli con cura il tuo compagno d’avventura! Sarà il coraggioso Vyrath, l’oscuro Darklaw, o il misterioso Felyss?</p></div>
      : <CroppedArt source="Comuni/dialogo-lab.svg" crop="250 145 630 210"><span className="ua-sr-only">PROFESSORE: Scegli con cura il tuo compagno d’avventura! Sarà il coraggioso Vyrath, l’oscuro Darklaw, o il misterioso Felyss?</span></CroppedArt>}</div>
    <div className="ua-lab-mobile-dialog"><Art source={dark('dialogo-scuro')} width={820} height={430} classic={classic}>
      <div><strong>PROFESSORE</strong><p>Scegli con cura il tuo compagno d’avventura! Vyrath, Darklaw o Felyss?</p></div>
    </Art></div>
    <div className="ua-lab-choice" aria-live="polite">In evidenza: {getPokemon(starters[selected].id)?.nome}<span>Anteprima della selezione · la partita non viene avviata</span></div>
  </>
}

function ControlExample({ classic }: { classic: boolean }) {
  const [audio, setAudio] = useState(true), [quantity, setQuantity] = useState(3), [page, setPage] = useState(1), [closed, setClosed] = useState(false)
  return <>
    <div className="ua-product-heading"><div><span>COMANDI E OPZIONI</span><h2>Ogni gesto, il suo controllo</h2></div></div>
    <div className="ua-controls-grid">
      <section><span className="ua-eyebrow">IMPOSTAZIONE BINARIA</span><h3>Audio</h3><button type="button" className="ua-toggle" aria-label="Audio dimostrativo" aria-pressed={audio} onClick={() => setAudio(value => !value)}>
        {classic ? <><RpgFrame kind={audio ? 'selected' : 'command'} /><span>{audio ? 'Attivo' : 'Spento'}</span></> : <img src={assetUrl(dark(audio ? 'toggle-on' : 'toggle-off'))} alt={audio ? 'Attivo' : 'Spento'} />}</button><p>{audio ? 'Audio attivo' : 'Audio spento'}</p></section>
      <section><span className="ua-eyebrow">TRE ELEMENTI INDIPENDENTI</span><h3>Quantità</h3><div className="ua-stepper">
        <button type="button" aria-label="Riduci quantità demo" disabled={quantity === 0} onClick={() => setQuantity(value => value - 1)}>{classic ? <><RpgFrame kind="command" /><span>−</span></> : <img src={assetUrl(studio('individuali/Scuro/quantita/meno.svg'))} alt="" />}</button>
        <div className="ua-quantity-display">{classic ? <RpgFrame kind="command" /> : <img src={assetUrl(studio('individuali/Scuro/quantita/display.svg'))} alt="" />}<output aria-live="polite">{quantity}</output></div>
        <button type="button" aria-label="Aumenta quantità demo" disabled={quantity === 9} onClick={() => setQuantity(value => value + 1)}>{classic ? <><RpgFrame kind="command" /><span>+</span></> : <img src={assetUrl(studio('individuali/Scuro/quantita/piu.svg'))} alt="" />}</button>
      </div><p>Da 0 a 9 · pulsanti disabilitati ai limiti</p></section>
      <section><span className="ua-eyebrow">NAVIGAZIONE</span><h3>Paginazione</h3><div className="ua-pager">
        <button type="button" aria-label="Pagina demo precedente" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{classic ? <><RpgFrame kind="command" />←</> : <img src={assetUrl(dark('pulsante-freccia-sinistra'))} alt="" />}</button>
        <output aria-live="polite">{page} / 3</output><button type="button" aria-label="Pagina demo successiva" disabled={page === 3} onClick={() => setPage(value => value + 1)}>{classic ? <><RpgFrame kind="command" />→</> : <img src={assetUrl(dark('pulsante-freccia-destra'))} alt="" />}</button>
      </div><p>Icona, forma e stato dedicati</p></section>
      <section><span className="ua-eyebrow">AZIONE RICONOSCIBILE</span><h3>Chiudi finestra</h3><button type="button" className="ua-close-demo" aria-label={closed ? 'Riapri esempio' : 'Chiudi esempio'} onClick={() => setClosed(value => !value)}>{classic ? <><RpgFrame kind="command" />{closed ? 'Apri' : 'Chiudi'}</> : <img src={assetUrl(dark(closed ? 'button-circolare-check' : 'button-chiusura-rosso'))} alt="" />}</button><p aria-live="polite">{closed ? 'Esempio chiuso · premi per riaprire' : 'Esempio aperto'}</p></section>
    </div>
  </>
}

/** Deliberately isolated from campaign stores: all interactions are local examples. */
export function UiAssetExamples() {
  const [example, setExample] = useState<Example>('borsa'), [classic, setClassic] = useState(false)
  return <main className="ua-examples" data-skin={classic ? 'classic' : 'dedicated'}>
    <header className="ua-review-head"><div><span>STUDIO ARKAMON / ANTEPRIMA</span><h1>Gli asset al loro posto</h1><p>Esempi interattivi con SVG originali, font e Arkamon del progetto.</p></div><span className="ua-demo-badge">DATI DEMO</span></header>
    <div className="ua-review-tools"><nav aria-label="Esempio da visualizzare">{examples.map(([id, name]) => <button type="button" key={id} aria-pressed={example === id} onClick={() => setExample(id)}>{name}</button>)}</nav><div role="group" aria-label="Confronto cornici"><button type="button" aria-pressed={classic} onClick={() => setClassic(true)}>Tre famiglie</button><button type="button" aria-pressed={!classic} onClick={() => setClassic(false)}>Asset dedicati</button></div></div>
    <div className="ua-comparison-label" role="status">{classic ? 'Confronto con le cornici generiche sullo stesso esempio' : 'SVG dedicati con proporzioni originali'} · <a href={import.meta.env.BASE_URL}>Apri il gioco</a></div>
    <div className={`ua-product ua-product-${example}`}>
      <div className="ua-brand-bar"><img src={assetUrl('/ui/logo_arkamon.png')} alt="Arkamon" /><span>STRUMENTI DELL’ALLENATORE</span><strong>G1 · Melia <small>Venezia</small></strong></div>
      {example === 'borsa' ? <BagExample classic={classic} /> : example === 'squadra' ? <TeamExample classic={classic} /> : example === 'laboratorio' ? <LabExample classic={classic} /> : <ControlExample classic={classic} />}
    </div>
    <aside className="ua-source-notes"><h2>Asset di questo esempio</h2><ul>{sourceLists[example].map(name => <li key={name}>{name}</li>)}</ul><p>{example === 'borsa' ? 'L’inventario usa la griglia originale 4×3 anche nella Borsa della partita. Il Deposito conserva i suoi 35 posti.' : example === 'laboratorio' ? 'Le capsule e il dialogo sono attivi nella scelta reale degli starter. Il testo del Professore è già incorporato nell’SVG originale.' : example === 'squadra' ? 'La cornice del ritratto e la barra a sei posti sono attive nella Squadra della partita. I ritratti restano i PNG ufficiali.' : 'Toggle audio, quantità del negozio, frecce di navigazione e chiusura dei dialoghi usano gli SVG dedicati nel gioco.'} Questa pagina conserva dati dimostrativi per confrontare i due stili; apri il gioco per usare inventario, compagni e azioni della tua partita.</p></aside>
  </main>
}
