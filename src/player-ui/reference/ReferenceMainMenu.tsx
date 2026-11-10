import { useGameStore } from '@/store/gameStore'
import { ALLENATORI, getPokemon } from '@/data'
import type { TipoPokemon } from '@/types'
import { assetUrl } from '@/utils/assetUrl'
import { SpatialNavigation } from '@/components/rpg/SpatialNavigation'
import { CreaturePortrait, formatNumber, KitIcon } from '../kit'
import { ReferenceEmblem } from './ReferenceEmblem'
import { ProvidedArtwork } from './ProvidedArtwork'
import type { PlayerUiAuxiliary, PlayerUiScreen } from '../navigation'

interface Props {
  playerId: 1 | 2
  onAuxiliary: (tool: PlayerUiAuxiliary) => void
  onNavigate?: (screen: PlayerUiScreen) => void
  onResume?: () => void
}
const entries: { title: string; icon: string; screen?: PlayerUiScreen; tool?: PlayerUiAuxiliary; resume?: boolean }[] = [
  {title:'Squadra',icon:'icon-team',screen:'squadra'},
  {title:'Arkadex',icon:'icon-arkadex',screen:'arkadex'},
  {title:'Borsa',icon:'icon-bag',screen:'borsa'},
  {title:'Deposito',icon:'icon-deposit',screen:'deposito'},
  {title:'Mappa',icon:'icon-map',resume:true},
  {title:'Diario',icon:'icon-journal',tool:'journal'},
  {title:'Registro',icon:'icon-book',tool:'register'},
  {title:'Salvataggio',icon:'icon-backup',tool:'backup'},
  {title:'Impostazioni',icon:'icon-options',tool:'settings'},
]
const gyms = ALLENATORI.filter(trainer => trainer.tipo === 'Capopalestra')
const medalByType: Record<TipoPokemon, string> = {
  Normale: 'medal-normal', Erba: 'medal-grass', Acqua: 'medal-water', Elettro: 'medal-electric',
  Fuoco: 'medal-fire', Terra: 'medal-earth', Oscurità: 'medal-dark', Psico: 'medal-psychic',
}
// Gym order is not an elemental order: several actual gyms share a type.
const gymMedalArtwork = new Map(gyms.map(gym => {
  const types = new Map<TipoPokemon, number>()
  for (const member of gym.squadra) {
    const species = getPokemon(member.pokemonId)
    if (species) types.set(species.tipo, (types.get(species.tipo) ?? 0) + 1)
  }
  const dominantType = [...types].sort((a, b) => b[1] - a[1])[0]?.[0]
  return [gym.id, dominantType ? medalByType[dominantType] : 'medal-empty'] as const
}))

function MedalStrip({ defeated }: { defeated: ReadonlySet<number> }) {
  const earnedCount = gyms.filter(gym => defeated.has(gym.id)).length
  return <div className="ref-medals ref-provided-medals" role="img" aria-label={`${earnedCount} medaglie su ${gyms.length}`}>
    {gyms.map(gym => {
      const earned = defeated.has(gym.id)
      return <span key={gym.id} data-earned={earned} title={`${gym.luogo}: ${earned ? 'ottenuta' : 'da ottenere'}`} aria-hidden="true">
        <ProvidedArtwork id={earned ? gymMedalArtwork.get(gym.id) ?? 'medal-empty' : 'medal-empty'} />
      </span>
    })}
  </div>
}

export function ReferenceMainMenu({playerId,onAuxiliary,onNavigate,onResume}:Props) {
  const one = useGameStore(state=>state.giocatore1), two = useGameStore(state=>state.giocatore2)
  const position1 = useGameStore(state=>state.posizione1), position2 = useGameStore(state=>state.posizione2)
  const context = useGameStore(state=>state.challengeContext)
  const player = playerId === 1 ? one : two, other = playerId === 1 ? two : one
  const position = playerId === 1 ? position1 : position2
  const badges = (owner: typeof one) => gyms.filter(gym=>owner.allenatoriSconfitti.has(gym.id)).length
  const medals = (owner: typeof one) => <MedalStrip defeated={owner.allenatoriSconfitti} />
  return <div className="ref-main-menu ref-provided-main-menu">
    <aside className="ref-trainers" aria-label="Allenatori della partita">
      <section className="ref-trainer-card is-primary" aria-label={`Riepilogo della partita di G${playerId}`}>
        <div className="ref-trainer-identity"><div className="ref-trainer-portrait"><img src={assetUrl(`/ui/player${playerId}_avatar.png`)} alt=""/></div><div className="ref-trainer-copy"><span className="pu-kicker">Allenatore · G{playerId}</span><h2>{player.nome || `Giocatore ${playerId}`}</h2><p><KitIcon id="icon-map"/>{(position.luogo ?? position.mappaId).replace(/_/g,' ')}</p>{medals(player)}<span className="ref-medal-count">Medaglie {badges(player)} / {gyms.length}</span><strong className="ref-trainer-coins"><KitIcon id="item-coin"/>{formatNumber(player.monete)}</strong></div></div>
        <div className="ref-trainer-team" aria-label={`Compagni di ${player.nome}`}>{player.squadra.length ? player.squadra.map(pokemon=><span key={pokemon.istanzaId} title={pokemon.nome}><CreaturePortrait pokemon={pokemon}/></span>) : <p>Scegli il tuo starter per iniziare il viaggio.</p>}</div>
      </section>
      <section className="ref-trainer-card is-secondary" aria-label={`Riepilogo della partita di G${other.id}`}><div className="ref-trainer-portrait"><img src={assetUrl(`/ui/player${other.id}_avatar.png`)} alt=""/></div><div><span className="pu-kicker">Allenatore · G{other.id}</span><h2>{other.nome || `Giocatore ${other.id}`}</h2>{medals(other)}<span className="ref-medal-count">Medaglie {badges(other)} / {gyms.length}</span></div></section>
      <div className="ref-menu-utilities" aria-label="Altri strumenti">{([['race','Gara'],['recap','Ripresa'],['challenges','Sfide']] as const).map(([tool,title])=><button key={tool} type="button" aria-label={`Apri ${title}`} disabled={!!context&&tool!=='challenges'} onClick={()=>onAuxiliary(tool)}><KitIcon id={tool==='challenges'?'icon-challenges':'icon-activity'}/>{title}</button>)}</div>
      <p className="ref-gm-note"><KitIcon id="icon-activity"/>Un’avventura guidata dal Game Master</p>
    </aside>
    <SpatialNavigation columns={3} selectOnFocus={false} className="ref-menu-grid" aria-label="Destinazioni del menù principale">{entries.map(entry=><button data-rpg-item data-ui-id={`service.${entry.tool ?? entry.screen ?? 'map'}`} className="pu-menu-tile ref-menu-tile ref-provided-menu-tile" key={entry.title} type="button" aria-label={`Apri ${entry.title}`} disabled={!!context&&entry.tool!=='settings'&&!entry.resume} onClick={()=>entry.tool?onAuxiliary(entry.tool):entry.screen?onNavigate?.(entry.screen):onResume?.()}><span className="ref-menu-card-face"><ProvidedArtwork id="menu-card-normal" className="ref-menu-card-frame"/>{entry.screen === 'squadra' && player.squadra.length > 0 ? <span className="ref-menu-companions" aria-hidden="true">{player.squadra.slice(0, 3).map(pokemon => <CreaturePortrait key={pokemon.istanzaId} pokemon={pokemon}/>)}</span> : <ReferenceEmblem kind={entry.icon}/>}<h2>{entry.title}</h2></span></button>)}</SpatialNavigation>
  </div>
}
