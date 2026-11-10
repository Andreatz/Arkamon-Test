import { GameButton } from '@/components/ui/GameButton'
import { useSceneNavigation } from '@/components/transitions/SceneNavigationContext'
import { AdminLayoutItem } from '@/admin/AdminLayoutItem'
import { getBackground } from '@data/backgrounds'
import { getAllenatoriInLuogo, getIncontri } from '@data/index'
import { calcolaHPMax, determinaIniziativa } from '@engine/battleEngine'
import { generaIncontroDaCespuglio } from '@engine/encounters'
import { useAdminStore } from '@store/adminStore'
import { useGameStore } from '@store/gameStore'
import type { AdminLayoutRect, AdminLuogoLayoutKey } from '@/theme/adminThemeTypes'
import type { StatoBattaglia } from '@/types'
import { getLocalMap } from '@/data/localMaps'
import { SECRET_LOCATION_ID, canAccessSecretLocation } from '@/data/secretLocation'
import { LocalMapScene } from './LocalMapScene'
import { isTeamWithinLevelCap, teamCapMessage } from '@/engine/teamLevelCap'

const CESPUGLI = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

/**
 * Scena percorso: 7 cespugli A-G visitabili una volta per giocatore.
 * Il layout admin è condiviso da tutti i percorsi.
 */
export function PercorsoScene() {
  const scenaCorrente = useSceneNavigation()
  const giocatoreAttivo = useGameStore((s) => s.giocatoreAttivo)
  const cespuglioVisitato = useGameStore((s) => s.cespuglioVisitato)
  const segnaCespuglioVisitato = useGameStore((s) => s.segnaCespuglioVisitato)
  const iniziaBattaglia = useGameStore((s) => s.iniziaBattaglia)
  const iniziaBattagliaNPC = useGameStore((s) => s.iniziaBattagliaNPC)
  const vaiAScena = useGameStore((s) => s.vaiAScena)
  const consumaInterazione = useGameStore((s) => s.consumaInterazioneMappaLocale)
  const turno = useGameStore((s) => s.turnoOverworld)
  const fallbackActivity = useGameStore((s) => s.fallbackLocationActivity)
  const giocatore = useGameStore((s) =>
    giocatoreAttivo === 1 ? s.giocatore1 : s.giocatore2
  )
  const posizione = useGameStore((s) => giocatoreAttivo === 1 ? s.posizione1 : s.posizione2)
  const layoutEditing = useAdminStore((s) => s.layoutEditing)
  const luogoLayout = useAdminStore((s) => s.theme.layouts.luogo)
  const updateSceneLayout = useAdminStore((s) => s.updateSceneLayout)

  const luogo = (scenaCorrente.payload?.luogo as string) || 'Percorso_1'
  const localMap = getLocalMap(luogo)
  const interazioneDisponibile = localMap
    ? turno.giocatoreAttivo === giocatoreAttivo && turno.azioniRimaste > 0
    : fallbackActivity?.playerId === giocatoreAttivo && fallbackActivity.location === luogo
  const allenatori = getAllenatoriInLuogo(luogo)
  const secret = luogo === SECRET_LOCATION_ID
  const secretAccess = !secret || canAccessSecretLocation(giocatore, posizione)
  const hasDefinedActivities = allenatori.length > 0 || CESPUGLI.some((c) => getIncontri(luogo, c).length > 0)
  const haPokemonVivi = giocatore.squadra.some((pokemon) => pokemon.hp > 0)

  const sfidaAllenatore = (allenatoreId: number) => {
    if (layoutEditing || !interazioneDisponibile || !haPokemonVivi || giocatore.allenatoriSconfitti.has(allenatoreId)) return
    if (!isTeamWithinLevelCap(giocatore.squadra)) { useGameStore.getState().aggiornaStato({ teamRuleMessage: teamCapMessage(giocatore.squadra) }); return }
    useGameStore.getState().eseguiTransazione(() => {
      if (!consumaInterazione(giocatoreAttivo, luogo)) return
      if (iniziaBattagliaNPC(allenatoreId, luogo)) vaiAScena('battaglia')
    })
  }

  const apriCespuglio = (cespuglio: string) => {
    if (layoutEditing || !interazioneDisponibile) return
    if (!isTeamWithinLevelCap(giocatore.squadra)) { useGameStore.getState().aggiornaStato({ teamRuleMessage: teamCapMessage(giocatore.squadra) }); return }
    if (cespuglioVisitato(giocatoreAttivo, luogo, cespuglio)) return
    const incontri = getIncontri(luogo, cespuglio)
    const selvatico = generaIncontroDaCespuglio(incontri)
    if (!selvatico) return

    const primoDellaSquadra = giocatore.squadra.find((pokemon) => pokemon.hp > 0)
    if (!primoDellaSquadra) return
    const battaglia: StatoBattaglia = {
      tipo: 'Selvatico',
      pokemonA: primoDellaSquadra,
      pokemonB: selvatico,
      hpMaxA: calcolaHPMax(primoDellaSquadra),
      hpMaxB: calcolaHPMax(selvatico),
      turnoCorrente: determinaIniziativa(primoDellaSquadra.livello, selvatico.livello, Math.random, primoDellaSquadra.stato?.tipo, selvatico.stato?.tipo),
      luogoRitorno: luogo,
      log: [`Appare ${selvatico.nome} selvatico!`],
      evoluzioneInAttesa: null,
    }
    useGameStore.getState().eseguiTransazione(() => {
      if (!consumaInterazione(giocatoreAttivo, luogo)) return
      segnaCespuglioVisitato(giocatoreAttivo, luogo, cespuglio)
      iniziaBattaglia(battaglia)
      vaiAScena('battaglia')
    })
  }

  const bg = getBackground(luogo)
  const updateLuogoLayout = (key: AdminLuogoLayoutKey, rect: AdminLayoutRect) =>
    updateSceneLayout({ scene: 'luogo', key, rect })

  const activities = (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-1">
          {!hasDefinedActivities && <p role="status" className="arka-panel p-6 text-2xl">Nessuna attività configurata qui. Torna alla mappa principale per proseguire il viaggio.</p>}
          {!haPokemonVivi && hasDefinedActivities && (
            <p role="status" className="arka-panel shrink-0 p-3 text-center text-amber-200">
              La squadra è esausta. Visita un Centro Pokémon prima di affrontare un incontro.
            </p>
          )}
          {hasDefinedActivities && <div className="grid shrink-0 grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {CESPUGLI.map((c) => {
            const visited = cespuglioVisitato(giocatoreAttivo, luogo, c)
            const haIncontri = getIncontri(luogo, c).length > 0
            const disabled = !interazioneDisponibile || visited || !haIncontri || !haPokemonVivi
            return (
              <GameButton
                key={c}
                disabled={layoutEditing || disabled}
                aria-label={`Cespuglio ${c}${visited ? ', esplorato' : ''}`}
                onClick={() => apriCespuglio(c)}
                className={`flex aspect-square flex-col items-center justify-center
                  ${disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer hover:border-arka-accent'}
                `}
              >
                <span className="arka-layout-content mb-2 text-5xl">{visited ? '🌾' : '🌳'}</span>
                <span className="arka-layout-content text-lg font-bold">{c}</span>
                <span className="arka-layout-content text-xs text-arka-text-muted">
                  {visited ? 'esplorato' : haIncontri ? 'cespuglio' : '—'}
                </span>
              </GameButton>
            )
          })}
          </div>}
          {allenatori.length > 0 && (
            <section className="shrink-0" aria-label="Allenatori del percorso">
              <h3 className="arka-readable-title mb-3 text-xl font-bold text-white">Allenatori del percorso</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {allenatori.map((allenatore) => {
                  const sconfitto = giocatore.allenatoriSconfitti.has(allenatore.id)
                  return (
                    <GameButton
                      key={allenatore.id}
                      disabled={layoutEditing || !interazioneDisponibile || sconfitto || !haPokemonVivi}
                      onClick={() => sfidaAllenatore(allenatore.id)}
                      aria-label={sconfitto ? `${allenatore.nome}, già sconfitto` : `Sfida ${allenatore.nome}`}
                      className={`flex w-full items-center gap-3 p-4 text-left ${sconfitto || !haPokemonVivi ? 'cursor-not-allowed opacity-40' : 'hover:border-arka-accent'}`}
                    >
                      <span className="text-3xl" aria-hidden="true">{sconfitto ? '✅' : allenatore.tipo === 'PVP' ? '⚔️' : '🥋'}</span>
                      <span>
                        <span className="block text-lg font-bold">{allenatore.nome}</span>
                        <span className="block text-xs text-arka-text-muted">
                          {sconfitto ? 'Già sconfitto' : `Squadra: ${allenatore.squadra.length} Pokémon · Lv. ${allenatore.squadra[0]?.livello ?? '—'}`}
                        </span>
                      </span>
                    </GameButton>
                  )
                })}
              </div>
            </section>
          )}
        </div>
  )

  if (!secretAccess) return <section className="local-map-scene" aria-label="Luogo non disponibile">
    <p>Questo luogo non è disponibile per il giocatore attivo.</p>
    <GameButton onClick={() => vaiAScena('mappa-principale')}>Mappa principale</GameButton>
  </section>

  if (localMap) return <LocalMapScene key={luogo} map={localMap} activities={activities} />

  return (
    <div
      data-percorso-layout-root
      className="relative h-full w-full overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-700 to-amber-700 bg-cover bg-center"
      style={bg ? { backgroundImage: `url(${bg})` } : undefined}
    >
      <AdminLayoutItem
        rootSelector="[data-percorso-layout-root]"
        label="Indietro"
        rect={luogoLayout.backButton}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('backButton', rect)}
      >
        <GameButton
          className="arka-layout-content h-full w-full px-3 py-2 text-sm"
          onClick={() => vaiAScena('mappa-principale')}
        >
          ← Torna alla mappa
        </GameButton>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-percorso-layout-root]"
        label="Turno"
        rect={luogoLayout.turnPanel}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('turnPanel', rect)}
      >
        <div className="arka-panel flex h-full w-full items-center justify-center px-3 py-2">
          <span className="arka-layout-content text-xs text-arka-text-muted">Turno di:</span>
          <span className="arka-layout-content ml-2 font-bold text-arka-accent">
            {giocatore.nome}
          </span>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-percorso-layout-root]"
        label="Monete"
        rect={luogoLayout.coinsPanel}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('coinsPanel', rect)}
      >
        <div className="arka-panel flex h-full w-full items-center justify-center px-3 py-2">
          <span className="arka-layout-content text-xs text-arka-text-muted">Monete:</span>
          <span className="arka-layout-content ml-2 font-bold text-yellow-300">
            ₳ {giocatore.monete}
          </span>
        </div>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-percorso-layout-root]"
        label="Titolo"
        rect={luogoLayout.title}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('title', rect)}
      >
        <h2 className="arka-layout-content arka-readable-title flex h-full w-full items-center justify-center text-center text-3xl font-bold text-white">
          {luogo.replace('_', ' ')}
        </h2>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-percorso-layout-root]"
        label="Sottotitolo"
        rect={luogoLayout.subtitle}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('subtitle', rect)}
      >
        <p className="arka-layout-content arka-readable-text flex h-full w-full items-center justify-center text-center italic text-arka-text-muted">
          {hasDefinedActivities ? 'Ogni cespuglio è esplorabile una sola volta.' : 'Luogo di passaggio · scegli la prossima destinazione sulla mappa principale.'}
        </p>
      </AdminLayoutItem>

      <AdminLayoutItem
        rootSelector="[data-percorso-layout-root]"
        label="Cespugli"
        rect={luogoLayout.contentGrid}
        editing={layoutEditing}
        onChange={(rect) => updateLuogoLayout('contentGrid', rect)}
        zIndex={10}
      >
        {activities}
      </AdminLayoutItem>
    </div>
  )
}
