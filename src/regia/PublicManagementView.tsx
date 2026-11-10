import { assetUrl } from '@/utils/assetUrl'
import { KitIcon, SpeciesPortrait } from '@/player-ui/kit'
import type { PublicManagement } from './managementPresentation'

/** Passive presentation of the explicit whitelist: never mounts a game action. */
export function PublicManagementView({ view }: { view: PublicManagement }) {
  const creature = view.creature
  return <section className="arka-public-management" aria-label="Scheda presentata dal GM">
    <header><img src={assetUrl('/ui/logo_arkamon.png')} alt="Arkamon" /><div><small>G{view.playerId} · {view.playerName} · {view.place}</small><h1>{view.title}</h1></div></header>
    <div className="arka-public-management-body">
      {creature ? <><div className="arka-public-management-hero"><SpeciesPortrait speciesId={creature.speciesId} large /><h2>{creature.name}</h2><span>{creature.type}{creature.level !== undefined ? ` · Lv. ${creature.level}` : ''}</span></div>
        <div className="arka-public-management-detail">{creature.hp !== undefined && creature.maximum !== undefined ? <div className="arka-public-management-health"><strong>{creature.hp} / {creature.maximum} HP</strong><progress max={creature.maximum} value={creature.hp} /><p>{creature.condition}</p></div> : null}<h2>Mosse</h2>{creature.moves.map((move, i) => <div className="arka-public-management-move" key={i}><strong>{move.name}</strong><span>{move.type} · {move.effect}</span></div>)}</div></> : null}
      {view.item ? <><div className="arka-public-management-hero"><KitIcon id={({ potion: 'item-potion', 'super-potion': 'item-superpotion', revive: 'item-revive', antidote: 'item-antidote', masterball: 'item-sphere', 'paralysis-heal': 'type-electric', awakening: 'type-psychic' } as Record<string, string>)[view.item.id]} /><h2>{view.item.name}</h2></div><div className="arka-public-management-detail"><h2>{view.item.name}</h2><p>{view.item.description}</p>{view.item.price !== undefined && <strong>{view.item.price} ₳ ciascuno</strong>}</div></> : null}
      {view.progress ? <div className="arka-public-management-progress"><h2>{view.playerName}</h2><p>{view.place}</p><div className="arka-public-medals" aria-label={`${view.progress.badges} medaglie su 8`}>{Array.from({ length: 8 }, (_, i) => <span key={i} data-earned={i < view.progress!.badges}>{i + 1}</span>)}</div><h2>{view.progress.badges} / 8 medaglie</h2><p>Lega · {view.progress.leagueWins} / {view.progress.leagueTotal} incontri</p></div> : null}
    </div><footer>Scheda condivisa dalla regia · nessun comando del gioco è attivo</footer>
  </section>
}
