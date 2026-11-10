import type { UiElementInfo, UiRect } from './types'

export interface RegisteredUiElement { id: string; label: string; element: HTMLElement | SVGElement; kind: UiElementInfo['kind']; parentId?: string }
type Rule = [selector: string, id: string, label: string, repeated?: boolean]
const shared: Rule[] = [
  ['.pu-topbar', 'header', 'Intestazione'], ['.pu-brand', 'brand', 'Logo e sottotitolo'], ['.pu-header-meta', 'location', 'Luogo'],
  ['.pu-player-switch', 'players', 'Selettore giocatore'], ['.pu-currency', 'currency', 'Monete'], ['.pu-nav', 'navigation', 'Menù superiore'],
  ['.pu-page-head', 'page-heading', 'Titolo della schermata'], ['.pu-player-context', 'player-context', 'Giocatore selezionato'],
  ['.pu-content', 'content', 'Contenuto della schermata'], ['.pu-footer', 'footer', 'Barra inferiore'],
  ['.pu-screen-heading', 'screen-heading', 'Titolo e comandi'], ['.pu-screen-toolbar', 'toolbar', 'Barra strumenti'],
]
const rules: Record<string, Rule[]> = {
  menu: [['.pu-menu-grid', 'services', 'Menù servizi'], ['.pu-journey', 'journey', 'Carta allenatore']],
  register: [['.pu-register-tabs', 'archives', 'Selettore archivio'], ['#pu-register-content', 'archive-content', 'Archivio selezionato']],
  race: [['.pu-race-cards', 'race', 'Gara'], ['.pu-race-cards>.pu-panel', 'race.player', 'Giocatrice', true]],
  recap: [['.pu-race-cards', 'race', 'Situazione corrente'], ['.pu-recap-events', 'recent-events', 'Eventi recenti']],
  battaglia: [['.battle-dice-panel', 'dice.panel', 'Pannello lancio dadi'], ['.battle-dice-grid', 'dice.results', 'Risultati dei dadi'], ['.battle-die', 'dice.result', 'Dado', true], ['.battle-item-dialog', 'battle-bag.dialog', 'Borsa in battaglia'], ['.battle-item-dialog>header', 'battle-bag.header', 'Intestazione borsa'], ['.battle-item-dialog>div', 'battle-bag.content', 'Oggetti e compagni']],
  squadra: [['.pu-team-layout', 'layout', 'Colonne squadra'], ['.pu-team-list', 'team', 'Squadra'], ['.pu-team-slot', 'team.slot', 'Posto squadra', true], ['.pu-team-cap', 'team.cap', 'Fascia livelli'], ['.pu-hero-column', 'hero', 'Arkamon selezionato'], ['.pu-detail-panel', 'detail', 'Scheda e azioni']],
  deposito: [['.pu-box-toolbar', 'box-navigation', 'Selettore box'], ['.pu-deposit-grid-panel', 'box', 'Pannello deposito'], ['.pu-deposit-filters', 'filters', 'Filtri'], ['.pu-box-grid', 'box.grid', 'Griglia box'], ['.pu-box-grid>.pu-box-slot', 'box.slot', 'Posto deposito', true], ['.pu-deposit-team', 'team', 'Squadra'], ['.pu-deposit-team-slot', 'team.slot', 'Posto squadra', true], ['.pu-deposit-detail', 'detail', 'Arkamon e scambio']],
  arkadex: [['.pu-dex-index', 'index', 'Indice Arkadex'], ['.pu-filter-grid', 'filters', 'Filtri'], ['.pu-dex-list', 'species-list', 'Elenco specie'], ['.pu-dex-row', 'species.slot', 'Scheda specie', true], ['.pu-pagination', 'pagination', 'Paginazione'], ['.pu-dex-hero', 'hero', 'Arkamon selezionato'], ['.pu-dex-detail', 'detail', 'Scheda specie'], ['.pu-dex-detail-tabs', 'tabs', 'Sezioni scheda']],
  analisi: [['.pu-analysis-selector', 'selector', 'Selezione Arkamon'], ['.pu-hero-column', 'hero', 'Arkamon selezionato'], ['.pu-detail-panel', 'detail', 'Analisi'], ['.pu-tabs', 'tabs', 'Sezioni'], ['.pu-stat-grid', 'stats', 'Statistiche'], ['.pu-analysis-facts', 'facts', 'Dati compagno']],
  borsa: [['.pu-bag-list', 'inventory', 'Inventario'], ['.pu-item-grid', 'items', 'Oggetti'], ['.pu-item-slot', 'item.slot', 'Oggetto', true], ['.pu-bag-detail', 'detail', 'Dettaglio oggetto'], ['.pu-item-hero', 'item-art', 'Illustrazione oggetto'], ['.pu-item-use', 'use-item', 'Uso oggetto']],
  negozio: [['.pu-store-catalog', 'catalog', 'Catalogo'], ['.pu-shop-row', 'catalog.item', 'Articolo', true], ['.pu-store-detail', 'detail', 'Dettaglio articolo'], ['.pu-quantity-control', 'quantity', 'Quantità'], ['.pu-store-cart', 'cart', 'Carrello'], ['.pu-store-totals', 'totals', 'Totale'], ['.pu-store-actions', 'checkout', 'Comandi acquisto']],
  citta: [['.local-map-toolbar', 'toolbar', 'Comandi mappa'], ['.local-map-heading', 'heading', 'Nome città'], ['.local-map-budget', 'actions', 'Azioni'], ['.local-map-play-area', 'map', 'Mappa locale'], ['.local-map-footer', 'footer', 'Informazioni e movimenti'], ['.local-map-neighbours', 'neighbours', 'Punti raggiungibili']],
  percorso: [['.local-map-toolbar', 'toolbar', 'Comandi percorso'], ['.local-map-heading', 'heading', 'Nome percorso'], ['.local-map-budget', 'actions', 'Azioni'], ['.local-map-play-area', 'map', 'Mappa percorso'], ['.local-map-footer', 'footer', 'Informazioni e movimenti'], ['.local-map-neighbours', 'neighbours', 'Punti raggiungibili']],
  lega: [['.league-heading', 'heading', 'Intestazione Lega'], ['.league-player-card', 'player', 'Giocatore'], ['.league-path', 'path', 'Percorso Superquattro'], ['.league-team', 'team', 'Squadra'], ['.league-team-member', 'team.slot', 'Posto squadra', true], ['.league-footer', 'footer', 'Comandi Lega']],
  titolo: [['img[alt="Arkamon"]', 'logo', 'Logo Arkamon'], ['button[data-game-button]', 'command', 'Comando titolo', true]],
  laboratorio: [['img', 'art', 'Illustrazione laboratorio', true], ['form', 'names', 'Nomi giocatori'], ['h2', 'heading', 'Titolo laboratorio']],
}
const legacyLabels: Record<string, string[]> = {
  battaglia: ['enemy-squad', 'player-squad', 'enemy-sprite', 'player-sprite', 'enemy-hp', 'player-hp', 'info', 'player-moves', 'enemy-moves', 'player-supreme', 'enemy-supreme', 'turn-status', 'pass-turn', 'reward', 'continue'],
}
function slug(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'elemento' }
function text(element: Element): string { return (element.getAttribute('aria-label') || element.textContent || element.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 100) }
export function uiRect(element: Element, root: Element): UiRect {
  const bounds = element.getBoundingClientRect(), stage = root.getBoundingClientRect()
  return { x: (bounds.left - stage.left) / Math.max(stage.width, 1) * 100, y: (bounds.top - stage.top) / Math.max(stage.height, 1) * 100, w: bounds.width / Math.max(stage.width, 1) * 100, h: bounds.height / Math.max(stage.height, 1) * 100 }
}
export function collectUiElements(root: HTMLElement, screen: string): RegisteredUiElement[] {
  screen = screen.split(':')[0]
  const output: RegisteredUiElement[] = [], seen = new Set<Element>(), ids = new Set<string>()
  const add = (element: Element, proposed: string, label: string, canonical = false) => {
    if (seen.has(element)) { if (canonical) { const previous = output.find(entry => entry.element === element); if (previous) previous.label = label } return }
    if (element.closest('[data-ui-runtime-owned]') || element.matches('video,style,script,defs')) return
    const saved = element.getAttribute('data-ui-id')
    let id = saved || proposed, n = 1
    while (ids.has(id)) id = `${proposed}.${++n}`
    ids.add(id); seen.add(element); element.setAttribute('data-ui-id', id)
    const kind = element.matches('button,a,input,select,textarea') ? 'button' : element.matches('img,svg,canvas') ? 'image' : element.matches('h1,h2,h3,p,small,strong,label,output') ? 'text' : 'group'
    output.push({ id, label: element.getAttribute('data-ui-label') || label || text(element) || id, element: element as HTMLElement, kind })
  }
  root.querySelectorAll('[data-ui-id]').forEach(element => add(element, element.getAttribute('data-ui-id')!, text(element)))
  for (const [selector, id, label, repeated] of [...shared, ...(rules[screen] ?? [])]) {
    root.querySelectorAll(selector).forEach((element, index) => add(element, repeated ? `${id}.${index + 1}` : id, repeated ? `${label} ${index + 1}` : label, true))
  }
  root.querySelectorAll('[data-admin-layout-item="true"]').forEach((element, index) => {
    const label = element.querySelector(':scope>button')?.textContent?.trim() || legacyLabels[screen]?.[index] || `Gruppo ${index + 1}`
    add(element, `layout.${slug(label)}`, label)
  })
  const structuralCounters = new Map<string, number>()
  root.querySelectorAll('button,a[href],input,select,textarea,h1,h2,h3,p,label,output,img,svg.pu-creature-art,.pu-kit-icon').forEach(element => {
    if (element.closest('svg') && !element.matches('svg.pu-creature-art')) return
    const ancestor = element.parentElement?.closest('[data-ui-id]')?.getAttribute('data-ui-id')
    const kind = element.matches('button,a,input,select') ? 'command' : element.matches('img,svg,.pu-kit-icon') ? 'image' : 'text'
    const structural = `${ancestor ? `${ancestor}.` : ''}${kind}.${element.tagName.toLowerCase()}`.slice(0, 140)
    const index = (structuralCounters.get(structural) ?? 0) + 1
    structuralCounters.set(structural, index)
    // Text, player names and sprite URLs change during play; identity follows structure only.
    add(element, `${structural}.${index}`, text(element) || `${kind} ${index}`)
  })
  for (const entry of output) entry.parentId = entry.element.parentElement?.closest('[data-ui-id]')?.getAttribute('data-ui-id') ?? undefined
  return output
}

export function findUiScreenRoot(scene: string, preview = false): { root: HTMLElement; screen: string } | null {
  const battleBag = document.querySelector<HTMLElement>('.battle-item-dialog')
  if (battleBag) {
    const root = battleBag.closest<HTMLElement>('[data-game-dialog]')
    if (root) return { root, screen: preview ? scene : 'battaglia:bag' }
  }
  const tools = document.querySelector<HTMLElement>('.pu-shell')
  if (tools) {
    const base = tools.dataset.playerUiScreen === 'partita' ? 'menu' : tools.dataset.playerUiScreen || 'menu'
    const view = tools.querySelector<HTMLElement>('[data-ui-view]')?.dataset.uiView
    return { root: tools, screen: preview ? scene : view && view !== 'scheda' && view !== 'information' ? `${base}:${view}` : base }
  }
  const supplied = preview ? document.querySelector<HTMLElement>('[data-ui-studio-preview-screen]') : null
  const stage = supplied ?? document.querySelector<HTMLElement>('[data-presented-scene]:not([aria-hidden="true"])') ?? document.querySelector<HTMLElement>('.arka-stage')
  if (!stage) return null
  const current = supplied?.dataset.uiStudioPreviewScreen || stage.dataset.presentedScene || scene
  let root = stage.querySelector<HTMLElement>('[data-battle-layout-root],.local-map-scene,[data-league-scene]') ?? (stage.firstElementChild instanceof HTMLElement ? stage.firstElementChild : stage)
  // SceneTransition adds a plain full-size wrapper; apply backgrounds to the real scene below it.
  while (root !== stage && root.className === 'absolute inset-0' && root.children.length === 1 && root.firstElementChild instanceof HTMLElement) root = root.firstElementChild
  if (root.getBoundingClientRect().width < 1 || root.getBoundingClientRect().height < 1) return null
  return { root, screen: !preview && current === 'battaglia' && root.querySelector('.battle-dice-panel') ? 'battaglia:dice' : current }
}
