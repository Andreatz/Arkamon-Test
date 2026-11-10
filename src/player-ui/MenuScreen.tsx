import { assetUrl } from '@/utils/assetUrl'
import { SpatialNavigation } from '@/components/rpg/SpatialNavigation'
import { useMemo } from 'react'
import { ALLENATORI, POKEMON_BASE } from '@/data'
import { deriveArkadexProgress } from '@/arkadex/arkadexModel'
import { getBackground } from '@/data/backgrounds'
import { useGameStore } from '@/store/gameStore'
import { CreaturePortrait, KitFrame, KitIcon, KitPanel, formatNumber } from './kit'
import type { PlayerUiAuxiliary } from './navigation'
import { MENU_SVG_ARTWORK_ENABLED } from './uiAppearancePolicy'
import { isReferenceUi } from './reference/referenceTheme'
import { ReferenceMainMenu } from './reference/ReferenceMainMenu'
import type { PlayerUiScreen } from './navigation'

interface MenuScreenProps {
  playerId: 1 | 2
  onAuxiliary: (tool: PlayerUiAuxiliary) => void
  onNavigate?: (screen: PlayerUiScreen) => void
  onResume?: () => void
}
const tiles: { id: PlayerUiAuxiliary; title: string; description: string; icon: string }[] = [
  { id: 'register', title: 'Registro', description: 'Diario, eventi e cronache delle battaglie', icon: 'icon-book' },
  { id: 'backup', title: 'Backup', description: 'Salva e importa la tua partita', icon: 'icon-box' },
  { id: 'settings', title: 'Impostazioni', description: 'Audio, animazioni e preferenze', icon: 'icon-options' },
  { id: 'race', title: 'Gara', description: 'Posizioni, medaglie e corsa alla Lega', icon: 'icon-activity' },
  { id: 'recap', title: 'Ripresa', description: 'Situazione corrente e ultimi eventi', icon: 'icon-activity' },
  { id: 'challenges', title: 'Sfide', description: 'Seed e Fanta-Team Builder', icon: 'icon-challenges' },
]
const sceneNames: Record<string, string> = { titolo: 'Titolo', laboratorio: 'Laboratorio', 'mappa-principale': 'Mappa principale', 'mappa-griglia': 'Mappa locale', citta: 'Città', percorso: 'Percorso', palestra: 'Palestra', 'centro-pokemon': 'Centro Pokémon', battaglia: 'Battaglia', deposito: 'Deposito', squadra: 'Squadra', evoluzione: 'Evoluzione', lega: 'Lega' }

export function MenuScreen({ playerId, onAuxiliary, onNavigate, onResume }: MenuScreenProps) {
  const one = useGameStore(state => state.giocatore1)
  const two = useGameStore(state => state.giocatore2)
  const position1 = useGameStore(state => state.posizione1)
  const position2 = useGameStore(state => state.posizione2)
  const active = useGameStore(state => state.giocatoreAttivo)
  const turn = useGameStore(state => state.turnoOverworld)
  const battle = useGameStore(state => state.battaglia)
  const scene = useGameStore(state => state.scenaCorrente)
  const savedArkadex = useGameStore(state => state.arkadex)
  const context = useGameStore(state => state.challengeContext)
  const league = useGameStore(state => state.league)
  const player = playerId === 1 ? one : two
  const position = playerId === 1 ? position1 : position2
  const progress = useMemo(() => deriveArkadexProgress(savedArkadex, { giocatore1: one, giocatore2: two, giocatoreAttivo: active, battaglia: battle }), [savedArkadex, one, two, active, battle])
  const discovered = progress[playerId === 1 ? 'seen1' : 'seen2'].length
  const obtained = progress[playerId === 1 ? 'caught1' : 'caught2'].length
  const gyms = ALLENATORI.filter(trainer => trainer.tipo === 'Capopalestra')
  const gymCount = gyms.filter(trainer => player.allenatoriSconfitti.has(trainer.id)).length
  const npcCount = ALLENATORI.filter(trainer => trainer.tipo === 'NPC' && player.allenatoriSconfitti.has(trainer.id)).length
  const location = scene.scena === 'titolo' ? 'Prima dell’avventura' : scene.scena === 'laboratorio' ? 'Laboratorio' : (position.luogo ?? position.mappaId).replace(/_/g, ' ')
  const background = position.luogo ? getBackground(position.luogo) : null
  const actions = active === playerId && turn.giocatoreAttivo === playerId ? turn.azioniRimaste : 0
  const leagueProgress = league?.players[playerId]
  const leagueStages = league?.config?.championEnabled ? 5 : 4

  if (isReferenceUi()) return <ReferenceMainMenu playerId={playerId} onAuxiliary={onAuxiliary} onNavigate={onNavigate} onResume={onResume} />

  return <div className="pu-menu-layout">
    <SpatialNavigation selectOnFocus={false} className="pu-menu-grid">{tiles.map((tile, index) => <button data-rpg-item data-ui-id={`service.${tile.id}`} type="button" key={tile.id} className={`pu-menu-tile ${index === 0 ? 'is-featured' : ''}`}
      aria-label={`Apri ${tile.title}`} disabled={!!context && tile.id !== 'settings' && tile.id !== 'challenges'}
      onClick={() => onAuxiliary(tile.id)}>
      <KitFrame id={index === 0 ? 'panel-wide' : 'panel-medium'} /><KitIcon id={tile.icon} />
      <span className="pu-tile-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div><h2>{tile.title}</h2><p>{tile.description}</p></div>
    </button>)}</SpatialNavigation>

    <KitPanel className="pu-journey" aria-label={`Riepilogo della partita di G${playerId}`}>
      <span className="pu-kicker">Carta allenatore · G{playerId}</span><h2>{player.nome || `Giocatore ${playerId}`}</h2>
      <div className="pu-journey-scene">{background && scene.scena !== 'titolo' && <img src={background} alt="" />}<strong>{location}</strong></div>
      {!player.squadra.length && <p className="pu-empty-copy">Scegli il tuo starter nel laboratorio per iniziare. Ogni giocatore ha una squadra, un deposito e scoperte indipendenti.</p>}
      <dl className="pu-summary">
        <div><dt>Turno attuale</dt><dd>G{active} · {actions} azioni per G{playerId}</dd></div>
        <div><dt>Scoperte</dt><dd>{discovered} / {POKEMON_BASE.length}</dd></div>
        <div><dt>Squadra</dt><dd>{player.squadra.length} / 6</dd></div>
        <div><dt>Deposito</dt><dd>{Object.keys(player.deposito).length} Arkamon</dd></div>
      </dl>
      <div className="pu-gym-progress"><span className="pu-kicker">Medaglie delle palestre · {gymCount} / {gyms.length}</span>
        <div className="pu-gym-badges" aria-label="Medaglie ottenute">{gyms.map((gym, index) => <span role="img" key={gym.id} className={player.allenatoriSconfitti.has(gym.id) ? 'earned' : ''}
          title={`${gym.luogo} · ${player.allenatoriSconfitti.has(gym.id) ? 'ottenuta' : 'da ottenere'}`} aria-label={`${gym.luogo}: ${player.allenatoriSconfitti.has(gym.id) ? 'medaglia ottenuta' : 'medaglia da ottenere'}`}>{MENU_SVG_ARTWORK_ENABLED ? <img src={assetUrl(`/ui/studio/progression/gym-${index + 1}.svg`)} alt="" /> : <b className="pu-gym-badge-symbol" aria-hidden="true">{String(index + 1).padStart(2, '0')}</b>}</span>)}</div>
      </div>
      <div className="pu-trainer-progress" aria-label={`Progresso della Lega di G${playerId}`}>
        <strong>{league?.winner ? `Campione della regione: ${league.winner.name}` : 'La sfida della Lega'}</strong>
        <p>{leagueProgress?.status === 'completed' ? 'Lega completata' : leagueProgress?.status === 'running' ? `Serie in corso · ${leagueProgress.completedStages.length} / ${leagueStages} vittorie` : leagueProgress?.status === 'defeated' ? `Serie interrotta · ${leagueProgress.completedStages.length} / ${leagueStages} vittorie` : `${gymCount} / ${gyms.length} medaglie · Quattro battaglie consecutive nello stesso turno`}</p>
      </div>
      <p className="pu-muted">{npcCount} allenatori NPC sconfitti · {obtained} specie ottenute · {formatNumber(player.monete)} monete</p>
      <div className="pu-mini-team" aria-label={`Squadra di G${playerId}`}>{player.squadra.map(pokemon => <span key={pokemon.istanzaId} title={`${pokemon.nome} · Lv. ${pokemon.livello}`}><CreaturePortrait pokemon={pokemon} /></span>)}</div>
      <p className="pu-muted">Scena attuale: {sceneNames[scene.scena] ?? scene.scena}{battle ? ' · scontro in corso' : ''}.</p>
    </KitPanel>
  </div>
}
