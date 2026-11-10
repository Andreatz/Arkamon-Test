import { useEffect, useState, type CSSProperties } from 'react'
import { assetUrl } from '@/utils/assetUrl'
import { getLocalMap } from '@/data/localMaps'
import { getBackground } from '@/data/backgrounds'
import { ArkamonBattleSprite } from '@/components/arkamon/ArkamonBattleSprite'
import { HpBar } from '@/components/battle/BattlePresentation'
import { DiceRollOverlay } from '@/components/battle/DiceRollOverlay'
import { MoveVfx } from '@/components/MoveVfx'
import { BattleLayoutProvider } from '@/ui-studio/battleLayout'
import { PUBLIC_CHANNEL, type PublicSnapshot } from './publicSnapshot'
import { useSessionOwnership, requestSessionControl } from '@/session/sessionOwnership'
import type { AdminLayoutRect } from '@/theme/adminThemeTypes'
import './regia.css'
import { PublicMap } from './PublicMap'
import { resolveUiMediaSource } from '@/ui-studio/mediaStorage'
import { PublicManagementView } from './PublicManagementView'
import { MotionPlaybackContext, normalizeMotionPlayback } from '@/settings/motionPlayback'
import type { PublicRelayConfiguration } from './publicRelayTransport'

const position = (rect: AdminLayoutRect): CSSProperties => ({ position: 'absolute', left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` })
function usePublicAsset(source: string | undefined, relay: PublicRelayConfiguration | null): { url?: string; error?: string } {
  const scope = source?.startsWith('public-media:') ? `${relay?.origin}:${relay?.token}` : 'local'
  const [resolved, setResolved] = useState<{ source: string; scope: string; url?: string; error?: string } | null>(null)
  useEffect(() => {
    if (!source || !/^(ui-media:|public-media:)/.test(source)) return
    let current = true
    let objectUrl: string | undefined
    let controller: AbortController | undefined, retry: number | undefined, attempts = 0
    const load = async () => {
      if (!current) return
      const operation = new AbortController(); controller = operation
      const timeout = window.setTimeout(() => operation.abort(), 10_000)
      try {
        const url = source.startsWith('ui-media:') ? await resolveUiMediaSource(source)
          : relay ? await (await import('./publicMedia')).fetchPublicRelayImage(relay, source, operation.signal)
            : undefined
        if (!url) throw new Error('Collegamento media della regia non disponibile.')
        if (source.startsWith('public-media:')) objectUrl = url
        if (current) setResolved({ source, scope, url })
        else if (objectUrl) URL.revokeObjectURL(objectUrl)
      } catch {
        if (current) {
          setResolved({ source, scope, error: 'Impossibile caricare un’immagine personalizzata della regia. Nuovo tentativo in corso.' })
          retry = window.setTimeout(() => { void load() }, Math.min(8000, 1000 * 2 ** Math.min(attempts++, 3)))
        }
      } finally { clearTimeout(timeout) }
    }
    void load()
    return () => { current = false; controller?.abort(); clearTimeout(retry); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [source, scope])
  return source && /^(ui-media:|public-media:)/.test(source) ? resolved?.source === source && resolved.scope === scope ? resolved : {} : { url: source ? assetUrl(source) : undefined }
}

/** A passive renderer. It never mounts game actions, audience polling, Admin or campaign effects. */
export function BroadcastView({ publicOnly = false }: { publicOnly?: boolean }) {
  const ownership = useSessionOwnership()
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [mediaRelay, setMediaRelay] = useState<PublicRelayConfiguration | null>(null)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(PUBLIC_CHANNEL)
    let receivedAt = 0
    let disposed = false
    let closeRelay: (() => void) | undefined
    let relaySignature = '', relayGeneration = 0
    const syncRelay = () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const signature = params.has('publicRelay') ? `${params.get('publicRelay')}\n${params.get('viewer')}` : ''
      if (signature === relaySignature) return
      relaySignature = signature
      const generation = ++relayGeneration
      closeRelay?.(); closeRelay = undefined
      receivedAt = 0; setConnected(false); setSnapshot(null); setMediaRelay(null)
      if (!signature) channel.postMessage({ kind: 'hello' })
      if (signature) void import('./publicRelayTransport').then(module => {
        const config = module.publicRelayConfiguration('viewer')
        if (!disposed && generation === relayGeneration && config) { setMediaRelay(config); closeRelay = module.subscribePublicRelay(config, value => {
          if (!disposed && generation === relayGeneration) { receivedAt = Date.now(); setConnected(true); setSnapshot(value) }
        }) }
      }).catch(() => { /* Keep the passive disconnected view when the optional chunk is unavailable. */ })
    }
    channel.onmessage = event => {
      if (relaySignature) return
      if (event.data?.kind !== 'snapshot' || event.data.snapshot?.version !== 1) return
      receivedAt = Date.now(); setConnected(true); setSnapshot(event.data.snapshot)
    }
    channel.postMessage({ kind: 'hello' })
    const timer = window.setInterval(() => {
      if (!receivedAt || Date.now() - receivedAt > 6500) { setConnected(false); channel.postMessage({ kind: 'hello' }) }
    }, 2000)
    window.addEventListener('hashchange', syncRelay)
    syncRelay()
    return () => { disposed = true; relayGeneration++; window.removeEventListener('hashchange', syncRelay); closeRelay?.(); clearInterval(timer); channel.close() }
  }, [])
  const battle = snapshot?.battle
  const enemyFrame = usePublicAsset(battle?.appearance?.enemyFrame?.source, mediaRelay)
  const playerFrame = usePublicAsset(battle?.appearance?.playerFrame?.source, mediaRelay)
  const customBackground = usePublicAsset(battle?.appearance?.background, mediaRelay)
  const mediaErrors = [enemyFrame.error, playerFrame.error, customBackground.error].filter(Boolean)
  const map = snapshot && ['citta', 'percorso'].includes(snapshot.scene) ? getLocalMap(snapshot.place) : undefined
  const background = customBackground.url ?? battle?.background ?? (map ? assetUrl(map.image) : snapshot?.scene === 'mappa-principale'
    ? assetUrl('/maps/Mappa-Finale.jpg') : getBackground(snapshot?.place ?? '') ?? assetUrl('/backgrounds/battle_forest.jpg'))
  return <MotionPlaybackContext.Provider value={snapshot?.motion ? normalizeMotionPlayback(snapshot.motion) : null}><main className="arka-broadcast" data-broadcast-view data-broadcast-connected={connected} data-broadcast-media-errors={mediaErrors.length} style={{ backgroundImage: `url("${background}")` }}>
    {snapshot ? <>
      {snapshot.management ? <PublicManagementView view={snapshot.management} /> : battle ? <BattleLayoutProvider value={battle.layout}>
        <div style={position(battle.layout.enemySprite)}><ArkamonBattleSprite speciesId={battle.pokemonB.specieId} name={battle.pokemonB.nome} side="front" animation={battle.animationB} replayKey={battle.replayB} playbackPaused={snapshot.paused} className="w-full h-full" /></div>
        <div style={position(battle.layout.playerSprite)}><ArkamonBattleSprite speciesId={battle.pokemonA.specieId} name={battle.pokemonA.nome} side="back" animation={battle.animationA} replayKey={battle.replayA} playbackPaused={snapshot.paused} className="w-full h-full" /></div>
        <div style={position(battle.layout.enemyHp)}><HpBar nome={battle.pokemonB.nome} livello={battle.pokemonB.livello} hp={battle.pokemonB.hp} hpMax={battle.hpMaxB} stato={battle.pokemonB.stato} side="enemy" frameSource={enemyFrame.url} frameFit={battle.appearance?.enemyFrame?.fit} hpColorsOverride={battle.appearance?.hpColors} /></div>
        <div style={position(battle.layout.playerHp)}><HpBar nome={battle.pokemonA.nome} livello={battle.pokemonA.livello} hp={battle.pokemonA.hp} hpMax={battle.hpMaxA} stato={battle.pokemonA.stato} side="player" frameSource={playerFrame.url} frameFit={battle.appearance?.playerFrame?.fit} hpColorsOverride={battle.appearance?.hpColors} /></div>
        {battle.dice && <DiceRollOverlay key={battle.dice.id} roll={battle.dice} staticPreview />}
        {battle.effect && <MoveVfx key={battle.effect.id} effect={battle.effect} />}
        <div className="arka-public-battle-status" role="status">{battle.status}</div>
        {!!battle.messages.length && <div className="arka-public-message">{battle.messages.slice(-2).map((message, i) => <p key={i}>{message}</p>)}</div>}
      </BattleLayoutProvider> : snapshot.scene === 'mappa-principale' || map ? <PublicMap snapshot={snapshot} />
        : <div className="arka-public-wait"><img className="arka-public-logo" src={assetUrl('/ui/logo_arkamon.png')} alt="Arkamon" /><h1>{snapshot.scene === 'titolo' ? 'La corsa alla Lega' : snapshot.scene === 'laboratorio' ? 'La scelta del primo compagno' : snapshot.scene === 'evoluzione' ? 'Un compagno si sta evolvendo' : snapshot.scene === 'battaglia' ? 'Preparazione della battaglia' : snapshot.place.replace(/_/g, ' ')}</h1><p>{snapshot.scene === 'titolo' ? 'Melia e Maggi · un viaggio, un solo campione' : 'Il viaggio continua'}</p></div>}
      <aside className="arka-public-race" aria-label="Stato della gara">{snapshot.players.map(player => <div key={player.id} data-active={snapshot.active === player.id}><strong>{player.name}</strong><span>{player.place.replace(/_/g, ' ')} · {player.badges}/8 medaglie{player.leagueWins ? ` · Lega ${player.leagueWins}/${snapshot.leagueTotal}` : ''}</span></div>)}</aside>
      {snapshot.winner && <div className="arka-public-winner">Campione della regione · {snapshot.winner}</div>}
      {snapshot.paused && <div className="arka-public-pause" role="status">Pausa di regia · il viaggio riprende tra poco</div>}
    </> : <div className="arka-public-wait"><h1>Arkamon · In onda</h1><p>Apri la console di gioco nello stesso browser per collegare questa vista.</p><p>Per OBS usa Cattura finestra. Una Browser Source con un profilo separato richiede un collegamento dedicato.</p></div>}
    {!connected && <p className="arka-public-disconnected" role="status">Console non collegata · nessuna azione viene eseguita da questa vista.</p>}
    {!!mediaErrors.length && <p className="arka-public-disconnected" role="status">{mediaErrors[0]}</p>}
    {!publicOnly && <section className="arka-session-ownership" aria-label="Controllo della sessione"><p>{ownership.reason}</p><button onClick={() => void requestSessionControl()}>Ricarica lo stato e richiedi controllo</button></section>}
  </main></MotionPlaybackContext.Provider>
}
