import { ALLENATORI, MAPPE, POKEMON_BASE } from '@/data'
import { LOCAL_MAPS } from '@/data/localMaps'
import { leagueConfigurationProblems, leagueOpponents } from '@/league/leagueModel'
import { validateCatalog } from '@/interactions/schema'
import { SHOP_LOCATIONS } from '@/shop/catalog'
import type { GameSaveState } from '@/save/gamePersistence'
import type { InteractionDefinition } from '@/interactions/types'
import type { AudienceConnectionStatus } from '@/audience/useAudienceStore'
import type { AudienceHostSnapshot } from '@/audience/types'

export type ReadinessDestination = 'interactions' | 'league' | 'audience' | 'assets'
export interface ReadinessCheck {
  id: string
  level: 'ok' | 'warning' | 'error' | 'info'
  title: string
  message: string
  destination?: ReadinessDestination
}
export interface ConnectionReadiness {
  enabled: boolean
  guestEnabled: boolean
  serviceUrl: string
  connectionStatus: AudienceConnectionStatus
  snapshot: AudienceHostSnapshot | null
}
export interface ReadinessReport {
  checks: ReadinessCheck[]
  maps: { id: string; points: number; configured: number; shops: number }[]
  counts: { errors: number; warnings: number; configuredInteractions: number; maps: number; species: number }
}

/** A configuration diagnostic, never a validator of the GM's unwritten story. */
export function buildReadinessReport(game: GameSaveState, interactions: readonly InteractionDefinition[], connection: ConnectionReadiness, now = Date.now(), catalogRecoveryError?: string | null): ReadinessReport {
  const checks: ReadinessCheck[] = []
  if (catalogRecoveryError) checks.push({ id: 'interaction-recovery', level: 'error', title: 'Catalogo salvato da recuperare', message: `${catalogRecoveryError} L’originale è conservato nell’editor; le interazioni restano sospese.`, destination: 'interactions' })
  const validation = validateCatalog({ version: 1, interactions }, { allowLegacyRepeatableRequirements: true })
  if (validation.error) checks.push({ id: 'interaction-invalid', level: 'error', title: 'Catalogo da correggere', message: validation.error, destination: 'interactions' })
  else if (validation.warning) checks.push({ id: 'interaction-legacy', level: 'warning', title: 'Requisiti delle interazioni', message: validation.warning, destination: 'interactions' })
  const enabled = interactions.filter(entry => entry.enabled)
  const maps = Object.values(LOCAL_MAPS).map(map => ({ id: map.id, points: map.nodes.length,
    configured: enabled.filter(entry => entry.mapId === map.id).length,
    shops: enabled.filter(entry => entry.mapId === map.id && entry.action.kind === 'shop').length }))
  checks.push({ id: 'map-catalog', level: 'info', title: 'Mappe disponibili', message: `${maps.length} mappe a pallini su ${MAPPE.length} luoghi del mondo. Gli altri luoghi usano la vista di riserva. Non tutti i pallini devono avere un’interazione.` })
  checks.push({ id: 'interaction-coverage', level: enabled.length ? 'ok' : 'warning', title: 'Interazioni configurate',
    message: enabled.length ? `${enabled.length} interazioni attive in ${maps.filter(map => map.configured).length} mappe. Le tappe intenzionalmente vuote restano libere per la conduzione.` : 'Nessuna interazione attiva. Configura o importa soltanto le tappe che devono produrre effetti nel gioco; il teatro mentale non richiede contenuti software.', destination: 'interactions' })
  const shops = enabled.filter(entry => entry.action.kind === 'shop')
  checks.push({ id: 'shop-access', level: shops.length ? 'ok' : 'warning', title: 'Accessi agli Arkastore',
    message: shops.length ? `${shops.length} accessi ai negozi in ${new Set(shops.map(entry => entry.mapId)).size} città. Il negozio si apre solo dal pallino configurato.` : `Nessun accesso al negozio configurato. ${SHOP_LOCATIONS.length} luoghi supportano un Arkastore; aggiungi i punti necessari prima di usarli in live.`, destination: 'interactions' })
  const leagueProblems = leagueConfigurationProblems(game.league.config)
  checks.push({ id: 'league', level: leagueProblems.length ? (game.league.players[1].status === 'running' || game.league.players[2].status === 'running' ? 'error' : 'warning') : 'ok', title: 'Preparazione della Lega',
    message: leagueProblems.length ? leagueProblems.join(' ') : 'Quattro Superquattro e regole confermate. I tentativi restano consecutivi nello stesso turno.', destination: 'league' })
  const wantsConnection = connection.enabled || connection.guestEnabled
  const fresh = !!connection.snapshot && connection.snapshot.expiresAt > now && now - connection.snapshot.serverNow < 45_000
  checks.push({ id: 'connection', level: wantsConnection && (connection.connectionStatus !== 'connected' || !fresh) ? 'warning' : connection.connectionStatus === 'connected' && fresh ? 'ok' : 'info', title: 'Ospiti e pubblico',
    message: connection.connectionStatus === 'connected' && fresh ? `Collegamento verificato di recente. Pubblico: ${connection.enabled ? 'abilitato solo per NPC normali' : 'disattivato'}. Ospite privato: ${connection.guestEnabled ? 'abilitato' : 'disattivato'}.`
      : connection.serviceUrl ? 'La connessione non è stata confermata di recente. Apri Connessioni e verifica il servizio e il telefono prima della live.' : 'Servizio non configurato. La partita locale resta disponibile; per usare i telefoni configura e verifica il collegamento.', destination: 'audience' })
  checks.push({ id: 'media', level: 'info', title: 'Media e prova in onda', message: `${POKEMON_BASE.length} specie nel catalogo. Il controllo rapido qui sotto verifica le immagini della squadra e delle mappe correnti; suoni, animazioni complete e OBS richiedono una prova in live.`, destination: 'assets' })
  return { checks, maps, counts: { errors: checks.filter(check => check.level === 'error').length, warnings: checks.filter(check => check.level === 'warning').length,
    configuredInteractions: enabled.length, maps: maps.length, species: POKEMON_BASE.length } }
}

export function currentRaceProgress(game: GameSaveState) {
  const gyms = ALLENATORI.filter(trainer => trainer.tipo === 'Capopalestra')
  return ([1, 2] as const).map(id => {
    const player = game[id === 1 ? 'giocatore1' : 'giocatore2']
    const position = game[id === 1 ? 'posizione1' : 'posizione2']
    const progress = game.league.players[id]
    return { id, name: player.nome, place: position.luogo ?? position.mappaId, team: player.squadra.length,
      badges: gyms.filter(gym => player.allenatoriSconfitti.has(gym.id)).length, totalBadges: gyms.length,
      leagueStages: progress.completedStages.length, leagueTotal: game.league.config ? leagueOpponents(game.league.config).length : 4, leagueStatus: progress.status }
  })
}
